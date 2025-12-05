import Settings from '@overleaf/settings'
import Path from 'node:path'
import logger from '@overleaf/logger'

function splitAndTrim(val) {
  if (!val) return []
  return val.split(',').map(s => s.trim()).filter(Boolean)
}

function deriveImageLabelFromName(imageName) {
  // Fallback label if no image name provided. Use last bit of repo:tag
  if (!imageName) return 'TeX Live'
  const parts = imageName.split('/')
  const last = parts[parts.length - 1]
  return last.replace(/[:_-]+/g, ' ')
}

function buildAllowedImageNames() {
  try {
    const images = splitAndTrim(
      (Settings.sandbox && Settings.sandbox.allTexLiveDockerImages) || process.env.ALL_TEX_LIVE_DOCKER_IMAGES || (Settings.sandbox && Settings.sandbox.texLiveDockerImage) || ''
    )
    const labels = splitAndTrim(
      (Settings.sandbox && Settings.sandbox.allTexLiveDockerImageNames) || process.env.ALL_TEX_LIVE_DOCKER_IMAGE_NAMES || ''
    )

    if (images.length === 0) {
      // Nothing provided — fallback to current image
      const cur = Settings.currentImageName || Settings.sandbox?.texLiveDockerImage || process.env.TEX_LIVE_DOCKER_IMAGE
      if (cur) {
        Settings.allowedImageNames = [
          { imageName: cur, imageDesc: deriveImageLabelFromName(cur), allowed: true },
        ]
      } else {
        Settings.allowedImageNames = []
      }
      return
    }

    if (labels.length > 0 && labels.length !== images.length) {
      logger.warn({ images, labels }, 'Mismatch between texlive images and image labels. Filling missing labels.')
    }

    const allowedImageNames = images.map((img, idx) => ({
      // Preserve the full repo string and a shorter basename for display & matching.
      imageFullName: (img || ''),
      imageName: (Path.basename(img || '') || ''),
      imageDesc: labels[idx] || deriveImageLabelFromName(img),
      allowed: true,
    }))
    Settings.allowedImageNames = allowedImageNames
    // Log to help debugging at startup
    try {
      logger.info({ allowedImageNames }, 'SettingsEnhancer populated allowed image names')
    } catch (err) {
      // Avoid throwing on logging errors
    }
  } catch (err) {
    logger.err({ err }, 'Failed to build allowedImageNames from sandbox settings')
    Settings.allowedImageNames = Settings.allowedImageNames || []
  }
}

export default function initialiseSettings() {
  buildAllowedImageNames()
}
