import logger from '@overleaf/logger'
import fetch from 'node-fetch'
import { AbortController } from 'abort-controller'
import SessionManager from '../Authentication/SessionManager.mjs'
import { User } from '../../models/User.js'
import { expressify } from '@overleaf/promise-utils'

async function checkLLMConnection(req, res) {
  const { apiUrl, apiKey, modelName } = req.body

  logger.info(
    { apiUrl, modelName },
    '[UserLLMSettings] Testing LLM connection'
  )

  if (!apiUrl || !apiKey || !modelName) {
    logger.error('[UserLLMSettings] Missing required parameters')
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, 30000) // 30 seconds timeout for connection check

  try {
    const llmApiUrl = `${apiUrl}/chat/completions`

    const requestBody = {
      model: modelName,
      messages: [{ role: 'user', content: 'Test connection' }],
      max_tokens: 10,
      temperature: 0.7,
    }

    const startTime = Date.now()

    const response = await fetch(llmApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    clearTimeout(timeout)
    const duration = Date.now() - startTime

    logger.info(
      {
        status: response.status,
        duration: `${duration}ms`,
      },
      '[UserLLMSettings] Connection test response'
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(
        {
          status: response.status,
          error: errorText,
        },
        '[UserLLMSettings] Connection test failed'
      )

      return res.status(400).json({
        success: false,
        error: 'LLM connection failed',
        details: errorText,
        status: response.status,
      })
    }

    const data = await response.json()

    logger.info(
      { hasChoices: !!data.choices },
      '[UserLLMSettings] Connection test successful'
    )

    res.json({
      success: true,
      message: 'LLM connection successful',
      duration: `${duration}ms`,
    })
  } catch (error) {
    clearTimeout(timeout)

    if (error.name === 'AbortError') {
      logger.error({ err: error }, '[UserLLMSettings] Connection test timeout')
      return res.status(504).json({
        success: false,
        error: 'Connection timeout',
        details: 'The LLM API did not respond within 30 seconds',
      })
    }

    logger.error(
      {
        err: error,
        errorName: error.name,
        errorMessage: error.message,
      },
      '[UserLLMSettings] Connection test error'
    )

    res.status(500).json({
      success: false,
      error: 'Failed to test LLM connection',
      details: error.message,
      type: error.name,
    })
  }
}

async function saveLLMSettings(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const { useOwnLLMSettings, llmApiKey, llmModelName, llmApiUrl } = req.body

  logger.info(
    {
      userId,
      useOwnLLMSettings,
      hasApiKey: !!llmApiKey,
      llmModelName,
      llmApiUrl,
    },
    '[UserLLMSettings] Saving LLM settings'
  )

  try {
    // If user is enabling their own LLM settings, validate required fields
    if (useOwnLLMSettings) {
      // Get current user to check if they have an existing API key
      const currentUser = await User.findById(userId, 'llmApiKey')
      const hasExistingApiKey = currentUser && currentUser.llmApiKey
      
      // Validate that all required fields are provided
      if (!llmApiUrl || !llmModelName) {
        logger.error({ userId, hasApiUrl: !!llmApiUrl, hasModelName: !!llmModelName }, 
          '[UserLLMSettings] Missing required fields')
        return res.status(400).json({
          success: false,
          error: 'API URL and Model Name are required when enabling custom LLM settings',
        })
      }
      
      // API key is required only if user doesn't have one already
      if (!hasExistingApiKey && (!llmApiKey || llmApiKey.trim() === '')) {
        logger.error({ userId }, '[UserLLMSettings] Missing API key for new configuration')
        return res.status(400).json({
          success: false,
          error: 'API Key is required when enabling custom LLM settings',
        })
      }
    }

    const updateData = {
      useOwnLLMSettings: Boolean(useOwnLLMSettings),
      llmModelName: llmModelName || '',
      llmApiUrl: llmApiUrl || '',
    }

    // Only update API key if a new one is provided
    if (llmApiKey && llmApiKey.trim() !== '') {
      updateData.llmApiKey = llmApiKey
    }

    await User.updateOne({ _id: userId }, { $set: updateData })

    logger.info({ userId }, '[UserLLMSettings] Settings saved successfully')

    res.json({
      success: true,
      message: 'LLM settings saved successfully',
    })
  } catch (error) {
    logger.error(
      {
        userId,
        err: error,
        errorMessage: error.message,
      },
      '[UserLLMSettings] Error saving settings'
    )

    res.status(500).json({
      success: false,
      error: 'Failed to save LLM settings',
      details: error.message,
    })
  }
}

export default {
  checkLLMConnection: expressify(checkLLMConnection),
  saveLLMSettings: expressify(saveLLMSettings),
}
