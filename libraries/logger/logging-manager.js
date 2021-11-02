const Stream = require('stream')
const bunyan = require('bunyan')
const yn = require('yn')
const GCPManager = require('./gcp-manager')
const SentryManager = require('./sentry-manager')
const Serializers = require('./serializers')
const {
  FileLogLevelChecker,
  GCEMetadataLogLevelChecker
} = require('./log-level-checker')

const LoggingManager = {
  initialize(name) {
    this.isProduction =
      (process.env.NODE_ENV || '').toLowerCase() === 'production'
    this.defaultLevel =
      process.env.LOG_LEVEL || (this.isProduction ? 'warn' : 'debug')
    this.loggerName = name
    this.logger = bunyan.createLogger({
      name,
      serializers: {
        err: Serializers.err,
        req: Serializers.req,
        res: Serializers.res
      },
      streams: [this._getOutputStreamConfig()]
    })
    this._setupRingBuffer()
    this._setupLogLevelChecker()
    return this
  },

  initializeErrorReporting(dsn, options) {
    this.sentryManager = new SentryManager()
  },

  debug() {
    return this.logger.debug.apply(this.logger, arguments)
  },

  info() {
    return this.logger.info.apply(this.logger, arguments)
  },

  log() {
    return this.logger.info.apply(this.logger, arguments)
  },

  error(attributes, message, ...args) {
    if (this.ringBuffer !== null && Array.isArray(this.ringBuffer.records)) {
      attributes.logBuffer = this.ringBuffer.records.filter(function (record) {
        return record.level !== 50
      })
    }
    this.logger.error(attributes, message, ...Array.from(args))
    if (this.sentryManager) {
      this.sentryManager.captureExceptionRateLimited(attributes, message)
    }
  },

  err() {
    return this.error.apply(this, arguments)
  },

  warn() {
    return this.logger.warn.apply(this.logger, arguments)
  },

  fatal(attributes, message) {
    this.logger.fatal(attributes, message)
    if (this.sentryManager) {
      this.sentryManager.captureException(attributes, message, 'fatal')
    }
  },

  _getOutputStreamConfig() {
    const gcpEnabled = yn(process.env.GCP_LOGGING)
    if (gcpEnabled) {
      const stream = new Stream.Writable({
        objectMode: true,
        write(entry, encoding, callback) {
          const gcpEntry = GCPManager.convertLogEntry(entry)
          console.log(JSON.stringify(gcpEntry, bunyan.safeCycles()))
          setImmediate(callback)
        }
      })
      return { level: this.defaultLevel, type: 'raw', stream }
    } else {
      return { level: this.defaultLevel, stream: process.stdout }
    }
  },

  _setupRingBuffer() {
    this.ringBufferSize = parseInt(process.env.LOG_RING_BUFFER_SIZE) || 0
    if (this.ringBufferSize > 0) {
      this.ringBuffer = new bunyan.RingBuffer({ limit: this.ringBufferSize })
      this.logger.addStream({
        level: 'trace',
        type: 'raw',
        stream: this.ringBuffer
      })
    } else {
      this.ringBuffer = null
    }
  },

  _setupLogLevelChecker() {
    const logLevelSource = (
      process.env.LOG_LEVEL_SOURCE || 'file'
    ).toLowerCase()

    if (this.logLevelChecker) {
      this.logLevelChecker.stop()
      this.logLevelChecker = null
    }

    if (this.isProduction) {
      switch (logLevelSource) {
        case 'file':
          this.logLevelChecker = new FileLogLevelChecker(this.logger)
          break
        case 'gce_metadata':
          this.logLevelChecker = new GCEMetadataLogLevelChecker(this.logger)
          break
        case 'none':
          break
        default:
          console.log(`Unrecognised log level source: ${logLevelSource}`)
      }
      if (this.logLevelChecker) {
        this.logLevelChecker.start()
      }
    }
  }
}

LoggingManager.initialize('default-sharelatex')

module.exports = LoggingManager
