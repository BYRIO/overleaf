import classNames from 'classnames'
import { useState, useRef, MouseEventHandler, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import useResizeObserver from '../hooks/use-resize-observer'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import OLButton from '@/shared/components/ol/ol-button'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import MaterialIcon from '@/shared/components/material-icon'
import { ErrorLevel, SourceLocation } from '@/features/pdf-preview/util/types'
import { useLayoutContext } from '@/shared/context/layout-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { useLLMChat } from '@/features/llm-chat/hooks/use-llm-chat'

function PreviewLogEntryHeader({
  sourceLocation,
  level,
  headerTitle,
  headerIcon,
  logType,
  showSourceLocationLink = true,
  onSourceLocationClick,
  logEntry,
}: {
  headerTitle: string | React.ReactNode
  level: ErrorLevel
  headerIcon?: React.ReactElement
  logType?: string
  sourceLocation?: SourceLocation
  showSourceLocationLink?: boolean
  onSourceLocationClick?: MouseEventHandler<HTMLButtonElement>
  logEntry?: any
}) {
  const { t } = useTranslation()
  const logLocationSpanRef = useRef<HTMLSpanElement>(null)
  const [locationSpanOverflown, setLocationSpanOverflown] = useState(false)
  const { setLLMChatIsOpen } = useLayoutContext()
  const { getCurrentDocValue, getCurrentDocName } = useEditorManagerContext()
  const { modelsLoaded, hasModels } = useLLMChat()

  useResizeObserver(
    logLocationSpanRef,
    locationSpanOverflown,
    checkLocationSpanOverflow
  )

  const file = sourceLocation ? sourceLocation.file : null
  const line = sourceLocation ? sourceLocation.line : null
  const logEntryHeaderClasses = classNames('log-entry-header', {
    'log-entry-header-error': level === 'error',
    'log-entry-header-warning': level === 'warning',
    'log-entry-header-info': level === 'info',
    'log-entry-header-typesetting': level === 'typesetting',
    'log-entry-header-raw': level === 'raw',
    'log-entry-header-success': level === 'success',
  })
  const logEntryLocationBtnClasses = classNames('log-entry-header-link', {
    'log-entry-header-link-error': level === 'error',
    'log-entry-header-link-warning': level === 'warning',
    'log-entry-header-link-typesetting': level === 'typesetting',
    'log-entry-header-link-raw': level === 'raw',
    'log-entry-header-link-info': level === 'info',
    'log-entry-header-link-success': level === 'success',
  })
  const headerLogLocationTitle = t('navigate_log_source', {
    location: file + (line ? `, ${line}` : ''),
  })

  function checkLocationSpanOverflow(observedElement: ResizeObserverEntry) {
    const spanEl = observedElement.target
    const isOverflowing = spanEl.scrollWidth > spanEl.clientWidth
    setLocationSpanOverflown(isOverflowing)
  }

  const handleAskAI = useCallback(async () => {
    try {
      let sourceContext = ''
      
      // Get source code context if we have file and line information
      if (file && line && typeof line === 'number') {
        const currentDocName = getCurrentDocName?.()
        
        // Normalize file paths for comparison
        const normalizeFilePath = (path: string) => {
          // Remove leading ./ and normalize slashes
          return path.replace(/^\.\//, '').replace(/\\/g, '/')
        }
        
        // Debug logging
        console.log('[AskAI] Debug - file:', file)
        console.log('[AskAI] Debug - currentDocName:', currentDocName)
        
        const normalizedFile = normalizeFilePath(file)
        const normalizedCurrentDoc = currentDocName ? normalizeFilePath(currentDocName) : null
        
        // Check if this error is for the currently open document
        const isCurrentFile = normalizedCurrentDoc && (
          normalizedFile === normalizedCurrentDoc ||
          normalizedFile.endsWith('/' + normalizedCurrentDoc) ||
          normalizedCurrentDoc.endsWith('/' + normalizedFile)
        )
        
        console.log('[AskAI] Debug - isCurrentFile:', isCurrentFile)
        
        if (isCurrentFile) {
          const docContent = getCurrentDocValue?.()
          if (docContent) {
            const lines = docContent.split('\n')
            const errorLine = line - 1
            const startLine = Math.max(0, errorLine - 5)
            const endLine = Math.min(lines.length, errorLine + 6)
            
            const contextLines = []
            for (let i = startLine; i < endLine; i++) {
              const lineNum = i + 1
              const marker = lineNum === line ? '→ ' : '  '
              const highlight = lineNum === line ? ' <<<--- ERROR HERE' : ''
              contextLines.push(
                `${marker}${lineNum.toString().padStart(4, ' ')} | ${lines[i]}${highlight}`
              )
            }
            
            sourceContext = contextLines.join('\n')
            console.log('[AskAI] Source context extracted:', sourceContext.length, 'chars')
          }
        }
      }

      // Format the error message
      const errorMessage = formatErrorForLLM({
        level,
        message: typeof headerTitle === 'string' ? headerTitle : String(headerTitle),
        file,
        line,
        raw: logEntry?.raw,
        content: logEntry?.content
      }, sourceContext)
      
      console.log('[AskAI] Sending error to LLM chat, context included:', sourceContext.length > 0)
      
      window.dispatchEvent(new CustomEvent('llm-chat-send-message', {
        detail: { message: errorMessage }
      }))
      
      setLLMChatIsOpen(true)
    } catch (err) {
      console.error('[AskAI] Failed to get context:', err)
      
      const errorMessage = formatErrorForLLM({
        level,
        message: typeof headerTitle === 'string' ? headerTitle : String(headerTitle),
        file,
        line,
        raw: logEntry?.raw,
        content: logEntry?.content
      }, '')
      
      window.dispatchEvent(new CustomEvent('llm-chat-send-message', {
        detail: { message: errorMessage }
      }))
      setLLMChatIsOpen(true)
    }
  }, [file, line, headerTitle, level, logEntry, getCurrentDocValue, getCurrentDocName, setLLMChatIsOpen])

  const locationLinkText =
    showSourceLocationLink && file ? `${file}${line ? `, ${line}` : ''}` : null

  const locationLink = locationLinkText ? (
    <OLButton
      variant="ghost"
      className={logEntryLocationBtnClasses}
      aria-label={headerLogLocationTitle}
      onClick={onSourceLocationClick}
    >
      <MaterialIcon type="link" />
      <span
        ref={logLocationSpanRef}
        className="log-entry-header-link-location"
        translate="no"
      >
        {`\u202A${locationLinkText}\u202C`}
      </span>
    </OLButton>
  ) : null

  const headerTitleText = logType ? `${logType} ${headerTitle}` : headerTitle

  return (
    <div className={logEntryHeaderClasses}>
      {headerIcon ? (
        <div className="log-entry-header-icon-container">{headerIcon}</div>
      ) : null}
      <h3 className="log-entry-header-title">{headerTitleText}</h3>
      {locationSpanOverflown && locationLinkText && locationLink ? (
        <OLTooltip
          id={locationLinkText}
          description={locationLinkText}
          overlayProps={{ placement: 'left' }}
          tooltipProps={{ className: 'log-location-tooltip', translate: 'no' }}
        >
          {locationLink}
        </OLTooltip>
      ) : (
        locationLink
      )}
      
      {/* Ask AI Button - only show for errors if models are available */}
      {level === 'error' && modelsLoaded && hasModels && (
        <OLTooltip
          id={`ask-ai-${file}-${line}`}
          description={t('ask_ai_about_error')}
          overlayProps={{ placement: 'bottom' }}
        >
          <OLIconButton
            onClick={handleAskAI}
            variant="ghost"
            icon="smart_toy"
            accessibilityLabel={t('ask_ai_about_error')}
            size="sm"
          />
        </OLTooltip>
      )}
    </div>
  )
}

function formatErrorForLLM(logEntry: any, sourceContext: string): string {
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

export default PreviewLogEntryHeader
