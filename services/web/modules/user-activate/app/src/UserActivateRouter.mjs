import logger from '@overleaf/logger'
import UserActivateController from './UserActivateController.mjs'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import RateLimiterMiddleware from '../../../../app/src/Features/Security/RateLimiterMiddleware.mjs'
import { RateLimiter } from '../../../../app/src/infrastructure/RateLimiter.js'

const selfRegisterLimiter = new RateLimiter('self-register', {
  points: parseInt(process.env.SELF_REGISTER_RATE_POINTS, 10) || 5,
  duration: parseInt(process.env.SELF_REGISTER_RATE_DURATION, 10) || 60 * 60,
  blockDuration:
    parseInt(process.env.SELF_REGISTER_RATE_BLOCK_DURATION, 10) || 60 * 60,
})

export default {
  apply(webRouter) {
    logger.debug({}, 'Init UserActivate router')
    
    webRouter.get(
      '/admin/user',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      (req, res) => res.redirect('/admin/register')
    )
    
    webRouter.get('/user/activate', UserActivateController.activateAccountPage)
    AuthenticationController.addEndpointToLoginWhitelist('/user/activate')
    webRouter.get('/self-register', UserActivateController.selfRegisterPage)
    webRouter.post(
      '/self-register',
      RateLimiterMiddleware.rateLimit(selfRegisterLimiter, {
        keyGenerator: req =>
          (req.body?.email || '').toLowerCase().trim() || req.ip,
        method: 'self-register',
      }),
      UserActivateController.selfRegister
    )
    AuthenticationController.addEndpointToLoginWhitelist('/self-register')
    
    webRouter.get(
      '/admin/register',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      UserActivateController.registerNewUser
    )
    
    webRouter.post(
      '/admin/register',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      UserActivateController.register
    )
    
    // Toggle admin status
    webRouter.post(
      '/admin/user/:userId/admin',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      UserActivateController.toggleAdminStatus
    )
    
    // Use POST instead of DELETE for better CSRF compatibility
    webRouter.post(
      '/admin/user/:userId/delete',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      UserActivateController.deleteUser
    )
  },
}
