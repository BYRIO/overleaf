import logger from '@overleaf/logger'
import http from 'node:http'
import https from 'node:https'
import Settings from '@overleaf/settings'
import TpdsUpdateSender from '../ThirdPartyDataStore/TpdsUpdateSender.mjs'
import TpdsProjectFlusher from '../ThirdPartyDataStore/TpdsProjectFlusher.mjs'
import EditorRealTimeController from '../Editor/EditorRealTimeController.mjs'
import SystemMessageManager from '../SystemMessages/SystemMessageManager.mjs'
import ProjectGetter from '../Project/ProjectGetter.mjs'
import UserGetter from '../User/UserGetter.mjs'
import { UserAuditLogEntry } from '../../models/UserAuditLogEntry.js'
import { ProjectAuditLogEntry } from '../../models/ProjectAuditLogEntry.js'
import { GroupAuditLogEntry } from '../../models/GroupAuditLogEntry.js'
import mongoose from '../../infrastructure/Mongoose.js'
import request from 'request'

const AUDIT_LOG_TYPES = {
  user: {
    model: UserAuditLogEntry,
    targetField: 'userId',
  },
  project: {
    model: ProjectAuditLogEntry,
    targetField: 'projectId',
  },
  group: {
    model: GroupAuditLogEntry,
    targetField: 'groupId',
  },
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isObjectId(value) {
  return /^[a-fA-F0-9]{24}$/.test(value)
}

function toObjectId(value) {
  return new mongoose.Types.ObjectId(value)
}

// Helper function to get all active projects from real-time service
async function getActiveProjectsFromRealTime() {
  return new Promise((resolve, reject) => {
    // Real-time service API endpoint (internal Docker network)
    const realTimeUrl = Settings.apis.realTime?.url || 'http://127.0.0.1:3026'
    const url = `${realTimeUrl}/active-projects`
    
    // Get credentials from settings (password may be empty)
    const user = Settings.apis.realTime?.user || process.env.WEB_API_USER || 'overleaf'
    const pass = Settings.apis.realTime?.pass || process.env.WEB_API_PASSWORD || ''

    logger.info({ url, user }, 'Fetching active projects from real-time service')
    
    request.get({
      url,
      auth: {
        user,
        pass,
        sendImmediately: true
      },
      json: true,
      timeout: 10000
    }, async (error, response, body) => {
      if (error) {
        logger.error({ err: error }, 'Error getting active projects from real-time')
        return resolve([])
      }
      
      if (response.statusCode !== 200) {
        logger.warn({ statusCode: response.statusCode }, 'Unexpected response from real-time service')
        return resolve([])
      }

      if (!body || !body.projects) {
        logger.warn({ body }, 'Unexpected response body from real-time service')
        return resolve([])
      }

      logger.info({ projectCount: body.projects.length }, 'Got active projects from real-time')

      try {
        // Enrich with project and owner details
        const enrichedProjects = await Promise.all(body.projects.map(async (projectData) => {
          try {
            const project = await ProjectGetter.promises.getProject(projectData.projectId, {
              name: 1,
              _id: 1,
              owner_ref: 1,
            })

            if (!project) {
              logger.warn({ projectId: projectData.projectId }, 'Project not found in database')
              return null
            }

            const owner = await UserGetter.promises.getUser(project.owner_ref, {
              email: 1,
              first_name: 1,
              last_name: 1,
            })

            return {
              id: project._id.toString(),
              name: project.name,
              owner: owner ? {
                email: owner.email,
                name: `${owner.first_name || ''} ${owner.last_name || ''}`.trim() || owner.email,
              } : null,
              activeUsers: projectData.users.map(u => ({
                name: `${u.firstName} ${u.lastName}`.trim() || u.email || 'Unknown',
                email: u.email,
              })),
              connectionCount: projectData.connectionCount,
            }
          } catch (err) {
            logger.error({ err, projectId: projectData.projectId }, 'Error enriching project data')
            return null
          }
        }))

        resolve(enrichedProjects.filter(p => p !== null))
      } catch (err) {
        logger.error({ err }, 'Error processing active projects')
        resolve([])
      }
    })
  })
}

const AdminController = {
  _sendDisconnectAllUsersMessage: delay => {
    return EditorRealTimeController.emitToAll(
      'forceDisconnect',
      'Sorry, we are performing a quick update to the editor and need to close it down. Please refresh the page to continue.',
      delay
    )
  },

  index: async (req, res, next) => {
    let url
    const openSockets = {}
    
    // Keep the existing HTTP/HTTPS socket tracking
    for (url in http.globalAgent.sockets) {
      openSockets[`http://${url}`] = http.globalAgent.sockets[url].map(
        socket => socket._httpMessage.path
      )
    }

    for (url in https.globalAgent.sockets) {
      openSockets[`https://${url}`] = https.globalAgent.sockets[url].map(
        socket => socket._httpMessage.path
      )
    }

    try {
      // Get active projects from real-time service
      const activeProjects = await getActiveProjectsFromRealTime()
      
      logger.info({ 
        activeProjectCount: activeProjects.length 
      }, 'Admin panel data collected')
      
      SystemMessageManager.getMessagesFromDB(function (error, systemMessages) {
        if (error) {
          return next(error)
        }
        res.render('admin/index', {
          title: 'System Admin',
          openSockets,
          activeProjects,
          systemMessages,
        })
      })
    } catch (error) {
      logger.error({ error }, 'Error getting admin data')
      next(error)
    }
  },

  disconnectAllUsers: (req, res) => {
    logger.warn('disconecting everyone')
    const delay = (req.query && req.query.delay) > 0 ? req.query.delay : 10
    AdminController._sendDisconnectAllUsersMessage(delay)
    res.redirect('/admin#open-close-editor')
  },

  openEditor(req, res) {
    logger.warn('opening editor')
    Settings.editorIsOpen = true
    res.redirect('/admin#open-close-editor')
  },

  closeEditor(req, res) {
    logger.warn('closing editor')
    Settings.editorIsOpen = req.body.isOpen
    res.redirect('/admin#open-close-editor')
  },

  flushProjectToTpds(req, res, next) {
    TpdsProjectFlusher.flushProjectToTpds(req.body.project_id, error => {
      if (error) {
        return next(error)
      }
      res.sendStatus(200)
    })
  },

  pollDropboxForUser(req, res) {
    const { user_id: userId } = req.body
    TpdsUpdateSender.pollDropboxForUser(userId, () => res.sendStatus(200))
  },

  createMessage(req, res, next) {
    SystemMessageManager.createMessage(req.body.content, function (error) {
      if (error) {
        return next(error)
      }
      res.redirect('/admin#system-messages')
    })
  },

  deleteMessage(req, res, next) {
    const { messageId } = req.params
    if (!messageId) {
      return res.redirect('/admin#system-messages')
    }

    SystemMessageManager.deleteMessage(messageId, function (error) {
      if (error) {
        return next(error)
      }
      res.redirect('/admin#system-messages')
    })
  },

  clearMessages(req, res, next) {
    SystemMessageManager.clearMessages(function (error) {
      if (error) {
        return next(error)
      }
      res.redirect('/admin#system-messages')
    })
  },

  listAuditLogs: async (req, res, next) => {
    try {
      const type = (req.query.type || 'user').toString()
      const config = AUDIT_LOG_TYPES[type]
      if (!config) {
        return res.status(400).json({ error: 'Invalid audit log type' })
      }

      const page = Math.max(parseInt(req.query.page || '1', 10), 1)
      const perPage = Math.min(
        Math.max(parseInt(req.query.perPage || '50', 10), 1),
        200
      )
      const targetId = (req.query.targetId || '').toString().trim()
      const initiatorId = (req.query.initiatorId || '').toString().trim()
      const operation = (req.query.operation || '').toString().trim()
      const ipAddress = (req.query.ipAddress || '').toString().trim()

      const query = {}

      if (targetId) {
        if (!isObjectId(targetId)) {
          return res.status(400).json({ error: 'Invalid target ID' })
        }
        query[config.targetField] = toObjectId(targetId)
      }

      if (initiatorId) {
        if (!isObjectId(initiatorId)) {
          return res.status(400).json({ error: 'Invalid initiator ID' })
        }
        query.initiatorId = toObjectId(initiatorId)
      }

      if (operation) {
        query.operation = new RegExp(escapeRegex(operation), 'i')
      }

      if (ipAddress) {
        query.ipAddress = ipAddress
      }

      const total = await config.model.countDocuments(query).exec()
      const totalPages = Math.max(1, Math.ceil(total / perPage))
      const safePage = Math.min(page, totalPages)

      const logs = await config.model
        .find(query)
        .sort({ timestamp: -1 })
        .skip((safePage - 1) * perPage)
        .limit(perPage)
        .lean()
        .exec()

      const normalized = logs.map(entry => ({
        id: entry._id.toString(),
        type,
        timestamp: entry.timestamp,
        operation: entry.operation || '',
        targetId: entry[config.targetField]
          ? entry[config.targetField].toString()
          : '',
        initiatorId: entry.initiatorId ? entry.initiatorId.toString() : '',
        ipAddress: entry.ipAddress || '',
        managedSubscriptionId: entry.managedSubscriptionId
          ? entry.managedSubscriptionId.toString()
          : '',
        info: entry.info || null,
      }))

      res.json({
        logs: normalized,
        total,
        page: safePage,
        perPage,
        totalPages,
      })
    } catch (error) {
      next(error)
    }
  },
}

export default AdminController
