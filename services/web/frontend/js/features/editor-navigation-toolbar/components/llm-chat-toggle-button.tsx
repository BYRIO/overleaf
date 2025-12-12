import classNames from 'classnames'
import { useTranslation } from 'react-i18next'
import MaterialIcon from '@/shared/components/material-icon'

function LLMChatToggleButton({
  llmChatIsOpen,
  onClick,
}: {
  llmChatIsOpen: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  const classes = classNames('btn', 'btn-full-height', { active: llmChatIsOpen })

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
