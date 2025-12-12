import logger from '@overleaf/logger'
import fetch from 'node-fetch'
import { AbortController } from 'abort-controller'
import SessionManager from '../Authentication/SessionManager.mjs'
import { User } from '../../models/User.js'
import { expressify } from '@overleaf/promise-utils'

const PROVIDERS = ['openai_style', 'anthropic', 'gemini']

function buildCompletionsUrl(apiUrl = '') {
  const trimmed = apiUrl.replace(/\/+$/, '')
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed
  }
  return `${trimmed}/chat/completions`
}

const ProviderAdapters = {
  openai_style: {
    build(apiUrl, apiKey, model) {
      return {
        url: buildCompletionsUrl(apiUrl),
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Test connection' }],
            max_tokens: 10,
            temperature: 0.7,
          }),
        },
      }
    },
  },
  anthropic: {
    build(apiUrl, apiKey, model) {
      const url = `${apiUrl.replace(/\/+$/, '')}/v1/messages`
      return {
        url,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 10,
            temperature: 0.7,
            messages: [{ role: 'user', content: 'Test connection' }],
          }),
        },
      }
    },
  },
  gemini: {
    build(apiUrl, apiKey, model) {
      const base = apiUrl.replace(/\/+$/, '')
      const url = `${base}/v1beta/models/${model}:generateContent`
      return {
        url,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: 'Test connection' }],
              },
            ],
            generationConfig: {
              maxOutputTokens: 10,
              temperature: 0.7,
            },
          }),
        },
      }
    },
  },
}

function getProviderAdapter(provider = 'openai_style') {
  return ProviderAdapters[provider] || ProviderAdapters.openai_style
}

async function checkLLMConnection(req, res) {
  const { apiUrl, apiKey, modelName, provider = 'openai_style' } = req.body

  logger.info(
    { apiUrl, modelName, provider },
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
    const { url: llmApiUrl, options } = getProviderAdapter(provider).build(apiUrl, apiKey, modelName)

    const startTime = Date.now()

    const response = await fetch(llmApiUrl, { ...options, signal: controller.signal })

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

    logger.info(
      { status: response.status },
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
  const { useOwnLLMSettings, llmApiKey, llmModelName, llmApiUrl, llmModels } = req.body

  logger.info(
    {
      userId,
      useOwnLLMSettings,
      hasApiKey: !!llmApiKey,
      llmModelName,
      llmApiUrl,
      hasModelsArray: Array.isArray(llmModels),
    },
    '[UserLLMSettings] Saving LLM settings'
  )

  try {
    const currentUser = await User.findById(userId, 'llmApiKey llmModels llmApiUrl llmModelName useOwnLLMSettings')
    const existingModels = Array.isArray(currentUser?.llmModels)
      ? currentUser.llmModels.map(m => ({
          id: m._id?.toString(),
          modelName: m.modelName,
          apiUrl: m.apiUrl,
          apiKey: m.apiKey,
          isDefault: Boolean(m.isDefault),
          provider: m.provider || 'openai_style',
        }))
      : []

    let modelsToSave = existingModels

    if (Array.isArray(llmModels)) {
      modelsToSave = llmModels.map(m => {
        const normalizedId = m.id || m._id
        const prev = existingModels.find(em => em.id === normalizedId || em.modelName === m.modelName)
        const apiKey = m.apiKey && m.apiKey.trim() !== '' ? m.apiKey : prev?.apiKey || ''
        const provider = PROVIDERS.includes(m.provider) ? m.provider : (prev?.provider || 'openai_style')
        return {
          id: normalizedId,
          modelName: (m.modelName || '').trim(),
          apiUrl: (m.apiUrl || '').trim(),
          apiKey,
          isDefault: Boolean(m.isDefault),
          provider,
        }
      })
    } else if (useOwnLLMSettings && llmApiUrl && llmModelName) {
      // fallback to single model path
      modelsToSave = [
        {
          id: 'legacy',
          modelName: llmModelName,
          apiUrl: llmApiUrl,
          apiKey: llmApiKey || currentUser?.llmApiKey || '',
          isDefault: true,
          provider: 'openai_style',
        },
      ]
    }

    if (useOwnLLMSettings) {
      if (!modelsToSave || modelsToSave.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one personal model is required when enabling custom LLM settings',
        })
      }

      // Validation and default selection
      let hasDefault = false
      for (const m of modelsToSave) {
        if (!m.modelName || !m.apiUrl) {
          return res.status(400).json({
            success: false,
            error: 'Each model requires API URL and Model Name',
          })
        }
        if (!m.apiKey || m.apiKey.trim() === '') {
          return res.status(400).json({
            success: false,
            error: `Model "${m.modelName}" is missing an API key`,
          })
        }
        if (m.isDefault) hasDefault = true
      }
      if (!hasDefault) {
        modelsToSave[0].isDefault = true
      }
    } else {
      modelsToSave = []
    }

    // Map to persistence shape
    const mappedModels = modelsToSave.map(m => ({
      _id: m.id, // let mongoose reuse _id if provided
      modelName: m.modelName,
      apiUrl: m.apiUrl,
      apiKey: m.apiKey,
      isDefault: Boolean(m.isDefault),
      provider: m.provider || 'openai_style',
    }))

    const defaultModel = mappedModels.find(m => m.isDefault) || mappedModels[0]

    const updateData = {
      useOwnLLMSettings: Boolean(useOwnLLMSettings),
      llmModels: mappedModels,
      llmModelName: defaultModel?.modelName || '',
      llmApiUrl: defaultModel?.apiUrl || '',
    }

    // Only update legacy api key if a new one is provided (for backwards compatibility)
    if (llmApiKey && llmApiKey.trim() !== '') {
      updateData.llmApiKey = llmApiKey
    } else if (defaultModel?.apiKey) {
      updateData.llmApiKey = defaultModel.apiKey
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
  getLLMSettings: expressify(async function getLLMSettings(req, res) {
    const userId = SessionManager.getLoggedInUserId(req.session)
    const user = await User.findById(userId, 'useOwnLLMSettings llmModels llmModelName llmApiUrl llmApiKey')
    const models = (user?.llmModels || []).map(m => ({
      id: m._id?.toString(),
      modelName: m.modelName,
      apiUrl: m.apiUrl,
      isDefault: Boolean(m.isDefault),
      hasApiKey: Boolean(m.apiKey),
      provider: m.provider || 'openai_style',
    }))
    res.json({
      useOwnLLMSettings: Boolean(user?.useOwnLLMSettings),
      models,
      // legacy fallbacks
      modelName: user?.llmModelName || '',
      apiUrl: user?.llmApiUrl || '',
      hasApiKey: Boolean(user?.llmApiKey),
    })
  }),
}
