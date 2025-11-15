import logger from '@overleaf/logger'
import ProjectListController from './ProjectListController.mjs'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'

export default {
  apply(webRouter) {
    logger.debug({}, 'Init ProjectList router')
    
    webRouter.get(
      '/admin/project',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      ProjectListController.projectListPage
    )
    
    webRouter.get(
      '/admin/project/list',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      ProjectListController.getAllProjects
    )
    
    webRouter.post(
      '/admin/project/:projectId/export',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      ProjectListController.exportProject
    )

    webRouter.post(
      '/admin/project/:projectId/delete',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      ProjectListController.deleteProject
    )
  },
}
