import { expressify } from '@overleaf/promise-utils'
import DocumentUpdaterHandler from '../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler.mjs'
import ChatApiHandler from '../../../../app/src/Features/Chat/ChatApiHandler.mjs'
import ChatManager from '../../../../app/src/Features/Chat/ChatManager.mjs'
import DocstoreManager from '../../../../app/src/Features/Docstore/DocstoreManager.mjs'
import EditorRealTimeController from '../../../../app/src/Features/Editor/EditorRealTimeController.mjs'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import UserInfoManager from '../../../../app/src/Features/User/UserInfoManager.mjs'
import UserInfoController from '../../../../app/src/Features/User/UserInfoController.mjs'
import logger from '@overleaf/logger'

async function resolveThread(req, res) {
  const { project_id: projectId, doc_id: docId, thread_id: threadId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  // Try to update both document updater and chat so the resolved state is consistent.
  // Note: DocumentUpdaterHandler and ChatApiHandler are both best-effort here: if one fails
  // we still want to log and propagate the error so the client sees the issue.
  await Promise.all([
    DocumentUpdaterHandler.promises.resolveThread(projectId, docId, threadId, userId),
    ChatApiHandler.promises.resolveThread(projectId, threadId, userId),
  ])
  // DocumentUpdater will dispatch notification via real-time channel.
  res.sendStatus(204)
}

async function reopenThread(req, res) {
  const { project_id: projectId, doc_id: docId, thread_id: threadId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await Promise.all([
    DocumentUpdaterHandler.promises.reopenThread(projectId, docId, threadId, userId),
    ChatApiHandler.promises.reopenThread(projectId, threadId, userId),
  ])
  res.sendStatus(204)
}

async function deleteThread(req, res) {
  const { project_id: projectId, doc_id: docId, thread_id: threadId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId == null) {
    throw new Error('no logged-in user')
  }

  await Promise.all([
    DocumentUpdaterHandler.promises.deleteThread(projectId, docId, threadId, userId),
    ChatApiHandler.promises.deleteThread(projectId, threadId, userId),
  ])
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
    const users = await DocstoreManager.promises.getTrackedChangesUserIds(projectId)
    res.json(users)
  }),
}

export default TrackChangesController
