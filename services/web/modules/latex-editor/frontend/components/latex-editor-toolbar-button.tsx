import React, { FC, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

const LatexEditorToolbarButton: FC = () => {
    const [modalRoot, setModalRoot] = useState<any>(null)

    const openModal = () => {
        // Check if modal already exists
        let existingModal = document.getElementById('latex-editor-modal-root')

        if (existingModal) {
            // Modal exists, use its API to show it
            const api = (existingModal as any).__latexEditor
            if (api && api.open) {
                api.open()
            } else {
                // Fallback if API not available
                existingModal.style.setProperty('display', 'block', 'important')
                existingModal.style.setProperty('visibility', 'visible', 'important')
                existingModal.style.setProperty('opacity', '1', 'important')
                const textarea = existingModal.querySelector('textarea')
                if (textarea) (textarea as HTMLTextAreaElement).focus()
            }
        } else {
            // Create the modal for the first time
            import('./latex-editor-createmodal.mjs').then(module => {
                const { LatexEditorCreateModal } = module
                const modalElement = LatexEditorCreateModal({
                    handleSelect: (symbol: string) => {
                        window.dispatchEvent(new CustomEvent('editor:insert-symbol', { detail: symbol }))
                    },
                    onClose: () => {
                        const modal = document.getElementById('latex-editor-modal-root')
                        if (modal) modal.style.display = 'none'
                    }
                })

                if (modalElement) {
                    const api = (modalElement as any).__latexEditor
                    if (api && api.open) {
                        api.open()
                    } else {
                        modalElement.style.setProperty('display', 'block', 'important')
                        modalElement.style.setProperty('visibility', 'visible', 'important')
                        modalElement.style.setProperty('opacity', '1', 'important')
                        const textarea = modalElement.querySelector('textarea')
                        if (textarea) (textarea as HTMLTextAreaElement).focus()
                    }
                }
            }).catch(err => {
                console.error('Failed to load latex editor modal:', err)
            })
        }
    }

    return (
        <button
            className="ol-cm-toolbar-button"
            onClick={openModal}
            title="Equation Editor"
            type="button"
            aria-label="Equation Editor"
        >
            🧮
        </button>
    )
}

export default LatexEditorToolbarButton