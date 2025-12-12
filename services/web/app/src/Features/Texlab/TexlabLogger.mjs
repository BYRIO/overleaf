import fs from 'node:fs'
import path from 'node:path'
import logger from '@overleaf/logger'

const preferredPath =
  process.env.TEXLAB_LOG_PATH || path.join('/var/log/overleaf', 'texlab.log')
const fallbackPath = '/tmp/texlab.log'

function openStream(logPath) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    return fs.createWriteStream(logPath, { flags: 'a' })
  } catch (err) {
    logger.warn({ err, logPath }, '[Texlab] failed to open log file')
    return null
  }
}

let texlabLogPath = preferredPath
let texlabStream = openStream(preferredPath)
if (!texlabStream && !process.env.TEXLAB_LOG_PATH) {
  texlabLogPath = fallbackPath
  texlabStream = openStream(fallbackPath)
}

const levels = ['debug', 'info', 'warn', 'error']

function toEntry(attributes, message) {
  const base =
    typeof attributes === 'string'
      ? { msg: attributes }
      : attributes || {}
  if (message) {
    return { ...base, msg: message }
  }
  return base
}

function write(level, attributes, message, ...args) {
  const entry = toEntry(attributes, message)
  const payload = {
    ...entry,
    level,
    time: new Date().toISOString(),
    logPath: texlabLogPath,
  }

  // keep existing web logs
  if (typeof logger[level] === 'function') {
    logger[level](attributes, message, ...args)
  }

  // append to dedicated texlab log file
  if (texlabStream) {
    texlabStream.write(JSON.stringify(payload) + '\n')
  }
}

const texlabLogger = {}
for (const level of levels) {
  texlabLogger[level] = (attributes, message, ...args) =>
    write(level, attributes, message, ...args)
}
texlabLogger.logPath = texlabLogPath

export default texlabLogger
