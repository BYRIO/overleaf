import { Panel, PanelGroup } from 'react-resizable-panels'
import { ElementType, FC } from 'react'
import { HorizontalResizeHandle } from '../resize/horizontal-resize-handle'
import classNames from 'classnames'
import { useLayoutContext } from '@/shared/context/layout-context'
import EditorNavigationToolbar from '@/features/ide-react/components/editor-navigation-toolbar'
import ChatPane from '@/features/chat/components/chat-pane'
import LLMChatPane from '@/features/llm-chat/components/llm-chat-pane'
import { HorizontalToggler } from '@/features/ide-react/components/resize/horizontal-toggler'
import { HistorySidebar } from '@/features/ide-react/components/history-sidebar'
import EditorSidebar from '@/features/ide-react/components/editor-sidebar'
import { useTranslation } from 'react-i18next'
import { useSidebarPane } from '@/features/ide-react/hooks/use-sidebar-pane'
import { useChatPane } from '@/features/ide-react/hooks/use-chat-pane'
import { useLLMChatPane } from '@/features/ide-react/hooks/use-llm-chat-pane'
import { EditorAndPdf } from '@/features/ide-react/components/editor-and-pdf'
import HistoryContainer from '@/features/ide-react/components/history-container'
import getMeta from '@/utils/meta'
import { useEditorContext } from '@/shared/context/editor-context'
import importOverleafModules from '../../../../../macros/import-overleaf-module.macro'

const mainEditorLayoutModalsModules: Array<{
  import: { default: ElementType }
  path: string
}> = importOverleafModules('mainEditorLayoutModals')

export const MainLayout: FC = () => {
  const { view } = useLayoutContext()
  const { isRestrictedTokenMember } = useEditorContext()

  const {
    isOpen: sidebarIsOpen,
    setIsOpen: setSidebarIsOpen,
    panelRef: sidebarPanelRef,
    togglePane: toggleSidebar,
    handlePaneExpand: handleSidebarExpand,
    handlePaneCollapse: handleSidebarCollapse,
    resizing: sidebarResizing,
    setResizing: setSidebarResizing,
  } = useSidebarPane()

  const {
    isOpen: chatIsOpen,
    panelRef: chatPanelRef,
    togglePane: toggleChat,
    resizing: chatResizing,
    setResizing: setChatResizing,
  } = useChatPane()

  const {
    isOpen: llmChatIsOpen,
    panelRef: llmChatPanelRef,
    togglePane: toggleLLMChat,
    resizing: llmChatResizing,
    setResizing: setLLMChatResizing,
  } = useLLMChatPane()

  const chatEnabled =
    getMeta('ol-capabilities')?.includes('chat') && !isRestrictedTokenMember

  const { t } = useTranslation()

  // Debug logging
  console.log('[MainLayout] Render - Chat States:', {
    chatIsOpen,
    llmChatIsOpen,
    chatEnabled,
    timestamp: new Date().toISOString()
  })

  return (
    <div className="ide-react-main">
      <EditorNavigationToolbar />
      <div className="ide-react-body">
        <PanelGroup
          autoSaveId="ide-outer-layout"
          direction="horizontal"
          className={classNames({
            'ide-panel-group-resizing': sidebarResizing || chatResizing || llmChatResizing,
          })}
        >
          {/* sidebar */}
          <Panel
            ref={sidebarPanelRef}
            id="panel-sidebar"
            order={1}
            defaultSize={15}
            minSize={5}
            maxSize={80}
            collapsible
            onCollapse={handleSidebarCollapse}
            onExpand={handleSidebarExpand}
          >
            <EditorSidebar />
            {view === 'history' && <HistorySidebar />}
          </Panel>

          <HorizontalResizeHandle
            onDoubleClick={toggleSidebar}
            resizable={sidebarIsOpen}
            onDragging={setSidebarResizing}
            hitAreaMargins={{ coarse: 0, fine: 0 }}
          >
            <HorizontalToggler
              id="panel-sidebar"
              togglerType="west"
              isOpen={sidebarIsOpen}
              setIsOpen={setSidebarIsOpen}
              tooltipWhenOpen={t('tooltip_hide_filetree')}
              tooltipWhenClosed={t('tooltip_show_filetree')}
            />
          </HorizontalResizeHandle>

          <Panel id="panel-outer-main" order={2}>
            <PanelGroup autoSaveId="ide-inner-layout" direction="horizontal">
              <Panel className="ide-react-panel" id="panel-main" order={1}>
                <HistoryContainer />
                <EditorAndPdf />
              </Panel>

              {/* LLM Chat - only render when open */}
              {!isRestrictedTokenMember && llmChatIsOpen && (
                <>
                  <HorizontalResizeHandle
                    onDoubleClick={toggleLLMChat}
                    resizable={true}
                    onDragging={setLLMChatResizing}
                    hitAreaMargins={{ coarse: 0, fine: 0 }}
                  />
                  <Panel
                    ref={llmChatPanelRef}
                    id="panel-llm-chat"
                    order={2}
                    defaultSize={20}
                    minSize={5}
                    maxSize={30}
                  >
                    <LLMChatPane />
                  </Panel>
                </>
              )}

              {/* Regular chat - only render when open */}
              {chatEnabled && chatIsOpen && (
                <>
                  <HorizontalResizeHandle
                    onDoubleClick={toggleChat}
                    resizable={true}
                    onDragging={setChatResizing}
                    hitAreaMargins={{ coarse: 0, fine: 0 }}
                  />
                  <Panel
                    ref={chatPanelRef}
                    id="panel-chat"
                    order={3}
                    defaultSize={20}
                    minSize={5}
                    maxSize={30}
                  >
                    <ChatPane />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
      {mainEditorLayoutModalsModules.map(
        ({ import: { default: Component }, path }) => (
          <Component key={path} />
        )
      )}
    </div>
  )
}
