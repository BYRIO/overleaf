import sanitizeEnvForPreview from './latex-editor-sanitize.mjs'

export function renderPreviewInto(previewEl, latex) {
    if (!previewEl) return
    // console.log('[renderPreviewInto] Called with latex:', latex, 'element:', previewEl.className)
    if (window.katex && window.katex.renderToString) {
        try {
            const s = sanitizeEnvForPreview(latex || '')
            if (s && s.display) {
                previewEl.innerHTML = window.katex.renderToString(s.tex || '', { throwOnError: false, displayMode: true })
                // console.log('[renderPreviewInto] Rendered (display mode):', previewEl.innerHTML)
                return
            }
            previewEl.innerHTML = window.katex.renderToString(s.tex || '', { throwOnError: false })
            // console.log('[renderPreviewInto] Rendered (inline mode):', previewEl.innerHTML)
            return
        } catch (e) {
            /* fallback to plain text */
        }
    }
    previewEl.textContent = latex || 'Preview (mock)'
}

export default renderPreviewInto