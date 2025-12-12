import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { TextDecoder, promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'
import texlabLogger from './TexlabLogger.mjs'
import ProjectEntityHandler from '../Project/ProjectEntityHandler.mjs'
import HistoryManager from '../History/HistoryManager.mjs'

const decoder = new TextDecoder()
const TEXLAB_PATH = process.env.TEXLAB_PATH || 'texlab'
const TEXLAB_ARGS = (process.env.TEXLAB_ARGS || '')
  .split(/\s+/)
  .filter(Boolean)
// default to 20 minutes idle timeout unless overridden
const TEXLAB_IDLE_MS =
  parseInt(process.env.TEXLAB_IDLE_MS, 10) || 20 * 60 * 1000
const TEXLAB_RESPONSE_TIMEOUT_MS =
  parseInt(process.env.TEXLAB_RESPONSE_TIMEOUT_MS, 10) || 20000
const TEXLAB_MAX_PROCS = parseInt(process.env.TEXLAB_MAX_PROCS, 10) || 4
const TEXLAB_WORKSPACE_TTL_MS =
  parseInt(process.env.TEXLAB_WORKSPACE_TTL_MS, 10) || 5 * 60 * 1000 // 5 minutes
const DEFAULT_PROJECT_ROOTS = [
  process.env.TEXLAB_PROJECT_ROOT,
  // NOTE: Overleaf CE does not have on-disk project roots; keep this empty by default.
].filter(Boolean)
const TEXLAB_WORKDIR_BASE =
  process.env.TEXLAB_WORKDIR_BASE ||
  path.join(os.tmpdir(), 'texlab-workspaces')

const getAllDocsAsync = promisify(ProjectEntityHandler.getAllDocs)
const getAllFilesAsync = promisify(ProjectEntityHandler.getAllFiles)
const requestBlobAsync = (projectId, fileHash) =>
  new Promise((resolve, reject) => {
    HistoryManager.requestBlobWithProjectId(projectId, fileHash, (err, res) => {
      if (err) return reject(err)
      resolve(res)
    })
  })

export const REQUIRE_FULL_TEXT = 'REQUIRES_FULL_TEXT'

function buildHeaders(payload) {
  return `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n`
}

function positionFromOffset(text, offset) {
  let line = 0
  let character = 0
  for (let i = 0; i < offset; i++) {
    if (text[i] === '\n') {
      line++
      character = 0
    } else {
      character++
    }
  }
  return { line, character }
}

function offsetToPosition(text, offset) {
  return positionFromOffset(text, offset)
}

class TexlabProcess {
  constructor(projectId) {
    this.projectId = projectId
    this.workspacePath = this.ensureWorkspace()
    this.workspaceUri = `file://${this.workspacePath}`
    this.usingRealProjectRoot = false
    this.workspaceReady = false
    this.workspaceReadyAt = 0
    this.workspaceSyncPromise = null
    this.recordBinaryInfo()
    this.child = spawn(TEXLAB_PATH, TEXLAB_ARGS)
    this.exited = false
    this.buffer = Buffer.alloc(0)
    this.nextId = 1
    this.pending = new Map()
    this.docs = new Map() // uri -> { version, text }
    this.lastUsed = Date.now()
    this.setupListeners()
    this.initialized = false
    this.initializePromise = null
    texlabLogger.info(
      {
        projectId,
        pid: this.child.pid,
        cmd: TEXLAB_PATH,
        args: TEXLAB_ARGS,
        cwd: process.cwd(),
        logPath: texlabLogger.logPath,
      },
      '[Texlab] spawned'
    )
    this.recordProjectRootAccess()
  }

  recordBinaryInfo() {
    try {
      const real = fs.realpathSync(TEXLAB_PATH)
      const stat = fs.statSync(real)
      texlabLogger.info(
        {
          path: TEXLAB_PATH,
          real,
          mode: stat.mode.toString(8),
          uid: stat.uid,
          gid: stat.gid,
          size: stat.size,
          cwd: process.cwd(),
        },
        '[Texlab] binary access ok'
      )
    } catch (err) {
      texlabLogger.error(
        { err, path: TEXLAB_PATH, cwd: process.cwd() },
        '[Texlab] binary access failed'
      )
    }
  }

  recordProjectRootAccess() {
    const rootPath = this.workspacePath
    try {
      const stat = fs.statSync(rootPath)
      if (this.usingRealProjectRoot) {
        texlabLogger.info(
          {
            rootPath,
            mode: stat.mode.toString(8),
            uid: stat.uid,
            gid: stat.gid,
          },
          '[Texlab] project root access ok'
        )
        this.workspaceReady = true
        this.workspaceReadyAt = Date.now()
      }
    } catch (err) {
      texlabLogger.error(
        { err, rootPath, cwd: process.cwd() },
        '[Texlab] project root access failed'
      )
    }
  }

  ensureWorkspace() {
    const workspace = path.join(TEXLAB_WORKDIR_BASE, this.projectId)
    try {
      fs.mkdirSync(workspace, { recursive: true })
      return workspace
    } catch (err) {
      texlabLogger.error(
        { err, workspace, base: TEXLAB_WORKDIR_BASE },
        '[Texlab] failed to create workspace'
      )
      // fallback to tmp project-scoped dir
      const fallback = fs.mkdtempSync(
        path.join(os.tmpdir(), `texlab-${this.projectId}-`)
      )
      texlabLogger.warn(
        { workspace: fallback },
        '[Texlab] using fallback workspace'
      )
      return fallback
    }
  }

  setupListeners() {
    this.child.stdout.on('data', data => {
      this.buffer = Buffer.concat([this.buffer, data])
      this.tryParse()
    })
    this.child.stderr.on('data', data => {
      texlabLogger.debug({ err: decoder.decode(data) }, '[Texlab] stderr')
    })
    this.child.on('error', err => {
      this.exited = true
      for (const [, { reject }] of this.pending) {
        reject(err)
      }
      this.pending.clear()
    })
    this.child.on('exit', (code, signal) => {
      this.exited = true
      texlabLogger.warn(
        { code, signal, projectId: this.projectId, pid: this.child.pid },
        '[Texlab] texlab exit'
      )
      for (const [, { reject }] of this.pending) {
        reject(new Error('texlab exited'))
      }
      this.pending.clear()
    })
  }

  tryParse() {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) break
      const header = this.buffer.slice(0, headerEnd).toString('utf8')
      const match = header.match(/Content-Length: (\d+)/i)
      if (!match) {
        texlabLogger.warn(
          { header },
          '[Texlab] invalid header, skipping'
        )
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }
      const length = parseInt(match[1], 10)
      const start = headerEnd + 4
      if (this.buffer.length < start + length) break
      const body = this.buffer.slice(start, start + length).toString('utf8')
      this.buffer = this.buffer.slice(start + length)
      try {
        const json = JSON.parse(body)
        this.handleResponse(json)
      } catch (err) {
        texlabLogger.warn(
          {
            err,
            bodyPreview: body.slice(0, 512),
            bodyLength: body.length,
            rawHeader: header,
          },
          '[Texlab] Failed to parse response'
        )
      }
    }
  }

  handleResponse(json) {
    if (json.id && this.pending.has(json.id)) {
      const { resolve, reject, timer } = this.pending.get(json.id)
      clearTimeout(timer)
      this.pending.delete(json.id)
      if (json.error) {
        reject(new Error(json.error.message || 'texlab error'))
      } else {
        resolve(json.result || {})
      }
    }
  }

  isAlive() {
    return !this.exited && this.child && !this.child.killed
  }

  send(msg) {
    const payload = JSON.stringify(msg)
    try {
      this.child.stdin.write(buildHeaders(payload))
      this.child.stdin.write(payload)
    } catch (err) {
      this.exited = true
      texlabLogger.error({ err }, '[Texlab] failed to write to stdin')
      throw err
    }
  }

  async ensureWorkspaceReady() {
    if (this.usingRealProjectRoot) {
      return
    }
    const now = Date.now()
    if (this.workspaceReady && now - this.workspaceReadyAt < TEXLAB_WORKSPACE_TTL_MS) {
      return
    }
    if (this.workspaceSyncPromise) {
      return this.workspaceSyncPromise
    }
    this.workspaceSyncPromise = this.materializeWorkspace().finally(() => {
      this.workspaceSyncPromise = null
    })
    return this.workspaceSyncPromise
  }

  applyChangesToDoc(text, changes) {
    let current = text
    const lspChanges = []
    for (const change of changes) {
      const from = Math.max(0, change.from || 0)
      const to = Math.max(from, change.to || 0)
      lspChanges.push({
        range: {
          start: offsetToPosition(current, from),
          end: offsetToPosition(current, to),
        },
        text: change.text ?? '',
      })
      const before = current.slice(0, from)
      const after = current.slice(to)
      current = `${before}${change.text ?? ''}${after}`
    }
    return { text: current, lspChanges }
  }

  async materializeWorkspace() {
    try {
      await fs.promises.mkdir(this.workspacePath, { recursive: true })

      const docs = await getAllDocsAsync(this.projectId)
      const docEntries = Object.entries(docs || {})
      for (const [p, doc] of docEntries) {
        const relPath = p.startsWith('/') ? p.slice(1) : p
        const target = path.join(this.workspacePath, relPath)
        await fs.promises.mkdir(path.dirname(target), { recursive: true })
        await fs.promises.writeFile(target, (doc.lines || []).join('\n'))
      }

      const files = await getAllFilesAsync(this.projectId)
      const fileEntries = Object.entries(files || {})
      for (const [p, file] of fileEntries) {
        const relPath = p.startsWith('/') ? p.slice(1) : p
        const target = path.join(this.workspacePath, relPath)
        await fs.promises.mkdir(path.dirname(target), { recursive: true })
        const { stream } = await requestBlobAsync(this.projectId, file.hash)
        await pipeline(stream, fs.createWriteStream(target))
      }

      this.workspaceReady = true
      this.workspaceReadyAt = Date.now()
      texlabLogger.info(
        { workspace: this.workspacePath, projectId: this.projectId },
        '[Texlab] workspace materialized'
      )
    } catch (err) {
      this.workspaceReady = false
      texlabLogger.warn(
        { err, workspace: this.workspacePath, projectId: this.projectId },
        '[Texlab] failed to materialize workspace; continuing with in-memory content'
      )
    }
  }

  sendRequest(
    msg,
    timeoutMs = TEXLAB_RESPONSE_TIMEOUT_MS,
    timeoutMessage = 'texlab request timeout'
  ) {
    if (!this.isAlive()) {
      return Promise.reject(new Error('texlab exited'))
    }
    if (!msg.id) {
      msg.id = `req-${this.nextId++}`
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id)
        reject(new Error(timeoutMessage))
      }, timeoutMs)
      this.pending.set(msg.id, { resolve, reject, timer })
      this.send(msg)
    })
  }

  async ensureInitialized() {
    if (this.initialized) return
    if (!this.initializePromise) {
      const rootUri = this.workspaceUri
      const initializeId = this.nextId++
      this.initializePromise = this.sendRequest(
        {
          jsonrpc: '2.0',
          id: initializeId,
          method: 'initialize',
          params: {
            processId: process.pid,
            rootUri,
            capabilities: {},
          },
        },
        TEXLAB_RESPONSE_TIMEOUT_MS,
        'texlab initialize timeout'
      ).then(result => {
        this.send({
          jsonrpc: '2.0',
          method: 'initialized',
          params: {},
        })
        this.initialized = true
        return result
      }).catch(err => {
        this.initializePromise = null
        throw err
      })
    }
    await this.initializePromise
  }

  async completion({ docPath, fullText, changes, version, offset }) {
    this.lastUsed = Date.now()
    await this.ensureWorkspaceReady()
    await this.ensureInitialized()
    const uri = `file://${path.join(this.workspacePath, docPath)}`
    const existing = this.docs.get(uri)
    const desiredVersion = version || (existing ? existing.version + 1 : 1)
    const contentChanges = []
    let currentText = existing?.text ?? ''
    let textForPosition = fullText ?? currentText

    if (!existing) {
      if (typeof fullText !== 'string') {
        const err = new Error(REQUIRE_FULL_TEXT)
        err.code = REQUIRE_FULL_TEXT
        throw err
      }
      const initialText = fullText ?? ''
      this.docs.set(uri, { version: desiredVersion, text: initialText })
      textForPosition = initialText
      this.send({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: {
          textDocument: {
            uri,
            languageId: 'latex',
            version: desiredVersion,
            text: initialText,
          },
        },
      })
    } else {
      if (Array.isArray(changes) && changes.length > 0) {
        const { text: newText, lspChanges } = this.applyChangesToDoc(
          currentText,
          changes
        )
        currentText = newText
        textForPosition = currentText
        this.docs.set(uri, { version: desiredVersion, text: currentText })
        contentChanges.push(...lspChanges)
      } else if (typeof fullText === 'string') {
        currentText = fullText
        textForPosition = currentText
        this.docs.set(uri, { version: desiredVersion, text: currentText })
        contentChanges.push({ text: currentText })
      }

      if (contentChanges.length > 0) {
        this.send({
          jsonrpc: '2.0',
          method: 'textDocument/didChange',
          params: {
            textDocument: { uri, version: desiredVersion },
            contentChanges,
          },
        })
      }
    }

    const baseText = textForPosition || ''
    let safeOffset = offset
    if (safeOffset > baseText.length) {
      safeOffset = baseText.length
      texlabLogger.warn(
        { offset, safeOffset, length: baseText.length },
        '[Texlab] clamped completion offset'
      )
    } else if (safeOffset < 0) {
      safeOffset = 0
    }

    const position = positionFromOffset(baseText, safeOffset)
    return await this.sendRequest(
      {
        jsonrpc: '2.0',
        id: `completion-${this.nextId++}`,
        method: 'textDocument/completion',
        params: {
          textDocument: { uri },
          position,
        },
      },
      TEXLAB_RESPONSE_TIMEOUT_MS,
      'texlab completion timeout'
    )
  }

  dispose() {
    this.exited = true
    try {
      this.child.kill()
    } catch (err) {
      texlabLogger.warn({ err }, '[Texlab] dispose error')
    }
    for (const [, { reject }] of this.pending) {
      reject(new Error('texlab disposed'))
    }
    this.pending.clear()
  }
}

class TexlabPool {
  constructor() {
    this.pool = new Map()
    setInterval(() => this.sweepIdle(), TEXLAB_IDLE_MS).unref()
  }

  sweepIdle() {
    const now = Date.now()
    for (const [key, proc] of this.pool.entries()) {
      if (!proc.isAlive() || now - proc.lastUsed > TEXLAB_IDLE_MS) {
        proc.dispose()
        this.pool.delete(key)
      }
    }
  }

  ensureProcess(key) {
    const existing = this.pool.get(key)
    if (existing && existing.isAlive()) {
      return existing
    }
    if (existing && !existing.isAlive()) {
      this.pool.delete(key)
    }
    if (this.pool.size >= TEXLAB_MAX_PROCS) {
      // remove oldest
      let oldestKey = null
      let oldestVal = null
      for (const [k, v] of this.pool.entries()) {
        if (!oldestVal || v.lastUsed < oldestVal.lastUsed) {
          oldestKey = k
          oldestVal = v
        }
      }
      if (oldestKey) {
        oldestVal.dispose()
        this.pool.delete(oldestKey)
      }
    }
    const proc = new TexlabProcess(key)
    this.pool.set(key, proc)
    return proc
  }

  async requestCompletion({
    projectId,
    docPath,
    fullText,
    changes,
    version,
    offset,
    text,
  }) {
    const proc = this.ensureProcess(projectId)
    return await proc.completion({
      docPath,
      fullText: fullText ?? text,
      changes,
      version,
      offset,
    })
  }
}

export default new TexlabPool()

// Periodic cleanup of expired tmp workspaces (best-effort)
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
setInterval(() => {
  try {
    const base = TEXLAB_WORKDIR_BASE
    const entries = fs.readdirSync(base, { withFileTypes: true })
    const now = Date.now()
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(base, entry.name)
      const stat = fs.statSync(full)
      // If directory hasn't been touched within TTL, remove recursively
      if (now - stat.mtimeMs > TEXLAB_WORKSPACE_TTL_MS) {
        fs.rmSync(full, { recursive: true, force: true })
        texlabLogger.info({ workspace: full }, '[Texlab] cleaned expired workspace')
      }
    }
  } catch (err) {
    texlabLogger.warn({ err }, '[Texlab] workspace cleanup failed')
  }
}, CLEANUP_INTERVAL_MS).unref()
