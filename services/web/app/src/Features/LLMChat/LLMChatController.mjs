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
    isDefault: index === 0, // First model is default
    provider: 'openai_style',
  }))
}

// Normalize an API base URL to the chat completions endpoint
function buildCompletionsUrl(apiUrl = '') {
  const trimmed = apiUrl.replace(/\/+$/, '')
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed
  }
  return `${trimmed}/chat/completions`
}

const PROVIDER_ADAPTERS = {
  openai_style: {
    buildRequest({ apiUrl, apiKey, modelNameForApi, messages }) {
      const url = buildCompletionsUrl(apiUrl)
      const body = {
        model: modelNameForApi,
        messages,
        max_tokens: 8192,
        temperature: 0.7,
      }
      return {
        url,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
      }
    },
    extractText(data) {
      return (
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.text ||
        null
      )
    },
  },
  anthropic: {
    buildRequest({ apiUrl, apiKey, modelNameForApi, messages }) {
      const url = `${apiUrl.replace(/\/+$/, '')}/v1/messages`
      const systemMessages = messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
      const system = systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined
      const converted = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }))

      const body = {
        model: modelNameForApi,
        max_tokens: 1024,
        temperature: 0.7,
        messages: converted,
      }
      if (system) body.system = system

      return {
        url,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        },
      }
    },
    extractText(data) {
      if (!data?.content) return null
      const parts = data.content
        .filter(part => part?.type === 'text' && part.text)
        .map(part => part.text)
      return parts.length ? parts.join('') : null
    },
  },
  gemini: {
    buildRequest({ apiUrl, apiKey, modelNameForApi, messages }) {
      const base = apiUrl.replace(/\/+$/, '')
      const url = `${base}/v1beta/models/${modelNameForApi}:generateContent`
      const systemMessages = messages.filter(m => m.role === 'system')
      const systemText = systemMessages.map(m => m.content).join('\n\n') || undefined
      const contentMessages = messages.filter(m => m.role !== 'system')
      const contents = contentMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
      const body = {
        contents,
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
        },
      }
      if (systemText) {
        body.systemInstruction = { parts: [{ text: systemText }] }
      }
      return {
        url,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(body),
        },
      }
    },
    extractText(data) {
      const parts = data?.candidates?.[0]?.content?.parts
      if (!Array.isArray(parts)) return null
      const texts = parts
        .filter(p => typeof p.text === 'string')
        .map(p => p.text)
      return texts.length ? texts.join('') : null
    },
  },
}

function getAdapter(provider = 'openai_style') {
  return PROVIDER_ADAPTERS[provider] || PROVIDER_ADAPTERS.openai_style
}

async function getModels(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const projectId = req.params.Project_id

  logger.debug({ userId, projectId }, '[LLMChat] Fetching available models')

  try {
    const models = []
    
    // 1. Add server-wide models from environment
    const serverModels = getAvailableModels()
    models.push(...serverModels)
    logger.debug({ serverModelCount: serverModels.length, serverModels: serverModels.map(m => m.id) }, '[LLMChat] Server-wide models')

    // 2. Add user's personal LLM model if configured and activated
    if (userId) {
      try {
        const user = await User.findById(userId, 'useOwnLLMSettings llmModelName llmApiUrl llmApiKey llmModels')

        if (user && user.useOwnLLMSettings) {
          let personalModels = []

          if (Array.isArray(user.llmModels) && user.llmModels.length > 0) {
            personalModels = user.llmModels
          } else if (user.llmModelName && user.llmApiUrl && user.llmApiKey) {
            // Backward compatibility: single legacy model
            personalModels = [
              {
                _id: 'legacy',
                modelName: user.llmModelName,
                apiUrl: user.llmApiUrl,
                apiKey: user.llmApiKey,
                isDefault: true,
              },
            ]
          }

          if (personalModels.length > 0) {
            // Ensure one default
            const hasDefault = personalModels.some(m => m.isDefault)
            if (!hasDefault) {
              personalModels[0].isDefault = true
            }

            personalModels.forEach(m => {
              models.push({
                id: `personal-${m._id.toString()}`,
                name: `${m.modelName} (🔒 Personal)`,
                isDefault: Boolean(m.isDefault),
                isPersonal: true,
                label: 'Private',
                provider: m.provider || 'openai_style',
              })
            })

            logger.debug(
              {
                userId,
                modelNames: personalModels.map(m => m.modelName),
                count: personalModels.length,
              },
              '[LLMChat] Added user personal LLM models to available models'
            )
          }
        }
      } catch (error) {
        logger.debug(
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

    logger.debug(
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
  let modelNameForApi = model || 'qwen3-32b'
  let provider = 'openai_style'

  if (isPersonalModel && userId) {
    try {
      const user = await User.findById(userId, 'useOwnLLMSettings llmApiUrl llmApiKey llmModelName llmModels')
      if (user && user.useOwnLLMSettings) {
        let personalModels = Array.isArray(user.llmModels) ? user.llmModels : []

        // Backward compatibility
        if (personalModels.length === 0 && user.llmModelName && user.llmApiUrl && user.llmApiKey) {
          personalModels = [
            {
              _id: 'legacy',
              modelName: user.llmModelName,
              apiUrl: user.llmApiUrl,
              apiKey: user.llmApiKey,
              isDefault: true,
            },
          ]
        }

        // Resolve requested model
        const modelId = model.substring('personal-'.length)
        let selectedModel =
          personalModels.find(m => m._id?.toString() === modelId) ||
          personalModels.find(m => m.modelName === modelId) // legacy id fallback

        if (!selectedModel) {
          // If no explicit model found, fall back to default one
          selectedModel =
            personalModels.find(m => m.isDefault) || personalModels[0]
        }

        if (selectedModel && selectedModel.apiUrl && (selectedModel.apiKey || user.llmApiKey)) {
          llmApiUrl = selectedModel.apiUrl
          llmApiKey = selectedModel.apiKey || user.llmApiKey
          modelNameForApi = selectedModel.modelName
          provider = selectedModel.provider || 'openai_style'
          usingUserSettings = true
          
          logger.info({ 
            projectId, 
            userId,
            usingUserSettings: true,
            selectedModel: selectedModel.modelName,
            modelId
          }, '[LLMChat] Using user\'s own LLM settings')
        } else {
          logger.error({ 
            projectId, 
            userId,
            modelId,
            hasApiUrl: !!selectedModel?.apiUrl,
            hasApiKey: !!selectedModel?.apiKey
          }, '[LLMChat] User LLM settings incomplete')
          return res.status(400).json({ 
            error: 'Your LLM settings are incomplete. Please configure API URL, API Key, and Model Name in your account settings.' 
          })
        }
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

  // For server-wide models, derive name
  if (!isPersonalModel) {
    modelNameForApi = model || 'qwen3-32b'
  }
  
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
    const adapter = getAdapter(provider)
    const { url: llmApiFullUrl, options } = adapter.buildRequest({
      apiUrl: llmApiUrl,
      apiKey: llmApiKey,
      modelNameForApi,
      messages,
    })

    logger.info({ 
      projectId,
      userId,
      url: llmApiFullUrl,
      model: modelNameForApi,
      messageCount: messages.length 
    }, '[LLMChat] Sending request to LLM API')

    const startTime = Date.now()
    
    const response = await fetch(llmApiFullUrl, { ...options, signal: controller.signal })

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
        requestBody: options?.body
      }, '[LLMChat] LLM API error response')
      
      return res.status(response.status).json({
        error: 'LLM API error',
        details: errorText,
        status: response.status
      })
    }

    const data = await response.json()
    const extracted = adapter.extractText(data)

    // Strip <think> tags from the response content
    if (typeof extracted === 'string') {
      const cleanedContent = stripThinkTags(extracted)

      data.choices = [
        {
          message: {
            content: cleanedContent,
          },
        },
      ]

      logger.debug({
        projectId,
        userId,
        originalLength: extracted.length,
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
