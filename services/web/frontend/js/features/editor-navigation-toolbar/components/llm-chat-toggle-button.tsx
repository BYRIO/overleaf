import classNames from 'classnames'
import { useTranslation } from 'react-i18next'
import MaterialIcon from '@/shared/components/material-icon'
import { useLLMChat } from '@/features/llm-chat/hooks/use-llm-chat'

function LLMChatToggleButton({
  llmChatIsOpen,
  onClick,
}: {
  llmChatIsOpen: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  const { modelsLoaded, hasModels } = useLLMChat()
  const classes = classNames('btn', 'btn-full-height', { active: llmChatIsOpen })

  // Don't render if models have been loaded but none are available
  if (modelsLoaded && !hasModels) {
    console.log('[LLMChatToggleButton] No models available, hiding button')
    return null
  }

  return (
    <div className="toolbar-item">
      <button type="button" className={classes} onClick={onClick}>
        <MaterialIcon
          type="smart_toy"
          className="align-middle"
        />
        <p className="toolbar-label">{t('ai_assistant')}</p>
      </button>
    </div>
  )
}

export default LLMChatToggleButton
