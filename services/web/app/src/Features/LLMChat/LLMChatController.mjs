import logger from '@overleaf/logger'
import fetch from 'node-fetch'
import { AbortController } from 'abort-controller'
import SessionManager from '../Authentication/SessionManager.mjs'
import { User } from '../../models/User.js'

// Helper function to remove <think> tags
function stripThinkTags(content) {
  return content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim()
}

// Parse available models from environment variable
// Format: "model1,model2,model3" or just "model1"
// Returns empty array if no models are configured via environment
function getAvailableModels() {
  const modelsEnv = process.env.LLM_AVAILABLE_MODELS || process.env.LLM_MODEL_NAME
  
  // If neither env var is set, return empty array (no server-wide models)
  if (!modelsEnv) {
    return []
  }
  
  const models = modelsEnv.split(',').map(m => m.trim()).filter(m => m.length > 0)
  
  // If after processing, no valid models, return empty array
  if (models.length === 0) {
    return []
  }
  
  // Return array of model objects
  return models.map((id, index) => ({
    id: id,
    name: id.replace(/-/g, ' ').toUpperCase(), // Simple formatting
    isDefault: index === 0 // First model is default
  }))
}

async function getModels(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const projectId = req.params.Project_id

  logger.info({ userId, projectId }, '[LLMChat] Fetching available models')

  try {
    const models = []
    
    // 1. Add server-wide models from environment
    const serverModels = getAvailableModels()
    models.push(...serverModels)
    logger.info({ serverModelCount: serverModels.length, serverModels: serverModels.map(m => m.id) }, '[LLMChat] Server-wide models')

    // 2. Add user's personal LLM model if configured and activated
    if (userId) {
      try {
        const user = await User.findById(userId, 'useOwnLLMSettings llmModelName llmApiUrl llmApiKey')
        
        if (user && user.useOwnLLMSettings && user.llmModelName && user.llmApiUrl && user.llmApiKey) {
          const personalModel = {
            id: `personal-${user.llmModelName}`,
            name: `${user.llmModelName} (🔒 Personal)`,
            isDefault: false,
            isPersonal: true,
            label: 'Private',
          }
          models.push(personalModel)
          
          logger.info(
            { userId, modelName: user.llmModelName },
            '[LLMChat] Added user personal LLM model to available models'
          )
        }
      } catch (error) {
        logger.warn(
          { userId, projectId, err: error },
          '[LLMChat] Error fetching user LLM settings'
        )
      }
    }

    // 3. If no models available, return empty array
    if (models.length === 0) {
      logger.warn(
        { userId, projectId },
        '[LLMChat] No LLM models available (no server models and no personal user model)'
      )
    }

    logger.info(
      { userId, projectId, modelCount: models.length, modelIds: models.map(m => m.id) },
      '[LLMChat] Returning available models'
    )
    
    res.json({ models })
  } catch (error) {
    logger.error(
      { userId, projectId, err: error },
      '[LLMChat] Error fetching available models'
    )
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available models',
      details: error.message,
    })
  }
}

async function chat(req, res) {
  const { messages, model } = req.body // Now accepting model parameter
  const projectId = req.params.Project_id
  const userId = SessionManager.getLoggedInUserId(req.session)

  logger.info({ 
    projectId, 
    userId,
    model: model || 'default',
    messageCount: messages?.length 
  }, '[LLMChat] Received chat request')

  if (!messages || !Array.isArray(messages)) {
    logger.error({ projectId }, '[LLMChat] Invalid messages format')
    return res.status(400).json({ error: 'Invalid messages format' })
  }

  // Check if model has personal prefix - if so, user is using personal LLM
  const isPersonalModel = model && model.startsWith('personal-')
  
  // Check if user has their own LLM settings
  let llmApiUrl = process.env.LLM_API_URL
  let llmApiKey = process.env.LLM_API_KEY
  let usingUserSettings = false

  if (isPersonalModel && userId) {
    try {
      const user = await User.findById(userId, 'useOwnLLMSettings llmApiUrl llmApiKey llmModelName')
      if (user && user.useOwnLLMSettings && user.llmApiUrl && user.llmApiKey) {
        llmApiUrl = user.llmApiUrl
        llmApiKey = user.llmApiKey
        usingUserSettings = true
        
        logger.info({ 
          projectId, 
          userId,
          usingUserSettings: true 
        }, '[LLMChat] Using user\'s own LLM settings')
      } else {
        logger.error({ 
          projectId, 
          userId,
          hasApiUrl: !!user?.llmApiUrl,
          hasApiKey: !!user?.llmApiKey,
          hasModelName: !!user?.llmModelName
        }, '[LLMChat] User LLM settings incomplete')
        return res.status(400).json({ 
          error: 'Your LLM settings are incomplete. Please configure API URL, API Key, and Model Name in your account settings.' 
        })
      }
    } catch (error) {
      logger.warn({ 
        projectId, 
        userId, 
        err: error 
      }, '[LLMChat] Error fetching user LLM settings, falling back to environment')
      return res.status(500).json({ 
        error: 'Failed to retrieve user LLM settings',
        details: error.message
      })
    }
  } else if (!isPersonalModel) {
    // Using global/server-wide model
    if (!llmApiUrl || !llmApiKey) {
      logger.error({ 
        projectId, 
        userId,
        hasEnvApiUrl: !!process.env.LLM_API_URL,
        hasEnvApiKey: !!process.env.LLM_API_KEY
      }, '[LLMChat] LLM service not configured')
      return res.status(503).json({ 
        error: 'LLM service is not configured. Please contact your administrator or configure your own LLM settings in your account settings.' 
      })
    }
  }

  if (!llmApiUrl || !llmApiKey) {
    logger.error({ projectId, userId }, '[LLMChat] No API credentials available')
    return res.status(503).json({ error: 'LLM service is not configured' })
  }

  // Get the actual model name (strip personal- prefix if present)
  const modelNameForApi = isPersonalModel && model
    ? model.substring('personal-'.length)
    : (model || 'qwen3-32b')
  
  logger.info({
    projectId,
    userId,
    modelReceived: model,
    modelForApi: modelNameForApi,
    isPersonal: isPersonalModel,
    usingUserSettings
  }, '[LLMChat] Model resolution')

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, 300000) // 5 minutes (300 seconds) - well under the 10 min proxy timeout

  try {
    const llmApiFullUrl = `${llmApiUrl}/chat/completions`
    
    logger.info({ 
      projectId,
      userId,
      url: llmApiFullUrl,
      model: modelNameForApi,
      messageCount: messages.length 
    }, '[LLMChat] Sending request to LLM API')

    const requestBody = {
      model: modelNameForApi,
      messages: messages,
      max_tokens: 8192,
      temperature: 0.7
    }

    const startTime = Date.now()
    
    const response = await fetch(llmApiFullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmApiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    })

    clearTimeout(timeout)
    const duration = Date.now() - startTime

    logger.info({ 
      projectId,
      userId,
      model: modelNameForApi,
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`
    }, '[LLMChat] Received response from LLM API')

    if (!response.ok) {
      const errorText = await response.text()
      logger.error({ 
        projectId,
        userId,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        duration: `${duration}ms`,
        requestBody
      }, '[LLMChat] LLM API error response')
      
      return res.status(response.status).json({
        error: 'LLM API error',
        details: errorText,
        status: response.status
      })
    }

    const data = await response.json()
    
    // Strip <think> tags from the response content
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      const originalContent = data.choices[0].message.content
      const cleanedContent = stripThinkTags(originalContent)
      data.choices[0].message.content = cleanedContent
      
      logger.debug({
        projectId,
        userId,
        originalLength: originalContent.length,
        cleanedLength: cleanedContent.length
      }, '[LLMChat] Stripped think tags from response')
    }
    
    logger.info({ 
      projectId,
      userId,
      model: modelNameForApi,
      hasChoices: !!data.choices,
      choiceCount: data.choices?.length,
      duration: `${duration}ms`
    }, '[LLMChat] Successfully parsed LLM response')
    
    res.json(data)
  } catch (error) {
    clearTimeout(timeout)
    
    if (error.name === 'AbortError') {
      logger.error({ 
        projectId,
        userId,
        err: error 
      }, '[LLMChat] Request timeout')
      return res.status(504).json({ 
        error: 'LLM service timeout',
        details: 'The LLM API did not respond within 5 minutes'
      })
    }
    
    logger.error({ 
      projectId,
      userId,
      err: error,
      errorName: error.name,
      errorMessage: error.message
    }, '[LLMChat] Error communicating with LLM service')
    
    res.status(500).json({ 
      error: 'Failed to communicate with LLM service',
      details: error.message,
      type: error.name
    })
  }
}

export default {
  chat,
  getModels
}
