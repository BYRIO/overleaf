const Path = require('node:path')
const os = require('node:os')

const isPreEmptible = process.env.PREEMPTIBLE === 'TRUE'
const CLSI_SERVER_ID = os.hostname().replace('-ctr', '')

module.exports = {
  compileSizeLimit: process.env.COMPILE_SIZE_LIMIT || '7mb',

  processLifespanLimitMs:
    parseInt(process.env.PROCESS_LIFE_SPAN_LIMIT_MS) || 60 * 60 * 24 * 1000 * 2,

  catchErrors: process.env.CATCH_ERRORS === 'true',

  path: {
    compilesDir:
      process.env.CLSI_COMPILES_PATH || Path.resolve(__dirname, '../compiles'),
    outputDir:
      process.env.CLSI_OUTPUT_PATH || Path.resolve(__dirname, '../output'),
    clsiCacheDir:
      process.env.CLSI_CACHE_PATH || Path.resolve(__dirname, '../cache'),
    synctexBaseDir(projectId) {
      return Path.join(this.compilesDir, projectId)
    },
  },

  internal: {
    clsi: {
      port: 3013,
      host: process.env.LISTEN_ADDRESS || '127.0.0.1',
    },

    load_balancer_agent: {
      report_load: process.env.LOAD_BALANCER_AGENT_REPORT_LOAD !== 'false',
      load_port: 3048,
      local_port: 3049,
      allow_maintenance:
        (
          process.env.LOAD_BALANCER_AGENT_ALLOW_MAINTENANCE ?? ''
        ).toLowerCase() !== 'false',
    },
  },
  apis: {
    clsi: {
      // Internal requests (used by tests only at the time of writing).
      url: `http://${process.env.CLSI_HOST || '127.0.0.1'}:3013`,
      // External url prefix for output files, e.g. for requests via load-balancers.
      outputUrlPrefix: `${process.env.ZONE ? `/zone/${process.env.ZONE}` : ''}`,
      clsiServerId: process.env.CLSI_SERVER_ID || CLSI_SERVER_ID,

      downloadHost: process.env.DOWNLOAD_HOST || 'http://localhost:3013',
    },
    clsiPerf: {
      host: `${process.env.CLSI_PERF_HOST || '127.0.0.1'}:${
        process.env.CLSI_PERF_PORT || '3043'
      }`,
    },
    clsiCache: {
      enabled: !!process.env.CLSI_CACHE_SHARDS,
      shards: JSON.parse(process.env.CLSI_CACHE_SHARDS || '[]'),
    },
  },

  smokeTest: process.env.SMOKE_TEST || false,
  project_cache_length_ms: 1000 * 60 * 60 * 24,
  parallelFileDownloads: process.env.FILESTORE_PARALLEL_FILE_DOWNLOADS || 1,
  filestoreDomainOveride: process.env.FILESTORE_DOMAIN_OVERRIDE,
  texliveImageNameOveride: process.env.TEX_LIVE_IMAGE_NAME_OVERRIDE,
  // Optional global tex compiler flags for CLSI (applies to every compile request if set).
  texCompilerExtraFlags: process.env.TEX_COMPILER_EXTRA_FLAGS || '-shell-escape',
  texliveOpenoutAny: process.env.TEXLIVE_OPENOUT_ANY,
  texliveMaxPrintLine: process.env.TEXLIVE_MAX_PRINT_LINE,
  enablePdfCaching: process.env.ENABLE_PDF_CACHING === 'true',
  enablePdfCachingDark: process.env.ENABLE_PDF_CACHING_DARK === 'true',
  pdfCachingMinChunkSize:
    parseInt(process.env.PDF_CACHING_MIN_CHUNK_SIZE, 10) || 1024,
  pdfCachingMaxProcessingTime:
    parseInt(process.env.PDF_CACHING_MAX_PROCESSING_TIME, 10) || 10 * 1000,
  pdfCachingEnableWorkerPool:
    process.env.PDF_CACHING_ENABLE_WORKER_POOL === 'true',
  pdfCachingWorkerPoolSize:
    parseInt(process.env.PDF_CACHING_WORKER_POOL_SIZE, 10) || 4,
  pdfCachingWorkerPoolBackLogLimit:
    parseInt(process.env.PDF_CACHING_WORKER_POOL_BACK_LOG_LIMIT, 10) || 40,
  compileConcurrencyLimit: isPreEmptible ? 32 : 64,
  performanceLogSamplingPercentage:
    parseFloat(process.env.CLSI_PERFORMANCE_LOG_SAMPLING, 10) || 0,
}

if (process.env.ALLOWED_COMPILE_GROUPS) {
  try {
    module.exports.allowedCompileGroups =
      process.env.ALLOWED_COMPILE_GROUPS.split(' ')
  } catch (error) {
    console.error(error, 'could not apply allowed compile group setting')
    process.exit(1)
  }
}

/* Enforce Docker runner and sandboxed compiles by config regardless of env vars.
   We intentionally ignore environment variables that try to disable these settings
   and warn if a contradictory env value is detected. */

// NOTE: DOCKER_RUNNER and SANDBOXED_COMPILES are enforced in code and cannot be disabled by environment variables.

// Enforced settings
module.exports.clsi = {
  dockerRunner: true,
  docker: {
    runtime: process.env.DOCKER_RUNTIME,
    image:
      process.env.TEX_LIVE_DOCKER_IMAGE ||
      'texlive/texlive:latest-full',
    env: {
      HOME: '/tmp',
      CLSI: 1,
    },
    socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
    user: process.env.TEX_LIVE_IMAGE_USER || 'www-data',
  },
  optimiseInDocker: true,
  expireProjectAfterIdleMs: 24 * 60 * 60 * 1000,
  checkProjectsIntervalMs: 10 * 60 * 1000,
  // Validate host sandboxed compiles path from Docker daemon perspective when the
  // configured host path is not visible inside this container. This is useful in
  // development setups where host paths are mounted differently; set to 'false'
  // to disable.
  validateSandboxedCompilesHostDirViaDocker:
    (process.env.SANDBOXED_COMPILES_VALIDATE_HOST_DIR_VIA_DOCKER || 'true') !== 'false',
  // Optional image used to validate host directory existence when Docker-based
  // validation is enabled. Defaults to a small busybox image.
  sandboxedCompilesDirValidationImage:
    process.env.SANDBOXED_COMPILES_DIR_VALIDATION_IMAGE || 'busybox:1',
}

  try {
    // Override individual docker settings using path-based keys, e.g.:
    // compileGroupDockerConfigs = {
    //    priority: { 'HostConfig.CpuShares': 100 }
    //    beta: { 'dotted.path.here', 'value'}
    // }
    const compileGroupConfig = JSON.parse(
      process.env.COMPILE_GROUP_DOCKER_CONFIGS || '{}'
    )
    // Automatically clean up wordcount and synctex containers
    const defaultCompileGroupConfig = {
      wordcount: { 'HostConfig.AutoRemove': true },
      synctex: { 'HostConfig.AutoRemove': true },
      'synctex-output': { 'HostConfig.AutoRemove': true },
    }
    module.exports.clsi.docker.compileGroupConfig = Object.assign(
      defaultCompileGroupConfig,
      compileGroupConfig
    )
  } catch (error) {
    console.error(error, 'could not apply compile group docker configs')
    process.exit(1)
  }

  let seccompProfilePath
  try {
    seccompProfilePath = Path.resolve(__dirname, '../seccomp/clsi-profile.json')
    module.exports.clsi.docker.seccomp_profile =
      process.env.SECCOMP_PROFILE ||
      JSON.stringify(
        JSON.parse(require('node:fs').readFileSync(seccompProfilePath))
      )
  } catch (error) {
    console.error(
      error,
      `could not load seccomp profile from ${seccompProfilePath}`
    )
    process.exit(1)
  }

  if (process.env.APPARMOR_PROFILE) {
    try {
      module.exports.clsi.docker.apparmor_profile = process.env.APPARMOR_PROFILE
    } catch (error) {
      console.error(error, 'could not apply apparmor profile setting')
      process.exit(1)
    }
  }

  try {
    if (process.env.ALL_TEX_LIVE_DOCKER_IMAGES) {
      // Use ALL_TEX_LIVE_DOCKER_IMAGES as the single source-of-truth for allowed images
      module.exports.clsi.docker.allowedImages =
        process.env.ALL_TEX_LIVE_DOCKER_IMAGES.split(',').map(i => i.trim()).filter(Boolean)
    } else {
      // Default to allowing the configured Tex Live image if no inventory list provided
      module.exports.clsi.docker.allowedImages = [module.exports.clsi.docker.image]
    }
  } catch (error) {
    console.error(error, 'could not populate allowed images from ALL_TEX_LIVE_DOCKER_IMAGES')
    process.exit(1)
  }

  module.exports.path.synctexBaseDir = () => '/compile'

  module.exports.path.sandboxedCompilesHostDirCompiles =
    process.env.SANDBOXED_COMPILES_HOST_DIR_COMPILES ||
    process.env.SANDBOXED_COMPILES_HOST_DIR ||
    process.env.COMPILES_HOST_DIR ||
    (process.env.OVERLEAF_HOST_DATA_DIR
      ? `${process.env.OVERLEAF_HOST_DATA_DIR}/data/compiles`
      : undefined)
  if (!module.exports.path.sandboxedCompilesHostDirCompiles) {
    throw new Error(
      'Sandboxed compiles require SANDBOXED_COMPILES_HOST_DIR_COMPILES to be set'
    )
  }

  module.exports.path.sandboxedCompilesHostDirOutput =
    process.env.SANDBOXED_COMPILES_HOST_DIR_OUTPUT ||
    process.env.OUTPUT_HOST_DIR ||
    (process.env.OVERLEAF_HOST_DATA_DIR
      ? `${process.env.OVERLEAF_HOST_DATA_DIR}/data/output`
      : undefined)
  if (!module.exports.path.sandboxedCompilesHostDirOutput) {
    // TODO(das7pad): Enforce in a future major version of Server Pro.
    // throw new Error(
    //   'Sandboxed compiles host dir output not set: SANDBOXED_COMPILES_HOST_DIR_OUTPUT not set'
    // )
  }
