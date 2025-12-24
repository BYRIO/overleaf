import Path from 'node:path'
import { fileURLToPath } from 'node:url'
import UserGetter from '../../../../app/src/Features/User/UserGetter.mjs'
import UserRegistrationHandler from '../../../../app/src/Features/User/UserRegistrationHandler.mjs'
import UserDeleter from '../../../../app/src/Features/User/UserDeleter.mjs'
import UserUpdater from '../../../../app/src/Features/User/UserUpdater.mjs'
import { User } from '../../../../app/src/models/User.js'
import ErrorController from '../../../../app/src/Features/Errors/ErrorController.mjs'
import { expressify } from '@overleaf/promise-utils'
import settings from '@overleaf/settings'
import EmailHelper from '../../../../app/src/Features/Helpers/EmailHelper.js'

const __dirname = Path.dirname(fileURLToPath(import.meta.url))
const allowedDomains = (process.env.SELF_REGISTER_ALLOWED_DOMAINS || '')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean)

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getUserSort(sort, direction) {
  const sortDirection = direction === 'desc' ? -1 : 1
  const sortMap = {
    lastName: { last_name: sortDirection, first_name: sortDirection, email: 1 },
    firstName: { first_name: sortDirection, last_name: sortDirection, email: 1 },
    email: { email: sortDirection },
    signUpDate: { signUpDate: sortDirection },
    lastLoggedIn: { lastLoggedIn: sortDirection },
    lastActive: { lastActive: sortDirection },
    loginCount: { loginCount: sortDirection },
    lastLoginIp: { lastLoginIp: sortDirection },
    suspended: { suspended: sortDirection },
    isAdmin: { isAdmin: sortDirection },
  }
  return sortMap[sort] || sortMap.lastName
}

async function registerNewUser(req, res, next) {
  try {
    res.render(
      Path.resolve(__dirname, '../views/user/register')
    )
  } catch (err) {
    next(err)
  }
}

async function listUsers(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1)
    const perPage = Math.min(
      Math.max(parseInt(req.query.perPage || '20', 10), 1),
      100
    )
    const search = (req.query.search || '').toString().trim()
    const sort = (req.query.sort || 'lastName').toString()
    const direction = (req.query.direction || 'asc').toString()

    const query = {}
    if (search) {
      const escaped = escapeRegex(search)
      const regex = new RegExp(escaped, 'i')
      query.$or = [
        { email: regex },
        { first_name: regex },
        { last_name: regex },
      ]
    }

    const total = await User.countDocuments(query).exec()
    const totalPages = Math.max(1, Math.ceil(total / perPage))
    const safePage = Math.min(page, totalPages)

    const users = await User.find(query)
      .select({
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        isAdmin: 1,
        signUpDate: 1,
        lastLoggedIn: 1,
        lastActive: 1,
        loginCount: 1,
        lastLoginIp: 1,
        suspended: 1,
      })
      .sort(getUserSort(sort, direction))
      .skip((safePage - 1) * perPage)
      .limit(perPage)
      .lean()
      .exec()

    const userData = users.map(user => ({
      id: user._id.toString(),
      lastName: user.last_name || 'N/A',
      firstName: user.first_name || 'N/A',
      email: user.email || 'N/A',
      isAdmin: user.isAdmin || false,
      signUpDate: user.signUpDate || null,
      lastLoggedIn: user.lastLoggedIn || null,
      lastActive: user.lastActive || null,
      loginCount: user.loginCount || 0,
      lastLoginIp: user.lastLoginIp || null,
      suspended: user.suspended || false,
    }))

    res.json({
      users: userData,
      total,
      page: safePage,
      perPage,
      totalPages,
    })
  } catch (err) {
    next(err)
  }
}

async function selfRegisterPage(req, res) {
  res.render(Path.resolve(__dirname, '../views/user/self-register'), {
    title: 'self_register',
    csrfToken: req.csrfToken?.(),
    success: req.query.success === '1',
    email: req.query.email,
  })
}

async function selfRegister(req, res) {
  const { email } = req.body
  const viewData = {
    title: 'self_register',
    csrfToken: req.csrfToken?.(),
    email,
  }

  if (!email) {
    viewData.error = '请输入邮箱地址'
    return res.status(422).render(
      Path.resolve(__dirname, '../views/user/self-register'),
      viewData
    )
  }

  try {
    const normalizedEmail = EmailHelper.parseEmail(email)
    const domain = normalizedEmail.split('@')[1] || ''
    if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
      return res.status(403).render(
        Path.resolve(__dirname, '../views/user/self-register'),
        {
          ...viewData,
          error: `当前仅支持以下邮箱后缀注册：${allowedDomains.join(', ')}`,
        }
      )
    }

    const { user } =
      await UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail(
        normalizedEmail
      )
    return res.render(Path.resolve(__dirname, '../views/user/self-register'), {
      ...viewData,
      success: true,
      email: user.email,
      info: '激活邮件已发送，请查看邮箱完成注册',
    })
  } catch (err) {
    if (err.message === 'EmailAlreadyRegistered') {
      return res.render(
        Path.resolve(__dirname, '../views/user/self-register'),
        {
          ...viewData,
          success: true,
          info: '该邮箱已注册，已重新发送激活邮件',
        }
      )
    }

    return res.status(500).render(
      Path.resolve(__dirname, '../views/user/self-register'),
      {
        ...viewData,
        error:
          settings.adminEmail != null
            ? `注册失败，请联系管理员（${settings.adminEmail}）`
            : '注册失败，请稍后重试',
      }
    )
  }
}

async function register(req, res, next) {
  const { email } = req.body
  if (email == null || email === '') {
    return res.sendStatus(422)
  }
  const { user, setNewPasswordUrl } =
    await UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail(
      email
    )
  res.json({
    email: user.email,
    setNewPasswordUrl,
  })
}

async function toggleAdminStatus(req, res, next) {
  const { userId } = req.params
  const { isAdmin } = req.body
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' })
  }

  if (typeof isAdmin !== 'boolean') {
    return res.status(400).json({ error: 'isAdmin must be a boolean' })
  }

  try {
    const user = await UserGetter.promises.getUser(userId, { _id: 1, email: 1 })
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Prevent admins from removing their own admin status
    if (req.user._id.toString() === userId && !isAdmin) {
      return res.status(403).json({ 
        error: 'Cannot remove your own admin privileges' 
      })
    }

    await UserUpdater.promises.updateUser(userId, {
      $set: { isAdmin }
    })

    res.json({ 
      success: true, 
      message: `User ${user.email} admin status updated to ${isAdmin}` 
    })
  } catch (err) {
    console.error('Error updating admin status:', err)
    res.status(500).json({ 
      error: 'Failed to update admin status',
      message: err.message 
    })
  }
}

async function deleteUser(req, res, next) {
  const { userId } = req.params
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' })
  }

  try {
    const user = await UserGetter.promises.getUser(userId, { _id: 1, email: 1, isAdmin: 1 })
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Prevent admins from deleting themselves
    if (req.user._id.toString() === userId) {
      return res.status(403).json({ 
        error: 'Cannot delete your own account' 
      })
    }

    const options = {
      ipAddress: req.ip || '0.0.0.0',
      force: true,
      skipEmail: false,
    }

    await new Promise((resolve, reject) => {
      UserDeleter.deleteUser(user._id, options, function (err) {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })

    res.json({ 
      success: true, 
      message: `User ${user.email} has been deleted successfully` 
    })
  } catch (err) {
    console.error('Error deleting user:', err)
    res.status(500).json({ 
      error: 'Failed to delete user',
      message: err.message 
    })
  }
}

async function activateAccountPage(req, res, next) {
  if (req.query.user_id == null || req.query.token == null) {
    return ErrorController.notFound(req, res)
  }
  if (typeof req.query.user_id !== 'string') {
    return ErrorController.forbidden(req, res)
  }
  const user = await UserGetter.promises.getUser(req.query.user_id, {
    email: 1,
    loginCount: 1,
  })
  if (!user) {
    return ErrorController.notFound(req, res)
  }
  if (user.loginCount > 0) {
    return res.redirect(`/login`)
  }
  req.session.doLoginAfterPasswordReset = true
  res.render(Path.resolve(__dirname, '../views/user/activate'), {
    title: 'activate_account',
    email: user.email,
    token: req.query.token,
  })
}

export default {
  registerNewUser: expressify(registerNewUser),
  listUsers: expressify(listUsers),
  register: expressify(register),
  toggleAdminStatus: expressify(toggleAdminStatus),
  deleteUser: expressify(deleteUser),
  activateAccountPage: expressify(activateAccountPage),
  selfRegisterPage: expressify(selfRegisterPage),
  selfRegister: expressify(selfRegister),
}
