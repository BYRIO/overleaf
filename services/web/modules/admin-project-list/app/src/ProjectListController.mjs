import Path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Project } from '../../../../app/src/models/Project.js'
import { User } from '../../../../app/src/models/User.js'
import DocumentUpdaterHandler from '../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler.mjs'
import ProjectZipStreamManager from '../../../../app/src/Features/Downloads/ProjectZipStreamManager.mjs'
import ProjectDeleter from '../../../../app/src/Features/Project/ProjectDeleter.mjs'
import { promisify } from '@overleaf/promise-utils'
import logger from '@overleaf/logger'
import crypto from 'crypto'

const __dirname = Path.dirname(fileURLToPath(import.meta.url))

const createZipStreamForProjectAsync = promisify(
  ProjectZipStreamManager.createZipStreamForProject
).bind(ProjectZipStreamManager)

// Helper function to generate hash fragment for share links
// This matches TokenAccessHandler.createTokenHashPrefix()
function createTokenHashPrefix(token) {
  if (!token) return ''
  const hash = crypto.createHash('sha256')
  hash.update(token)
  return '#' + hash.digest('hex').slice(0, 6)
}

export default {
  projectListPage(req, res) {
    res.render(Path.resolve(__dirname, '../views/project/list'), {
      title: 'project_list',
      user: JSON.stringify(req.user || {})
    })
  },

  async getAllProjects(req, res) {
    try {
      // Fetch all projects with owner and collaborator information
      const projects = await Project.find({})
        .populate('owner_ref', 'email first_name last_name')
        .populate('collaberator_refs', 'email first_name last_name')
        .populate('readOnly_refs', 'email first_name last_name')
        .populate('reviewer_refs', 'email first_name last_name')
        .populate('tokenAccessReadAndWrite_refs', 'email first_name last_name')
        .populate('tokenAccessReadOnly_refs', 'email first_name last_name')
        .populate('pendingEditor_refs', 'email first_name last_name')
        .populate('pendingReviewer_refs', 'email first_name last_name')
        .lean()
        .exec()

      // Transform the data for the frontend
      const projectList = projects.map(project => {
        const collaborators = []
        
        // Add read-write collaborators (editors)
        if (project.collaberator_refs) {
          project.collaberator_refs.forEach(user => {
            if (user) {
              collaborators.push({
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                email: user.email || '',
                permission: 'Read & Write',
                type: 'editor'
              })
            }
          })
        }
        
        // Add read-only collaborators
        if (project.readOnly_refs) {
          project.readOnly_refs.forEach(user => {
            if (user) {
              collaborators.push({
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                email: user.email || '',
                permission: 'Read Only',
                type: 'read-only'
              })
            }
          })
        }

        // Add reviewers (can view and comment)
        if (project.reviewer_refs) {
          project.reviewer_refs.forEach(user => {
            if (user) {
              collaborators.push({
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                email: user.email || '',
                permission: 'Reviewer',
                type: 'reviewer'
              })
            }
          })
        }

        // Add token access read-write users (invited via share link with edit access)
        if (project.tokenAccessReadAndWrite_refs) {
          project.tokenAccessReadAndWrite_refs.forEach(user => {
            if (user) {
              collaborators.push({
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                email: user.email || '',
                permission: 'Read & Write',
                type: 'link-editor'
              })
            }
          })
        }

        // Add token access read-only users (invited via share link with view access)
        if (project.tokenAccessReadOnly_refs) {
          project.tokenAccessReadOnly_refs.forEach(user => {
            if (user) {
              collaborators.push({
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                email: user.email || '',
                permission: 'Read Only',
                type: 'link-viewer'
              })
            }
          })
        }

        // Add pending editors (invited but haven't accepted yet)
        if (project.pendingEditor_refs) {
          project.pendingEditor_refs.forEach(user => {
            if (user) {
              collaborators.push({
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                email: user.email || '',
                permission: 'Read & Write',
                type: 'pending-editor'
              })
            }
          })
        }

        // Add pending reviewers (invited but haven't accepted yet)
        if (project.pendingReviewer_refs) {
          project.pendingReviewer_refs.forEach(user => {
            if (user) {
              collaborators.push({
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                email: user.email || '',
                permission: 'Reviewer',
                type: 'pending-reviewer'
              })
            }
          })
        }

        // Generate complete share links with hash fragments
        let shareLink = null
        let editShareLink = null

        if (project.tokens?.readOnly) {
          // For read-only links, hash is generated from the readOnly token
          const hash = createTokenHashPrefix(project.tokens.readOnly)
          shareLink = `${req.protocol}://${req.get('host')}/read/${project.tokens.readOnly}${hash}`
        }

        if (project.tokens?.readAndWrite) {
          // For read-write links, hash is generated from the full readAndWrite token
          const hash = createTokenHashPrefix(project.tokens.readAndWrite)
          editShareLink = `${req.protocol}://${req.get('host')}/${project.tokens.readAndWrite}${hash}`
        }

        return {
          id: project._id.toString(),
          name: project.name || 'Untitled Project',
          owner: {
            firstName: project.owner_ref?.first_name || '',
            lastName: project.owner_ref?.last_name || '',
            email: project.owner_ref?.email || 'Unknown'
          },
          collaborators,
          shareLink,
          editShareLink,
          createdAt: project.createdAt
        }
      })

      res.json(projectList)
    } catch (error) {
      logger.error({ err: error }, 'Error fetching projects')
      res.status(500).json({ error: 'Failed to fetch projects' })
    }
  },

  async exportProject(req, res) {
    try {
      const { projectId } = req.params

      // Check if project exists
      const project = await Project.findById(projectId).lean().exec()
      if (!project) {
        return res.status(404).json({ error: 'Project not found' })
      }

      logger.info({ projectId }, 'Starting project export')

      // Flush project to MongoDB
      await DocumentUpdaterHandler.promises.flushProjectToMongoAndDelete(projectId)

      // Create zip stream
      const zipStream = await createZipStreamForProjectAsync(projectId)

      // Set headers for file download
      const filename = `${project.name || 'project'}_${projectId}.zip`
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

      // Pipe the stream to response
      zipStream.pipe(res)

      zipStream.on('error', (err) => {
        logger.error({ err, projectId }, 'Error streaming project export')
        if (!res.headersSent) {
          res.status(500).json({ error: 'Export failed' })
        }
      })

    } catch (error) {
      logger.error({ err: error, projectId: req.params.projectId }, 'Error exporting project')
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to export project' })
      }
    }
  },

  async deleteProject(req, res) {
    const { projectId } = req.params
    
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' })
    }

    try {
      const project = await Project.findById(projectId).lean().exec()
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' })
      }

      logger.info({ projectId, projectName: project.name }, 'Admin deleting project')

      // Delete the project
      await new Promise((resolve, reject) => {
        ProjectDeleter.deleteProject(projectId, function (err) {
          if (err) {
            return reject(err)
          }
          resolve()
        })
      })

      res.json({ 
        success: true, 
        message: `Project "${project.name}" has been deleted successfully` 
      })
    } catch (err) {
      logger.error({ err, projectId }, 'Error deleting project')
      res.status(500).json({ 
        error: 'Failed to delete project',
        message: err.message 
      })
    }
  }
}
