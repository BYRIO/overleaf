import { pipeline } from 'node:stream/promises'
import { Cookie } from 'tough-cookie'
import OError from '@overleaf/o-error'
import Metrics from '@overleaf/metrics'
import ProjectGetter from '../Project/ProjectGetter.mjs'
import CompileManager from './CompileManager.mjs'
import ClsiManager from './ClsiManager.mjs'
import logger from '@overleaf/logger'
import Settings from '@overleaf/settings'
import Errors from '../Errors/Errors.js'
import SessionManager from '../Authentication/SessionManager.mjs'
import { RateLimiter } from '../../infrastructure/RateLimiter.js'
import Validation from '../../infrastructure/Validation.js'
import ClsiCookieManagerFactory from './ClsiCookieManager.mjs'
import Path from 'node:path'
import { expressify } from '@overleaf/promise-utils'
import {
  fetchStreamWithResponse,
  RequestFailedError,
} from '@overleaf/fetch-utils'
import Features from '../../infrastructure/Features.js'
import { emitCompileResult } from './CompileWebsocketManager.mjs'
import {
  COMPILE_TIMEOUT_MS,
  compileProject,
  startCompileHeartbeat,
} from './CompileRunner.mjs'
import { getFileUrl } from './CompileUrl.mjs'

const { z, zz, validateReq } = Validation
const ClsiCookieManager = ClsiCookieManagerFactory(
  Settings.apis.clsi?.backendGroupName
)

const pdfDownloadRateLimiter = new RateLimiter('full-pdf-download', {
  points: 1000,
  duration: 60 * 60,
})

async function _syncTeX(req, res, direction, validatedOptions) {
  const projectId = req.params.Project_id
  const { editorId, buildId, clsiserverid: clsiServerId } = req.query
  if (!editorId?.match(/^[a-f0-9-]+$/)) throw new Error('invalid ?editorId')
  if (!buildId?.match(/^[a-f0-9-]+$/)) throw new Error('invalid ?buildId')

  const userId = CompileController._getUserIdForCompile(req)
  try {
    const body = await CompileManager.promises.syncTeX(projectId, userId, {
      direction,
      compileFromClsiCache: Features.hasFeature('saas'),
      validatedOptions: {
        ...validatedOptions,
        editorId,
        buildId,
      },
      clsiServerId,
    })
    res.json(body)
  } catch (err) {
    if (err instanceof Errors.NotFoundError) return res.status(404).end()
    throw err
  }
}

const deleteAuxFilesSchema = z.object({
  params: z.object({
    Project_id: zz.objectId(),
  }),
  query: z.object({
    clsiserverid: z.string().optional(),
  }),
})

const wordCountSchema = z.object({
  params: z.object({
    Project_id: zz.objectId(),
  }),
  query: z.object({
    clsiserverid: z.string().optional(),
    file: z.string().optional(),
  }),
})

const _CompileController = {
  async compile(req, res) {
    const projectId = req.params.Project_id
    const { baseRes, userId, sessionId } = await compileProject(req, res, {
      sendHeartbeat: true,
    })
    emitCompileResult(projectId, userId, sessionId, baseRes)
    res.json(baseRes)
  },

  async stopCompile(req, res) {
    const projectId = req.params.Project_id
    const userId = SessionManager.getLoggedInUserId(req.session)
    await CompileManager.promises.stopCompile(projectId, userId)
    res.sendStatus(200)
  },

  // Used for submissions through the public API
  async compileSubmission(req, res) {
    res.setTimeout(COMPILE_TIMEOUT_MS)
    const submissionId = req.params.submission_id
    const options = {}
    if (req.body?.rootResourcePath != null) {
      options.rootResourcePath = req.body.rootResourcePath
    }
    if (req.body?.compiler) {
      options.compiler = req.body.compiler
    }
    if (req.body?.draft) {
      options.draft = req.body.draft
    }
    if (['validate', 'error', 'silent'].includes(req.body?.check)) {
      options.check = req.body.check
    }
    options.compileGroup =
      req.body?.compileGroup || Settings.defaultFeatures.compileGroup
    options.compileBackendClass = Settings.apis.clsi.submissionBackendClass
    options.timeout =
      req.body?.timeout || Settings.defaultFeatures.compileTimeout
    const stopHeartbeat = startCompileHeartbeat(res)
    let compileResult
    try {
      compileResult = await ClsiManager.promises.sendExternalRequest(
        submissionId,
        req.body,
        options
      )
    } finally {
      stopHeartbeat()
    }
    const { status, outputFiles, clsiServerId, validationProblems } =
      compileResult
    res.json({
      status,
      outputFiles,
      clsiServerId,
      validationProblems,
    })
  },

  _getUserIdForCompile(req) {
    if (!Settings.disablePerUserCompiles) {
      return SessionManager.getLoggedInUserId(req.session)
    }
    return null
  },

  async downloadPdf(req, res) {
    Metrics.inc('pdf-downloads')
    const projectId = req.params.Project_id
    const rateLimit = () =>
      pdfDownloadRateLimiter
        .consume(req.ip, 1, { method: 'ip' })
        .then(() => true)
        .catch(err => {
          if (err instanceof Error) {
            throw err
          }
          return false
        })

    const project = await ProjectGetter.promises.getProject(projectId, {
      name: 1,
    })

    res.contentType('application/pdf')
    const filename = `${_CompileController._getSafeProjectName(project)}.pdf`

    if (req.query.popupDownload) {
      res.setContentDisposition('attachment', { filename })
    } else {
      res.setContentDisposition('inline', { filename })
    }

    let canContinue
    try {
      canContinue = await rateLimit()
    } catch (err) {
      logger.err({ err }, 'error checking rate limit for pdf download')
      res.sendStatus(500)
      return
    }

    if (!canContinue) {
      logger.debug({ projectId, ip: req.ip }, 'rate limit hit downloading pdf')
      res.sendStatus(500) // should it be 429?
    } else {
      const userId = CompileController._getUserIdForCompile(req)

      const url = getFileUrl(
        projectId,
        userId,
        req.params.build_id,
        'output.pdf'
      )
      await CompileController._proxyToClsi(
        projectId,
        'output-file',
        url,
        {},
        req,
        res
      )
    }
  },

  // Keep in sync with the logic for zip files in ProjectDownloadsController
  _getSafeProjectName(project) {
    return project.name.replace(/[^\p{L}\p{Nd}]/gu, '_')
  },

  async deleteAuxFiles(req, res) {
    const { params, query } = validateReq(req, deleteAuxFilesSchema)
    const projectId = params.Project_id
    const { clsiserverid } = query
    const userId = await CompileController._getUserIdForCompile(req)
    await CompileManager.promises.deleteAuxFiles(
      projectId,
      userId,
      clsiserverid
    )
    res.sendStatus(200)
  },

  // this is only used by templates, so is not called with a userId
  async compileAndDownloadPdf(req, res) {
    const projectId = req.params.project_id

    let outputFiles
    try {
      ;({ outputFiles } = await CompileManager.promises
        // pass userId as null, since templates are an "anonymous" compile
        .compile(projectId, null, {}))
    } catch (err) {
      logger.err(
        { err, projectId },
        'something went wrong compile and downloading pdf'
      )
      res.sendStatus(500)
      return
    }
    const pdf = outputFiles.find(f => f.path === 'output.pdf')
    if (!pdf) {
      logger.warn(
        { projectId },
        'something went wrong compile and downloading pdf: no pdf'
      )
      res.sendStatus(500)
      return
    }
    await CompileController._proxyToClsi(
      projectId,
      'output-file',
      pdf.url,
      {},
      req,
      res
    )
  },

  async getFileFromClsi(req, res) {
    const projectId = req.params.Project_id
    const userId = CompileController._getUserIdForCompile(req)

    const qs = {}

    const url = getFileUrl(
      projectId,
      userId,
      req.params.build_id,
      req.params.file
    )
    await CompileController._proxyToClsi(
      projectId,
      'output-file',
      url,
      qs,
      req,
      res
    )
  },

  async getFileFromClsiWithoutUser(req, res) {
    const submissionId = req.params.submission_id
    const url = getFileUrl(
      submissionId,
      null,
      req.params.build_id,
      req.params.file
    )
    const limits = {
      compileGroup:
        req.body?.compileGroup ||
        req.query?.compileGroup ||
        Settings.defaultFeatures.compileGroup,
      compileBackendClass: Settings.apis.clsi.submissionBackendClass,
    }
    await CompileController._proxyToClsiWithLimits(
      submissionId,
      'output-file',
      url,
      {},
      limits,
      req,
      res
    )
  },

  async proxySyncPdf(req, res) {
    const { page, h, v } = req.query
    if (!page?.match(/^\d+$/)) {
      throw new Error('invalid page parameter')
    }
    if (!h?.match(/^-?\d+\.\d+$/)) {
      throw new Error('invalid h parameter')
    }
    if (!v?.match(/^-?\d+\.\d+$/)) {
      throw new Error('invalid v parameter')
    }
    await _syncTeX(req, res, 'pdf', { page, h, v })
  },

  async proxySyncCode(req, res) {
    const { file, line, column } = req.query
    if (file == null) {
      throw new Error('missing file parameter')
    }
    // Check that we are dealing with a simple file path (this is not
    // strictly needed because synctex uses this parameter as a label
    // to look up in the synctex output, and does not open the file
    // itself).  Since we have valid synctex paths like foo/./bar we
    // allow those by replacing /./ with /
    const testPath = file.replace('/./', '/')
    if (Path.resolve('/', testPath) !== `/${testPath}`) {
      throw new Error('invalid file parameter')
    }
    if (!line?.match(/^\d+$/)) {
      throw new Error('invalid line parameter')
    }
    if (!column?.match(/^\d+$/)) {
      throw new Error('invalid column parameter')
    }
    await _syncTeX(req, res, 'code', { file, line, column })
  },

  async _proxyToClsi(projectId, action, url, qs, req, res) {
    const limits =
      await CompileManager.promises.getProjectCompileLimits(projectId)
    return CompileController._proxyToClsiWithLimits(
      projectId,
      action,
      url,
      qs,
      limits,
      req,
      res
    )
  },

  async _proxyToClsiWithLimits(projectId, action, url, qs, limits, req, res) {
    const persistenceOptions = await _getPersistenceOptions(
      req,
      projectId,
      limits.compileGroup,
      limits.compileBackendClass
    ).catch(err => {
      OError.tag(err, 'error getting cookie jar for clsi request')
      throw err
    })

    url = new URL(`${Settings.apis.clsi.url}${url}`)

    const searchParams = {
      ...persistenceOptions.qs,
      ...qs,
    }
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) {
        // avoid sending "undefined" as a string value
        url.searchParams.set(key, value)
      }
    }

    const timer = new Metrics.Timer(
      'proxy_to_clsi',
      1,
      { path: action },
      [0, 100, 1000, 2000, 5000, 10000, 15000, 20000, 30000, 45000, 60000]
    )
    Metrics.inc('proxy_to_clsi', 1, { path: action, status: 'start' })
    try {
      const { stream, response } = await fetchStreamWithResponse(url.href, {
        method: req.method,
        signal: AbortSignal.timeout(60 * 1000),
        headers: persistenceOptions.headers,
      })
      if (req.destroyed) {
        // The client has disconnected already, avoid trying to write into the broken connection.
        Metrics.inc('proxy_to_clsi', 1, {
          path: action,
          status: 'req-aborted',
        })
        return
      }
      Metrics.inc('proxy_to_clsi', 1, {
        path: action,
        status: response.status,
      })

      for (const key of ['Content-Length', 'Content-Type']) {
        if (response.headers.has(key)) {
          res.setHeader(key, response.headers.get(key))
        }
      }
      res.writeHead(response.status)
      await pipeline(stream, res)
      timer.labels.status = 'success'
      timer.done()
    } catch (err) {
      const reqAborted = Boolean(req.destroyed)
      const status = reqAborted ? 'req-aborted-late' : 'error'
      timer.labels.status = status
      const duration = timer.done()
      Metrics.inc('proxy_to_clsi', 1, { path: action, status })
      const streamingStarted = Boolean(res.headersSent)
      if (!streamingStarted) {
        if (err instanceof RequestFailedError) {
          res.sendStatus(err.response.status)
        } else {
          res.sendStatus(500)
        }
      }
      if (
        streamingStarted &&
        reqAborted &&
        err.code === 'ERR_STREAM_PREMATURE_CLOSE'
      ) {
        // Ignore noisy spurious error
        return
      }
      if (
        err instanceof RequestFailedError &&
        ['sync-to-code', 'sync-to-pdf', 'output-file'].includes(action)
      ) {
        // Ignore noisy error
        // https://github.com/overleaf/internal/issues/15201
        return
      }
      logger.warn(
        {
          err,
          projectId,
          url,
          action,
          reqAborted,
          streamingStarted,
          duration,
        },
        'CLSI proxy error'
      )
    }
  },

  async wordCount(req, res) {
    const { params, query } = validateReq(req, wordCountSchema)
    const projectId = params.Project_id
    const file = query.file || false
    const { clsiserverid } = query
    const userId = CompileController._getUserIdForCompile(req)

    const body = await CompileManager.promises.wordCount(
      projectId,
      userId,
      file,
      clsiserverid
    )
    res.json(body)
  },
}

async function _getPersistenceOptions(
  req,
  projectId,
  compileGroup,
  compileBackendClass
) {
  const { clsiserverid } = req.query
  const userId = SessionManager.getLoggedInUserId(req)
  if (clsiserverid && typeof clsiserverid === 'string') {
    return {
      qs: { clsiserverid, compileGroup, compileBackendClass },
      headers: {},
    }
  } else {
    const clsiServerId = await ClsiCookieManager.promises.getServerId(
      projectId,
      userId,
      compileGroup,
      compileBackendClass
    )
    return {
      qs: { compileGroup, compileBackendClass },
      headers: clsiServerId
        ? {
            Cookie: new Cookie({
              key: Settings.clsiCookie.key,
              value: clsiServerId,
            }).cookieString(),
          }
        : {},
    }
  }
}

const CompileController = {
  COMPILE_TIMEOUT_MS,
  compile: expressify(_CompileController.compile),
  stopCompile: expressify(_CompileController.stopCompile),
  compileSubmission: expressify(_CompileController.compileSubmission),
  downloadPdf: expressify(_CompileController.downloadPdf), //
  compileAndDownloadPdf: expressify(_CompileController.compileAndDownloadPdf),
  deleteAuxFiles: expressify(_CompileController.deleteAuxFiles),
  getFileFromClsi: expressify(_CompileController.getFileFromClsi),
  getFileFromClsiWithoutUser: expressify(
    _CompileController.getFileFromClsiWithoutUser
  ),
  proxySyncPdf: expressify(_CompileController.proxySyncPdf),
  proxySyncCode: expressify(_CompileController.proxySyncCode),
  wordCount: expressify(_CompileController.wordCount),

  _getSafeProjectName: _CompileController._getSafeProjectName,
  _getUserIdForCompile: _CompileController._getUserIdForCompile,
  _proxyToClsi: _CompileController._proxyToClsi,
  _proxyToClsiWithLimits: _CompileController._proxyToClsiWithLimits,
}

export default CompileController
