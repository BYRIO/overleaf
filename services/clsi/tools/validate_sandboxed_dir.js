#!/usr/bin/env node
// Quick script to validate sandboxed compiles host dir from inside a container.
// This duplicates the same validation used in the main app to aid debugging.
const Settings = require('@overleaf/settings')
const Docker = require('dockerode')
const fs = require('fs')

async function validate() {
  const dir = Settings.path.sandboxedCompilesHostDirCompiles
  console.log('Configured sandboxed compiles host dir:', dir)
  if (!dir) {
    console.error('SANDBOXED_COMPILES_HOST_DIR_COMPILES not defined in Settings.path.sandboxedCompilesHostDirCompiles')
    process.exit(1)
  }
  try {
    const stat = fs.statSync(dir)
    console.log('FS stat succeeded locally inside container (exists):', dir)
    if (!stat.isDirectory()) {
      console.error('Configured path is not a directory')
      process.exit(1)
    }
    console.log('Writable check...')
    fs.accessSync(dir, fs.constants.W_OK)
    console.log('It is writable by the container user')
  } catch (err) {
    console.warn('Local stat or write check failed:', err.message)
    if (!(Settings.clsi && Settings.clsi.dockerRunner && Settings.clsi.validateSandboxedCompilesHostDirViaDocker !== false)) {
      console.error('Docker-based validation not enabled; aborting')
      process.exit(1)
    }
    const validationImage = Settings.clsi?.sandboxedCompilesDirValidationImage || 'busybox:1'
    const docker = new Docker({ socketPath: Settings.clsi?.docker?.socketPath || '/var/run/docker.sock' })
    try {
      await new Promise((resolve, reject) => {
        docker.getImage(validationImage).inspect((e, i) => (e ? reject(e) : resolve(i)))
      })
    } catch (ex) {
      console.log('Pulling validation image: ', validationImage)
      await new Promise((resolve, reject) => {
        docker.pull(validationImage, (e, s) => (e ? reject(e) : docker.modem.followProgress(s, (er, o) => (er ? reject(er) : resolve(o)))))
      })
    }
    const container = await docker.createContainer({ Image: validationImage, Cmd: ['sh', '-c', 'test -d /hostdir'], HostConfig: { Binds: [`${dir}:/hostdir:ro`] } })
    await container.start()
    const wait = await container.wait()
    await container.remove({ force: true })
    if (wait && wait.StatusCode === 0) {
      console.log('Docker validated that the configured host dir exists on the host and is accessible to Docker')
      process.exit(0)
    }
    console.error('Docker validation failed, exit code:', wait)
    process.exit(1)
  }
}

validate().catch(err => {
  console.error('Validation script error', err)
  process.exit(1)
})
