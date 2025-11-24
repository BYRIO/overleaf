// Symbol palette loader (module-scoped) — inserts the palette into the LaTeX
// editor modal. This file is intended to live inside the latex-editor module and
// uses module-local data in `../data/*.mjs`.

// Export an initializer so callers can `import initSymbolPalette from './latex-editor-symbolpalette'`
// and call it explicitly. For compatibility with previous behaviour the
// initializer is also auto-run once on import (guarded by a window flag).

async function initSymbolPalette() {
    const categories = []

    // Import all data modules directly - this ensures proper bundling
    try {
        const modules = await Promise.all([
            import('../data/advancedconstructs.mjs').catch(() => null),
            import('../data/arrows.mjs').catch(() => null),
            import('../data/calculus.mjs').catch(() => null),
            import('../data/delimiters.mjs').catch(() => null),
            import('../data/equationenvironment.mjs').catch(() => null),
            import('../data/fontstyles.mjs').catch(() => null),
            import('../data/fractions.mjs').catch(() => null),
            import('../data/functionoperators.mjs').catch(() => null),
            import('../data/greek.mjs').catch(() => null),
            import('../data/largeoperators.mjs').catch(() => null),
            import('../data/matrices.mjs').catch(() => null),
            import('../data/miscellaneoussymbols.mjs').catch(() => null),
            import('../data/operators.mjs').catch(() => null),
            import('../data/relations.mjs').catch(() => null),
            import('../data/sets.mjs').catch(() => null),
            import('../data/spacing.mjs').catch(() => null)
        ])

        const paths = [
            '../data/advancedconstructs.mjs',
            '../data/arrows.mjs',
            '../data/calculus.mjs',
            '../data/delimiters.mjs',
            '../data/equationenvironment.mjs',
            '../data/fontstyles.mjs',
            '../data/fractions.mjs',
            '../data/functionoperators.mjs',
            '../data/greek.mjs',
            '../data/largeoperators.mjs',
            '../data/matrices.mjs',
            '../data/miscellaneoussymbols.mjs',
            '../data/operators.mjs',
            '../data/relations.mjs',
            '../data/sets.mjs',
            '../data/spacing.mjs'
        ]

        modules.forEach((mod, idx) => {
            if (!mod) return
            for (const k of Object.keys(mod)) {
                const v = mod[k]
                if (v && v.name && Array.isArray(v.symbols)) {
                    categories.push({ cat: v, path: paths[idx] })
                }
            }
        })
    } catch (e) {
        console.warn('[symbol-palette module] failed to load modules', e && e.message)
    }

    if (!categories.length) return

    const palette = document.createElement('div')
    palette.id = 'latex-symbol-palette'
    palette.className = 'latex-symbol-palette'

    const groups = document.createElement('div')
    groups.className = 'latex-symbol-groups'

    const panel = document.createElement('div')
    panel.className = 'latex-symbol-panel'

    const searchWrap = document.createElement('div')
    searchWrap.className = 'latex-symbol-search'
    const searchInput = document.createElement('input')
    searchInput.type = 'search'
    searchInput.placeholder = 'Search symbols by name or description...'
    searchInput.className = 'latex-symbol-search-input'
    searchWrap.appendChild(searchInput)

    const ioWrap = document.createElement('div')
    ioWrap.className = 'latex-symbol-io-wrap'
    palette.appendChild(ioWrap)
    palette.appendChild(searchWrap)
    palette.appendChild(groups)
    palette.appendChild(panel)

    function refreshIORefs() {
        // no-op: module expects the modal to provide textarea/preview elements
    }

    function attachPaletteToModal() {
        const modal = document.querySelector('#latex-editor-modal-root .latex-editor')
        if (!modal) return false
        const body = modal.querySelector('.latex-editor-body')
        if (!body) return false
        const leftCol = body.querySelector(':scope > div:first-child') || body

        try {
            const modalTa = modal.querySelector('.latex-editor-textarea')
            const insertBtn = modal.querySelector('.latex-editor-insert')
            const clearBtn = modal.querySelector('.latex-editor-clear')

            ioWrap.innerHTML = ''

            const previewEl = modal.querySelector('.latex-editor-preview')
            if (previewEl && !previewEl.__moved_to_palette) {
                // make the in-header preview more compact when moved into the palette
                previewEl.style.minHeight = '48px'
                previewEl.style.maxHeight = '52px'
                previewEl.style.overflow = 'auto'
                previewEl.style.width = '100%'
                // Wrap the preview in an outer container so padding appears outside
                // the preview's own border (padding inside the element keeps it
                // within the border). The outer wrapper holds the extra lower
                // spacing we need.
                let previewOuter = null
                try {
                    const maybeOuter = previewEl.parentNode
                    if (maybeOuter && maybeOuter.classList && maybeOuter.classList.contains('latex-editor-preview-outer')) {
                        previewOuter = maybeOuter
                    }
                } catch (e) { }
                try {
                    if (!previewOuter) {
                        previewOuter = document.createElement('div')
                        previewOuter.className = 'latex-editor-preview-outer'
                        // keep full width and ensure box-sizing so padding doesn't collapse
                        previewOuter.style.width = '100%'
                        previewOuter.style.boxSizing = 'border-box'
                        // padding outside the preview border
                        try { previewOuter.style.setProperty('padding-bottom', '8px', 'important') } catch (e) { previewOuter.style.paddingBottom = '8px' }
                        // move the preview inside the outer wrapper
                        try { previewEl.parentNode && previewEl.parentNode.insertBefore(previewOuter, previewEl) } catch (e) { }
                        try { previewOuter.appendChild(previewEl) } catch (e) { }
                    }
                    ioWrap.appendChild(previewOuter)
                } catch (e) {
                    // fallback: append preview directly if wrapping failed
                    try { ioWrap.appendChild(previewEl) } catch (err) { }
                }
                previewEl.__moved_to_palette = true
                const otherPreviews = modal.querySelectorAll('.latex-editor-preview')
                otherPreviews.forEach(p => { if (p !== previewEl) { try { p.style.display = 'none' } catch (e) { p.remove && p.remove() } } })
                const rightCol = modal.querySelector('.latex-editor-right')
                if (rightCol) { try { rightCol.style.display = 'none' } catch (e) { rightCol.remove && rightCol.remove() } }
            }

            if (modalTa && !modalTa.__moved_to_palette) {
                // Move the wrapper if it exists, otherwise move the textarea directly
                const taWrapper = modalTa.closest('.latex-editor-textarea-wrapper')
                if (taWrapper && !taWrapper.__moved_to_palette) {
                    ioWrap.appendChild(taWrapper)
                    taWrapper.__moved_to_palette = true
                } else {
                    ioWrap.appendChild(modalTa)
                }
                modalTa.__moved_to_palette = true
            }

            if (insertBtn && insertBtn.parentNode && !insertBtn.parentNode.__moved_to_palette) {
                const controlsDiv = insertBtn.parentNode
                try {
                    const isInHeader = controlsDiv.closest && controlsDiv.closest('.latex-editor-header')
                    if (!isInHeader) { ioWrap.appendChild(controlsDiv); controlsDiv.__moved_to_palette = true }
                } catch (e) { }
            }

            // if modal textarea/preview not found, leave ioWrap empty (no demo fallbacks)
            refreshIORefs()
        } catch (e) {
            ioWrap.innerHTML = ''
        }

        try {
            if (leftCol && leftCol.prepend) leftCol.prepend(palette)
            else if (leftCol && leftCol.parentNode) leftCol.parentNode.insertBefore(palette, leftCol)
            else document.body.prepend(palette)
        } catch (e) { leftCol.parentNode && leftCol.parentNode.insertBefore(palette, leftCol) }
        return true
    }

    if (!attachPaletteToModal()) {
        const obs = new MutationObserver((mutations, o) => { if (attachPaletteToModal()) o.disconnect() })
        obs.observe(document.body, { childList: true, subtree: true })
    }

    // Ensure only one dropdown menu exists on the page and harmonize
    // menus created by other bundles (compiled/dist) by removing or
    // normalizing them. Some environments load both this module and a
    // prebuilt bundle which can create a second menu without our
    // data attributes; observe and cleanup those duplicates.
    try {
        if (!window.__latexSymbolDropdownGlobalObserver) {
            const globalObserver = new MutationObserver((mutations) => {
                try {
                    // If multiple menus exist, prefer the one that is visible/has size
                    const menus = Array.from(document.querySelectorAll('.latex-symbol-group-dropdown-menu'))
                    if (menus.length > 1) {
                        try {
                            // Score menus: visible display:block or computed display block, and area
                            const scored = menus.map((m) => {
                                const cs = window.getComputedStyle(m)
                                const isDisplayed = (m.style.display === 'block') || (cs && cs.display === 'block')
                                const rect = m.getBoundingClientRect && m.getBoundingClientRect()
                                const area = rect ? (rect.width * rect.height) : 0
                                return { el: m, isDisplayed: !!isDisplayed, area: area }
                            })
                            // pick keeper: displayed && max area; fallback to max area; fallback to last
                            let keeper = scored.find(s => s.isDisplayed)
                            if (!keeper) keeper = scored.reduce((a, b) => (a.area >= b.area ? a : b), scored[0])
                            const keeperEl = keeper && keeper.el
                            for (const s of scored) {
                                try {
                                    if (s.el === keeperEl) {
                                        // normalize keeper: ensure left alignment
                                        try { s.el.style.textAlign = 'left' } catch (e) { }
                                        continue
                                    }
                                    // remove others
                                    try { s.el.parentNode && s.el.parentNode.removeChild && s.el.parentNode.removeChild(s.el) } catch (e) { }
                                } catch (e) { }
                            }
                        } catch (e) { }
                    } else if (menus.length === 1) {
                        // ensure single menu is left-aligned
                        try { const single = menus[0]; single.style.textAlign = 'left' } catch (e) { }
                    }
                } catch (e) { }
            })
            globalObserver.observe(document.body, { childList: true, subtree: true })
            window.__latexSymbolDropdownGlobalObserver = true
        }
    } catch (e) { }

    // No demo fallback IO synchronization: module uses the actual modal elements when present.

    try {
        const seen = new Map(); const uniq = []
        for (const obj of categories) {
            const c = obj.cat
            const key = ((c && (c.name || c.label)) || '').toString().trim().toLowerCase()
            if (!key) continue
            if (!seen.has(key)) { seen.set(key, true); uniq.push(obj) }
        }
        categories.length = 0; categories.push(...uniq)
    } catch (e) { }

    const pathMap = new Map()
    for (const obj of categories) { const src = obj.path || ''; const base = src.split('/').pop(); pathMap.set(base, obj.cat) }

    const desiredVisibleFiles = ['greek.mjs', 'delimiters.mjs', 'arrows.mjs', 'operators.mjs', 'relations.mjs', 'fractions.mjs', 'calculus.mjs']
    const desiredDropdownFiles = ['functionoperators.mjs', 'fontstyles.mjs', 'miscellaneoussymbols.mjs', 'matrices.mjs', 'largeoperators.mjs', 'sets.mjs', 'equationenvironment.mjs', 'advancedconstructs.mjs', 'spacing.mjs']

    const visibleCategories = []
    const dropdownCategories = []
    for (const fname of desiredVisibleFiles) if (pathMap.has(fname)) visibleCategories.push(pathMap.get(fname))
    for (const fname of desiredDropdownFiles) if (pathMap.has(fname)) dropdownCategories.push(pathMap.get(fname))
    for (const obj of categories) {
        const base = (obj.path || '').split('/').pop()
        if (desiredVisibleFiles.includes(base) || desiredDropdownFiles.includes(base)) continue
        const already = dropdownCategories.find(c => (c.name || c.label) === (obj.cat.name || obj.cat.label))
        if (!already) dropdownCategories.push(obj.cat)
    }
    const allCats = categories.map(o => o.cat)

    try { console.debug('[symbol-palette module] category-classification', { total: categories.length, visible: visibleCategories.map(c => ({ name: c.name, label: c.label })), dropdown: dropdownCategories.map(c => ({ name: c.name, label: c.label })) }) } catch (e) { }

    function selectGroupButton(btn) { const all = groups.querySelectorAll('.latex-symbol-group-button'); all.forEach(x => x.setAttribute('aria-selected', 'false')); btn.setAttribute('aria-selected', 'true') }

    function checkLatexRenderable(latex) { try { if (!window.katex || !window.katex.renderToString) return null; window.katex.renderToString(latex || '', { throwOnError: true }); return true } catch (e) { return false } }

    function annotateButtonRenderState(btn, latex, groupName, symbolIndex) {
        const setState = (ok) => {
            if (ok === null) return
            if (!ok) {
                btn.classList.add('latex-render-error')
                try {
                    const raw = (latex || (btn.dataset && btn.dataset.latex) || '').toString(); const latexText = raw.trim(); const fallback = (btn.textContent || '').toString().trim(); let baseTitle = (btn.title || '').toString().trim(); const what = latexText || fallback || '';
                    if (what && baseTitle.indexOf(what) === -1) baseTitle = baseTitle ? (baseTitle + ' — ' + what) : what
                    btn.title = (baseTitle || what) + ' — RENDER ERROR'
                    try { console.debug('OVERLEAF_DIAG symbol-render-error', { group: groupName, index: symbolIndex, latexArg: latex, btnDatasetLatex: (btn.dataset && btn.dataset.latex) || null, computedTooltip: btn.title, usedFallback: (!latex || String(latex).trim() === '') }) } catch (e) { }
                } catch (e) { btn.title = (btn.title || '') + ' — RENDER ERROR' }
            }
        }
        let testLatex = latex
        try {
            const s = (latex || '').toString(); const trimmed = s.trim(); if (trimmed) {
                const pairs = [['\\left(', '\\right)'], ['\\left[', '\\right]'], ['\\left\\{', '\\right\\}'], ['\\left\\langle', '\\right\\rangle'], ['\\left |', '\\right |'], ['\\left\\|', '\\right\\|']]
                if (trimmed.indexOf('\\left') !== -1 && trimmed.indexOf('\\right') === -1) { for (const p of pairs) { if (trimmed.indexOf(p[0]) !== -1) { testLatex = trimmed + ' x ' + p[1]; break } } }
                else if (trimmed.indexOf('\\right') !== -1 && trimmed.indexOf('\\left') === -1) { for (const p of pairs) { if (trimmed.indexOf(p[1]) !== -1) { testLatex = p[0] + ' x ' + trimmed; break } } }
            }
        } catch (e) { testLatex = latex }
        const res = checkLatexRenderable(testLatex)
        if (res === null) {
            const id = setInterval(() => { const r = checkLatexRenderable(latex); if (r !== null) { setState(r); clearInterval(id) } }, 250)
            setTimeout(() => clearInterval(id), 8000)
        } else setState(res)
    }

    visibleCategories.forEach((cat, idx) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'latex-symbol-group-button'
        b.dataset.group = cat.name || cat.label || ('group-' + idx)
        b.textContent = cat.label || cat.name || ('Group ' + (idx + 1))
        b.title = cat.name || ''
        b.setAttribute('aria-selected', 'false')
        b.addEventListener('click', () => { selectGroupButton(b); renderSymbols(cat) })
        try { const firstSym = (cat.symbols && cat.symbols[0]) || null; if (firstSym) annotateButtonRenderState(b, firstSym.latex || firstSym.placeholder || firstSym.label, cat.name || cat.label, 1) } catch (e) { }
        groups.appendChild(b)
    })

    let dropdownBtn = null
    if (dropdownCategories.length) {
        const ddWrap = document.createElement('div')
        ddWrap.className = 'latex-symbol-group-dropdown-wrap'
        dropdownBtn = document.createElement('button')
        dropdownBtn.type = 'button'
        dropdownBtn.className = 'latex-symbol-group-dropdown-button'
        dropdownBtn.innerHTML = 'More <svg class="latex-dropdown-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>'
        dropdownBtn.setAttribute('aria-haspopup', 'true')
        dropdownBtn.setAttribute('aria-expanded', 'false')

        const ddMenu = document.createElement('div')
        ddMenu.className = 'latex-symbol-group-dropdown-menu'
        // enforce centered text alignment for the themed menu
        try { ddMenu.style.textAlign = 'center' } catch (e) { }
        // stable identifier for this menu instance
        try { ddMenu.setAttribute('data-latex-dd-id', 'latex-dd-' + Math.round(Math.random() * 1e9)) } catch (e) { }
        ddMenu.setAttribute('role', 'menu')
        ddMenu.style.display = 'none'
        ddMenu.style.position = 'fixed'
        ddMenu.style.left = '0px'
        ddMenu.style.top = '0px'
        ddMenu.style.zIndex = '200000'

        // Mark this menu as themed so we can apply very targeted styles
        // without affecting other global menus. We add a data attribute
        // and ensure a single scoped stylesheet exists in the document
        // head that only targets menus with this attribute.
        try {
            ddMenu.dataset.themed = 'true'
            const STYLE_ID = 'latex-symbol-dropdown-themed-styles'
            if (!document.getElementById(STYLE_ID)) {
                const _s = document.createElement('style')
                _s.id = STYLE_ID
                _s.type = 'text/css'
                _s.textContent = `
/* Scoped dropdown menu styling for LaTeX symbol palette (targets only the themed menu) */
    .latex-symbol-group-dropdown-menu[data-themed="true"] {
    background: var(--bg-secondary-themed) !important;
    color: #fff !important;
    border: 1px solid rgba(255,255,255,0.08) !important;
    border-radius: 10px !important;
    padding: 6px !important;
    box-shadow: 0 8px 30px rgba(0,0,0,0.18) !important;
    min-width: 140px !important;
    max-width: 240px !important;
    max-height: 220px !important;
    overflow-y: auto !important;
    z-index: 200000 !important;
    /* do not force display here — let inline styles control visibility */
    flex-direction: column !important;
    gap: 6px !important;
    font-size: 12px !important;
}
.latex-symbol-group-dropdown-menu[data-themed="true"] .latex-symbol-group-dropdown-item {
    display: block !important;
    width: 100% !important;
    text-align: center !important;
    color: #fff !important;
    background: transparent !important;
    padding: 6px 8px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    border-bottom: 1px solid rgba(255,255,255,0.04) !important;
    font-size: 12px !important;
}
.latex-symbol-group-dropdown-menu[data-themed="true"] .latex-symbol-group-dropdown-item:last-child {
    border-bottom: none !important;
}
.latex-symbol-group-dropdown-menu[data-themed="true"] .latex-symbol-group-dropdown-item:hover,
.latex-symbol-group-dropdown-menu[data-themed="true"] .latex-symbol-group-dropdown-item:focus {
    background: rgba(255,255,255,0.05) !important;
    outline: none !important;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.03) !important;
}
.latex-symbol-group-dropdown-menu[data-themed="true"]:focus {
    outline: none !important;
    box-shadow: 0 0 0 4px rgba(100,150,255,0.06) !important;
}
                `
                try { document.head.appendChild(_s) } catch (e) { document.body.appendChild(_s) }
            }
        } catch (e) { }

        dropdownCategories.forEach((cat, idx) => {
            const item = document.createElement('div')
            item.className = 'latex-symbol-group-dropdown-item'
            item.textContent = cat.label || cat.name || ('Group ' + (idx + 1))
            // center each item text to match the requested compact look
            try { item.style.textAlign = 'center'; item.style.justifyContent = 'center' } catch (e) { }
            item.dataset.group = cat.name || cat.label || ('group-dd-' + idx)
            item.setAttribute('role', 'menuitem')
            item.addEventListener('click', () => {
                const key = item.dataset.group
                const visible = groups.querySelector(".latex-symbol-group-button[data-group='" + key + "']")
                if (visible) selectGroupButton(visible)
                else { const all = groups.querySelectorAll('.latex-symbol-group-button'); all.forEach(x => x.setAttribute('aria-selected', 'false')); dropdownBtn.setAttribute('aria-selected', 'true') }
                renderSymbols(cat)
                ddMenu.style.display = 'none'
                dropdownBtn.setAttribute('aria-expanded', 'false')
            })
            ddMenu.appendChild(item)
        })

        dropdownBtn.addEventListener('click', (ev) => {
            ev.stopPropagation()
            const open = ddMenu.style.display === 'block'
            if (open) {
                ddMenu.style.display = 'none'
                try { if (ddMenu.parentNode === document.body) document.body.removeChild(ddMenu) } catch (e) { }
                dropdownBtn.setAttribute('aria-expanded', 'false')
                return
            }

            // Append the menu if not already attached. We will make it visible
            // then measure its rendered size after the browser applies styles
            // using two rAFs to avoid initial layout flash at the viewport corner.
            // Ensure there are no other detached copies of the menu floating
            try {
                const others = Array.from(document.querySelectorAll('.latex-symbol-group-dropdown-menu'))
                for (const o of others) {
                    if (o === ddMenu) continue
                    try {
                        // If it's already in the body and clearly from a previous run,
                        // remove it to avoid duplicate menus floating in the viewport.
                        if (o.parentNode) o.parentNode.removeChild(o)
                    } catch (er) { }
                }
            } catch (e) { }

            if (ddMenu.parentNode !== document.body) document.body.appendChild(ddMenu)
            ddMenu.style.display = 'block'
            // hide during measurement to avoid a visible jump
            ddMenu.style.visibility = 'hidden'

            try {
                // Wait for style/layout to settle: two rAFs is a pragmatic approach
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
                        try {
                            const rect = dropdownBtn.getBoundingClientRect()
                            const menuW = ddMenu.offsetWidth || Math.max(260, Math.round(ddMenu.getBoundingClientRect().width || 260))
                            const menuH = ddMenu.offsetHeight || Math.max(200, Math.round(ddMenu.getBoundingClientRect().height || 200))
                            let left = Math.round(rect.right - menuW)
                            if (left < 8) left = Math.round(rect.left)
                            let top = Math.round(rect.bottom + 6)
                            const viewportH = window.innerHeight || document.documentElement.clientHeight
                            if (top + menuH > viewportH - 8) top = Math.max(8, Math.round(rect.top - menuH - 6))
                            ddMenu.style.left = left + 'px'
                            ddMenu.style.top = top + 'px'
                            ddMenu.style.right = 'auto'
                            ddMenu.style.zIndex = '200000'
                        } catch (e) { }
                        // reveal after positioning
                        try { ddMenu.style.visibility = '' } catch (e) { }
                    })
                })
            } catch (e) { try { ddMenu.style.visibility = '' } catch (err) { } }

            dropdownBtn.setAttribute('aria-expanded', 'true')
        })

        document.addEventListener('click', (ev) => { try { if (ddMenu.style.display === 'block' && !ddMenu.contains(ev.target) && ev.target !== dropdownBtn) { ddMenu.style.display = 'none'; if (ddMenu.parentNode === document.body) document.body.removeChild(ddMenu); if (dropdownBtn) dropdownBtn.setAttribute('aria-expanded', 'false') } } catch (e) { } })

        ddWrap.appendChild(dropdownBtn)
        ddWrap.appendChild(ddMenu)
        groups.appendChild(ddWrap)
    }

    if (groups.firstChild) selectGroupButton(groups.firstChild)

    let searchTimeout = null
    searchInput.addEventListener('input', (ev) => {
        const q = (ev.target.value || '').trim().toLowerCase()
        if (searchTimeout) clearTimeout(searchTimeout)
        searchTimeout = setTimeout(() => {
            if (!q) { renderSymbols(visibleCategories[0] || dropdownCategories[0] || allCats[0]); return }
            const matches = []
            for (const cat of allCats) for (const s of cat.symbols) { const hay = ((s.label || '') + ' ' + (s.description || '') + ' ' + (s.latex || '')).toLowerCase(); if (hay.indexOf(q) !== -1) matches.push(Object.assign({}, s, { _group: cat.name })) }
            panel.innerHTML = ''
            const title = document.createElement('div'); title.className = 'latex-symbol-panel-title'; title.textContent = 'Search results (' + matches.length + ')'; panel.appendChild(title)
            const grid = document.createElement('div'); grid.className = 'latex-symbol-grid'
            matches.slice(0, 200).forEach(s => { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'latex-symbol-btn'; btn.innerHTML = s.label || s.latex || s.placeholder || ''; try { btn.dataset.latex = (s.latex || s.placeholder || s.label || '').toString() } catch (e) { }; btn.title = (s.description || '') + ' — ' + (s._group || '') + ' — Right-click to insert directly'; btn.addEventListener('click', () => insertSymbol(s)); btn.addEventListener('contextmenu', (e) => { e.preventDefault(); insertSymbol(s, true); }); grid.appendChild(btn) })
            panel.appendChild(grid)
        }, 120)
    })

    function renderSymbols(cat) {
        panel.innerHTML = ''
        const title = document.createElement('div'); title.className = 'latex-symbol-panel-title'; title.textContent = cat.name; panel.appendChild(title)
        const grid = document.createElement('div'); grid.className = 'latex-symbol-grid'
        cat.symbols.slice(0, 120).forEach(s => { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'latex-symbol-btn'; btn.innerHTML = s.label || s.latex || s.placeholder || ''; try { btn.dataset.latex = (s.latex || s.placeholder || s.label || '').toString() } catch (e) { } btn.title = (s.description || s.latex || '') + ' — Right-click to insert directly'; btn.addEventListener('click', () => insertSymbol(s)); btn.addEventListener('contextmenu', (e) => { e.preventDefault(); insertSymbol(s, true); }); try { annotateButtonRenderState(btn, s.latex || s.placeholder || s.label, cat.name || cat.label, (cat.symbols.indexOf(s) + 1)) } catch (e) { } grid.appendChild(btn) })
        panel.appendChild(grid)
        try { const sel = groups.querySelector(".latex-symbol-group-button[data-group='" + (cat.name || cat.label) + "']"); if (sel) selectGroupButton(sel) } catch (e) { }
    }

    function insertSymbol(symbol, directToDoc = false) {
        const canonical = symbol.latex || symbol.placeholder || ''

        // If directToDoc is true, insert directly into the main document
        if (directToDoc) {
            try {
                const modal = document.querySelector('#latex-editor-modal-root')
                if (modal && modal.__latexEditor && modal.__latexEditor.insert) {
                    modal.__latexEditor.insert(canonical)
                }
            } catch (e) {
                console.warn('[symbol-palette] direct insert failed:', e)
            }
            // Always return after right-click to prevent textarea state contamination
            return
        }

        // Otherwise insert into the modal textarea (normal behavior)
        const modalTa = document.querySelector('#latex-editor-modal-root .latex-editor-textarea')
        if (modalTa) {
            try {
                const preview = symbol.previewLatex || canonical
                const start = modalTa.selectionStart || 0
                const end = modalTa.selectionEnd || start
                modalTa.value = modalTa.value.slice(0, start) + preview + modalTa.value.slice(end)
                try { const currentVal = modalTa.value; const priorValue = currentVal.slice(0, start) + currentVal.slice(start + preview.length); const prevCanonical = (modalTa.dataset && modalTa.dataset.canonicalLatex !== undefined) ? modalTa.dataset.canonicalLatex : priorValue; const newCanonical = prevCanonical.slice(0, start) + canonical + prevCanonical.slice(end); modalTa.dataset.canonicalLatex = newCanonical } catch (e) { try { modalTa.dataset.canonicalLatex = canonical } catch (ee) { } }
                modalTa.selectionStart = modalTa.selectionEnd = start + preview.length
                modalTa.focus()
                modalTa.dispatchEvent(new Event('input', { bubbles: true }))
                return
            } catch (e) { }
        }
        // If modal textarea not present, do nothing (no demo host fallback)
        console.warn('[demo-symbols] insertSymbol: no modal textarea found; symbol not inserted')
    }

    renderSymbols(visibleCategories[0] || dropdownCategories[0] || allCats[0])
}

export default initSymbolPalette

// Auto-run for backwards-compatibility, but only once per page.
try {
    if (typeof window !== 'undefined' && !window.__latexSymbolPaletteInitialized) {
        // fire-and-forget; errors are non-fatal for host pages
        initSymbolPalette().catch(() => { })
        window.__latexSymbolPaletteInitialized = true
    }
} catch (e) { }
