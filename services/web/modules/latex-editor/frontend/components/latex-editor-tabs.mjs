export function createTabs(categories, onChange) {
    const wrap = document.createElement('div')
    wrap.className = 'latex-editor-tabs'
    if (!categories || !categories.length) {
        // default demo tabs
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'latex-editor-tab active'
        btn.textContent = 'Symbols'
        wrap.appendChild(btn)
        return wrap
    }
    categories.forEach((c, i) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'latex-editor-tab'
        b.textContent = c.label || c.name || String(c)
        b.addEventListener('click', () => {
            const prev = wrap.querySelector('.active')
            if (prev) prev.classList.remove('active')
            b.classList.add('active')
            try { onChange && onChange(c) } catch (e) { }
        })
        if (i === 0) b.classList.add('active')
        wrap.appendChild(b)
    })
    return wrap
}

export default createTabs