import { expressify } from '@overleaf/promise-utils'
import DocumentUpdaterHandler from '../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler.mjs'
import ChatApiHandler from '../../../../app/src/Features/Chat/ChatApiHandler.mjs'
import ChatManager from '../../../../app/src/Features/Chat/ChatManager.mjs'
import DocstoreManager from '../../../../app/src/Features/Docstore/DocstoreManager.mjs'
import EditorRealTimeController from '../../../../app/src/Features/Editor/EditorRealTimeController.mjs'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import UserInfoManager from '../../../../app/src/Features/User/UserInfoManager.mjs'
import UserInfoController from '../../../../app/src/Features/User/UserInfoController.mjs'
import UserGetter from '../../../../app/src/Features/User/UserGetter.mjs'
import { z, zz, validateReq } from '../../../../app/src/infrastructure/Validation.js'
import TrackChangesHandler from './TrackChangesHandler.mjs'
import logger from '@overleaf/logger'

async function resolveThread(req, res) {
  const { project_id: projectId, doc_id: docId, thread_id: threadId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  // Orchestrate the change across both services to keep state consistent.
  // If the second service fails, attempt a compensating action on the first.
  await _applyAcrossDocAndChat({
    projectId,
    docId,
    threadId,
    userId,
    docupdaterAction: () => DocumentUpdaterHandler.promises.resolveThread(projectId, docId, threadId, userId),
    chatAction: () => ChatApiHandler.promises.resolveThread(projectId, threadId, userId),
    revertDocupdaterAction: () => DocumentUpdaterHandler.promises.reopenThread(projectId, docId, threadId, userId),
    order: 'docupdater-first',
  })
  // DocumentUpdater will dispatch notification via real-time channel.
  res.sendStatus(204)
}

async function reopenThread(req, res) {
  const { project_id: projectId, doc_id: docId, thread_id: threadId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await _applyAcrossDocAndChat({
    projectId,
    docId,
    threadId,
    userId,
    docupdaterAction: () => DocumentUpdaterHandler.promises.reopenThread(projectId, docId, threadId, userId),
    chatAction: () => ChatApiHandler.promises.reopenThread(projectId, threadId, userId),
    revertDocupdaterAction: () => DocumentUpdaterHandler.promises.resolveThread(projectId, docId, threadId, userId),
    order: 'docupdater-first',
  })
  res.sendStatus(204)
}

async function deleteThread(req, res) {
  const { project_id: projectId, doc_id: docId, thread_id: threadId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await _applyAcrossDocAndChat({
    projectId,
    docId,
    threadId,
    userId,
    // For deletion, delete from chat first to avoid creating leftover messages if the
    // docupdater call fails. If docupdater fails we log and bubble the error.
    docupdaterAction: () => DocumentUpdaterHandler.promises.deleteThread(projectId, docId, threadId, userId),
    chatAction: () => ChatApiHandler.promises.deleteThread(projectId, threadId, userId),
    order: 'chat-first',
  })
  res.sendStatus(204)
}

async function sendMessage(req, res) {
  const { project_id: projectId, thread_id: threadId } = req.params
  const { content, client_id: clientId } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  const message = await ChatApiHandler.promises.sendComment(
    projectId,
    threadId,
    userId,
    content
  )

  // add user info and clientId
  const user = await UserInfoManager.promises.getPersonalInfo(message.user_id)
  message.user = UserInfoController.formatPersonalInfo(user)
  message.clientId = clientId

  EditorRealTimeController.emitToRoom(projectId, 'new-comment', threadId, message)
  res.sendStatus(204)
}

async function editMessage(req, res) {
  const { project_id: projectId, thread_id: threadId, message_id: messageId } = req.params
  const { content } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await ChatApiHandler.promises.editMessage(projectId, threadId, messageId, userId, content)
  EditorRealTimeController.emitToRoom(projectId, 'edit-message', threadId, messageId, content)
  res.sendStatus(204)
}

async function deleteMessage(req, res) {
  const { project_id: projectId, thread_id: threadId, message_id: messageId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await ChatApiHandler.promises.deleteMessage(projectId, threadId, messageId)
  EditorRealTimeController.emitToRoom(projectId, 'delete-message', threadId, messageId)
  res.sendStatus(204)
}

async function deleteOwnMessage(req, res) {
  const { project_id: projectId, thread_id: threadId, message_id: messageId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await ChatApiHandler.promises.deleteUserMessage(projectId, threadId, userId, messageId)
  EditorRealTimeController.emitToRoom(projectId, 'delete-message', threadId, messageId)
  res.sendStatus(204)
}

/*
 * Internal helper to orchestrate operations against both DocumentUpdater and Chat services.
 * - Executes the provided docupdaterAction and chatAction in given order.
 * - If the second action fails, attempts the provided revert action to keep state consistent.
 * - Throws an error when operations fail; logs extensively to aid diagnosis.
 */
async function _applyAcrossDocAndChat({
  projectId,
  docId,
  threadId,
  userId,
  docupdaterAction,
  chatAction,
  revertDocupdaterAction,
  revertChatAction,
  order = 'docupdater-first',
}) {
  const RETRIES = 2
  const RETRY_DELAY_MS = 300
  async function tryWithRetries(fn, attempts = RETRIES, delayMs = RETRY_DELAY_MS) {
    let lastErr
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        if (i + 1 < attempts) {
          // small delay before retrying
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
      }
    }
    throw lastErr
  }

  if (order === 'docupdater-first') {
    // Apply to the doc updater first; then the chat service; on chat failure, revert doc updater if possible
    try {
      await tryWithRetries(docupdaterAction)
    } catch (err) {
      logger.err({ err, projectId, docId, threadId }, 'docupdater action failed')
      throw err
    }

    try {
      await tryWithRetries(chatAction)
    } catch (err) {
      logger.err({ err, projectId, docId, threadId }, 'chat action failed after docupdater success; attempting revert')
      if (typeof revertDocupdaterAction === 'function') {
        try {
          await tryWithRetries(revertDocupdaterAction)
          logger.info({ projectId, docId, threadId }, 'reverted docupdater action after chat failure')
        } catch (revertErr) {
          // Revert failed - we may have left partial state; log and escalate
          logger.err({ revertErr, projectId, docId, threadId }, 'failed to revert docupdater change after chat error')
        }
      }
      throw err
    }
  } else {
    // chat-first
    try {
      await tryWithRetries(chatAction)
    } catch (err) {
      logger.err({ err, projectId, docId, threadId }, 'chat action failed')
      throw err
    }

    try {
      await tryWithRetries(docupdaterAction)
    } catch (err) {
      logger.err({ err, projectId, docId, threadId }, 'docupdater action failed after chat success')
      if (typeof revertChatAction === 'function') {
        try {
          await tryWithRetries(revertChatAction)
          logger.info({ projectId, docId, threadId }, 'reverted chat change after docupdater failure')
        } catch (revertErr) {
          logger.err({ revertErr, projectId, docId, threadId }, 'failed to revert chat change after docupdater failure')
        }
      }
      throw err
    }
  }
}

const TrackChangesController = {
  resolveThread: expressify(resolveThread),
  reopenThread: expressify(reopenThread),
  deleteThread: expressify(deleteThread),
  sendMessage: expressify(sendMessage),
  editMessage: expressify(editMessage),
  deleteMessage: expressify(deleteMessage),
  deleteOwnMessage: expressify(deleteOwnMessage),
  // GET endpoints
  getThreads: expressify(async function (req, res) {
    const projectId = req.params.project_id
    logger.debug({ projectId }, 'GET /project/:project_id/threads called')
    const threads = await ChatApiHandler.promises.getThreads(projectId)
    // inject user info into threads
    await ChatManager.promises.injectUserInfoIntoThreads(threads)
    res.json(threads)
  }),
  getRanges: expressify(async function (req, res) {
    const projectId = req.params.project_id
    logger.debug({ projectId }, 'GET /project/:project_id/ranges called')
    const docs = await DocumentUpdaterHandler.promises.getProjectRanges(projectId)
    res.json(docs)
  }),
  getChangesUsers: expressify(async function (req, res) {
    const projectId = req.params.project_id
    logger.debug({ projectId }, 'GET /project/:project_id/changes/users called')
    const userIds = await DocstoreManager.promises.getTrackedChangesUserIds(projectId)
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.json([])
    }

    // fetch the user objects and format them like other user endpoints
    const projection = { _id: true, email: true, first_name: true, last_name: true }
    const usersArray = await UserGetter.promises.getUsers(userIds, projection)
    const formatted = usersArray.map(u => UserInfoController.formatPersonalInfo(u))
    res.json(formatted)
  }),
  saveTrackChanges: expressify(async function (req, res) {
    try {
      const saveTrackChangesSchema = z.object({
        params: z.object({ Project_id: zz.objectId() }),
        body: z.object({
          on: z.boolean().optional(),
          on_for: z.record(z.string(), z.boolean()).optional(),
          on_for_guests: z.boolean().optional(),
        }),
      })
      const { params, body } = validateReq(req, saveTrackChangesSchema)
      const projectId = params.Project_id
      const userId = SessionManager.getLoggedInUserId(req.session)

      if (body.on_for && (!userId || Object.keys(body.on_for).some(id => id !== userId))) {
        return res.sendStatus(403)
      }

      await TrackChangesHandler.promises.setTrackChanges(projectId, body, userId)
      res.sendStatus(204)
    } catch (err) {
      throw err
    }
  }),
}

export default TrackChangesController
