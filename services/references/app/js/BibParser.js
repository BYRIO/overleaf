"use strict";

// Lightweight BibTeX key extractor for cite completion.
// We only need entry keys, so we scan for patterns like:
//   @article{key, ...}
// and ignore STRING/PREAMBLE/COMMENT blocks.
function parseKeys(input) {
  const entries = {}
  const entryRegex = /@([a-zA-Z0-9_:\\./-]+)\s*[\{\(]\s*([^,\s]+)\s*,/g

  let match
  while ((match = entryRegex.exec(input)) !== null) {
    const type = match[1].toUpperCase()
    if (type === 'STRING' || type === 'PREAMBLE' || type === 'COMMENT') {
      continue
    }
    const key = match[2]
    if (key) {
      entries[key] = true
    }
  }
  return entries
}

module.exports = parseKeys;
