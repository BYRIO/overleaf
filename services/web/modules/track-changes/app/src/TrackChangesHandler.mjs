import { callbackify } from 'node:util'
import OError from '@overleaf/o-error'
import { Project } from '../../../../app/src/models/Project.js'
import ProjectGetter from '../../../../app/src/Features/Project/ProjectGetter.mjs'
import EditorRealTimeController from '../../../../app/src/Features/Editor/EditorRealTimeController.mjs'
import { convertTrackChangesToExplicitFormat } from '../../../../app/src/Features/Helpers/TrackChangesHelper.mjs'
import logger from '@overleaf/logger'

// use shared convertTrackChangesToExplicitFormat imported from Collaborators

async function setTrackChanges(projectId, body, actingUserId) {
  // body: { on?: boolean, on_for?: Record<UserId, boolean>, on_for_guests?: boolean }
  try {
    const project = await ProjectGetter.promises.getProject(projectId, {
      track_changes: 1,
      collaberator_refs: 1,
    })
    if (!project) {
      throw new Error('project not found')
    }

    let newState
    // If `on` present, set boolean state
    if (typeof body.on === 'boolean') {
      newState = body.on
    }

    // Convert existing state to explicit object if we need to merge user entries
    const existingIsObject = typeof project.track_changes === 'object'
    let explicit = existingIsObject
      ? { ...(project.track_changes || {}) }
      : await convertTrackChangesToExplicitFormat(projectId, project.track_changes)

    if (body.on_for) {
      // only merge per-user entries
      for (const [key, val] of Object.entries(body.on_for)) {
        explicit[key] = val
      }
      newState = explicit
    }

    if (typeof body.on_for_guests === 'boolean') {
      explicit.__guests__ = body.on_for_guests
      newState = explicit
    }

    if (newState === undefined) {
      // nothing to change
      return
    }

    const update = { $set: { track_changes: newState } }
    await Project.updateOne({ _id: projectId }, update).exec()

    // Emit the updated state to the editor socket room
    EditorRealTimeController.emitToRoom(projectId, 'toggle-track-changes', newState)
  } catch (err) {
    throw OError.tag(err, 'failed to set track changes')
  }
}

export default {
  setTrackChanges: callbackify(setTrackChanges),
  promises: {
    setTrackChanges,
  },
}
