import { URL } from 'node:url'
import logger from '@overleaf/logger'
import Metrics from '@overleaf/metrics'
import Settings from '@overleaf/settings'
import AnalyticsManager from '../Analytics/AnalyticsManager.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import SplitTestHandler from '../SplitTests/SplitTestHandler.mjs'
import CompileManager from './CompileManager.mjs'
import Features from '../../infrastructure/Features.js'
import { getFileUrl } from './CompileUrl.mjs'

const COMPILE_TIMEOUT_MS = 10 * 60 * 1000
const COMPILE_HEARTBEAT_INTERVAL_MS =
  parseInt(process.env.COMPILE_HEARTBEAT_MS, 10) || 10 * 1000

// Send interim 102 responses so upstream proxies/CDNs don't drop long-running compile requests.
// We use writeProcessing() because it does not lock in the final HTTP status code.
function startCompileHeartbeat(res) {
  const writeProcessing = res?.writeProcessing?.bind(res)
  if (!writeProcessing || COMPILE_HEARTBEAT_INTERVAL_MS <= 0) {
    return () => {}
  }

  let stopped = false
  let timer

  const stop = () => {
    if (stopped) return
    stopped = true
    if (timer) clearInterval(timer)
    if (typeof res.removeListener === 'function') {
      res.removeListener('close', stop)
      res.removeListener('finish', stop)
    }
  }

  const ping = () => {
    if (stopped || res.writableEnded) {
      stop()
      return
    }
    try {
      writeProcessing()
    } catch (err) {
      logger.debug({ err }, 'failed to send compile heartbeat')
      stop()
    }
  }

  ping()
  timer = setInterval(ping, COMPILE_HEARTBEAT_INTERVAL_MS)
  if (typeof res.on === 'function') {
    res.on('close', stop)
    res.on('finish', stop)
  }
  return stop
}

function getOutputFilesArchiveSpecification(projectId, userId, buildId) {
  const fileName = 'output.zip'
  return {
    path: fileName,
    url: getFileUrl(projectId, userId, buildId, fileName),
    type: 'zip',
  }
}

async function getPdfCachingMinChunkSize(req, res) {
  const { variant } = await SplitTestHandler.promises.getAssignment(
    req,
    res,
    'pdf-caching-min-chunk-size'
  )
  if (variant === 'default') {
    return 1_000_000
  }
  return parseInt(variant, 10)
}

async function getSplitTestOptions(req, res) {
  // Use the query flags from the editor request for overriding the split test.
  let query = {}
  try {
    const u = new URL(req.headers?.referer || req.url, Settings.siteUrl)
    query = Object.fromEntries(u.searchParams.entries())
  } catch (e) {}
  const editorReq = { ...req, query }

  const pdfDownloadDomain = Settings.pdfDownloadDomain

  if (!req.query.enable_pdf_caching) {
    // The frontend does not want to do pdf caching.
    return {
      pdfDownloadDomain,
      enablePdfCaching: false,
    }
  }

  // Double check with the latest split test assignment.
  // We may need to turn off the feature on a short notice, without requiring
  //  all users to reload their editor page to disable the feature.
  const { variant } = await SplitTestHandler.promises.getAssignment(
    editorReq,
    res,
    'pdf-caching-mode'
  )
  const enablePdfCaching = variant === 'enabled'
  if (!enablePdfCaching) {
    // Skip the lookup of the chunk size when caching is not enabled.
    return {
      pdfDownloadDomain,
      enablePdfCaching: false,
    }
  }
  const pdfCachingMinChunkSize = await getPdfCachingMinChunkSize(editorReq, res)
  return {
    pdfDownloadDomain,
    enablePdfCaching,
    pdfCachingMinChunkSize,
  }
}

async function compileProject(req, res, { sendHeartbeat = true } = {}) {
  if (!res.locals) {
    res.locals = {}
  }

  if (sendHeartbeat && typeof res.setTimeout === 'function') {
    res.setTimeout(COMPILE_TIMEOUT_MS)
  }

  const projectId = req.params.Project_id
  const query = req.query || {}
  const body = req.body || {}
  req.query = query
  req.body = body
  const isAutoCompile = !!query.auto_compile
  const fileLineErrors = !!query.file_line_errors
  const stopOnFirstError = !!body.stopOnFirstError
  const compileId = body?.compileId
  const userId = SessionManager.getLoggedInUserId(req.session)
  const sessionId = req.sessionID
  const options = {
    isAutoCompile,
    fileLineErrors,
    stopOnFirstError,
    editorId: body.editorId,
  }

  if (body.rootDoc_id) {
    options.rootDoc_id = body.rootDoc_id
  } else if (body.settingsOverride && body.settingsOverride.rootDoc_id) {
    // Can be removed after deploy
    options.rootDoc_id = body.settingsOverride.rootDoc_id
  }
  if (body.compiler) {
    options.compiler = body.compiler
  }
  if (body.draft) {
    options.draft = body.draft
  }
  if (['validate', 'error', 'silent'].includes(body.check)) {
    options.check = body.check
  }
  if (body.incrementalCompilesEnabled) {
    options.incrementalCompilesEnabled = true
  }

  let { enablePdfCaching, pdfCachingMinChunkSize, pdfDownloadDomain } =
    await getSplitTestOptions(req, res)
  if (Features.hasFeature('saas')) {
    options.compileFromClsiCache = true
    options.populateClsiCache = true
  }
  options.enablePdfCaching = enablePdfCaching
  if (enablePdfCaching) {
    options.pdfCachingMinChunkSize = pdfCachingMinChunkSize
  }

  const stopHeartbeat = sendHeartbeat ? startCompileHeartbeat(res) : () => {}
  let compileResult
  try {
    compileResult = await CompileManager.promises.compile(
      projectId,
      userId,
      options
    )
  } catch (error) {
    Metrics.inc('compile-error')
    throw error
  } finally {
    stopHeartbeat()
  }
  const {
    status,
    outputFiles,
    clsiServerId,
    limits,
    validationProblems,
    stats,
    timings,
    outputUrlPrefix,
    buildId,
    clsiCacheShard,
    adminHint,
  } = compileResult

  Metrics.inc('compile-status', 1, { status })
  if (status === 'unavailable') {
    logger.warn({ projectId, adminHint }, 'compile backend unavailable')
  }
  if (pdfDownloadDomain && outputUrlPrefix) {
    pdfDownloadDomain += outputUrlPrefix
  }

  if (
    limits &&
    SplitTestHandler.getPercentile(
      AnalyticsManager.getIdsFromSession(req.session).analyticsId,
      'compile-result-backend',
      'release'
    ) === 1
  ) {
    // For a compile request to be sent to clsi we need limits.
    // If we get here without having the limits object populated, it is
    //  a reasonable assumption to make that nothing was compiled.
    // We need to know the limits in order to make use of the events.
    AnalyticsManager.recordEventForSession(
      req.session,
      'compile-result-backend',
      {
        projectId,
        ownerAnalyticsId: limits.ownerAnalyticsId,
        status,
        compileTime: timings?.compileE2E,
        timeout: limits.timeout,
        server: clsiServerId?.includes('-c4d-') ? 'faster' : 'normal',
        clsiServerId,
        isAutoCompile,
        isInitialCompile: stats?.isInitialCompile === 1,
        restoredClsiCache: stats?.restoredClsiCache === 1,
        stopOnFirstError,
        isDraftMode: !!options.draft,
      }
    )
  }

  const outputFilesArchive = buildId
    ? getOutputFilesArchiveSpecification(projectId, userId, buildId)
    : null

  const baseRes = {
    status,
    outputFiles,
    outputFilesArchive,
    compileGroup: limits?.compileGroup,
    clsiServerId,
    clsiCacheShard,
    validationProblems,
    stats,
    timings,
    outputUrlPrefix,
    pdfDownloadDomain,
    pdfCachingMinChunkSize,
    compileId,
  }
  if (status === 'unavailable' && adminHint) {
    baseRes.adminHint = adminHint
  }

  return { baseRes, userId, sessionId }
}

export { COMPILE_TIMEOUT_MS, compileProject, startCompileHeartbeat }
