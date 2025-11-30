import TrackChangesRouter from './app/src/TrackChangesRouter.mjs'
import ProjectEditorHandler from '../../app/src/Features/Project/ProjectEditorHandler.mjs'
import logger from '@overleaf/logger'

/** @import { WebModule } from "../../types/web-module" */

/** @type {WebModule} */
const TrackChangesModule = {
  router: TrackChangesRouter,
}

// When this module exists (i.e., enabled in Settings.moduleImportSequence),
// enable the project-level fallback so the front-end can show the review UI.
// This keeps backwards compatibility and only enables the client UI when the
// module is present and loaded by the web server.
try {
  ProjectEditorHandler.trackChangesAvailable = true
  logger.debug({}, 'track-changes module enabled: ProjectEditorHandler.trackChangesAvailable set to true')
} catch (err) {
  // If import/assignment fails, log a warning but continue
  logger.err({ err }, 'failed to signal project editor trackChanges available')
}

export default TrackChangesModule
