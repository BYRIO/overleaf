import logger from '@overleaf/logger'
import TrackChangesController from './TrackChangesController.mjs'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import PermissionsController from '../../../../app/src/Features/Authorization/PermissionsController.mjs'

export default {
  apply(webRouter) {
    logger.info({}, 'Init track-changes router')

    // Thread operations scoped to a document
    webRouter.post(
      '/project/:project_id/doc/:doc_id/thread/:thread_id/resolve',
      AuthenticationController.requireLogin(),
      AuthorizationMiddleware.ensureUserCanReadProject,
      AuthorizationMiddleware.ensureUserCanDeleteOrResolveThread,
      TrackChangesController.resolveThread
    )

    webRouter.post(
      '/project/:project_id/doc/:doc_id/thread/:thread_id/reopen',
      AuthenticationController.requireLogin(),
      AuthorizationMiddleware.ensureUserCanReadProject,
      AuthorizationMiddleware.ensureUserCanDeleteOrResolveThread,
      TrackChangesController.reopenThread
    )

    webRouter.delete(
      '/project/:project_id/doc/:doc_id/thread/:thread_id',
      AuthenticationController.requireLogin(),
      AuthorizationMiddleware.ensureUserCanReadProject,
      AuthorizationMiddleware.ensureUserCanDeleteOrResolveThread,
      TrackChangesController.deleteThread
    )

    // Optional proxy to Chat endpoints for thread messages
    // GET threads for project
    webRouter.get(
      '/project/:project_id/threads',
      AuthorizationMiddleware.blockRestrictedUserFromProject,
      AuthorizationMiddleware.ensureUserCanReadProject,
      PermissionsController.requirePermission('chat'),
      TrackChangesController.getThreads
    )

    // GET project ranges
    webRouter.get(
      '/project/:project_id/ranges',
      AuthorizationMiddleware.ensureUserCanReadProject,
      TrackChangesController.getRanges
    )

    // GET changes users
    webRouter.get(
      '/project/:project_id/changes/users',
      AuthorizationMiddleware.ensureUserCanReadProject,
      TrackChangesController.getChangesUsers
    )

    webRouter.post(
      '/project/:project_id/thread/:thread_id/messages',
      AuthenticationController.requireLogin(),
      AuthorizationMiddleware.blockRestrictedUserFromProject,
      AuthorizationMiddleware.ensureUserCanReadProject,
      PermissionsController.requirePermission('chat'),
      TrackChangesController.sendMessage
    )

    webRouter.post(
      '/project/:project_id/thread/:thread_id/messages/:message_id/edit',
      AuthenticationController.requireLogin(),
      AuthorizationMiddleware.blockRestrictedUserFromProject,
      AuthorizationMiddleware.ensureUserCanReadProject,
      PermissionsController.requirePermission('chat'),
      TrackChangesController.editMessage
    )

    webRouter.delete(
      '/project/:project_id/thread/:thread_id/messages/:message_id',
      AuthenticationController.requireLogin(),
      AuthorizationMiddleware.blockRestrictedUserFromProject,
      AuthorizationMiddleware.ensureUserCanReadProject,
      PermissionsController.requirePermission('chat'),
      TrackChangesController.deleteMessage
    )

    webRouter.delete(
      '/project/:project_id/thread/:thread_id/own-messages/:message_id',
      AuthenticationController.requireLogin(),
      AuthorizationMiddleware.blockRestrictedUserFromProject,
      AuthorizationMiddleware.ensureUserCanReadProject,
      PermissionsController.requirePermission('chat'),
      TrackChangesController.deleteOwnMessage
    )
  },
}
