const request = require('request')
const Settings = require('@overleaf/settings')
const logger = require('@overleaf/logger')

function cleanupProjectUserSession(projectId, userId) {
  if (!projectId || !userId) return
  const baseUrl = Settings.apis?.clsi?.url
  if (!baseUrl) {
    logger.warn(
      { projectId, userId },
      'cannot cleanup project session, missing clsi url'
    )
    return
  }
  const url = `${baseUrl}/project/${projectId}/user/${userId}/session`
  request.del(
    {
      url,
      timeout: 5000,
    },
    error => {
      if (error) {
        logger.warn({ err: error, projectId, userId, url }, 'cleanup failed')
      } else {
        logger.info({ projectId, userId, url }, 'requested clsi session cleanup')
      }
    }
  )
}

module.exports = {
  cleanupProjectUserSession,
}
