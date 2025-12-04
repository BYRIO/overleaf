import React, { useCallback, useEffect, useState } from 'react'
import ReferencePickerModal from './components/ReferencePickerModal'
import { useEditorViewContext } from '@/features/ide-react/context/editor-view-context'
import { useReferencesContext } from '@/features/ide-react/context/references-context'

export default function ReferencePickerController() {
  const { view } = useEditorViewContext()
  const { searchLocalReferences } = useReferencesContext()

  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | null>(null)
  const [commandName, setCommandName] = useState<string | null>(null)
  const [initialSelectedKeys, setInitialSelectedKeys] = useState<string[] | undefined>(undefined)

  const onClose = useCallback(() => {
    setOpen(false)
  }, [])

  const onApply = useCallback(
    (selectedKeys: string[]) => {
      if (!view || from == null || to == null) return
      // replace the inner content; we expect from and to to be inner positions
      const insert = selectedKeys.join(', ')
      view.dispatch({ changes: { from, to, insert } })
      // Move cursor after the closing brace
      view.focus()
    },
    [view, from, to]
  )

  useEffect(() => {
    const handler = (evt: CustomEvent) => {
      const { from, to, existingKeys, commandName } = evt.detail || {}
      if ((!from || !to) && view) {
        const pos = view.state.selection.main.head
        const insertText = '\\cite{}'
        view.dispatch({ changes: { from: pos, to: pos, insert: insertText } })
        const newFrom = pos + insertText.indexOf('{') + 1
        const newTo = newFrom
        setFrom(newFrom)
        setTo(newTo)
      } else {
        setFrom(from ?? null)
        setTo(to ?? null)
      }
      setCommandName(commandName ?? null)
      setInitialSelectedKeys(existingKeys ?? [])
      setOpen(true)
    }

    window.addEventListener('reference:openPicker', handler as any)

    return () => window.removeEventListener('reference:openPicker', handler as any)
  }, [searchLocalReferences])

  return (
    <ReferencePickerModal
      show={open}
      from={from}
      to={to}
      commandName={commandName}
      initialSelectedKeys={initialSelectedKeys}
      onClose={onClose}
      onApply={onApply}
    />
  )
}
