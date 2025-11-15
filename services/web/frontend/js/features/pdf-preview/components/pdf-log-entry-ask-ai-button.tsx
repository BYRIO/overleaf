import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import { useLayoutContext } from '@/shared/context/layout-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { useLLMChat } from '@/features/llm-chat/hooks/use-llm-chat'
import type { LogEntry } from '../util/types'

interface AskAIButtonProps {
  logEntry: LogEntry
}

function PdfLogEntryAskAIButton({ logEntry }: AskAIButtonProps) {
  const { t } = useTranslation()
  const { setLLMChatIsOpen } = useLayoutContext()
  const { getCurrentDocValue, getCurrentDocName } = useEditorManagerContext()
  const { modelsLoaded, hasModels } = useLLMChat()

  // DEBUG: Log when component renders
  console.log('[PdfLogEntryAskAIButton] Rendering:', {
    level: logEntry.level,
    message: logEntry.message,
    file: logEntry.file,
    line: logEntry.line,
    modelsLoaded,
    hasModels,
    willShow: logEntry.level === 'error' && modelsLoaded && hasModels
  })

  const handleAskAI = useCallback(async () => {
    try {
      let sourceContext = ''
      
      // Get source code context if we have file and line information
      if (logEntry.file && logEntry.line && typeof logEntry.line === 'number') {
        const currentDocName = getCurrentDocName?.()
        
        // Normalize file paths for comparison
        const normalizeFilePath = (path: string) => {
          // Remove leading ./ and normalize slashes
          return path.replace(/^\.\//, '').replace(/\\/g, '/')
        }
        
        // Debug logging
        console.log('[PdfLogEntryAskAIButton] Debug - file:', logEntry.file)
        console.log('[PdfLogEntryAskAIButton] Debug - currentDocName:', currentDocName)
        
        const normalizedFile = normalizeFilePath(logEntry.file)
        const normalizedCurrentDoc = currentDocName ? normalizeFilePath(currentDocName) : null
        
        // Check if this error is for the currently open document
        const isCurrentFile = normalizedCurrentDoc && (
          normalizedFile === normalizedCurrentDoc ||
          normalizedFile.endsWith('/' + normalizedCurrentDoc) ||
          normalizedCurrentDoc.endsWith('/' + normalizedFile)
        )
        
        console.log('[PdfLogEntryAskAIButton] Debug - isCurrentFile:', isCurrentFile)
        
        if (isCurrentFile) {
          const docContent = getCurrentDocValue?.()
          if (docContent) {
            const lines = docContent.split('\n')
            const errorLine = logEntry.line - 1 // Convert to 0-based
            const startLine = Math.max(0, errorLine - 5)
            const endLine = Math.min(lines.length, errorLine + 6)
            
            const contextLines = []
            for (let i = startLine; i < endLine; i++) {
              const lineNum = i + 1
              const marker = lineNum === logEntry.line ? '→ ' : '  '
              const highlight = lineNum === logEntry.line ? ' <<<--- ERROR HERE' : ''
              contextLines.push(
                `${marker}${lineNum.toString().padStart(4, ' ')} | ${lines[i]}${highlight}`
              )
            }
            sourceContext = contextLines.join('\n')
            console.log('[PdfLogEntryAskAIButton] Source context extracted:', sourceContext.length, 'chars')
          }
        }
      }

      // Format the error message for the LLM
      const errorMessage = formatErrorForLLM(logEntry, sourceContext)
      
      console.log('[PdfLogEntryAskAIButton] Sending error to LLM chat, context included:', sourceContext.length > 0)
      
      // Send to LLM chat
      window.dispatchEvent(new CustomEvent('llm-chat-send-message', {
        detail: { message: errorMessage }
      }))
      
      // Open the LLM chat panel
      setLLMChatIsOpen(true)
    } catch (err) {
      console.error('[PdfLogEntryAskAIButton] Failed to get context:', err)
      
      // Fallback: send without context
      const errorMessage = formatErrorForLLM(logEntry, '')
      window.dispatchEvent(new CustomEvent('llm-chat-send-message', {
        detail: { message: errorMessage }
      }))
      setLLMChatIsOpen(true)
    }
  }, [logEntry, getCurrentDocValue, getCurrentDocName, setLLMChatIsOpen])

  // Only show for errors
  if (logEntry.level !== 'error') {
    console.log('[PdfLogEntryAskAIButton] NOT showing button - level is:', logEntry.level)
    return null
  }

  // Don't show button if models are still loading
  if (!modelsLoaded) {
    console.log('[PdfLogEntryAskAIButton] Models still loading, button hidden')
    return null
  }

  // Hide button if no models are available
  if (!hasModels) {
    console.log('[PdfLogEntryAskAIButton] NOT showing button - no models available')
    return null
  }

  console.log('[PdfLogEntryAskAIButton] SHOWING button for error')

  return (
    <OLTooltip
      id={`ask-ai-${logEntry.key}`}
      description={t('ask_ai_about_error')}
      overlayProps={{ placement: 'bottom' }}
    >
      <OLIconButton
        onClick={handleAskAI}
        variant="ghost"
        icon="smart_toy"
        accessibilityLabel={t('ask_ai_about_error')}
      />
    </OLTooltip>
  )
}

function formatErrorForLLM(logEntry: LogEntry, sourceContext: string): string {
  const parts = [
    '🔴 **LaTeX Compilation Error**',
    '',
    '**Error Message:**',
    logEntry.message || logEntry.content || 'Unknown error',
    ''
  ]

  if (logEntry.file) {
    parts.push(`**File:** \`${logEntry.file}\``)
  }

  if (logEntry.line) {
    parts.push(`**Line:** ${logEntry.line}`)
  }

  if (sourceContext) {
    parts.push(
      '',
      '**Source Code Context:**',
      '```latex',
      sourceContext,
      '```',
      ''
    )
  }

  if (logEntry.raw && logEntry.raw !== logEntry.message) {
    parts.push(
      '**Full Error Details:**',
      '```',
      logEntry.raw,
      '```',
      ''
    )
  }

  parts.push(
    '**Please help me:**',
    '1. Explain what this error means in simple terms',
    '2. Show me exactly what\'s wrong in my code',
    '3. Provide the corrected code',
    '4. Explain how to avoid this error in the future'
  )

  return parts.join('\n')
}

export default memo(PdfLogEntryAskAIButton)
