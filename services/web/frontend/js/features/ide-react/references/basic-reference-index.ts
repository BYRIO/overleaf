import { ReferenceIndex } from './reference-index'
import { Changes, Bib2JsonEntry, AdvancedReferenceSearchResult } from './types'
import Fuse, { IFuseOptions, FuseResult } from 'fuse.js'

export default class BasicReferenceIndex extends ReferenceIndex {
  fileIndex: Map<string, Set<string>> = new Map()
  entryIndex: Map<string, Bib2JsonEntry> = new Map()
  fuse: Fuse<Bib2JsonEntry> | null = null

  updateIndex({ updates, deletes }: Changes): Set<string> {
    for (const path of deletes) {
      const keys = this.fileIndex.get(path)
      if (keys) {
        for (const k of keys) {
          this.entryIndex.delete(k)
        }
      }
      this.fileIndex.delete(path)
    }
    for (const { path, content } of updates) {
      // remove previous keys for this path from entryIndex
      const previous = this.fileIndex.get(path)
      if (previous) {
        for (const k of previous) {
          this.entryIndex.delete(k)
        }
      }
      const fileReferences: Set<string> = new Set()
      const entries = this.parseEntries(content)
      for (const entry of entries) {
        fileReferences.add(entry.EntryKey)
        this.entryIndex.set(entry.EntryKey, entry)
      }
      this.fileIndex.set(path, fileReferences)
    }
    this.keys = new Set(
      this.fileIndex.values().flatMap(entry => Array.from(entry))
    )
    this.rebuildFuseIndex()
    return this.keys
  }

  rebuildFuseIndex() {
    const data: Bib2JsonEntry[] = Array.from(this.entryIndex.values())
    try {
      const options: IFuseOptions<Bib2JsonEntry> = {
        includeScore: true,
        includeMatches: true,
        threshold: 0.35,
        keys: [
          { name: 'EntryKey', weight: 0.8 },
          { name: 'Fields.title', weight: 0.6 },
          { name: 'Fields.author', weight: 0.5 },
          { name: 'Fields.journal', weight: 0.3 },
          { name: 'Fields.year', weight: 0.2 },
        ],
      }
      this.fuse = new Fuse(data, options)
    } catch (e) {
      this.fuse = null
    }
  }

  async search(query: string, fields?: string[]): Promise<AdvancedReferenceSearchResult> {
    if (!query || !query.trim()) return { hits: [] }
    const q = query.toLowerCase().trim()
    const MAX_RESULTS = 50
    const tokens = q.split(/\s+/).filter(Boolean)
    const singleNumeric = tokens.length === 1 && /^[0-9]{4}$/.test(tokens[0])

    // If query is a single 4-digit year, prefer exact year matches first to avoid
    // fuzzy mis-matches (e.g., '2023' matching '2003'). If any exact matches exist,
    // return them directly (up to MAX_RESULTS).
    if (singleNumeric) {
      const exactMatches: { _source: Bib2JsonEntry }[] = []
      for (const entry of this.entryIndex.values()) {
        const year = (entry.Fields.year || '').trim()
        if (year === tokens[0]) {
          exactMatches.push({ _source: entry })
          if (exactMatches.length >= MAX_RESULTS) break
        }
      }
      if (exactMatches.length > 0) return { hits: exactMatches }
    }

    // very short queries: fallback to substring scanning
    if (q.length <= 2 || !this.fuse) {
      const results: { _source: Bib2JsonEntry }[] = []
      for (const [key, entry] of this.entryIndex.entries()) {
        if (results.length >= MAX_RESULTS) break
        if (!fields || fields.length === 0 || fields.includes('EntryKey')) {
          if (key.toLowerCase().includes(q)) {
            results.push({ _source: entry })
            continue
          }
        }
        const entryFields = entry.Fields
        if (
          ((!fields || fields.length === 0 || fields.includes('title')) && entryFields.title.toLowerCase().includes(q)) ||
          ((!fields || fields.length === 0 || fields.includes('author')) && entryFields.author.toLowerCase().includes(q)) ||
          ((!fields || fields.length === 0 || fields.includes('journal')) && entryFields.journal.toLowerCase().includes(q)) ||
          ((!fields || fields.length === 0 || fields.includes('year')) && entryFields.year.toLowerCase().includes(q)) ||
          ((!fields || fields.length === 0 || fields.includes('date')) && entryFields.date.toLowerCase().includes(q))
        ) {
          results.push({ _source: entry })
        }
      }
      return { hits: results }
    }

    // Fuse-based fuzzy search
    try {
      const fuseResults = this.fuse.search(q, { limit: MAX_RESULTS }) as FuseResult<Bib2JsonEntry>[]
      const mapped = fuseResults.map(r => {
        const matchedFields = (r.matches ?? [])
          .map(m => {
            const k = String(m.key)
            if (k === 'EntryKey') return 'EntryKey'
            if (k.startsWith('Fields.')) return k.split('.')[1]
            return k
          })
          .filter(Boolean)
        return { _source: r.item, score: r.score, matchedFields }
      })
      let filtered = mapped.filter(m => {
        if (!fields || fields.length === 0) return true
        const mf = m.matchedFields ?? []
        return mf.some(f => fields.includes(f))
      })
      // If query contains multiple tokens (e.g., 'David Rotermund'), also perform
      // the order-insensitive tokenized substring fallback and merge any
      // additional matches into the results so we don't lose entries that
      // fuse didn't match but still contain all tokens across allowed fields.
      const queryTokens = q.split(/\s+/).filter(Boolean)
      if ((queryTokens.length > 1 || (queryTokens.length === 1 && /^[0-9]{4}$/.test(queryTokens[0]))) && this.entryIndex.size > 0) {
        const extra_results: { _source: Bib2JsonEntry }[] = []
        const seen = new Set(filtered.map(f => f._source.EntryKey))
        for (const entry of this.entryIndex.values()) {
          if (extra_results.length >= MAX_RESULTS) break
          const entryFields = entry.Fields
          const keyLower = entry.EntryKey.toLowerCase()
          const all = queryTokens.every(token => {
            const t = token.toLowerCase()
            if (!fields || fields.length === 0 || fields.includes('EntryKey')) {
              if (keyLower.includes(t)) return true
            }
            if ((!fields || fields.length === 0 || fields.includes('author')) && (entryFields.author || '').toLowerCase().includes(t)) return true
            if ((!fields || fields.length === 0 || fields.includes('title')) && (entryFields.title || '').toLowerCase().includes(t)) return true
            if ((!fields || fields.length === 0 || fields.includes('journal')) && (entryFields.journal || '').toLowerCase().includes(t)) return true
            if ((!fields || fields.length === 0 || fields.includes('year')) && (entryFields.year || '').toLowerCase().includes(t)) return true
            if ((!fields || fields.length === 0 || fields.includes('date')) && (entryFields.date || '').toLowerCase().includes(t)) return true
            return false
          })
          if (all && !seen.has(entry.EntryKey)) {
            extra_results.push({ _source: entry })
            seen.add(entry.EntryKey)
          }
        }
        if (extra_results.length) {
          // append new matches after the fuse-based matches
          filtered = [...filtered, ...extra_results.map(r => ({ _source: r._source })) as any]
        }
      }
      // if no fuse matches, try a multi-token substring fallback to support
      // order-insensitive token matches like 'david rotermund' matching 'Rotermund, David'.
      if (filtered.length === 0) {
        const tokens = q.split(/\s+/).filter(Boolean)
        const singleNumeric = tokens.length === 1 && /^[0-9]{4}$/.test(tokens[0])
        if (tokens.length > 1 || singleNumeric) {
          const extra_results: { _source: Bib2JsonEntry }[] = []
          for (const entry of this.entryIndex.values()) {
            const entryFields = entry.Fields
            const keyLower = entry.EntryKey.toLowerCase()
            // each token must be found somewhere in the allowed fields (or EntryKey)
            const all = tokens.every(token => {
              const t = token.toLowerCase()
              if (!fields || fields.length === 0 || fields.includes('EntryKey')) {
                if (keyLower.includes(t)) return true
              }
              if ((!fields || fields.length === 0 || fields.includes('author')) && (entryFields.author || '').toLowerCase().includes(t)) return true
              if ((!fields || fields.length === 0 || fields.includes('title')) && (entryFields.title || '').toLowerCase().includes(t)) return true
              if ((!fields || fields.length === 0 || fields.includes('journal')) && (entryFields.journal || '').toLowerCase().includes(t)) return true
              if ((!fields || fields.length === 0 || fields.includes('year')) && (entryFields.year || '').toLowerCase().includes(t)) return true
              if ((!fields || fields.length === 0 || fields.includes('date')) && (entryFields.date || '').toLowerCase().includes(t)) return true
              return false
            })
            if (all) extra_results.push({ _source: entry })
            if (extra_results.length >= MAX_RESULTS) break
          }
          // append the extra_results as fallback
          if (extra_results.length) filtered = extra_results as any
        }
      }
      return { hits: filtered }
    } catch (e) {
      // fallback to substring if fuse fails
      const results: { _source: Bib2JsonEntry }[] = []
      for (const [key, entry] of this.entryIndex.entries()) {
        if (results.length >= MAX_RESULTS) break
        if (!fields || fields.length === 0 || fields.includes('EntryKey')) {
          if (key.toLowerCase().includes(q)) {
            results.push({ _source: entry })
            continue
          }
        }
        const entryFields = entry.Fields
        if (
          ((!fields || fields.length === 0 || fields.includes('title')) && entryFields.title.toLowerCase().includes(q)) ||
          ((!fields || fields.length === 0 || fields.includes('author')) && entryFields.author.toLowerCase().includes(q)) ||
          ((!fields || fields.length === 0 || fields.includes('journal')) && entryFields.journal.toLowerCase().includes(q)) ||
          ((!fields || fields.length === 0 || fields.includes('year')) && entryFields.year.toLowerCase().includes(q)) ||
          ((!fields || fields.length === 0 || fields.includes('date')) && entryFields.date.toLowerCase().includes(q))
        ) {
          results.push({ _source: entry })
        }
      }
      return { hits: results }
    }
  }

  async list(limit = 30): Promise<AdvancedReferenceSearchResult> {
    const results: { _source: Bib2JsonEntry }[] = []
    for (const entry of this.entryIndex.values()) {
      if (results.length >= limit) break
      results.push({ _source: entry })
    }
    return { hits: results }
  }
}
