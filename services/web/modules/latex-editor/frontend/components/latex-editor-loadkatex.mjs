async function loadKaTeX(cb) {
    try {
        if (typeof window === 'undefined') return cb && cb(new Error('no window'))
        if (window.katex) return cb && cb(null)

        // Load KaTeX CSS from local bundled package
        if (!document.querySelector('link[href*="katex"]')) {
            try {
                // Import the CSS file from the local katex package
                await import('katex/dist/katex.min.css')
            } catch (cssErr) {
                // If bundler doesn't support CSS import, create link element
                const link = document.createElement('link')
                link.rel = 'stylesheet'
                // Try to use the bundled katex CSS path
                link.href = '/stylesheets/katex.min.css'
                document.head.appendChild(link)
            }
        }

        // Import katex from local dependency (bundler will resolve)
        const katexNS = await import('katex')
        const katex = (katexNS && katexNS.default) ? katexNS.default : katexNS
        if (typeof window !== 'undefined') window.katex = katex
        return cb && cb(null)
    } catch (e) {
        try { console.warn && console.warn('loadKaTeX failed', e && e.message) } catch (err) { }
        return cb && cb(e || new Error('katex import failed'))
    }
}

export default loadKaTeX
