import { URL } from 'node:url'
import cookie from 'cookie'
import signature from 'cookie-signature'
import { WebSocketServer, WebSocket } from 'ws'
import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import AuthorizationManager from '../Authorization/AuthorizationManager.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import { compileProject } from './CompileRunner.mjs'

const COMPILE_WS_PATH = '/compile-ws'
const COMPILE_WS_HEARTBEAT_INTERVAL_MS =
  parseInt(process.env.COMPILE_WS_HEARTBEAT_MS, 10) || 10 * 1000
const COMPILE_WS_STATUS_INTERVAL_MS =
  parseInt(process.env.COMPILE_WS_STATUS_MS, 10) ||
  COMPILE_WS_HEARTBEAT_INTERVAL_MS
const socketsByProject = new Map()
const heartbeatPayload = JSON.stringify({ type: 'heartbeat' })

let heartbeatTimer

function parseSignedSessionId(raw, secrets) {
  if (!raw) return null
  if (!raw.startsWith('s:')) {
    return raw
  }
  const signed = raw.slice(2)
  for (const secret of secrets) {
    const unsigned = signature.unsign(signed, secret)
    if (unsigned !== false) {
      return unsigned
    }
  }
  return null
}

function getSessionIdFromRequest(req, secrets) {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return null
  const cookies = cookie.parse(cookieHeader)
  const raw = cookies[Settings.cookieName]
  return parseSignedSessionId(raw, secrets)
}

async function loadSession(sessionStore, sessionId) {
  if (!sessionId) return null
  return await new Promise((resolve, reject) => {
    sessionStore.get(sessionId, (err, session) => {
      if (err) {
        return reject(err)
      }
      resolve(session || null)
    })
  })
}

function addSocket(projectId, socket) {
  let sockets = socketsByProject.get(projectId)
  if (!sockets) {
    sockets = new Set()
    socketsByProject.set(projectId, sockets)
  }
  sockets.add(socket)
}

function removeSocket(projectId, socket) {
  const sockets = socketsByProject.get(projectId)
  if (!sockets) return
  sockets.delete(socket)
  if (sockets.size === 0) {
    socketsByProject.delete(projectId)
  }
}

async function authorizeConnection(req, sessionStore, sessionSecrets) {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname !== COMPILE_WS_PATH) {
    return { ok: false }
  }

  const projectId = url.searchParams.get('projectId')
  if (!projectId) {
    return { ok: false }
  }

  let session
  let sessionId
  try {
    sessionId = getSessionIdFromRequest(req, sessionSecrets)
    session = await loadSession(sessionStore, sessionId)
  } catch (err) {
    logger.warn({ err }, 'compile websocket session lookup failed')
    return { ok: false }
  }

  const userId = SessionManager.getLoggedInUserId(session)
  const token = session?.anonTokenAccess?.[projectId]
  try {
    const canRead = await AuthorizationManager.promises.canUserReadProject(
      userId,
      projectId,
      token
    )
    if (!canRead) {
      return { ok: false }
    }
  } catch (err) {
    logger.warn({ err, projectId, userId }, 'compile websocket auth failed')
    return { ok: false }
  }

  return { ok: true, projectId, userId, sessionId, session }
}

function startHeartbeatLoop() {
  if (heartbeatTimer || COMPILE_WS_HEARTBEAT_INTERVAL_MS <= 0) {
    return
  }

  heartbeatTimer = setInterval(() => {
    for (const sockets of socketsByProject.values()) {
      for (const socket of sockets) {
        if (socket.readyState !== WebSocket.OPEN) continue
        try {
          socket.send(heartbeatPayload)
        } catch (err) {
          logger.debug({ err }, 'compile websocket heartbeat failed')
        }
      }
    }
  }, COMPILE_WS_HEARTBEAT_INTERVAL_MS)
}

function normalizeMessageData(data) {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8')
  }
  return null
}

function getStatusCodeFromError(err) {
  if (!err || typeof err !== 'object') return undefined
  return err.info?.statusCode || err.statusCode || err.status
}

function sendCompileError(ws, compileId, err) {
  if (ws.readyState !== WebSocket.OPEN) return
  const payload = {
    type: 'compile-error',
    compileId,
    projectId: ws.projectId,
    statusCode: getStatusCodeFromError(err),
    message: err?.message || 'compile failed',
  }
  try {
    ws.send(JSON.stringify(payload))
  } catch (sendErr) {
    logger.debug({ err: sendErr }, 'compile websocket error send failed')
  }
}

function sendCompileStatus(ws, compileId, state, startedAt) {
  if (ws.readyState !== WebSocket.OPEN) return
  const payload = {
    type: 'compile-status',
    compileId,
    projectId: ws.projectId,
    state,
    elapsedMs: Math.max(0, Date.now() - startedAt),
  }
  try {
    ws.send(JSON.stringify(payload))
  } catch (err) {
    logger.debug({ err }, 'compile websocket status send failed')
  }
}

async function handleCompileMessage(ws, payload) {
  const compileId = payload?.compileId
  const requestedProjectId = payload?.projectId
  const projectId = requestedProjectId || ws.projectId
  if (!compileId || projectId !== ws.projectId) {
    sendCompileError(ws, compileId, new Error('invalid compile request'))
    return
  }

  const req = {
    params: { Project_id: ws.projectId },
    query: payload.query || {},
    body: payload.body || {},
    session: ws.session,
    sessionID: ws.sessionId,
    headers: {
      referer: payload.referer,
    },
    url: payload.referer,
  }
  if (!req.body.compileId) {
    req.body.compileId = compileId
  }
  const res = { locals: {} }

  const startedAt = Date.now()
  let statusTimer
  sendCompileStatus(ws, compileId, 'started', startedAt)
  if (COMPILE_WS_STATUS_INTERVAL_MS > 0) {
    statusTimer = setInterval(() => {
      sendCompileStatus(ws, compileId, 'running', startedAt)
    }, COMPILE_WS_STATUS_INTERVAL_MS)
  }

  try {
    const { baseRes, userId, sessionId } = await compileProject(req, res, {
      sendHeartbeat: false,
    })
    if (statusTimer) clearInterval(statusTimer)
    emitCompileResult(ws.projectId, userId, sessionId, baseRes)
  } catch (err) {
    if (statusTimer) clearInterval(statusTimer)
    logger.warn({ err, projectId, compileId }, 'compile websocket failed')
    sendCompileError(ws, compileId, err)
  }
}

export function attachCompileWebsocketServer(
  server,
  sessionStore,
  sessionSecrets
) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname !== COMPILE_WS_PATH) {
      return
    }

    socket.on('error', () => {})

    authorizeConnection(req, sessionStore, sessionSecrets)
      .then(result => {
        if (!result.ok) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }

        wss.handleUpgrade(req, socket, head, ws => {
          ws.projectId = result.projectId
          ws.userId = result.userId ? String(result.userId) : null
          ws.sessionId = result.sessionId || null
          ws.session = result.session || null
          addSocket(result.projectId, ws)

          ws.on('close', () => removeSocket(result.projectId, ws))
          ws.on('error', () => removeSocket(result.projectId, ws))
          ws.on('message', data => {
            const raw = normalizeMessageData(data)
            if (!raw) return
            let payload
            try {
              payload = JSON.parse(raw)
            } catch (err) {
              logger.debug({ err }, 'compile websocket payload parse failed')
              return
            }
            if (payload?.type === 'compile') {
              handleCompileMessage(ws, payload)
            }
          })
        })
      })
      .catch(err => {
        logger.warn({ err }, 'compile websocket upgrade failed')
        socket.destroy()
      })
  })

  startHeartbeatLoop()
}

export function emitCompileResult(projectId, userId, sessionId, result) {
  const sockets = socketsByProject.get(projectId)
  if (!sockets || sockets.size === 0) {
    return
  }

  const targetUserId = userId ? String(userId) : null
  const targetSessionId = sessionId || null
  const payload = JSON.stringify({
    type: 'compile-result',
    compileId: result?.compileId,
    projectId,
    userId: targetUserId,
    result,
  })

  for (const socket of sockets) {
    if (socket.readyState !== WebSocket.OPEN) continue
    if (socket.userId !== targetUserId) continue
    if (targetSessionId && socket.sessionId !== targetSessionId) continue
    try {
      socket.send(payload)
    } catch (err) {
      logger.warn({ err, projectId, userId }, 'compile websocket send failed')
    }
  }
}
