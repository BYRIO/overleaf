import logger from '@overleaf/logger'
import DocumentUpdaterHandler from './DocumentUpdaterHandler.mjs'
import ProjectLocator from '../Project/ProjectLocator.mjs'
import { plainTextResponse } from '../../infrastructure/Response.js'
import { expressify } from '@overleaf/promise-utils'

async function getDoc(req, res) {
  const projectId = req.params.Project_id
  const docId = req.params.Doc_id

  try {
    const { element: doc } = await ProjectLocator.promises.findElement({
      project_id: projectId,
      element_id: docId,
      type: 'doc',
    })

    const { lines } = await DocumentUpdaterHandler.promises.getDocument(
      projectId,
      docId,
      -1 // latest version only
    )

    res.setContentDisposition('attachment', { filename: doc.name })
    plainTextResponse(res, lines.join('\n'))
  } catch (err) {
    if (err.name === 'NotFoundError') {
      logger.warn(
        { err, projectId, docId },
        'entity not found when downloading doc'
      )

      return res.sendStatus(404)
    }

    logger.err(
      { err, projectId, docId },
      'error getting document for downloading'
    )

    return res.sendStatus(500)
  }
}

async function acceptChanges(req, res) {
  // Accept either `project_id` or `Project_id` to be resilient to varying router param names
  const projectId = req.params.project_id || req.params.Project_id
  const docId = req.params.doc_id || req.params.Doc_id
  const sessionUser = req.session && req.session.user_id
  logger.debug({ projectId, docId, sessionUser, body: req.body }, 'document-updater acceptChanges request received')
  let changeIds = req.body?.change_ids
  if (changeIds == null) {
    // If provided as single change in route param
    if (req.params.change_id) {
      changeIds = [req.params.change_id]
    } else {
      // Bad request
      return res.status(400).json({ message: 'missing change_ids' })
    }
  }
  if (!Array.isArray(changeIds) || changeIds.some(id => typeof id !== 'string')) {
    return res.status(400).json({ message: 'invalid change_ids' })
  }
  // Forward to DocumentUpdater handler.  If user identity required, controller or upstream
  // middleware may set it on req.body or req.session; DocumentUpdater handler may accept userId
  // as an additional optional parameter but it isn't required here.
  try {
    logger.debug({ projectId, docId, changeIds }, 'acceptChanges called')
    try {
      await DocumentUpdaterHandler.promises.acceptChanges(projectId, docId, changeIds)
    } catch (err) {
      logger.err({ err, projectId, docId, changeIds }, 'error in acceptChanges controller')
      return res.status(500).json({ message: 'error accepting changes' })
    }
    res.sendStatus(204)
  } catch (err) {
    logger.err({ err, projectId, docId, changeIds }, 'error accepting changes')
    // rethrow for expressify wrapper to handle HTTP response code, but we ensure logging was done
    throw err
  }
}

export default {
  getDoc: expressify(getDoc),
  acceptChanges: expressify(acceptChanges),
}
