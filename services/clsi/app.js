// Metrics must be initialized before importing anything else
require('@overleaf/metrics/initialize')

const CompileController = require('./app/js/CompileController')
const ContentController = require('./app/js/ContentController')
const Settings = require('@overleaf/settings')
const logger = require('@overleaf/logger')
logger.initialize('clsi')
const LoggerSerializers = require('./app/js/LoggerSerializers')
logger.logger.serializers.clsiRequest = LoggerSerializers.clsiRequest

const Metrics = require('@overleaf/metrics')

const smokeTest = require('./test/smoke/js/SmokeTests')
const ContentTypeMapper = require('./app/js/ContentTypeMapper')
const Errors = require('./app/js/Errors')
const { createOutputZip } = require('./app/js/OutputController')

const Path = require('node:path')

Metrics.open_sockets.monitor(true)
Metrics.memory.monitor(logger)
Metrics.leaked_sockets.monitor(logger)

const ProjectPersistenceManager = require('./app/js/ProjectPersistenceManager')
const OutputCacheManager = require('./app/js/OutputCacheManager')
const ContentCacheManager = require('./app/js/ContentCacheManager')

ProjectPersistenceManager.init()
OutputCacheManager.init()

const express = require('express')
const bodyParser = require('body-parser')
const app = express()

Metrics.injectMetricsRoute(app)
app.use(Metrics.http.monitor(logger))

// Compile requests can take longer than the default two
// minutes (including file download time), so bump up the
// timeout a bit.
const TIMEOUT = 10 * 60 * 1000
app.use(function (req, res, next) {
  req.setTimeout(TIMEOUT)
  res.setTimeout(TIMEOUT)
  res.removeHeader('X-Powered-By')
  next()
})

app.param('project_id', function (req, res, next, projectId) {
  if (projectId?.match(/^[a-zA-Z0-9_-]+$/)) {
    next()
  } else {
    next(new Error('invalid project id'))
  }
})

app.param('user_id', function (req, res, next, userId) {
  if (userId?.match(/^[0-9a-f]{24}$/)) {
    next()
  } else {
    next(new Error('invalid user id'))
  }
})

app.param('build_id', function (req, res, next, buildId) {
  if (buildId?.match(OutputCacheManager.BUILD_REGEX)) {
    next()
  } else {
    next(new Error(`invalid build id ${buildId}`))
  }
})

app.param('contentId', function (req, res, next, contentId) {
  if (contentId?.match(OutputCacheManager.CONTENT_REGEX)) {
    next()
  } else {
    next(new Error(`invalid content id ${contentId}`))
  }
})

app.param('hash', function (req, res, next, hash) {
  if (hash?.match(ContentCacheManager.HASH_REGEX)) {
    next()
  } else {
    next(new Error(`invalid hash ${hash}`))
  }
})

app.post(
  '/project/:project_id/compile',
  bodyParser.json({ limit: Settings.compileSizeLimit }),
  CompileController.compile
)
app.post('/project/:project_id/compile/stop', CompileController.stopCompile)
app.delete('/project/:project_id', CompileController.clearCache)

app.get('/project/:project_id/sync/code', CompileController.syncFromCode)
app.get('/project/:project_id/sync/pdf', CompileController.syncFromPdf)
app.get('/project/:project_id/wordcount', CompileController.wordcount)
app.get('/project/:project_id/status', CompileController.status)
app.post('/project/:project_id/status', CompileController.status)

// Per-user containers
app.post(
  '/project/:project_id/user/:user_id/compile',
  bodyParser.json({ limit: Settings.compileSizeLimit }),
  CompileController.compile
)
app.post(
  '/project/:project_id/user/:user_id/compile/stop',
  CompileController.stopCompile
)
app.delete('/project/:project_id/user/:user_id', CompileController.clearCache)

app.get(
  '/project/:project_id/user/:user_id/sync/code',
  CompileController.syncFromCode
)
app.get(
  '/project/:project_id/user/:user_id/sync/pdf',
  CompileController.syncFromPdf
)
app.get(
  '/project/:project_id/user/:user_id/wordcount',
  CompileController.wordcount
)

const ForbidSymlinks = require('./app/js/StaticServerForbidSymlinks')

// create a static server which does not allow access to any symlinks
// avoids possible mismatch of root directory between middleware check
// and serving the files
const staticOutputServer = ForbidSymlinks(
  express.static,
  Settings.path.outputDir,
  {
    setHeaders(res, path, stat) {
      if (Path.basename(path) === 'output.pdf') {
        // Calculate an etag in the same way as nginx
        // https://github.com/tj/send/issues/65
        const etag = (path, stat) =>
          `"${Math.ceil(+stat.mtime / 1000).toString(16)}` +
          '-' +
          Number(stat.size).toString(16) +
          '"'
        res.set('Etag', etag(path, stat))
      }
      res.set('Content-Type', ContentTypeMapper.map(path))
    },
  }
)

// This needs to be before GET /project/:project_id/build/:build_id/output/*
app.get(
  '/project/:project_id/build/:build_id/output/output.zip',
  bodyParser.json(),
  createOutputZip
)

// This needs to be before GET /project/:project_id/user/:user_id/build/:build_id/output/*
app.get(
  '/project/:project_id/user/:user_id/build/:build_id/output/output.zip',
  bodyParser.json(),
  createOutputZip
)

app.get(
  '/project/:project_id/user/:user_id/build/:build_id/output/*',
  function (req, res, next) {
    // for specific build get the path from the OutputCacheManager (e.g. .clsi/buildId)
    req.url =
      `/${req.params.project_id}-${req.params.user_id}/` +
      OutputCacheManager.path(req.params.build_id, `/${req.params[0]}`)
    staticOutputServer(req, res, next)
  }
)

app.get(
  '/project/:projectId/content/:contentId/:hash',
  ContentController.getPdfRange
)
app.get(
  '/project/:projectId/user/:userId/content/:contentId/:hash',
  ContentController.getPdfRange
)

app.get(
  '/project/:project_id/build/:build_id/output/*',
  function (req, res, next) {
    // for specific build get the path from the OutputCacheManager (e.g. .clsi/buildId)
    req.url =
      `/${req.params.project_id}/` +
      OutputCacheManager.path(req.params.build_id, `/${req.params[0]}`)
    staticOutputServer(req, res, next)
  }
)

app.get('/oops', function (req, res, next) {
  logger.error({ err: 'hello' }, 'test error')
  res.send('error\n')
})

app.get('/oops-internal', function (req, res, next) {
  setTimeout(function () {
    throw new Error('Test error')
  }, 1)
})

app.get('/status', (req, res, next) => res.send('CLSI is alive\n'))

Settings.processTooOld = false
if (Settings.processLifespanLimitMs) {
  // Pre-emp instances have a maximum lifespan of 24h after which they will be
  //  shutdown, with a 30s grace period.
  // Spread cycling of VMs by up-to 2.4h _before_ their limit to avoid large
  //  numbers of VMs that are temporarily unavailable (while they reboot).
  Settings.processLifespanLimitMs -=
    Settings.processLifespanLimitMs * (Math.random() / 10)
  logger.info(
    { target: new Date(Date.now() + Settings.processLifespanLimitMs) },
    'Lifespan limited'
  )

  setTimeout(() => {
    logger.info({}, 'shutting down, process is too old')
    Settings.processTooOld = true
  }, Settings.processLifespanLimitMs)
}

function runSmokeTest() {
  if (Settings.processTooOld) return
  const INTERVAL = 30 * 1000
  if (
    smokeTest.lastRunSuccessful() &&
    CompileController.timeSinceLastSuccessfulCompile() < INTERVAL / 2
  ) {
    logger.debug('skipping smoke tests, got recent successful user compile')
    return setTimeout(runSmokeTest, INTERVAL / 2)
  }
  logger.debug('running smoke tests')
  smokeTest.triggerRun(err => {
    if (err) logger.error({ err }, 'smoke tests failed')
    setTimeout(runSmokeTest, INTERVAL)
  })
}
if (Settings.smokeTest) {
  runSmokeTest()
}

app.get('/health_check', function (req, res) {
  if (Settings.processTooOld) {
    return res.status(500).json({ processTooOld: true })
  }
  if (ProjectPersistenceManager.isAnyDiskCriticalLow()) {
    return res.status(500).json({ diskCritical: true })
  }
  smokeTest.sendLastResult(res)
})

// Enhance health_check for docker runtime
app.get('/health_check_docker', async function (req, res) {
  if (!(Settings.clsi && Settings.clsi.dockerRunner)) {
    return res.json({ docker: 'not-enabled' })
  }
  try {
    const fs = require('fs')
    const socketPath = (Settings.clsi.docker && Settings.clsi.docker.socketPath) || '/var/run/docker.sock'
    const stat = fs.statSync(socketPath)
    if (!stat.isSocket()) {
      return res.status(500).json({ docker: 'socket-not-socket' })
    }
    const Docker = require('dockerode')
    const docker = new Docker({ socketPath })
    await new Promise((resolve, reject) => docker.version((err, info) => (err ? reject(err) : resolve(info))))
    return res.json({ docker: 'ok' })
  } catch (err) {
    logger.warn({ err }, 'docker health check failed')
    return res.status(500).json({ docker: 'unavailable', err: err.message })
  }
})

app.get('/smoke_test_force', (req, res) => smokeTest.sendNewResult(res))

app.use(function (error, req, res, next) {
  if (error instanceof Errors.NotFoundError) {
    logger.debug({ err: error, url: req.url }, 'not found error')
    res.sendStatus(404)
  } else if (error instanceof Errors.InvalidParameter) {
    res.status(400).send(error.message)
  } else if (error.code === 'EPIPE') {
    // inspect container returns EPIPE when shutting down
    res.sendStatus(503) // send 503 Unavailable response
  } else {
    logger.error({ err: error, url: req.url }, 'server error')
    res.sendStatus(error.statusCode || 500)
  }
})

const net = require('node:net')
const os = require('node:os')

let STATE = 'up'

const loadTcpServer = net.createServer(function (socket) {
  socket.on('error', function (err) {
    if (err.code === 'ECONNRESET') {
      // this always comes up, we don't know why
      return
    }
    logger.err({ err }, 'error with socket on load check')
    socket.destroy()
  })

  if (STATE === 'up' && Settings.internal.load_balancer_agent.report_load) {
    let availableWorkingCpus
    const currentLoad = os.loadavg()[0]

    // staging clis's have 1 cpu core only
    if (os.cpus().length === 1) {
      availableWorkingCpus = 1
    } else {
      availableWorkingCpus = os.cpus().length - 1
    }

    const freeLoad = availableWorkingCpus - currentLoad
    let freeLoadPercentage = Math.round((freeLoad / availableWorkingCpus) * 100)
    if (ProjectPersistenceManager.isAnyDiskCriticalLow()) {
      freeLoadPercentage = 0
    }
    if (ProjectPersistenceManager.isAnyDiskLow()) {
      freeLoadPercentage = freeLoadPercentage / 2
    }

    if (
      Settings.internal.load_balancer_agent.allow_maintenance &&
      freeLoadPercentage <= 0
    ) {
      // When its 0 the server is set to drain implicitly.
      // Drain will move new projects to different servers.
      // Drain will keep existing projects assigned to the same server.
      // Maint will more existing and new projects to different servers.
      socket.write(`maint, 0%\n`, 'ASCII')
    } else {
      // Ready will cancel the maint state.
      socket.write(`up, ready, ${Math.max(freeLoadPercentage, 1)}%\n`, 'ASCII')
      if (freeLoadPercentage <= 0) {
        // This metric records how often we would have gone into maintenance mode.
        Metrics.inc('clsi-prevented-maint')
      }
    }
    socket.end()
  } else {
    socket.write(`${STATE}\n`, 'ASCII')
    socket.end()
  }
})

const loadHttpServer = express()

loadHttpServer.post('/state/up', function (req, res, next) {
  STATE = 'up'
  logger.debug('getting message to set server to down')
  res.sendStatus(204)
})

loadHttpServer.post('/state/down', function (req, res, next) {
  STATE = 'down'
  logger.debug('getting message to set server to down')
  res.sendStatus(204)
})

loadHttpServer.post('/state/maint', function (req, res, next) {
  STATE = 'maint'
  logger.debug('getting message to set server to maint')
  res.sendStatus(204)
})

const port = Settings.internal.clsi.port
const host = Settings.internal.clsi.host

const loadTcpPort = Settings.internal.load_balancer_agent.load_port
const loadHttpPort = Settings.internal.load_balancer_agent.local_port

if (!module.parent) {
  // Called directly

  // handle uncaught exceptions when running in production
  if (Settings.catchErrors) {
    process.removeAllListeners('uncaughtException')
    process.on('uncaughtException', error =>
      logger.error({ err: error }, 'uncaughtException')
    )
  }

  // Diagnostic guard: if `app.listen` is not a function, log helpful debug and exit.
  try {
    const type = typeof app?.listen
    if (type !== 'function') {
      logger.fatal({ typeofListen: type, keys: Object.keys(app || {}).slice(0, 50) }, 'FATAL: CLSI app.listen is not a function')
      // Provide extra debugging info about express resolution
      try {
        const expressResolved = require.resolve('express')
        logger.fatal({ expressResolved }, 'Express resolve path')
        const expressVersion = JSON.parse(require('fs').readFileSync(require.resolve('express/package.json'), 'utf8')).version
        logger.fatal({ expressVersion }, 'Express version')
      } catch (err) {
        logger.fatal({ err }, 'failed to resolve express runtime info')
      }
      // Avoid runaway runit restarts by failing early with a clear code
      process.exit(200)
    }
    // Log extra diagnostic data to help identify env/module differences
    logger.info({ nodeEnv: process.env.NODE_ENV, moduleId: module.id, moduleParent: !!module.parent, appType: typeof app, appHasListen: typeof app?.listen === 'function' }, 'CLSI start diagnostic: app type info')
  } catch (err) {
    logger.fatal({ err }, 'Error during CLSI start diagnostic checks')
    process.exit(201)
  }

  app.listen(port, host, error => {
    if (error) {
      logger.fatal({ error }, `Error starting CLSI on ${host}:${port}`)
    } else {
      logger.info(
        {
          host,
          port,
          dockerRunner: Settings.clsi?.dockerRunner === true,
          image: Settings.clsi?.docker?.image,
          socketPath: Settings.clsi?.docker?.socketPath,
        },
        `CLSI starting up, listening on ${host}:${port}`
      )
    }
  });

  // Run preflight checks for docker/sandboxed compiles when enabled
  (async () => {
    if (Settings.clsi && Settings.clsi.dockerRunner) {
        if (process.env.OVERLEAF_IS_SERVER_PRO !== 'true') {
          logger.warn('Sandboxed compiles are configured and enforcement is enabled in code; you are enabling sandboxed compiles in Community Edition. Ensure you understand the security implications.')
        }
      const fs = require('fs')
      const Path = require('path')
      const Docker = require('dockerode')
      const dir = Settings.path.sandboxedCompilesHostDirCompiles
      // -- keep preflight behavior: use configured dir value as-is ---
      try {
        if (!dir) {
          logger.fatal('Sandboxed compiles host dir not configured: SANDBOXED_COMPILES_HOST_DIR_COMPILES missing')
          // 101: Missing required host bind mount / environment for compiles
          process.exit(101)
        }
        try {
          const stat = fs.statSync(dir)
          if (!stat.isDirectory()) {
            logger.fatal({ dir }, 'Sandboxed compiles host dir is not a directory: SANDBOXED_COMPILES_HOST_DIR_COMPILES')
            // 102: Not a directory
            process.exit(102)
          }
          // Check writable
          fs.accessSync(dir, fs.constants.W_OK)
        } catch (err) {
          // If stat failed due to ENOENT or similar, we may still be able to
          // verify the host path from the Docker daemon (host) perspective.
          // This happens when the host path exists on the Docker host but is
          // not visible inside this container under the same absolute path.
          if (err && err.code === 'ENOENT') {
            // Optionally attempt Docker-based validation when configured and
            // when Docker runner is enabled. This avoids failing on ENOENT for
            // typical dev setups where host paths are not mounted into the
            // running container.
            const allowDockerValidation = Settings.clsi?.validateSandboxedCompilesHostDirViaDocker !== false
            if (Settings.clsi && Settings.clsi.dockerRunner && allowDockerValidation) {
              try {
                const socketPath = (Settings.clsi.docker && Settings.clsi.docker.socketPath) || '/var/run/docker.sock'
                const docker = new Docker({ socketPath })
                // Use a small image to validate existence of the directory from
                // the docker daemon's perspective. Use a non-privileged test
                // and avoid requiring pre-existing images where possible.
                const validationImage = Settings.clsi?.sandboxedCompilesDirValidationImage || 'busybox:1'
                // Ensure the image exists locally; allow docker to pull it if needed.
                try {
                  await new Promise((resolve, reject) => {
                    docker.getImage(validationImage).inspect((err, info) => {
                      if (err) return reject(err)
                      return resolve(info)
                    })
                  })
                } catch (ex) {
                  logger.warn({ image: validationImage }, 'Validation image not present locally; attempting to pull')
                  await new Promise((resolve, reject) => {
                    docker.pull(validationImage, (err, stream) => {
                      if (err) return reject(err)
                      docker.modem.followProgress(stream, (err, out) => (err ? reject(err) : resolve(out)))
                    })
                  })
                }

                const validationContainer = await docker.createContainer({
                  Image: validationImage,
                  Cmd: ['sh', '-c', 'test -d /hostdir'],
                  HostConfig: {
                    Binds: [`${dir}:/hostdir:ro`],
                  },
                  Tty: false,
                  AttachStderr: true,
                  AttachStdout: true,
                })
                await validationContainer.start()
                const wait = await validationContainer.wait()
                const exitCode = wait.StatusCode
                await validationContainer.remove({ force: true })
                if (exitCode !== 0) {
                  logger.fatal({ dir, exitCode }, 'Sandboxed compiles host dir invalid from Docker perspective: SANDBOXED_COMPILES_HOST_DIR_COMPILES')
                  // 103: Not writable or invalid (validated by Docker)
                  process.exit(103)
                }
                logger.info({ dir }, 'Sandboxed compiles host dir is not visible inside this container but validated successfully from Docker daemon; continuing')
              } catch (dockerErr) {
                logger.fatal({ err: dockerErr, dir }, 'Sandboxed compiles host dir invalid or not writable: SANDBOXED_COMPILES_HOST_DIR_COMPILES (docker validation failed)')
                process.exit(103)
              }
            } else {
              logger.fatal({ err, dir }, 'Sandboxed compiles host dir invalid or not writable: SANDBOXED_COMPILES_HOST_DIR_COMPILES')
              // 103: Not writable or invalid
              process.exit(103)
            }
          } else {
            logger.fatal({ err, dir }, 'Sandboxed compiles host dir invalid or not writable: SANDBOXED_COMPILES_HOST_DIR_COMPILES')
            // 103: Not writable or invalid
            process.exit(103)
          }
        }
      } catch (err) {
        logger.fatal({ err }, 'Unexpected error while validating sandboxed compiles host directory')
        process.exit(103)
      }

      // Optionally check the output dir exists and is a directory
      const outDir = Settings.path.sandboxedCompilesHostDirOutput
      // -- keep output dir unchecked and use configured value as-is --
      if (outDir) {
        try {
          const outStat = fs.statSync(outDir)
          if (!outStat.isDirectory()) {
            logger.warn({ outDir }, 'Sandboxed compiles output host dir exists but is not a directory: SANDBOXED_COMPILES_HOST_DIR_OUTPUT')
          }
        } catch (err) {
          logger.warn({ err, outDir }, 'Sandboxed compiles output host dir not present or invalid: SANDBOXED_COMPILES_HOST_DIR_OUTPUT')
        }
      }

      // check docker socket
      try {
        const socketPath = (Settings.clsi.docker && Settings.clsi.docker.socketPath) || '/var/run/docker.sock'
        const stat = fs.statSync(socketPath)
        if (!stat.isSocket() && !stat.isCharacterDevice() && !stat.isFIFO()) {
          logger.fatal({ socketPath }, 'Docker socket path does not appear to be a socket')
          // 105: Docker socket path invalid
          process.exit(105)
        }
        // Try basic docker version check with dockerode if available
        try {
          const Docker = require('dockerode')
          const docker = new Docker({ socketPath: socketPath })
          await new Promise((resolve, reject) => docker.version((err, d) => (err ? reject(err) : resolve(d))))
          // Validate default image is allowed (based on ALL_TEX_LIVE_DOCKER_IMAGES or default image)
          try {
            const defaultImage = Settings.clsi.docker?.image
            const allowedImages = Settings.clsi.docker?.allowedImages || []
            if (!allowedImages.includes(defaultImage)) {
              logger.fatal({ defaultImage, allowedImages }, 'TEX_LIVE_DOCKER_IMAGE must be included in ALL_TEX_LIVE_DOCKER_IMAGES')
              // 106: Tex live image mismatch
              process.exit(106)
            }

            // Ensure all images listed in ALL_TEX_LIVE_DOCKER_IMAGES are present or can be pulled
            const allImagesEnv = process.env.ALL_TEX_LIVE_DOCKER_IMAGES
            if (allImagesEnv) {
              const allImages = allImagesEnv.split(',').map(i => i.trim()).filter(Boolean)
              for (const image of allImages) {
                // Ensure ALL_TEX_LIVE_DOCKER_IMAGES images are included in allowedImages
                if (!allowedImages.includes(image)) {
                  logger.fatal({ image, allowedImages }, 'ALL_TEX_LIVE_DOCKER_IMAGES contains an image not listed in allowed images list')
                  process.exit(1)
                }
                // Check image presence, otherwise try to pull it
                let imagePresent = true
                try {
                  await docker.getImage(image).inspect()
                } catch (err) {
                  imagePresent = false
                }
                if (!imagePresent) {
                  logger.warn({ image }, 'TexLive image not found locally; attempting to pull')
                  await new Promise((resolve, reject) => {
                    docker.pull(image, (err, stream) => {
                      if (err) return reject(err)
                      docker.modem.followProgress(stream, (err, out) => (err ? reject(err) : resolve(out)))
                    })
                  })
                  logger.info({ image }, 'Successfully pulled TexLive image')
                }
              }
            }
          } catch (err) {
            logger.fatal({ err }, 'Error validating Docker images or ALL_TEX_LIVE_DOCKER_IMAGES settings')
            process.exit(1)
          }
        } catch (err) {
          logger.fatal({ err }, 'failed to reach docker daemon, cannot start sibling-container compiles')
          process.exit(1)
        }
      } catch (err) {
        logger.fatal({ err }, 'missing or invalid docker socket')
        process.exit(1)
      }
      // Log runtime settings
      logger.info(
        {
          dockerRunner: Settings.clsi.dockerRunner,
          dockerImage: Settings.clsi.docker?.image,
          socketPath: Settings.clsi.docker?.socketPath || '/var/run/docker.sock',
          sandboxCompilesHostDirCompiles: Settings.path.sandboxedCompilesHostDirCompiles,
          sandboxCompilesHostDirOutput: Settings.path.sandboxedCompilesHostDirOutput,
        },
        'CLSI startup preflight checks passed for Docker runner'
      )
    }
  })()

  loadTcpServer.listen(loadTcpPort, host, function (error) {
    if (error != null) {
      throw error
    }
    logger.debug(`Load tcp agent listening on load port ${loadTcpPort}`)
  })

  loadHttpServer.listen(loadHttpPort, host, function (error) {
    if (error != null) {
      throw error
    }
    logger.debug(`Load http agent listening on load port ${loadHttpPort}`)
  })
}

module.exports = app
