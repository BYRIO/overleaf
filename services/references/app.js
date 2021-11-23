const metrics = require('@overleaf/metrics')
metrics.initialize('reference')

const Settings = require('@overleaf/settings')
const logger = require('logger-sharelatex')
logger.initialize('reference')
if ((Settings.sentry != null ? Settings.sentry.dsn : undefined) != null) {
  logger.initializeErrorReporting(Settings.sentry.dsn)
}
metrics.memory.monitor(logger)

const mongodb = require('./app/js/mongodb')
const ReferencesAPIController = require('./app/js/ReferencesAPIController')
const express = require('express')
const app = express()
metrics.injectMetricsRoute(app)
const bodyParser = require('body-parser')
// const HealthCheckController = require('./app/js/HealthCheckController')

app.use(bodyParser.json({ limit: '2mb' }))
app.use(metrics.http.monitor(logger))

app.post('/project/:project_id/index', ReferencesAPIController.index)
app.get('/status', (req, res) => res.send({ status: 'references api is up' }))

// app.get('/health_check', HealthCheckController.healthCheck)

const settings =
  Settings.internal && Settings.internal.references
    ? Settings.internal.references
    : undefined
const host = settings && settings.host ? settings.host : 'localhost'
const port = settings && settings.port ? settings.port : 3006

if (!module.parent) {
  // application entry point, called directly
  mongodb
    .waitForDb()
    .then(() => {
      app.listen(port, host, function (error) {
        if (error != null) {
          throw error
        }
        return logger.info(`references starting up, listening on ${host}:${port}`)
      })
    })
    .catch(err => {
      logger.fatal({ err }, 'Cannot connect to mongo. Exiting.')
      process.exit(1)
    })
}

module.exports = app
