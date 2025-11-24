import createCloseButton from './latex-editor-close-button.mjs'
import renderPreviewInto from './latex-editor-renderpreviewinto.mjs'
import createTabs from './latex-editor-tabs.mjs'
import initSymbolPalette from './latex-editor-symbolpalette.mjs'
import loadKaTeX from './latex-editor-loadkatex.mjs'
import PropTypes from 'prop-types'

// Symbol palette will auto-initialize via its module; no need to call here.

export function LatexEditorCreateModal(props) {
    const opts = (props && typeof props === 'object') ? props : { handleSelect: props }
    const handleSelect = opts.handleSelect
    const onClose = opts.onClose || (() => { })

    const existing = document.getElementById('latex-editor-modal-root')
    if (existing) return existing

    const root = document.createElement('div')
    root.id = 'latex-editor-modal-root'
    root.className = 'latex-editor-modal'
    Object.assign(root.style, {
        position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 99999, width: '840px', height: '612px', overflow: 'hidden',
        background: 'var(--bg-light-primary)', border: '1px solid var(--border-divider)', boxShadow: '0 10px 40px rgba(0,0,0,0.16)'
    })

    // Defensive sync: copy a small set of theme CSS variables from the host
    // root (documentElement/body) onto the modal root so the modal matches
    // the host (Overleaf) theme when the module is loaded inside the host.
    try {
        const hostStyles = window.getComputedStyle(document.documentElement) || window.getComputedStyle(document.body)
        const varsToSync = [
            '--bg-light-primary', '--bg-secondary-themed', '--bg-light-tertiary',
            '--content-primary-themed', '--content-primary', '--content-secondary',
            '--border-divider', '--bs-primary', '--bs-font-monospace', '--bs-font-sans-serif'
        ]
        varsToSync.forEach((name) => {
            try {
                const val = hostStyles.getPropertyValue(name)
                if (val && val.trim()) root.style.setProperty(name, val.trim())
            } catch (e) { }
        })
    } catch (e) { }

    const container = document.createElement('div')
    container.className = 'latex-editor-container'
    const editorEl = document.createElement('div')
    editorEl.className = 'latex-editor'

    const headerOuter = document.createElement('div')
    headerOuter.className = 'latex-editor-header-outer'
    const header = document.createElement('div')
    header.className = 'latex-editor-header'
    header.style.padding = '4px 8px'
    // remove bottom border — test visual separation without the white line
    header.style.borderBottom = 'none'
    header.style.display = 'flex'
    header.style.justifyContent = 'flex-start'
    header.style.alignItems = 'center'
    header.style.gap = '8px'
    header.style.width = '100%'

    const leftHeader = document.createElement('div')
    leftHeader.className = 'latex-editor-header-group'
    leftHeader.style.display = 'flex'
    leftHeader.style.alignItems = 'center'
    leftHeader.style.gap = '12px'
    leftHeader.style.flex = '1 1 auto'
    leftHeader.style.minWidth = '0'
    leftHeader.style.overflow = 'hidden'

    const title = document.createElement('div')
    title.className = 'latex-editor-title'
    // keep title text empty in maximized view; populate only when minimized
    title.textContent = ''
    // By default the modal is shown in its normal (maximized) form where the
    // compact title is not necessary. Hide it initially so the header matches
    // the host's maximized appearance. When minimized we toggle this to show
    // a compact title for the small header.
    title.style.display = 'none'
    title.style.whiteSpace = 'nowrap'
    title.style.overflow = 'hidden'
    title.style.textOverflow = 'ellipsis'
    title.style.maxWidth = '220px'
    title.style.lineHeight = '36px'
    title.style.height = '36px'
    title.style.alignSelf = 'center'

    const actions = document.createElement('div')
    // keep existing header-group classname for compatibility but add a
    // dedicated actions classname for targeted positioning
    actions.className = 'latex-editor-header-group latex-editor-actions'
    actions.style.display = 'flex'
    actions.style.alignItems = 'center'
    actions.style.gap = '8px'
    // use margin-left: auto to push actions to the right edge in flex layout
    actions.style.marginLeft = 'auto'
    actions.style.flexShrink = '0'

    const insertBtn = document.createElement('button')
    insertBtn.type = 'button'
    insertBtn.className = 'latex-editor-insert'
    insertBtn.textContent = 'Apply to Doc'


    const importBtn = document.createElement('button')
    importBtn.type = 'button'
    importBtn.className = 'latex-editor-import'
    importBtn.textContent = 'Load from Doc'

    const minimizeBtn = document.createElement('button')
    minimizeBtn.type = 'button'
    minimizeBtn.className = 'latex-editor-minimize'
    minimizeBtn.title = 'Minimize'
    minimizeBtn.textContent = '−'

    // create close button using helper (no extra text to avoid double icon)
    const { closeOuter, btn: closeBtnEl } = createCloseButton()
    closeBtnEl.title = 'Close'
    actions.appendChild(minimizeBtn)
    actions.appendChild(closeOuter)

    leftHeader.appendChild(title)
    header.appendChild(leftHeader)
    header.appendChild(actions)
    headerOuter.appendChild(header)

    const body = document.createElement('div')
    body.className = 'latex-editor-body'
    body.style.display = 'flex'
    body.style.gap = '12px'
    // reduce vertical padding to remove excess space above/below the main panes
    body.style.padding = '8px'
    body.style.width = '100%'
    body.style.boxSizing = 'border-box'

    const left = document.createElement('div')
    left.style.flex = '1 1 100%'
    left.style.minWidth = '0'
    const controls = document.createElement('div')
    controls.className = 'latex-editor-controls'
    controls.style.display = 'flex'
    controls.style.gap = '8px'
    // remove extra bottom margin so header children align on the same y-axis
    controls.style.marginBottom = '0'
    controls.appendChild(insertBtn)
    controls.appendChild(importBtn)

    const textareaWrapper = document.createElement('div')
    textareaWrapper.className = 'latex-editor-textarea-wrapper'
    textareaWrapper.style.position = 'relative'

    const textarea = document.createElement('textarea')
    textarea.className = 'latex-editor-textarea'
    textarea.setAttribute('aria-label', 'LaTeX editor textarea')
    // make textarea slightly more compact
    textarea.style.minHeight = '64px'
    // show helpful info when empty — similar to the search input placeholder
    try { textarea.setAttribute('placeholder', 'Enter your LaTeX equation here...') } catch (e) { }

    const textareaClear = document.createElement('button')
    textareaClear.type = 'button'
    textareaClear.className = 'latex-editor-textarea-clear'
    textareaClear.title = 'Clear textarea'
    textareaClear.setAttribute('aria-label', 'Clear textarea')
    textareaClear.textContent = '\u2715'
    textareaClear.style.display = 'none'
    textareaClear.style.border = 'none'
    textareaClear.style.background = 'var(--bs-primary)'
    textareaClear.style.cursor = 'pointer'
    textareaClear.style.padding = '0'
    textareaClear.style.margin = '0'
    textareaClear.style.position = 'absolute'
    textareaClear.style.right = '12px'
    textareaClear.style.bottom = '12px'
    textareaClear.style.top = 'auto'
    textareaClear.style.width = '28px'
    textareaClear.style.height = '28px'
    textareaClear.style.display = 'flex'
    textareaClear.style.alignItems = 'center'
    textareaClear.style.justifyContent = 'center'
    textareaClear.style.color = '#fff'
    textareaClear.style.fontSize = '14px'
    textareaClear.style.borderRadius = '6px'
    textareaClear.style.zIndex = '50'
    textareaClear.style.boxShadow = '0 2px 6px rgba(0,0,0,0.12)'
    textareaClear.addEventListener('click', (ev) => {
        try { textarea.value = ''; try { delete textarea.dataset.canonicalLatex } catch (e) { textarea.removeAttribute && textarea.removeAttribute('data-canonical-latex') }; textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.focus() } catch (e) { }
    })

    textarea.addEventListener('input', () => {
        try { textareaClear.style.display = (textarea.value && textarea.value.length) ? 'flex' : 'none' } catch (e) { }
        // console.log('[Preview] Rendering:', textarea.value, 'into preview element')
        try { renderPreviewInto(preview, textarea.value) } catch (e) { }
    })

    // initialize clear button visibility based on existing content
    try { textareaClear.style.display = (textarea.value && textarea.value.length) ? 'flex' : 'none' } catch (e) { }

    try {
        if (leftHeader && title) leftHeader.insertBefore(controls, title)
        else left.appendChild(controls)
    } catch (e) {
        left.appendChild(controls)
    }
    // (search input removed — header kept minimal)
    // tabs removed - not needed in header

    // Move the symbol-palette search input into the modal header (so it lives
    // visually in the window header). We move the existing input node so React
    // handlers continue working. If the palette recreates the input, observer
    // will reattach it.
    try {
        function findPaletteSearch() {
            const sels = [
                '#symbol-palette-input',
                'input.latex-symbol-search-input',
                '.latex-symbol-search input',
                '.symbol-palette-search input',
                '.symbol-palette-search'
            ]
            for (const s of sels) {
                try {
                    const el = document.querySelector(s)
                    if (el) return el
                } catch (e) { }
            }
            return null
        }

        function movePaletteSearchToHeader() {
            try {
                const p = findPaletteSearch()
                if (!p) return false
                // if it's already inside our header, ensure it's before the title
                if (leftHeader.contains(p)) {
                    try { leftHeader.insertBefore(p, title) } catch (e) { }
                    return true
                }
                // move the node into the header (preserves React listeners)
                try {
                    p.style.marginLeft = p.style.marginLeft || '8px'
                    p.style.marginRight = p.style.marginRight || '8px'
                    // make the header search about twice as wide as before
                    p.style.minWidth = p.style.minWidth || '320px'
                    p.style.maxWidth = p.style.maxWidth || '720px'
                    p.style.width = p.style.width || '44%'
                    // ensure input doesn't expand oddly in header flex
                    p.style.boxSizing = 'border-box'
                    // ensure the input is interactable above other elements
                    try { p.tabIndex = p.tabIndex || 0 } catch (e) { }
                    try { p.style.position = p.style.position || 'relative' } catch (e) { }
                    try { p.style.zIndex = p.style.zIndex || '100050' } catch (e) { }
                    // prevent header drag or other handlers from swallowing pointer events
                    try { p.addEventListener && p.addEventListener('mousedown', (ev) => { ev.stopPropagation && ev.stopPropagation(); }); } catch (e) { }
                    try { p.addEventListener && p.addEventListener('click', () => { try { p.focus() } catch (e) { } }) } catch (e) { }
                    try { p.addEventListener && p.addEventListener('pointerdown', (ev) => { ev.stopPropagation && ev.stopPropagation(); }, true) } catch (e) { }
                    try { p.addEventListener && p.addEventListener('touchstart', (ev) => { ev.stopPropagation && ev.stopPropagation(); }, { passive: true, capture: true }) } catch (e) { }
                    try { p.style.pointerEvents = p.style.pointerEvents || 'auto' } catch (e) { }
                    try { p.style.touchAction = p.style.touchAction || 'manipulation' } catch (e) { }
                    leftHeader.insertBefore(p, title)
                    // try to focus the input so keyboard users can type immediately
                    try { p.focus && p.focus() } catch (e) { }
                    return true
                } catch (e) { return false }
            } catch (e) { return false }
        }

        // Try immediate attach; otherwise observe DOM changes to attach when ready
        try {
            if (!movePaletteSearchToHeader()) {
                const mo = new MutationObserver((mutations, obs) => {
                    try {
                        if (movePaletteSearchToHeader()) obs.disconnect()
                    } catch (e) { }
                })
                mo.observe(document.body, { childList: true, subtree: true })
                root.__paletteSearchObserver = mo
            }
        } catch (e) { }
    } catch (e) { }

    // header search input removed
    textareaWrapper.appendChild(textarea)
    textareaWrapper.appendChild(textareaClear)
    left.appendChild(textareaWrapper)

    // Ensure the inline clear button follows the textarea when the symbol
    // palette moves the textarea node into its IO wrapper. Some host code
    // moves the raw `<textarea>` element (not the wrapper), which can leave
    // the clear button orphaned. Observe DOM changes and reattach the
    // clear button to the textarea's current parent when needed.
    try {
        function reattachTextareaClear() {
            try {
                const ta = textarea
                if (!ta) return
                let parent = ta.parentNode
                if (!parent) return

                // If the textarea is already wrapped in a textarea-wrapper, use it
                if (parent.classList && parent.classList.contains('latex-editor-textarea-wrapper')) {
                    // ensure wrapper is positioned so absolute clear button overlays correctly
                    try { if (!parent.style.position) parent.style.position = parent.style.position || 'relative' } catch (e) { }
                    if (!parent.contains(textareaClear)) {
                        try {
                            const sb = Math.max(0, (parent.offsetWidth || 0) - (parent.clientWidth || 0)) || 0
                            const baseRight = 20
                            const extraPadding = 8
                            textareaClear.style.position = 'absolute'
                            textareaClear.style.right = (baseRight + sb + (sb ? extraPadding : 0)) + 'px'
                            textareaClear.style.bottom = '12px'
                            textareaClear.style.top = 'auto'
                            parent.appendChild(textareaClear)
                        } catch (e) { }
                    }
                    return
                }

                // Otherwise, create a wrapper around the textarea so the clear button can be positioned
                try {
                    const wrapper = document.createElement('div')
                    wrapper.className = 'latex-editor-textarea-wrapper'
                    wrapper.style.position = parent.style.position && parent.style.position !== '' ? parent.style.position : 'relative'
                    wrapper.style.display = 'block'
                    // insert the wrapper in place of the textarea
                    try { parent.insertBefore(wrapper, ta) } catch (e) { parent.appendChild(wrapper) }
                    // move the textarea into the wrapper
                    try { wrapper.appendChild(ta) } catch (e) { }
                    // append the clear button into the wrapper (offset by scrollbar width)
                    try {
                        const sb = Math.max(0, (wrapper.offsetWidth || 0) - (wrapper.clientWidth || 0)) || 0
                        const baseRight = 20
                        const extraPadding = 8
                        textareaClear.style.position = 'absolute'
                        textareaClear.style.right = (baseRight + sb + (sb ? extraPadding : 0)) + 'px'
                        textareaClear.style.bottom = '12px'
                        textareaClear.style.top = 'auto'
                        wrapper.appendChild(textareaClear)
                    } catch (e) { }
                } catch (e) {
                    // fallback: just append to parent
                    try {
                        const sb = Math.max(0, (parent.offsetWidth || 0) - (parent.clientWidth || 0)) || 0
                        const baseRight = 20
                        const extraPadding = 8
                        textareaClear.style.position = 'absolute'
                        textareaClear.style.right = (baseRight + sb + (sb ? extraPadding : 0)) + 'px'
                        textareaClear.style.bottom = '12px'
                        textareaClear.style.top = 'auto'
                        parent.appendChild(textareaClear)
                    } catch (err) { }
                }
            } catch (e) { }

            // Cleanup: remove any leftover empty wrappers that no longer contain
            // a textarea or the clear button so the DOM doesn't accumulate
            try {
                const wrappers = Array.from(document.querySelectorAll('.latex-editor-textarea-wrapper'))
                for (const w of wrappers) {
                    try {
                        const hasTA = !!w.querySelector && !!w.querySelector('textarea')
                        const hasClear = w.contains && w.contains(textareaClear)
                        if (!hasTA && !hasClear) {
                            w.parentNode && w.parentNode.removeChild && w.parentNode.removeChild(w)
                        }
                    } catch (ee) { }
                }
            } catch (e) { }
        }

        // Run once to fix current state
        try { reattachTextareaClear() } catch (e) { }

        const taMo = new MutationObserver((mutations) => {
            try {
                // If textarea was moved, reattach the clear button
                for (const m of mutations) {
                    if (!m) continue
                    // cheap check: if any mutation touched nodes that might contain the textarea
                    if ((m.addedNodes && m.addedNodes.length) || (m.removedNodes && m.removedNodes.length) || m.type === 'attributes') {
                        reattachTextareaClear();
                        break
                    }
                }
            } catch (e) { }
        })
        taMo.observe(document.body, { childList: true, subtree: true })
        root.__textareaMoveObserver = taMo
    } catch (e) { }

    // Preview element - will be moved by symbol palette into the IO section
    const preview = document.createElement('div')
    preview.className = 'latex-editor-preview'
    preview.style.minHeight = '160px'
    preview.style.padding = '8px'
    preview.style.paddingBottom = '8px'
    preview.style.border = '1px solid var(--border-divider)'
    // Start with empty preview - will be filled by symbol palette
    // Append preview to left panel so symbol palette can find and move it
    left.appendChild(preview)

    // Note: preview rendering is handled by the input listener at line ~195

    insertBtn.addEventListener('click', () => {
        const latex = (textarea.dataset && textarea.dataset.canonicalLatex) || textarea.value || ''
        document.dispatchEvent(new CustomEvent('editor:insert-equation', { detail: { latex } }))
        try {
            // Try to find CodeMirror editor in the page
            const cmContent = document.querySelector('.cm-content')
            let cmView = null
            if (cmContent) {
                // Try multiple ways to access the view
                cmView = cmContent.cmView?.view || window.cmView?.view || window.editorView
            }
            if (cmView && cmView.state) {
                const state = cmView.state
                const selection = state.selection.main
                cmView.dispatch({
                    changes: { from: selection.from, to: selection.to, insert: latex },
                    selection: { anchor: selection.from + latex.length }
                })
                cmView.focus()
                return
            }
            // Prefer hostAdapter if provided (for host integrations like Overleaf)
            const adapter = opts.hostAdapter || null
            if (adapter && typeof adapter.replaceSelection === 'function') {
                try {
                    // If we have a stored host selection, attempt to use indices if adapter supports it
                    if (root.__hostSelection && root.__hostSelection.hostSelector === opts.hostSelector && typeof adapter.replaceRange === 'function') {
                        let start = root.__hostSelection.start
                        let end = root.__hostSelection.end
                        const original = root.__hostSelection.text || ''
                        try {
                            // allow adapter to validate and fallback internally
                            adapter.replaceRange(start, end, latex)
                        } catch (e) {
                            // fallback to generic replaceSelection
                            adapter.replaceSelection(latex)
                        }
                        try { delete root.__hostSelection } catch (e) { root.__hostSelection = undefined }
                    } else {
                        // generic replace at cursor or selection
                        adapter.replaceSelection(latex)
                    }
                } catch (e) { console.warn && console.warn('hostAdapter.replaceSelection failed', e && e.message) }
            } else {
                const host = opts.hostSelector ? document.querySelector(opts.hostSelector) : null
                if (host && host.selectionStart !== undefined) {
                    if (root.__hostSelection && root.__hostSelection.hostSelector === opts.hostSelector) {
                        let start = root.__hostSelection.start
                        let end = root.__hostSelection.end
                        const original = root.__hostSelection.text || ''
                        try {
                            const currentSlice = host.value.slice(start, end)
                            if (currentSlice !== original) {
                                const found = original ? host.value.indexOf(original) : -1
                                if (found !== -1) { start = found; end = found + original.length }
                            }
                        } catch (e) { }
                        start = Math.max(0, Math.min(start, host.value.length))
                        end = Math.max(0, Math.min(end, host.value.length))
                        host.value = host.value.slice(0, start) + latex + host.value.slice(end)
                        host.selectionStart = host.selectionEnd = start + latex.length
                        host.focus()
                        try { delete root.__hostSelection } catch (e) { root.__hostSelection = undefined }
                    } else {
                        const start = host.selectionStart
                        const end = host.selectionEnd
                        host.value = host.value.slice(0, start) + latex + host.value.slice(end)
                        host.selectionStart = host.selectionEnd = start + latex.length
                        host.focus()
                    }
                }
            }
        } catch (e) { }
        try { delete textarea.dataset.canonicalLatex } catch (e) { textarea.removeAttribute && textarea.removeAttribute('data-canonical-latex') }
    })

    // header clear button removed — inline textarea-clear button remains

    importBtn.addEventListener('click', () => {
        try {
            // Try to find CodeMirror editor
            const cmContent = document.querySelector('.cm-content')
            let cmView = null
            if (cmContent) {
                cmView = cmContent.cmView?.view || window.cmView?.view || window.editorView
            }
            if (cmView && cmView.state) {
                const state = cmView.state
                const selection = state.selection.main
                const selected = state.doc.sliceString(selection.from, selection.to)
                textarea.value = selected
                textarea.dispatchEvent(new Event('input', { bubbles: true }))
                try { root.__hostSelection = { from: selection.from, to: selection.to, text: selected, cmView: cmView } } catch (e) { }
                try { textarea.focus() } catch (e) { }
                return
            }
            const host = opts.hostSelector ? document.querySelector(opts.hostSelector) : null
            if (!host || host.selectionStart === undefined) return
            const start = host.selectionStart
            const end = host.selectionEnd
            const selected = host.value.slice(start, end)
            textarea.value = selected
            textarea.dispatchEvent(new Event('input', { bubbles: true }))
            try { root.__hostSelection = { start: start, end: end, text: selected, hostSelector: opts.hostSelector } } catch (e) { }
            try { textarea.focus() } catch (e) { }
        } catch (e) { }
    })

    body.appendChild(left)
    // right panel removed - preview is moved into symbol palette by symbolpalette.mjs

    editorEl.appendChild(headerOuter)
    // inject scoped styles so the modal matches Overleaf-like UI
    try {
        const style = document.createElement('style')
        style.type = 'text/css'
        style.textContent = `
#latex-editor-modal-root { font-family: var(--bs-font-sans-serif); color: var(--content-primary-themed); }
#latex-editor-modal-root .latex-editor-header { background: var(--bg-secondary-themed); }

/* Force backgrounds inside the modal to the themed secondary background.
   This applies broadly to panels, grids, preview, textarea wrapper and form
   controls inside the modal so the whole window uses the same background.
   Buttons keep their explicit styles elsewhere in the stylesheet. */
#latex-editor-modal-root,
#latex-editor-modal-root .latex-editor,
#latex-editor-modal-root .latex-editor-container,
#latex-editor-modal-root .latex-editor-body,
#latex-editor-modal-root .latex-editor-right,
#latex-editor-modal-root .latex-editor-preview,
#latex-editor-modal-root .latex-editor-textarea-wrapper,
#latex-editor-modal-root .latex-symbol-groups,
#latex-editor-modal-root .latex-symbol-grid,
#latex-editor-modal-root .latex-symbol-panel,
#latex-editor-modal-root .latex-symbol-panel .latex-symbol-panel-title,
#latex-editor-modal-root .latex-symbol-panel .latex-symbol-grid,
#latex-editor-modal-root .latex-symbol-search,
#latex-editor-modal-root .latex-symbol-io-wrap,
#latex-editor-modal-root .latex-editor-tabs,
#latex-editor-modal-root textarea,
#latex-editor-modal-root input,
#latex-editor-modal-root select {
    background: var(--bg-secondary-themed) !important;
}

/* Backgrounds below the header: keep header styling but ensure all
   primary panes and panels underneath use the themed secondary background.
   Do NOT alter button rules here — buttons keep their existing styles. */
#latex-editor-modal-root .latex-editor-container,
#latex-editor-modal-root .latex-editor,
#latex-editor-modal-root .latex-editor-body,
#latex-editor-modal-root .latex-editor-right,
#latex-editor-modal-root .latex-editor-preview,
#latex-editor-modal-root .latex-editor-textarea-wrapper,
#latex-editor-modal-root .latex-symbol-groups,
#latex-editor-modal-root .latex-symbol-grid,
#latex-editor-modal-root .latex-editor-tabs {
    background: var(--bg-secondary-themed) !important;
}
/* Title: hidden in normal/maximized view; shown only when minimized */
#latex-editor-modal-root .latex-editor-header .latex-editor-title { display: none; font-weight: 600; font-size: 1rem; color: var(--content-primary-themed); }
#latex-editor-modal-root.latex-editor--minimized .latex-editor-header .latex-editor-title { display: block !important; }
#latex-editor-modal-root .latex-editor-header .latex-editor-header-group {
    gap: 8px;
    /* match the header search input and buttons height for consistent alignment */
    height: 36px !important;
    min-height: 36px !important;
    display: flex !important;
    align-items: center !important;
}
#latex-editor-modal-root .latex-editor-controls button { margin-right: 6px; }
#latex-editor-modal-root .latex-editor-insert { background: var(--bs-primary); color: #fff; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer }
#latex-editor-modal-root .latex-editor-insert:hover { filter: brightness(0.95) }
#latex-editor-modal-root .latex-editor-import, #latex-editor-modal-root .latex-editor-clear { background: transparent; border: 1px solid var(--border-divider); color: var(--content-primary-themed); padding: 6px 8px; border-radius: 4px; cursor: pointer }
#latex-editor-modal-root .latex-editor-minimize { background: transparent; border: none; font-size: 18px; padding: 4px; cursor: pointer }
#latex-editor-modal-root .latex-editor-textarea { width: 100%; box-sizing: border-box; font-family: var(--bs-font-monospace); font-size: 14px; padding: 10px; border: none !important; border-radius: 4px; background: var(--bg-secondary-themed); color: var(--content-primary-themed); }
#latex-editor-modal-root .latex-editor-textarea-wrapper { position: relative; background: var(--bg-secondary-themed); padding: 6px 6px 6px !important; border-radius: 4px; border: 1px solid var(--border-divider) !important; }
#latex-editor-modal-root .latex-editor-textarea { padding-right: 56px; padding-bottom: 44px }
#latex-editor-modal-root .latex-editor-textarea-clear { position: absolute; right: 12px; bottom: 12px; top: auto; width: 28px; height: 28px; display: none; align-items: center; justify-content: center; border: none; background: var(--bs-primary); color: #fff; cursor: pointer; font-size: 14px; border-radius: 6px; z-index: 5; box-shadow: 0 2px 6px rgba(0,0,0,0.12); }
#latex-editor-modal-root .latex-editor-textarea-clear:hover { filter: brightness(0.95) }
#latex-editor-modal-root .latex-editor-preview { border-radius: 4px; background: var(--bg-secondary-themed); border: 1px solid var(--border-divider); padding: 10px; padding-bottom: 8px !important; color: var(--content-primary-themed) }
#latex-editor-modal-root .katex-mathml { display: none !important; }
#latex-editor-modal-root .latex-editor-right { min-width: 240px }
#latex-editor-modal-root .latex-editor-tabs { display: inline-flex; gap: 6px; }
#latex-editor-modal-root .latex-editor-tabs button { background: transparent; border: 1px solid transparent; padding: 6px 8px; border-radius: 4px; cursor: pointer }
#latex-editor-modal-root .latex-editor-tabs button.active { background: var(--bg-light-tertiary); border-color: var(--border-divider) }
/* Unified modal button style (applies to all modal buttons) */
/* target common button containers plus specific modal button classes to ensure coverage */
/* Apply unified button visuals to modal buttons except the compact
   header controls (minimize/close) which need to keep a tight box so
   their small clickable area is preserved and not overridden by broad
   padding rules. */
#latex-editor-modal-root .latex-editor-controls button,
#latex-editor-modal-root .latex-editor-header-group button,
#latex-editor-modal-root .latex-editor-tabs button,
#latex-editor-modal-root .latex-editor-right button,
#latex-editor-modal-root .latex-editor-header-outer button,
#latex-editor-modal-root .latex-editor-insert,
#latex-editor-modal-root .latex-editor-import,
#latex-editor-modal-root .latex-editor-toolbar-button,
#latex-editor-modal-root .latex-symbol-btn,
#latex-editor-modal-root .latex-symbol-group-button,
#latex-editor-modal-root .latex-symbol-group-dropdown-item {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: var(--bs-primary) !important;
    color: #fff !important;
    border: none !important;
    padding: 6px 10px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.12) !important;
}
#latex-editor-modal-root .latex-editor-controls button:hover,
#latex-editor-modal-root .latex-editor-header-group button:hover,
#latex-editor-modal-root .latex-editor-tabs button:hover,
#latex-editor-modal-root .latex-editor-toolbar-button:hover,
#latex-editor-modal-root .latex-symbol-btn:hover,
#latex-editor-modal-root .latex-symbol-group-button:hover,
#latex-editor-modal-root .latex-symbol-group-dropdown-button:hover,
#latex-editor-modal-root .latex-symbol-group-dropdown-item:hover {
    filter: brightness(0.95) !important;
}
/* Keep clear button compact; make minimize and close the same size */
#latex-editor-modal-root .latex-editor-textarea-clear {
    width: 28px !important;
    height: 28px !important;
    padding: 0 !important;
}
#latex-editor-modal-root .latex-editor-minimize,
#latex-editor-modal-root .latex-editor-close-button {
    width: 36px !important;
    height: 36px !important;
    padding: 0 !important;
    border-radius: 6px !important;
    font-size: 16px !important;
}
/* Ensure symbol grid buttons (many small buttons) keep comfortable padding
    and force a consistent font-size so symbol buttons match group buttons. */
#latex-editor-modal-root .latex-symbol-btn { padding: 6px !important; border-radius: 6px !important; font-size: 13px !important; line-height: 1 !important; }
#latex-editor-modal-root .latex-symbol-group-button, #latex-editor-modal-root .latex-symbol-group-dropdown-item { font-size: 13px !important; line-height: 1 !important; }
/* styles applied when a toggle-switch input is checked (mirrored as
   .toggle-switch-active on the modal root). These style the header buttons
   (Apply / Load / Clear / Minimize / Close) so they reflect the toggle state. */
#latex-editor-modal-root.toggle-switch-active .latex-editor-controls button,
#latex-editor-modal-root.toggle-switch-active .latex-editor-header .latex-editor-minimize,
#latex-editor-modal-root.toggle-switch-active .latex-editor-close-button {
    background: var(--bs-primary);
    color: #fff;
    border-color: var(--bs-primary);
    box-shadow: 0 6px 18px rgba(34,46,80,0.12);
    transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
}
#latex-editor-modal-root.toggle-switch-active .latex-editor-controls button:hover,
#latex-editor-modal-root.toggle-switch-active .latex-editor-header .latex-editor-minimize:hover,
#latex-editor-modal-root.toggle-switch-active .latex-editor-close-button:hover {
    filter: brightness(0.95);
}
/* Header search inside modal: wider when moved into header; hide when minimized */
#latex-editor-modal-root input.latex-symbol-search-input,
#latex-editor-modal-root #symbol-palette-input,
#latex-editor-modal-root .symbol-palette-search input {
    min-width: 320px !important;
    max-width: 720px !important;
    width: 44% !important;
}
#latex-editor-modal-root.latex-editor--minimized input.latex-symbol-search-input,
#latex-editor-modal-root.latex-editor--minimized #symbol-palette-input,
#latex-editor-modal-root.latex-editor--minimized .symbol-palette-search input {
    display: none !important;
}
/* Make the header search and primary action buttons share the same height */
#latex-editor-modal-root input.latex-symbol-search-input,
#latex-editor-modal-root #symbol-palette-input,
#latex-editor-modal-root .symbol-palette-search input {
    height: 36px !important;
    font-size: 13px !important;
    padding: 6px 12px !important;
    border-radius: 999px !important;
    background-clip: padding-box !important;
}

/* Make header search input background white for readability */
#latex-editor-modal-root input.latex-symbol-search-input,
#latex-editor-modal-root #symbol-palette-input,
#latex-editor-modal-root .symbol-palette-search input {
    background: #ffffff !important;
    color: var(--content-primary) !important;
    border: 1px solid var(--border-divider) !important;
}
#latex-editor-modal-root .latex-editor-insert,
#latex-editor-modal-root .latex-editor-import {
    height: 36px !important;
    line-height: 36px !important;
    padding: 0 12px !important;
    font-size: 13px !important;
}
/* Dropdown menu styling: themed secondary background, white text, and
   white rounded border to visually match other modal panels */
#latex-editor-modal-root .latex-symbol-group-dropdown-menu {
    background: var(--bg-secondary-themed) !important;
    color: #fff !important;
    border: 1px solid #ffffff !important;
    border-radius: 12px !important;
    padding: 6px !important;
    box-shadow: 0 8px 30px rgba(0,0,0,0.18) !important;
}
/* Make each dropdown item match the menu background so items appear
   seamless with the themed panel; keep text white for contrast. */
#latex-editor-modal-root .latex-symbol-group-dropdown-item {
    color: #fff !important;
    background: var(--bg-secondary-themed) !important;
    padding: 8px 12px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    border: 1px solid transparent !important;
}
#latex-editor-modal-root .latex-symbol-group-dropdown-item:hover {
    /* subtle highlight on hover while preserving the themed background */
    background: color-mix(in srgb, var(--bg-secondary-themed) 88%, white 12%) !important;
}
/* dropdown trigger styling reverted to host defaults (do not force themed button) */

/* Make the dropdown trigger button match the modal's primary button style */
#latex-editor-modal-root .latex-symbol-group-dropdown-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: var(--bs-primary) !important;
    color: #fff !important;
    border: none !important;
    padding: 0 12px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.12) !important;
    height: 25px !important;
    line-height: 25px !important;
    font-size: 13px !important;
}
#latex-editor-modal-root .latex-symbol-group-dropdown-button:hover { filter: brightness(0.95) !important; }

/* Panel title color and rounded white border for symbol panels */
#latex-editor-modal-root .latex-symbol-panel {
    border: 1px solid #ffffff !important;
    border-radius: 12px !important;
    padding: 8px !important;
}
#latex-editor-modal-root .latex-symbol-panel-title {
    color: #fff !important;
    font-weight: 600 !important;
}
/* White rounded border around symbol groups with vertical gap */
#latex-editor-modal-root .latex-symbol-groups {
    border: 1px solid #ffffff !important;
    border-radius: 12px !important;
    padding: 8px !important;
    margin: 10px 0 !important;
}
        `
        root.appendChild(style)
    } catch (e) { }
    // Ensure all header elements share the same vertical center (y-axis).
    // This block deliberately runs after earlier rules so it can align
    // title, search input, action buttons and compact controls.
    try {
        const headerAlignStyle = document.createElement('style')
        headerAlignStyle.type = 'text/css'
        headerAlignStyle.id = 'latex-editor-header-vertical-align'
        headerAlignStyle.textContent = `
#latex-editor-modal-root .latex-editor-header,
#latex-editor-modal-root .latex-editor-header-outer {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    box-sizing: border-box !important;
    padding: 4px 8px !important; /* reduced top/bottom gap */
    min-height: 36px !important;
}
#latex-editor-modal-root .latex-editor-header .latex-editor-header-group,
#latex-editor-modal-root .latex-editor-header .latex-editor-title,
#latex-editor-modal-root .latex-editor-header .latex-editor-controls {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    box-sizing: border-box !important;
    height: 32px !important; /* children reduced to 32px for a slimmer header */
}
#latex-editor-modal-root .latex-editor-title {
    display: flex !important;
    align-items: center !important;
    height: 36px !important;
    line-height: 1 !important;
    padding: 0 8px !important;
    margin: 0 !important;
}
#latex-editor-modal-root .latex-editor-controls button,
#latex-editor-modal-root .latex-editor-header-group button,
#latex-editor-modal-root .latex-editor-minimize,
#latex-editor-modal-root .latex-editor-close-button,
#latex-editor-modal-root .latex-editor-toolbar-button {
    height: 32px !important;
    line-height: 1 !important;
    padding: 0 10px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-sizing: border-box !important;
}
/* ensure header search input vertically centers */
#latex-editor-modal-root input.latex-symbol-search-input,
#latex-editor-modal-root #symbol-palette-input,
#latex-editor-modal-root .symbol-palette-search input {
    height: 32px !important;
    line-height: 1 !important;
    box-sizing: border-box !important;
}
/* Make header occupy full modal width and allow first header group to stretch */
#latex-editor-modal-root .latex-editor-header { width: 100% !important; }
#latex-editor-modal-root .latex-editor-header .latex-editor-header-group:first-child { flex: 1 1 auto !important; min-width: 0 !important; }
`
        try { document.head && document.head.appendChild(headerAlignStyle) } catch (e) { try { document.body.appendChild(headerAlignStyle) } catch (err) { } }
    } catch (e) { }
    // Hide action buttons and controls when the modal is minimized.
    try {
        const miniHide = document.createElement('style')
        miniHide.type = 'text/css'
        miniHide.id = 'latex-editor-minimized-hide-controls'
        miniHide.textContent = `
/* Hide primary action controls when modal is minimized */
#latex-editor-modal-root.latex-editor--minimized .latex-editor-controls,
#latex-editor-modal-root.latex-editor--minimized .latex-editor-controls button,
#latex-editor-modal-root.latex-editor--minimized .latex-editor-insert,
#latex-editor-modal-root.latex-editor--minimized .latex-editor-import,
#latex-editor-modal-root.latex-editor--minimized .latex-editor-clear {
    display: none !important;
    visibility: hidden !important;
}
#latex-editor-modal-root.latex-editor--minimized .latex-editor-header-group .latex-editor-insert,
#latex-editor-modal-root.latex-editor--minimized .latex-editor-header-group .latex-editor-import {
    display: none !important;
    visibility: hidden !important;
}
`
        try { document.head && document.head.appendChild(miniHide) } catch (e) { try { document.body.appendChild(miniHide) } catch (err) { } }
    } catch (e) { }
    // Ensure vertical alignment for elements when the modal is minimized.
    try {
        const miniAlign = document.createElement('style')
        miniAlign.type = 'text/css'
        miniAlign.id = 'latex-editor-minimized-vertical-align'
        miniAlign.textContent = `
/* Vertically center header elements in minimized state */
#latex-editor-modal-root.latex-editor--minimized .latex-editor-header,
#latex-editor-modal-root.latex-editor--minimized .latex-editor-header-outer {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 4px 8px !important;
    box-sizing: border-box !important;
    justify-content: flex-start !important;
}
#latex-editor-modal-root.latex-editor--minimized .latex-editor-header .latex-editor-header-group {
    display: flex !important;
    align-items: center !important;
    min-height: 0 !important;
}
/* Keep actions using flex layout - no absolute positioning */
#latex-editor-modal-root.latex-editor--minimized .latex-editor-actions {
    position: relative !important;
    top: auto !important;
    right: auto !important;
    transform: none !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    margin-left: auto !important;
    flex-shrink: 0 !important;
    margin-top: -4px !important;
}
/* Ensure title and compact controls align correctly */
#latex-editor-modal-root.latex-editor--minimized .latex-editor-title {
    display: flex !important;
    align-items: center !important;
    transform: none !important;
}
        `
        try { document.head && document.head.appendChild(miniAlign) } catch (e) { try { document.body.appendChild(miniAlign) } catch (err) { } }
    } catch (e) { }
    // Watch for any `.toggle-switch-input` controls and mirror their checked
    // state onto the modal root via `.toggle-switch-active`. This lets us
    // apply scoped styles to the five header buttons when a toggle is active
    // without relying on specific DOM placement of the control.
    try {
        function updateHeaderButtonStyles(active) {
            try {
                const selectors = [
                    '.latex-editor-insert',
                    '.latex-editor-import',
                    '.latex-editor-minimize',
                    '.latex-editor-close-button'
                ]
                // Only modify buttons inside the modal root to avoid mutating host DOM
                selectors.forEach((sel) => {
                    const btn = (root && root.querySelector && root.querySelector(sel))
                    if (!btn) return
                    if (active) {
                        btn.classList.add('btn', 'btn-primary')
                    } else {
                        btn.classList.remove('btn', 'btn-primary')
                    }
                })
            } catch (e) { }
        }

        function handleToggleChange(ev) {
            const t = ev.target
            // also accept triggers where the label or surrounding element is used
            const isToggle = t && t.classList && (t.classList.contains('toggle-switch-input') || t.matches && t.matches('.toggle-switch-input'))
            if (!isToggle) return
            try {
                if (t.checked) {
                    root.classList.add('toggle-switch-active')
                    updateHeaderButtonStyles(true)
                } else {
                    root.classList.remove('toggle-switch-active')
                    updateHeaderButtonStyles(false)
                }
            } catch (e) { }
        }
        // observe changes bubbled from inputs
        document.addEventListener('change', handleToggleChange, true)
        // initialize based on any existing checked toggle
        try {
            const inputs = Array.from(document.querySelectorAll('.toggle-switch-input'))
            const anyChecked = inputs.some(i => !!i.checked)
            if (anyChecked) {
                root.classList.add('toggle-switch-active')
                updateHeaderButtonStyles(true)
            } else {
                updateHeaderButtonStyles(false)
            }
        } catch (e) { }
        // Additionally, mirror any host `.btn-primary` presence as a fallback,
        // but avoid changing host elements and debounce mutations to prevent
        // feedback loops that can cause hangs.
        try {
            function checkPrimaryButtons() {
                try {
                    const found = document.querySelectorAll('.btn-primary')
                    const active = found && found.length > 0
                    if (active) {
                        root.classList.add('toggle-switch-active')
                        updateHeaderButtonStyles(true)
                    } else {
                        root.classList.remove('toggle-switch-active')
                        updateHeaderButtonStyles(false)
                    }
                    return active
                } catch (e) { return false }
            }
            // initial run
            checkPrimaryButtons()
            // observe DOM changes to pick up dynamic additions/removals of primary buttons
            try {
                let _btnCheckTimer = null
                const mo = new MutationObserver((mutations) => {
                    try {
                        for (let m of mutations) {
                            // ignore mutations that occur inside our modal to avoid self-triggering
                            if (m.target && m.target.closest && m.target.closest('#latex-editor-modal-root')) continue
                        }
                        // debounce the check to avoid rapid recurring runs
                        if (_btnCheckTimer) clearTimeout(_btnCheckTimer)
                        _btnCheckTimer = setTimeout(() => { try { checkPrimaryButtons() } catch (e) { } }, 120)
                    } catch (e) { }
                })
                mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
                root.__btnPrimaryObserver = mo
            } catch (e) { }
        } catch (e) { }
    } catch (e) { }
    editorEl.appendChild(body)
    container.appendChild(editorEl)
    root.appendChild(container)
    document.body.appendChild(root)
    // Enforce minimum modal dimensions so users cannot resize smaller than
    // the intended usable minimums. These are applied as important rules
    // so host CSS can't easily override them.
    try {
        root.style.setProperty('min-width', '840px', 'important')
        root.style.setProperty('min-height', '612px', 'important')
    } catch (e) { }
    // Late-applied fallback: ensure the compact header controls (minimize/close)
    // retain their intended 36x36 box and zero padding even if other bundles
    // inject broad button rules. This style is appended after the modal so
    // it loads later and wins when necessary. It's safe to remove once host
    // CSS conflicts are resolved.
    try {
        const lateBtnStyle = document.createElement('style')
        lateBtnStyle.type = 'text/css'
        lateBtnStyle.id = 'latex-editor-close-button-fallback'
        lateBtnStyle.textContent = `#latex-editor-modal-root .latex-editor-minimize, #latex-editor-modal-root .latex-editor-close-button { padding: 0 !important; width: 36px !important; height: 36px !important; box-sizing: border-box !important; }`
        try { document.head && document.head.appendChild(lateBtnStyle) } catch (e) { try { document.body.appendChild(lateBtnStyle) } catch (err) { } }
    } catch (e) { }
    root.style.display = 'none'

    const _ST_KEY_MAX = 'latexEditor.maximized'
    const _ST_KEY_MIN = 'latexEditor.minimized'

    function _parseSaved(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null } catch (e) { return null } }
    function _saveState(isMin) {
        try {
            if (root.__suppressSave) return
            // don't persist when the modal is hidden
            const comp = window.getComputedStyle && window.getComputedStyle(root)
            if (comp && comp.display === 'none') return

            const rect = root.getBoundingClientRect()
            if (!rect || !isFinite(rect.width) || !isFinite(rect.height)) return

            // Normalize and clamp values to sane ranges before saving
            const vw = Math.max(640, window.innerWidth || 1024)
            const vh = Math.max(480, window.innerHeight || 768)
            // Enforce larger sensible minimums for maximized modal dimensions
            const minW = 700
            const minH = 510

            let left = Math.round(rect.left || 0)
            let top = Math.round(rect.top || 0)
            let width = Math.round(rect.width || minW)
            let height = Math.round(rect.height || minH)

            // Clamp sizes to viewport and minimums
            width = Math.max(minW, Math.min(width, vw))
            height = Math.max(minH, Math.min(height, vh))

            // Clamp position so the modal remains at least partially visible
            left = Math.max(0, Math.min(left, Math.max(0, vw - minW)))
            top = Math.max(0, Math.min(top, Math.max(0, vh - minH)))

            const obj = { left: left, top: top, width: width, height: height }
            try { localStorage.setItem(isMin ? _ST_KEY_MIN : _ST_KEY_MAX, JSON.stringify(obj)) } catch (e) { }
        } catch (e) { }
    }
    function _applySaved(obj) {
        try {
            if (!obj) return
            // viewport sizes (use sensible fallbacks)
            const vw = Math.max(640, window.innerWidth || 1024)
            const vh = Math.max(480, window.innerHeight || 768)
            // Mirror the same minimums used when saving state so sizes/clamping are consistent
            const minW = 840
            const minH = 612

            root.style.position = 'fixed'
            root.style.transform = 'none'

            if (obj.left !== undefined) {
                let left = Number(obj.left)
                if (!isFinite(left)) left = Math.round((vw - Math.min(Number(obj.width) || vw, vw)) / 2)
                // clamp to viewport
                left = Math.max(0, Math.min(left, vw - minW))
                root.style.setProperty('left', Math.round(left) + 'px', 'important')
            }
            if (obj.top !== undefined) {
                let top = Number(obj.top)
                if (!isFinite(top)) top = Math.round((vh - Math.min(Number(obj.height) || vh, vh)) / 2)
                top = Math.max(0, Math.min(top, vh - minH))
                root.style.setProperty('top', Math.round(top) + 'px', 'important')
            }
            if (obj.width !== undefined) {
                let w = Math.round(Number(obj.width) || vw)
                if (!isFinite(w)) w = vw
                w = Math.max(minW, Math.min(w, vw))
                root.style.width = w + 'px'
            }
            if (obj.height !== undefined) {
                let h = Math.round(Number(obj.height) || vh)
                if (!isFinite(h)) h = vh
                h = Math.max(minH, Math.min(h, vh))
                root.style.height = h + 'px'
            }
            // Re-assert minimums after applying saved geometry so the saved
            // values can't shrink the modal below the enforced minimum.
            try {
                root.style.setProperty('min-width', String(minW) + 'px', 'important')
                root.style.setProperty('min-height', String(minH) + 'px', 'important')
            } catch (e) { }
        } catch (e) { }
    }

    try { const savedMax = _parseSaved(_ST_KEY_MAX); if (savedMax) { root.__suppressSave = true; _applySaved(savedMax); root.__suppressSave = false } } catch (e) { }

    try {
        const ro = new ResizeObserver(() => { if (root.__suppressSave) return; const recent = root.__lastPointerAt && ((Date.now() - root.__lastPointerAt) < 800); if (!root.__userIsInteracting && !recent) return; try { _saveState(root.classList.contains('latex-editor--minimized')) } catch (e) { } })
        ro.observe(root)
        root.__resizeObserver = ro
    } catch (e) { }

    root.__fixPosition = () => { try { const rect = root.getBoundingClientRect(); const computedLeft = rect.left + window.scrollX; const computedTop = rect.top + window.scrollY; root.style.left = computedLeft + 'px'; root.style.top = computedTop + 'px'; root.style.transform = 'none' } catch (e) { } }

    minimizeBtn.addEventListener('click', () => {
        const isMin = root.classList.contains('latex-editor--minimized')
        root.__suppressSave = true
        if (isMin) {
            root.classList.remove('latex-editor--minimized')
            minimizeBtn.textContent = '−'
            try { if (root.__minDebugObserver) { root.__minDebugObserver.disconnect(); delete root.__minDebugObserver } } catch (e) { }
            try { if (root.__prevLeft !== undefined && root.__prevLeft !== '') { try { root.style.position = root.__prevPosition || 'fixed' } catch (e) { root.style.position = 'fixed' }; try { root.style.setProperty('left', root.__prevLeft, 'important') } catch (e) { }; try { root.style.setProperty('top', root.__prevTop, 'important') } catch (e) { }; try { root.style.transform = root.__prevTransform || 'none' } catch (e) { root.style.transform = 'none' }; try { delete root.__prevLeft; delete root.__prevTop; delete root.__prevTransform; delete root.__prevPosition } catch (e) { } } else { const savedMax = _parseSaved(_ST_KEY_MAX); if (savedMax) { _applySaved(savedMax) } else { root.style.position = 'fixed'; root.style.left = '50%'; root.style.top = '50%'; root.style.transform = 'translate(-50%, -50%)' } } } catch (e) { }
            try { if (root.__prevWidth) { root.style.width = root.__prevWidth; delete root.__prevWidth } else { root.style.width = '' } } catch (e) { }
            try { if (root.__prevBoxShadow !== undefined) { root.style.boxShadow = root.__prevBoxShadow; delete root.__prevBoxShadow } else { root.style.boxShadow = '' } } catch (e) { }
            try { if (root.__prevHeight) { root.style.height = root.__prevHeight; delete root.__prevHeight } else { root.style.height = '' } } catch (e) { }
            try { if (root.style.removeProperty) { root.style.removeProperty('min-height'); root.style.removeProperty('max-height'); root.style.removeProperty('min-width'); root.style.removeProperty('max-width') } else { root.style.minHeight = ''; root.style.maxHeight = ''; root.style.minWidth = ''; root.style.maxWidth = '' } } catch (e) { }
            // Re-apply enforced minimums for normal (non-minimized) mode.
            try {
                root.style.setProperty('min-width', '840px', 'important')
                root.style.setProperty('min-height', '612px', 'important')
            } catch (e) { }
            try { title.style.display = 'none'; title.textContent = '' } catch (e) { }
            try { header.style.padding = '8px 12px' } catch (e) { }
            try { const ctr = root.querySelector('.latex-editor-controls'); if (ctr) ctr.style.display = '' } catch (e) { }
            try { body.style.display = 'flex' } catch (e) { }
            root.__suppressSave = false
        } else {
            root.classList.add('latex-editor--minimized')
            minimizeBtn.textContent = '+'
            try { if (!root.__prevWidth) root.__prevWidth = root.style.width || ''; root.style.width = '300px' } catch (e) { }
            // Ensure inline min/max width are clamped to the minimized size so
            // previously-applied inline minimums (which may have used !important)
            // do not prevent the modal from shrinking. These are removed when
            // the modal is restored back to normal size.
            try { root.style.setProperty('min-width', '300px', 'important'); root.style.setProperty('max-width', '300px', 'important') } catch (e) { }
            try {
                if (!root.__prevHeight) root.__prevHeight = root.style.height || (root.getBoundingClientRect && (Math.round(root.getBoundingClientRect().height) + 'px')) || ''
                const hRect = header.getBoundingClientRect && header.getBoundingClientRect()
                const headerH = (hRect && hRect.height) || header.offsetHeight || 40
                try { if (root.__prevLeft === undefined) root.__prevLeft = root.style.left || ''; if (root.__prevTop === undefined) root.__prevTop = root.style.top || ''; if (root.__prevTransform === undefined) root.__prevTransform = root.style.transform || ''; if (root.__prevPosition === undefined) root.__prevPosition = root.style.position || '' } catch (e) { }
                try {
                    if (root.__prevBoxSizing === undefined) root.__prevBoxSizing = root.style.boxSizing || ''; if (root.__prevPadding === undefined) root.__prevPadding = root.style.padding || ''; if (root.__prevOverflow === undefined) root.__prevOverflow = root.style.overflow || ''; if (root.__prevBoxShadow === undefined) root.__prevBoxShadow = root.style.boxShadow || ''; root.style.boxSizing = 'border-box'; root.style.padding = '0'; root.style.overflow = 'hidden'; root.style.boxShadow = 'none'; const rComp = window.getComputedStyle(root); const bTop = parseFloat(rComp.borderTopWidth) || 0; const bBottom = parseFloat(rComp.borderBottomWidth) || 0; let desired = Math.max(0, Math.round(headerH - bTop - bBottom)); try { root.style.height = '' } catch (e) { } try { root.style.setProperty('min-height', desired + 'px', 'important'); root.style.setProperty('max-height', desired + 'px', 'important'); root.style.setProperty('height', desired + 'px', 'important'); if (root.__prevBorder === undefined) root.__prevBorder = root.style.border || ''; try { root.style.setProperty('border', '0 solid transparent', 'important') } catch (e) { root.style.border = '0 solid transparent' } if (root.__prevOutline === undefined) root.__prevOutline = root.style.outline || ''; try { root.style.setProperty('outline', 'none', 'important') } catch (e) { root.style.outline = 'none' } try { root.style.setProperty('position', 'fixed', 'important') } catch (e) { root.style.position = 'fixed' } } catch (e) { root.style.height = desired + 'px'; root.style.minHeight = desired + 'px'; root.style.maxHeight = desired + 'px' } try { void root.getBoundingClientRect(); for (let i = 0; i < 6; i++) { const rect = root.getBoundingClientRect && root.getBoundingClientRect(); const outer = rect && rect.height ? rect.height : root.offsetHeight; const delta = Math.round(outer - headerH); if (Math.abs(delta) <= 1) break; desired = Math.max(0, desired - delta); try { root.style.setProperty('min-height', desired + 'px', 'important'); root.style.setProperty('max-height', desired + 'px', 'important'); root.style.setProperty('height', desired + 'px', 'important') } catch (e) { root.style.height = desired + 'px'; root.style.minHeight = desired + 'px'; root.style.maxHeight = desired + 'px' } void root.getBoundingClientRect() } } catch (e) { }
                } catch (e) { }
                try { title.style.display = ''; title.textContent = 'Equation Editor' } catch (e) { }
                try { header.style.padding = '4px 8px' } catch (e) { }
                try { const ctr = root.querySelector('.latex-editor-controls'); if (ctr) ctr.style.display = 'none' } catch (e) { }
                try { body.style.display = 'none' } catch (e) { }
                try { const r = root.getBoundingClientRect && root.getBoundingClientRect(); if (r) { try { localStorage.setItem(_ST_KEY_MIN, JSON.stringify({ left: r.left, top: r.top, width: r.width, height: r.height })) } catch (e) { } } } catch (e) { }
                root.__suppressSave = false
            } catch (e) { }
        }
    })

    // attach close behavior to the helper button
    closeBtnEl.addEventListener('click', (ev) => {
        // console.log('[Close Button] Clicked!')
        ev.stopPropagation()
        ev.stopImmediatePropagation()
        try {
            root.style.setProperty('display', 'none', 'important')
            root.style.setProperty('visibility', 'hidden', 'important')
            root.style.setProperty('opacity', '0', 'important')
            // console.log('[Close Button] Set display to none, visibility to hidden')
            // console.log('[Close Button] Computed display:', window.getComputedStyle(root).display)
            // console.log('[Close Button] Computed visibility:', window.getComputedStyle(root).visibility)
            if (typeof onClose === 'function') {
                onClose()
            }
            // Do NOT remove from DOM - symbol palette has moved elements into it
        } catch (e) { console.error('[Close Button] Error:', e) }
        return false
    }, true)

    root.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            root.style.display = 'none'
            onClose()
        }
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
            ev.preventDefault()
            insertBtn.click()
        }
    })

    let dragging = false
    let dragOffset = { x: 0, y: 0 }
    // make header draggable; ignore clicks on controls (minimize/close/buttons)
    try {
        header.style.touchAction = 'none'
        header.style.userSelect = 'none'
    } catch (e) { }
    header.addEventListener('pointerdown', (ev) => {
        // only left button
        if (ev.button !== undefined && ev.button !== 0) return

        // Prevent browser defaults FIRST before any checks
        ev.preventDefault()
        ev.stopPropagation()

        // Block dragging from ALL buttons and inputs - let them work normally
        if (ev.target.closest) {
            const btn = ev.target.closest('button')
            const inp = ev.target.closest('input')
            const txt = ev.target.closest('textarea')
            const sel = ev.target.closest('select')
            // if (btn || inp || txt || sel) {
            //     console.log('[Drag] Blocked on:', btn ? 'BUTTON' : inp ? 'INPUT' : txt ? 'TEXTAREA' : 'SELECT')
            //     return
            // }
        }

        // console.log('[Drag] Starting drag from:', ev.target.className || ev.target.tagName)
        root.__userIsInteracting = true
        dragging = true
        root.classList.add('dragging')
        header.style.cursor = 'move'

        const rect = root.getBoundingClientRect()
        const computedLeft = rect.left + window.scrollX
        const computedTop = rect.top + window.scrollY
        root.style.setProperty('left', computedLeft + 'px', 'important')
        root.style.setProperty('top', computedTop + 'px', 'important')
        root.style.transform = 'none'
        dragOffset.x = ev.clientX - computedLeft
        dragOffset.y = ev.clientY - computedTop
    })

    window.addEventListener('pointermove', (ev) => {
        if (!dragging) return
        try {
            const nx = ev.clientX - dragOffset.x
            const ny = ev.clientY - dragOffset.y
            // console.log('[Drag] Moving to:', nx, ny)
            root.style.setProperty('left', nx + 'px', 'important')
            root.style.setProperty('top', ny + 'px', 'important')
        } catch (e) { console.error('[Drag] Move error:', e) }
    })

    function finishDrag() {
        if (!dragging) {
            if (root.__userIsInteracting) {
                try { _saveState(root.classList.contains('latex-editor--minimized')) } catch (e) { }
                root.__userIsInteracting = false
            }
            return
        }
        dragging = false
        root.classList.remove('dragging')
        header.style.cursor = ''
        try { _saveState(root.classList.contains('latex-editor--minimized')) } catch (e) { }
        root.__userIsInteracting = false
    }

    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)

    document.addEventListener('pointerdown', (ev) => { try { if (root.contains && root.contains(ev.target)) root.__lastPointerAt = Date.now() } catch (e) { } })

    root.__latexEditor = {
        open: () => { root.style.setProperty('display', 'block', 'important'); root.style.setProperty('visibility', 'visible', 'important'); root.style.setProperty('opacity', '1', 'important'); textarea.focus() },
        close: () => { root.style.display = 'none' },
        insert: (s) => {
            // Direct insert into document without touching modal textarea
            document.dispatchEvent(new CustomEvent('editor:insert-equation', { detail: { latex: s } }))
            try {
                const cmContent = document.querySelector('.cm-content')
                let cmView = null
                if (cmContent) {
                    cmView = cmContent.cmView?.view || window.cmView?.view || window.editorView
                }
                if (cmView && cmView.state) {
                    const state = cmView.state
                    const selection = state.selection.main
                    cmView.dispatch({
                        changes: { from: selection.from, to: selection.to, insert: s },
                        selection: { anchor: selection.from + s.length }
                    })
                    cmView.focus()
                    return
                }
                if (handleSelect && typeof handleSelect === 'function') {
                    handleSelect(s)
                }
            } catch (e) {
                console.warn('[latex-editor] insert failed:', e)
            }
        }
    }

    // loadKaTeX is called, but we don't render preview here - the textarea input listener handles it
    loadKaTeX(() => { /* KaTeX loaded, preview rendering handled by input listener */ })

    return root
}

LatexEditorCreateModal.propTypes = {
    handleSelect: PropTypes.func.isRequired,
}

export default LatexEditorCreateModal