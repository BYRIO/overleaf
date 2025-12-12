import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MaterialIcon from '@/shared/components/material-icon'
import { useLayoutContext } from '@/shared/context/layout-context'
import { useLLMChat } from '../hooks/use-llm-chat'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { postJSON } from '@/infrastructure/fetch-json'

const LLMChatPane = React.memo(function LLMChatPane() {
  const { t } = useTranslation()
  const { llmChatIsOpen, setLLMChatIsOpen } = useLayoutContext()
  const { 
    messages, 
    isLoading, 
    sendMessage, 
    stopGeneration,
    rerunLastMessage,
    clearMessages,
    models, 
    selectedModel, 
    setSelectedModel,
    canRerun,
    modelsLoaded,
    hasModels,
    refreshModels
  } = useLLMChat()
  const [inputValue, setInputValue] = useState('')

  const [chatOpenedOnce, setChatOpenedOnce] = useState(llmChatIsOpen)
  const [setupApiKey, setSetupApiKey] = useState('')
  const [setupApiUrl, setSetupApiUrl] = useState('')
  const [setupModelName, setSetupModelName] = useState('qwen3-32b')
  const [setupSaving, setSetupSaving] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [setupSuccess, setSetupSuccess] = useState(false)

  useEffect(() => {
    if (llmChatIsOpen) {
      setChatOpenedOnce(true)
    }
  }, [llmChatIsOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue)
      setInputValue('')
    }
  }

  const handleStop = () => {
    stopGeneration()
  }

  const handleRerun = () => {
    rerunLastMessage()
  }

  const handleClear = () => {
    if (confirm('Clear all messages?')) {
      clearMessages()
    }
  }

  const handleSaveLLMSettings = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!setupApiUrl || !setupModelName || !setupApiKey) {
      setSetupError('Please provide API URL, API key, and model name')
      return
    }
    setSetupSaving(true)
    setSetupError(null)
    setSetupSuccess(false)

    try {
      await postJSON('/user/llm-settings', {
        body: {
          useOwnLLMSettings: true,
          llmApiKey: setupApiKey || undefined,
          llmModelName: setupModelName,
          llmApiUrl: setupApiUrl,
        },
      })
      setSetupSuccess(true)
      setSetupApiKey('')
      await refreshModels()
    } catch (err: any) {
      const friendlyMessage =
        typeof err?.getUserFacingMessage === 'function'
          ? err.getUserFacingMessage()
          : err?.message || 'Failed to save settings'
      setSetupError(friendlyMessage)
    } finally {
      setSetupSaving(false)
    }
  }

  if (!chatOpenedOnce) {
    return null
  }

  const showSetupView = modelsLoaded && !hasModels
  const displayMessages = messages.filter(m => m.role !== 'system')
  const showModelSelector = models.length > 0 && !showSetupView

  return (
    <aside className="chat" aria-label={t('ai_assistant')}>
      <div className="llm-chat-container">
        {showSetupView ? (
          <div className="llm-chat-setup">
            <div className="llm-chat-welcome">
              <MaterialIcon type="smart_toy" className="llm-welcome-icon" />
              <h3>{t('ai_assistant')}</h3>
              <p>No models are available. Add your own API key to enable the AI assistant.</p>
            </div>
            <form className="llm-chat-setup-form" onSubmit={handleSaveLLMSettings}>
              <label className="llm-setup-label">
                API URL
                <input
                  type="text"
                  value={setupApiUrl}
                  onChange={(e) => setSetupApiUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  required
                  className="llm-chat-input"
                />
              </label>
              <label className="llm-setup-label">
                API Key
                <input
                  type="password"
                  value={setupApiKey}
                  onChange={(e) => setSetupApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="llm-chat-input"
                />
              </label>
              <label className="llm-setup-label">
                Model Name
                <input
                  type="text"
                  value={setupModelName}
                  onChange={(e) => setSetupModelName(e.target.value)}
                  placeholder="e.g., gpt-4o-mini"
                  required
                  className="llm-chat-input"
                />
              </label>
              {setupError && (
                <div className="llm-setup-error">
                  {setupError}
                </div>
              )}
              {setupSuccess && (
                <div className="llm-setup-success">
                  Settings saved. Loading models…
                </div>
              )}
              <div className="llm-setup-actions">
                <button
                  type="submit"
                  className="llm-action-button"
                  disabled={setupSaving}
                >
                  {setupSaving ? 'Saving…' : 'Save & Enable'}
                </button>
                <a
                  href="/user/settings#llm-settings"
                  className="llm-setup-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open full LLM settings
                </a>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* Header with Model Selector and Action Buttons */}
            <div className="llm-chat-header">
              {showModelSelector && (
                <div className="llm-model-selector">
                  <label htmlFor="model-select">Model:</label>
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isLoading}
                  >
                    {models.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="llm-action-buttons">
                {/* Re-run button - only show if we have a previous message */}
                {canRerun && !isLoading && (
                  <button
                    type="button"
                    onClick={handleRerun}
                    className="llm-action-button"
                    title="Re-run last question"
                  >
                    <MaterialIcon type="refresh" />
                  </button>
                )}
                
                {/* Clear button - only show if we have messages */}
                {displayMessages.length > 0 && !isLoading && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="llm-action-button"
                    title="Clear conversation"
                  >
                    <MaterialIcon type="delete" />
                  </button>
                )}
              </div>
            </div>

            {displayMessages.length === 0 ? (
              <div className="llm-chat-welcome">
                <MaterialIcon type="smart_toy" className="llm-welcome-icon" />
                <h3>{t('latex_ai_assistant')}</h3>
                <p>{t('ai_assistant_description')}</p>
                <div className="llm-suggestions">
                  <p className="llm-suggestions-title">{t('try_asking')}:</p>
                  <ul>
                    <li>"How do I create a table?"</li>
                    <li>"Help me fix this equation"</li>
                    <li>"How to add bibliography?"</li>
                    <li>"Explain this LaTeX command"</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="llm-chat-messages">
                {displayMessages.map((msg, idx) => (
                  <div key={idx} className={`llm-message llm-message-${msg.role}`}>
                    <div className="message-container">
                      <div className="message-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="llm-message llm-message-assistant">
                    <div className="message-container">
                      <div className="llm-message-loading">
                        <MaterialIcon type="smart_toy" className="loading-icon" />
                        <span>Thinking...</span>
                        <button
                          type="button"
                          onClick={handleStop}
                          className="llm-stop-button"
                          title="Stop generation"
                        >
                          <MaterialIcon type="stop" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="llm-chat-input-form">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about LaTeX..."
                disabled={isLoading || !hasModels}
                className="llm-chat-input"
              />
              <button type="submit" disabled={isLoading || !inputValue.trim() || !hasModels}>
                <MaterialIcon type="send" />
              </button>
            </form>
          </>
        )}
      </div>
    </aside>
  )
})

export default LLMChatPane
