import CollaboratorsGetter from '../Collaborators/CollaboratorsGetter.mjs'
import PrivilegeLevels from '../Authorization/PrivilegeLevels.js'

/**
 * Convert `track_changes` boolean/legacy state to an explicit object
 * mapping user IDs to boolean. Used by Collaborators and TrackChanges modules.
 */
export async function convertTrackChangesToExplicitFormat(projectId, trackChangesState) {
  if (typeof trackChangesState === 'object') {
    return { ...trackChangesState }
  }

  if (trackChangesState === true) {
    const members = await CollaboratorsGetter.promises.getMemberIdsWithPrivilegeLevels(projectId)

    const newTrackChangesState = {}
    for (const { id, privilegeLevel } of members) {
      if ([PrivilegeLevels.OWNER, PrivilegeLevels.READ_AND_WRITE, PrivilegeLevels.REVIEW].includes(privilegeLevel)) {
        newTrackChangesState[id] = true
      }
    }

    return newTrackChangesState
  }

  return {}
}

export default { convertTrackChangesToExplicitFormat }
