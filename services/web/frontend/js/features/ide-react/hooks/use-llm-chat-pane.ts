import { useLayoutContext } from '@/shared/context/layout-context'
import { useCallback, useRef, useState } from 'react'
import { ImperativePanelHandle } from 'react-resizable-panels'

export const useLLMChatPane = () => {
  const { llmChatIsOpen: isOpen, setLLMChatIsOpen: setIsOpen } = useLayoutContext()
  const [resizing, setResizing] = useState(false)
  const panelRef = useRef<ImperativePanelHandle>(null)

  // REMOVED the useEffect that was calling panel.expand() and panel.collapse()
  // This was causing the coupling issue

  const togglePane = useCallback(() => {
    console.log('[useLLMChatPane] Toggling LLM chat from', isOpen, 'to', !isOpen)
    setIsOpen(value => !value)
  }, [setIsOpen, isOpen])

  return {
    isOpen,
    panelRef,
    resizing,
    setResizing,
    togglePane,
  }
}
