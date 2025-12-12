import SessionManager from '../Authentication/SessionManager.mjs'
import TexlabManager, { REQUIRE_FULL_TEXT } from './TexlabManager.mjs'
import texlabLogger from './TexlabLogger.mjs'

async function complete(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const projectId = req.params.Project_id
  const { text, fullText, changes, offset, docPath, version } = req.body || {}

  if (typeof offset !== 'number') {
    return res.status(400).json({ error: 'offset is required' })
  }
  const hasText = typeof fullText === 'string' && fullText.length >= 0
  const hasChanges = Array.isArray(changes) && changes.length > 0
  if (!hasText && !hasChanges && !text) {
    return res
      .status(400)
      .json({ error: 'fullText or changes (or legacy text) are required' })
  }

  try {
    const result = await TexlabManager.requestCompletion({
      projectId,
      docPath: docPath || 'main.tex',
      fullText: hasText ? fullText : text,
      changes: hasChanges ? changes : undefined,
      version,
      offset,
    })
    res.json({ items: result.items || [] })
  } catch (err) {
    if (err && err.code === REQUIRE_FULL_TEXT) {
      return res.status(409).json({ requiresFullText: true })
    }
    texlabLogger.error({ err, userId, projectId }, '[Texlab] completion failed')
    res.status(500).json({ error: 'texlab completion failed' })
  }
}

export default {
  complete,
}
