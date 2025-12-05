import { db } from '../../../app/src/infrastructure/mongodb.js'
// single import for Settings
//
// This script validates TexLive Docker image configuration against the projects
// in the database. Behavior modifiers via env variables:
//
// - SKIP_TEX_LIVE_CHECK=true: skip checks entirely (legacy override)
// - AUTO_BACKFILL_TEXLIVE_IMAGE=true: attempt to run the backfill script to
//    set a default image on projects missing imageName (the script runs
//    'node scripts/backfill_project_image_name.mjs --commit <image>').
// - FAIL_ON_MISSING_TEXLIVE_IMAGE=true: when missing project imageName, exit
//    with non-zero status (default is to continue and log a warning).
// - AUTO_PULL_TEXLIVE_IMAGE=true: attempt to pull missing Tex Live images
//    (requires `docker` CLI to be available in the environment). By default
//    this is disabled to avoid accidental host-side docker operations.
// - FAIL_ON_IMAGE_PULL_FAILURE=true: when pulling images fails, exit with a
//    non-zero status. Default is to continue and log a warning.
//
import Settings from '@overleaf/settings'
import { spawnSync } from 'child_process'

async function readImagesInUse() {
  const projectCount = await db.projects.countDocuments()
  if (projectCount === 0) {
    return []
  }
  const images = await db.projects.distinct('imageName')

  if (!images || images.length === 0 || images.includes(null)) {
    console.error(`'project.imageName' is not set for some projects`)
    console.error(
      `If this is a fresh install please run the backfill or set project imageName manually` +
        ` (see bin/run-script scripts/backfill_project_image_name.mjs).`
    )
    // Optionally perform backfill automatically if explicitly requested
    if (process.env.AUTO_BACKFILL_TEXLIVE_IMAGE === 'true') {
      const backfillImage = process.env.TEX_LIVE_DOCKER_IMAGE || (Settings.sandbox && Settings.sandbox.texLiveDockerImage)
      if (!backfillImage) {
        console.error('AUTO_BACKFILL_TEXLIVE_IMAGE=true but no TEX_LIVE_DOCKER_IMAGE or default found in Settings')
        if (process.env.FAIL_ON_MISSING_TEXLIVE_IMAGE === 'true') process.exit(1)
      } else {
        try {
          console.log(`Running backfill_project_image_name with image ${backfillImage}`)
          // run the backfill script and commit changes
          const child = spawnSync('node', [
            'scripts/backfill_project_image_name.mjs',
            '--commit',
            backfillImage,
          ], { stdio: 'inherit' })
          if (child.status !== 0) {
            console.error('Backfill script failed')
            if (process.env.FAIL_ON_MISSING_TEXLIVE_IMAGE === 'true') process.exit(1)
          } else {
            console.log('Backfill finished; continuing')
          }
        } catch (err) {
          console.error('Failed to execute backfill script', err)
          if (process.env.FAIL_ON_MISSING_TEXLIVE_IMAGE === 'true') process.exit(1)
        }
      }
    }

    // If we get this far and the operator explicitly asked us to fail on missing images,
    // do so, otherwise continue, and allow the admin to perform the backfill manually.
    if (process.env.FAIL_ON_MISSING_TEXLIVE_IMAGE === 'true') {
      process.exit(1)
    }
  }
  return images
}

// Sandboxed compiles are enforced by application code. Always run TexLive checks
// to ensure valid images are configured.

function checkTexLiveEnvVariablesAreProvided() {
  const texLiveDockerImage =
    process.env.TEX_LIVE_DOCKER_IMAGE || Settings.sandbox?.texLiveDockerImage
  const allTexLiveDockerImages =
    process.env.ALL_TEX_LIVE_DOCKER_IMAGES ||
    Settings.sandbox?.allTexLiveDockerImages

  if (!texLiveDockerImage || !allTexLiveDockerImages) {
    console.error(
      'Sandboxed compiles require TEX_LIVE_DOCKER_IMAGE and ALL_TEX_LIVE_DOCKER_IMAGES being set.'
    )
    process.exit(1)
  }
  return { texLiveDockerImage, allTexLiveDockerImages }
}

function checkIsServerPro() {
  // Historically the server-pro scripts could behave slightly differently depending
  // on OVERLEAF_IS_SERVER_PRO. The helper was accidentally removed; keep this
  // check lightweight so scripts can still be executed in both CE and Server Pro
  // modes without throwing.
  return process.env.OVERLEAF_IS_SERVER_PRO === 'true'
}

function checkSandboxedCompilesAreEnabled() {
  // By default sandboxed compiles are enforced so if an explicit disable is
  // provided (SANDBOXED_COMPILES=false) we refuse to run the check.
  if (process.env.SANDBOXED_COMPILES === 'false') {
    console.error('Sandboxed compiles are disabled (SANDBOXED_COMPILES=false). Aborting.');
    process.exit(1)
  }
}

async function main() {
  if (process.env.SKIP_TEX_LIVE_CHECK === 'true') {
    console.log(`SKIP_TEX_LIVE_CHECK=true, skipping TexLive images check`)
    process.exit(0)
  }

  checkIsServerPro()
  checkSandboxedCompilesAreEnabled()
  const { texLiveDockerImage, allTexLiveDockerImages } = checkTexLiveEnvVariablesAreProvided()

  // Normalize image names so whitespace and stray characters don't
  // create seemingly different values (e.g. "image:tag" vs "image:tag ").
  const allTexLiveImages = allTexLiveDockerImages
    .split(',')
    .map(s => (s || '').trim())
    .filter(Boolean)

  if (!allTexLiveImages.includes(texLiveDockerImage)) {
    console.error(
      `TEX_LIVE_DOCKER_IMAGE must be included in ALL_TEX_LIVE_DOCKER_IMAGES`
    )
    process.exit(1)
  }

  const currentImages = (await readImagesInUse() || []).map(i => (i || '').trim()).filter(Boolean)

  // Optionally ensure that the images we intend to use are available
  const exec = spawnSync
  if (process.env.AUTO_PULL_TEXLIVE_IMAGE === 'true') {

    const dockerExists = (function () {
      try {
        // Ensure docker binary is present AND it can reach the daemon
        const version = exec('docker', ['--version'], { stdio: 'pipe' })
        if (version.status !== 0) return false
        const info = exec('docker', ['info'], { stdio: 'pipe' })
        return info.status === 0
      } catch (e) {
        return false
      }
    })()

    if (!dockerExists) {
      console.error(
        'ERROR: AUTO_PULL_TEXLIVE_IMAGE=true but docker CLI/socket is not available; auto-pull cannot be performed. Pre-pull images or mount /var/run/docker.sock into the container.'
      )
      if (process.env.FAIL_ON_MISSING_TEXLIVE_IMAGE === 'true') {
        console.error('Failing startup because AUTO_PULL_TEXLIVE_IMAGE=true but Docker access unavailable and strict failure requested')
        process.exit(1)
      }
    } else {
      const imagesToInspect = Array.from(new Set([...allTexLiveImages, ...currentImages].filter(Boolean)))
      for (const image of imagesToInspect) {
        if (!image) continue
        // Check if image exists locally
        try {
          const inspect = exec('docker', ['image', 'inspect', image], { stdio: 'pipe' })
          if (inspect.status === 0) {
            const stdout = inspect.stdout ? inspect.stdout.toString() : ''
            const stderr = inspect.stderr ? inspect.stderr.toString() : ''
            console.log(`${image} is already present locally`)
            console.log(`(normalized string: ${JSON.stringify(image)} length=${String(image).length})`)
            console.log(`inspect stdout (truncated): ${stdout.slice(0,200)}`)
            if (stderr && stderr.length) console.log(`inspect stderr (truncated): ${stderr.slice(0,200)}`)
            continue
          }
        } catch (e) {
          // fallthrough to attempt pull
        }
        console.log(`${image} is not present; attempting to pull it`)
        try {
          const pull = exec('docker', ['pull', image], { stdio: 'inherit' })
          if (pull.status !== 0) {
            console.error(`Failed to pull ${image}`)
            if (process.env.FAIL_ON_IMAGE_PULL_FAILURE === 'true') process.exit(1)
          }
        } catch (e) {
          console.error(`Failed to pull ${image}:`, e)
          if (process.env.FAIL_ON_IMAGE_PULL_FAILURE === 'true') process.exit(1)
        }
      }
    }
  }

    // Re-check local availability for the canonical list of images after any pull
    // attempts. If images are still missing, fail if the operator requested strict
    // enforcement via FAIL_ON_MISSING_TEXLIVE_IMAGE or log a warning otherwise.
    let missingImagesAfterPull = []
    try {
      for (const img of new Set([...allTexLiveImages, ...currentImages].filter(Boolean))) {
        try {
          const inspectImg = exec('docker', ['image', 'inspect', img], { stdio: 'pipe' })
          const stdout = inspectImg.stdout ? inspectImg.stdout.toString() : ''
          const stderr = inspectImg.stderr ? inspectImg.stderr.toString() : ''
          if (inspectImg.status !== 0) {
            console.log(`post-inspect: ${img} returned status ${inspectImg.status}`)
            if (stdout && stdout.length) console.log(`post-inspect stdout (truncated): ${stdout.slice(0,200)}`)
            if (stderr && stderr.length) console.log(`post-inspect stderr (truncated): ${stderr.slice(0,200)}`)
            missingImagesAfterPull.push(img)
          } else {
            console.log(`post-inspect: ${img} returned status 0 — OK`) 
            if (stdout && stdout.length) console.log(`post-inspect stdout (truncated): ${stdout.slice(0,200)}`)
          }
        } catch (err) {
          missingImagesAfterPull.push(img)
        }
      }
    } catch (err) {
      // Unexpected error while checking images; for safety, abort if we were asked to fail
      console.error('Error while verifying Docker images after pull:', err)
      if (process.env.FAIL_ON_MISSING_TEXLIVE_IMAGE === 'true') process.exit(1)
    }

    if (missingImagesAfterPull.length > 0) {
      missingImagesAfterPull.forEach(img => {
        console.error(`${img} is not present locally even after AUTO_PULL_TEXLIVE_IMAGE`)
        console.error(`(normalized string: ${JSON.stringify(img)} length=${String(img).length})`)
      })
      if (process.env.FAIL_ON_MISSING_TEXLIVE_IMAGE === 'true') {
        console.error('Failing startup because images are missing and FAIL_ON_MISSING_TEXLIVE_IMAGE=true')
        process.exit(1)
      } else {
        console.error('Continuing startup despite missing images. Use FAIL_ON_MISSING_TEXLIVE_IMAGE=true to enforce failure.')
      }
    }

  const danglingImages = []
  for (const image of currentImages) {
    if (!allTexLiveImages.includes(image)) {
      danglingImages.push(image)
    }
  }
  let migratedDanglingImages = false
  if (danglingImages.length > 0) {
    danglingImages.forEach(image =>
      console.error(
        `${image} is currently in use but it's not included in ALL_TEX_LIVE_DOCKER_IMAGES`
      )
    )
    // Optionally fallback projects using dangling images to the configured default image
    if (process.env.AUTO_FALLBACK_TEXLIVE_IMAGE === 'true') {
      const fallbackImage = texLiveDockerImage
      console.log(`AUTO_FALLBACK_TEXLIVE_IMAGE=true; migrating dangling image(s) to ${fallbackImage}`)
      for (const image of danglingImages) {
        try {
          // Spawn the update script; this script will validate ALL_TEX_LIVE_DOCKER_IMAGES contains the fallback
          console.log(`Migrating projects from ${image} -> ${fallbackImage}`)
          const r = spawnSync('node', ['scripts/update_project_image_name.mjs', image, fallbackImage], { stdio: 'inherit' })
          if (r.status !== 0) {
            console.error(`Failed to migrate ${image} -> ${fallbackImage}. Exit code ${r.status}`)
            if (process.env.FAIL_ON_MISSING_TEXLIVE_IMAGE === 'true') process.exit(1)
          }
        } catch (err) {
          console.error(`Error while migrating ${image} -> ${fallbackImage}:`, err)
          if (process.env.FAIL_ON_MISSING_TEXLIVE_IMAGE === 'true') process.exit(1)
        }
      }
      // Re-load the image list after migration and continue validation
      const newCurrentImages = (await readImagesInUse() || []).map(i => (i || '').trim()).filter(Boolean)
      const newDanglingImages = []
      for (const image of newCurrentImages) {
        if (!allTexLiveImages.includes(image)) newDanglingImages.push(image)
      }
      if (newDanglingImages.length > 0) {
        newDanglingImages.forEach(img =>
          console.error(`${img} is still in use but not in ALL_TEX_LIVE_DOCKER_IMAGES`)
        )
        if (process.env.FAIL_ON_MISSING_TEXLIVE_IMAGE === 'true') process.exit(1)
        else {
          console.error('Continuing startup despite remaining dangling images.')
          process.exit(0)
        }
      } else {
        migratedDanglingImages = true
      }
      console.log('Dangling images migrated successfully; continuing startup')
    }
    if (!migratedDanglingImages) {
      console.error(
      `Set SKIP_TEX_LIVE_CHECK=true in config/variables.env, restart the instance and run 'bin/run-script scripts/update_project_image_name.js <dangling_image> <new_image>' to update projects to a new image.`
    )
    console.error(
      `After running the script, remove SKIP_TEX_LIVE_CHECK from config/variables.env and restart the instance.`
    )
      process.exit(1)
    }
  }

  console.log('Done.')
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
