export function getFileUrl(projectId, userId, buildId, file) {
  if (userId != null && buildId != null) {
    return `/project/${projectId}/user/${userId}/build/${buildId}/output/${file}`
  }
  if (userId != null) {
    return `/project/${projectId}/user/${userId}/output/${file}`
  }
  if (buildId != null) {
    return `/project/${projectId}/build/${buildId}/output/${file}`
  }
  return `/project/${projectId}/output/${file}`
}
