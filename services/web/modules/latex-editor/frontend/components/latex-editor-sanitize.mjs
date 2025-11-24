export function sanitizeEnvForPreview(tex) {
    if (!tex) return { tex: '', display: false }
    let t = tex.trim()

    // Strip inline math delimiters $...$
    if (t.startsWith('$') && t.endsWith('$') && t.length > 2) {
        t = t.slice(1, -1).trim()
    }

    // Strip display math delimiters \[...\]
    if (t.startsWith('\\[') && t.endsWith('\\]')) {
        t = t.slice(2, -2).trim()
    }

    // Strip \begin{math}...\end{math} before checking other environments
    if (t.startsWith('\\begin{math}') && t.endsWith('\\end{math}')) {
        t = t.slice(12, -10).trim()
        return { tex: t, display: false }
    }

    const m = t.match(/^\\begin\{([a-z*]+)\}([\s\S]*)\\end\{\1\}$/)
    if (!m) return { tex: t, display: false }
    const env = m[1]
    const inner = m[2].trim()
    switch (env) {
        case 'matrix':
        case 'pmatrix':
        case 'bmatrix':
        case 'vmatrix':
        case 'Vmatrix':
        case 'Bmatrix':
        case 'smallmatrix':
            return { tex: '\\begin{smallmatrix}' + inner + '\\end{smallmatrix}', display: false }
        case 'equation':
        case 'equation*':
            return { tex: inner, display: true }
        case 'align':
        case 'align*':
            return { tex: '\\begin{aligned}' + inner + '\\end{aligned}', display: true }
        case 'gather':
        case 'gather*':
        case 'multline':
        case 'multline*':
        case 'split':
            return { tex: inner, display: true }
        case 'cases':
            return { tex: '\\begin{cases}' + inner + '\\end{cases}', display: true }
        default:
            return { tex: inner, display: true }
    }
}

export default sanitizeEnvForPreview