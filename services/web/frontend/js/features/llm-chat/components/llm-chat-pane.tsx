import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MaterialIcon from '@/shared/components/material-icon'
import { useLayoutContext } from '@/shared/context/layout-context'
import { useLLMChat } from '../hooks/use-llm-chat'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
    hasModels
  } = useLLMChat()
  const [inputValue, setInputValue] = useState('')

  const [chatOpenedOnce, setChatOpenedOnce] = useState(llmChatIsOpen)

  useEffect(() => {
    if (llmChatIsOpen) {
      setChatOpenedOnce(true)
    }
  }, [llmChatIsOpen])

  // Close chat panel if models become unavailable
  useEffect(() => {
    if (modelsLoaded && !hasModels && llmChatIsOpen) {
      console.log('[LLMChat] Closing chat panel - no models available')
      setLLMChatIsOpen(false)
    }
  }, [modelsLoaded, hasModels, llmChatIsOpen, setLLMChatIsOpen])

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

  // If no models are available and models have been loaded, don't render
  if (modelsLoaded && !hasModels) {
    console.log('[LLMChat] No models available, hiding AI Assistant tab')
    return null
  }

  if (!chatOpenedOnce) {
    return null
  }

  const displayMessages = messages.filter(m => m.role !== 'system')
  const showModelSelector = models.length > 0

  return (
    <aside className="chat" aria-label={t('ai_assistant')}>
      <div className="llm-chat-container">
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
            disabled={isLoading}
            className="llm-chat-input"
          />
          <button type="submit" disabled={isLoading || !inputValue.trim()}>
            <MaterialIcon type="send" />
          </button>
        </form>
      </div>
    </aside>
  )
})

export default LLMChatPane
