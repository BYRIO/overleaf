export function createCloseButton() {
    const closeOuter = document.createElement('div')
    closeOuter.className = 'latex-editor-close-button-outer'
    const btn = document.createElement('button')
    btn.className = 'btn-close latex-editor-close-button'
    btn.type = 'button'
    btn.setAttribute('aria-label', 'Close')
    // ensure visible clickable area even if global styles vary
    // match the minimize button size for consistent header controls
    btn.style.width = '36px'
    btn.style.height = '36px'
    btn.style.display = 'inline-flex'
    btn.style.alignItems = 'center'
    btn.style.justifyContent = 'center'
    btn.style.border = '1px solid transparent'
    btn.style.padding = '0'
    btn.style.cursor = 'pointer'
    btn.style.background = 'transparent'
    btn.style.backgroundRepeat = 'no-repeat'
    btn.style.backgroundPosition = 'center'
    btn.style.backgroundSize = '12px'
    btn.style.pointerEvents = 'auto'
    btn.style.position = 'relative'
    btn.style.zIndex = '1000'
    // visual styles are provided via injected CSS so avoid forcing background/border here
    btn.style.borderRadius = '6px'
    btn.style.padding = '0'
    // fallback visual if background image not applied by CSS
    btn.textContent = '\u00D7'
    btn.style.fontSize = '16px'
    btn.style.lineHeight = '1'
    btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(0.95)' })
    btn.addEventListener('mouseleave', () => { btn.style.filter = '' })
    btn.addEventListener('focus', () => { btn.style.boxShadow = '0 0 0 3px rgba(100,150,255,0.15)' })
    btn.addEventListener('blur', () => { btn.style.boxShadow = '' })
    closeOuter.appendChild(btn)
    return { closeOuter, btn }
}

export default createCloseButton