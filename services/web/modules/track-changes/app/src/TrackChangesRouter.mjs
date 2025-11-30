import logger from '@overleaf/logger'
import TrackChangesController from './TrackChangesController.mjs'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import PermissionsController from '../../../../app/src/Features/Authorization/PermissionsController.mjs'

export default {
  apply(webRouter) {
    // no-op: routes for the track-changes module are registered centrally in `router.mjs`.
    // This avoids duplicate route registrations when modules are loaded. Keep the file
    // so the module can still provide controllers and other functionality.
    logger.info({}, 'TrackChangesRouter.apply skipped - routes registered in main router')
  },
}
