import React, { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { OLModal, OLModalBody, OLModalFooter, OLModalHeader, OLModalTitle } from '@/shared/components/ol/ol-modal'
import OLButton from '@/shared/components/ol/ol-button'
import { useReferencesContext } from '@/features/ide-react/context/references-context'
import Tag from '@/shared/components/tag'
import { useTranslation } from 'react-i18next'
import type { AdvancedReferenceSearchResult, Bib2JsonEntry } from '@/features/ide-react/references/types'

type FocusArea = 'search' | 'list' | 'footer'

export default function ReferencePickerModal({
  show,
  from,
  to,
  commandName,
  initialSelectedKeys,
  onClose,
  onApply,
}: {
  show: boolean
  from: number | null
  to: number | null
  commandName?: string | null
  initialSelectedKeys?: string[]
  onClose: () => void
  onApply: (selectedKeys: string[]) => void
}) {
  const { t } = useTranslation()
  const { referenceKeys, listLocalReferences, searchLocalReferences } = useReferencesContext()

  const keysArray = useMemo(() => Array.from(referenceKeys), [referenceKeys])
  const [query, setQuery] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<string[]>(initialSelectedKeys ?? [])
  const [originalKeys, setOriginalKeys] = useState<string[]>(initialSelectedKeys ?? [])

  useEffect(() => {
    setSelectedKeys(initialSelectedKeys ?? [])
    setOriginalKeys(initialSelectedKeys ?? [])
  }, [initialSelectedKeys])

  const [results, setResults] = useState<{ _source: Bib2JsonEntry }[]>([])
  const [selectedFields, setSelectedFields] = useState<string[]>(['author', 'title', 'year', 'journal', 'EntryKey'])

  useEffect(() => {
    let aborted = false
    const perform = async () => {
      if (!query.trim()) {
        // Query empty: list up to 30 references (first entries)
        if (listLocalReferences) {
          const r: AdvancedReferenceSearchResult = await listLocalReferences(30)
          if (!aborted) {
            setResults(r.hits)
          }
          return
        }
        setResults([])
        return
      }
      if (searchLocalReferences && query.trim()) {
        // pass normalized fields: allow 'EntryKey' and the field name without 'Fields.' prefix
        const normalized = selectedFields.map(f => (f.startsWith('Fields.') ? f.split('.')[1] : f))
        const r: AdvancedReferenceSearchResult = await searchLocalReferences(query, normalized)
        if (!aborted) {
          setResults(r.hits)
        }
      } else {
        // fallback (when search worker isn't present): filter keys matching query and create minimal entries
        const normalized = selectedFields.map(f => (f.startsWith('Fields.') ? f.split('.')[1] : f))
        const fallback = keysArray
          .filter((k: string) => {
            if (normalized.includes('EntryKey') || normalized.length === 0) return k.toLowerCase().includes(query.toLowerCase())
            return false
          })
          .map((k: string) => ({ _source: { EntryKey: k, Fields: { author: '', title: '', year: '', journal: '', date: '' } } }))
        setResults(fallback)
      }
    }
    perform()
    return () => {
      aborted = true
    }
  }, [query, keysArray, searchLocalReferences, listLocalReferences, selectedFields])

  const filtered: string[] = results.map((r: { _source: Bib2JsonEntry }) => r._source.EntryKey)

  const [focusArea, setFocusArea] = useState<FocusArea>('search')
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const footerRef = useRef<HTMLDivElement | null>(null)

  const toggleKey = (key: string) => {
    setSelectedKeys((prev: string[]) => {
      if (prev.includes(key)) return prev.filter((x: string) => x !== key)
      return [...prev, key]
    })
  }

  const onApplyClick = () => {
    // create final keys preserving original order
    const originalSet = new Set(originalKeys)
    const selectedSet = new Set(selectedKeys)
    const existingInOrder = originalKeys.filter((k: string) => selectedSet.has(k))
    const appended = selectedKeys.filter((k: string) => !originalSet.has(k))
    const unique = [...existingInOrder, ...appended]
    onApply(unique)
    onClose()
  }

  // 'Clear' button removed - users may individually remove tags using the Tag close button.

  useEffect(() => {
    // reset focus when show toggles
    if (show) {
      setTimeout(() => searchRef.current?.focus(), 0)
      setFocusArea('search')
      setFocusedIndex(null)
    }
  }, [show])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (focusArea === 'search') {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setFocusArea('list')
        setFocusedIndex(0)
      }
    } else if (focusArea === 'list') {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setFocusedIndex((prev: number | null) => (prev == null ? 0 : Math.min(filtered.length - 1, prev + 1)))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setFocusedIndex((prev: number | null) => (prev == null ? 0 : Math.max(0, prev - 1)))
      } else if (event.key === ' ') {
        // Space toggles selection of focused item
        event.preventDefault()
        if (focusedIndex != null) {
          const key = filtered[focusedIndex]
          toggleKey(key)
        }
      } else if (event.key === 'Enter') {
        event.preventDefault()
        onApplyClick()
      }
    }

    // Tab navigation across areas
    if (event.key === 'Tab') {
      event.preventDefault()
      if (!event.shiftKey) {
        if (focusArea === 'search') {
          setFocusArea('list')
          setFocusedIndex(0)
        } else if (focusArea === 'list') {
          setFocusArea('footer')
          setFocusedIndex(null)
          setTimeout(() => footerRef.current?.querySelector('button')?.focus(), 0)
        } else {
          setFocusArea('search')
          setTimeout(() => searchRef.current?.focus(), 0)
        }
      } else {
        if (focusArea === 'footer') {
          setFocusArea('list')
          setFocusedIndex(0)
        } else if (focusArea === 'list') {
          setFocusArea('search')
          setTimeout(() => searchRef.current?.focus(), 0)
        } else {
          setFocusArea('footer')
          setTimeout(() => footerRef.current?.querySelector('button')?.focus(), 0)
        }
      }
    }
  }

  useEffect(() => {
    if (focusArea === 'list' && focusedIndex !== null) {
      const el = document.getElementById(`reference-picker-item-${focusedIndex}`)
      if (el) {
        ;(el as HTMLElement).focus()
        if (searchRef.current) {
          searchRef.current.setAttribute('aria-activedescendant', el.id)
        }
      }
    }
    if (focusArea !== 'list' && searchRef.current) {
      searchRef.current.removeAttribute('aria-activedescendant')
    }
  }, [focusArea, focusedIndex])

  // Build list content (avoid complex inline JSX ternary to reduce parser issues)
  const listContent = useMemo(() => {
    if (!results.length) {
      return <div className="reference-picker-empty" data-testid="reference-picker-empty">{t('references_picker_empty_hint')}</div>
    }
    return results.map((hit: { _source: Bib2JsonEntry }, index: number) => {
      const key = hit._source.EntryKey
      const fields = hit._source.Fields
      const title = fields?.title ?? ''
      const author = fields?.author ?? ''
      const year = fields?.year ?? ''
      const journal = fields?.journal ?? ''
      return (
        <label
          id={`reference-picker-item-${index}`}
          key={key}
          className={`d-block ${focusedIndex === index ? 'focused' : ''}`}
          role="option"
          aria-selected={selectedKeys.includes(key)}
          tabIndex={0}
          onClick={() => setFocusedIndex(index)}
          data-entry-key={key}
          data-testid={`reference-picker-item-${key}`}
        >
          <div className="hit-head">
            <input
              type="checkbox"
              checked={selectedKeys.includes(key)}
              onChange={() => toggleKey(key)}
              disabled={originalKeys.includes(key) && selectedKeys.includes(key)}
            />
            <span className="hit-key">{key}</span>
          </div>
          <div className="hit-main" style={{ display: 'flex', flexDirection: 'column', gap: '0px', flex: '1 1 auto', minWidth: 0 }}>
            <span className="hit-title">{title}</span>
            <span className="hit-meta">{author}{author && year ? ` — ${year}` : year}{journal ? ` · ${journal}` : ''}</span>
          </div>
          
        </label>
      )
    })
  }, [query, results, focusedIndex, selectedKeys, originalKeys, toggleKey, t])

  return (
    <OLModal show={show} onHide={onClose} size="lg">
      <OLModalHeader>
        <OLModalTitle data-testid="reference-picker-title">{t('references_picker_title')}</OLModalTitle>
      </OLModalHeader>
      <OLModalBody>
        <div onKeyDown={onKeyDown} className="reference-picker">
          <input
            aria-label={t('search_references')}
            type="search"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            autoFocus
            ref={searchRef}
            className="form-control"
            data-testid="reference-picker-search"
            style={{ marginBottom: '8px' }}
          />
          <div className="search-selectors" style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            {[
              { label: 'Author', value: 'author' },
              { label: 'Title', value: 'title' },
              { label: 'Year', value: 'year' },
              { label: 'Journal', value: 'journal' },
              { label: 'Key', value: 'EntryKey' },
            ].map(s => (
              <label key={s.value} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={selectedFields.includes(s.value)}
                  onChange={() => {
                    setSelectedFields(prev => {
                      if (prev.includes(s.value)) return prev.filter(v => v !== s.value)
                      return [...prev, s.value]
                    })
                  }}
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>

          <div className="selected-chips" style={{ marginBottom: '8px', alignItems: 'center', display: 'flex', gap: '8px', flexWrap: 'wrap' }} data-testid="reference-picker-selected-chips">
            {selectedKeys.map((key: string) => (
              <Tag key={key} closeBtnProps={{ onClick: () => toggleKey(key) }}>
                {key}
              </Tag>
            ))}
          </div>

          <div role="listbox" aria-label={t('reference_search_results')} id="reference-picker-list" data-testid="reference-picker-list">
            {listContent}
          </div>
        </div>
      </OLModalBody>
      <OLModalFooter>
        <div ref={footerRef}>
          {/* Clear moved to selected chips for better UX */}
          <OLButton variant="secondary" onClick={onClose}>
            {t('cancel')}
          </OLButton>
          <OLButton variant="primary" onClick={onApplyClick} data-testid="reference-picker-insert">
            {t('insert')}
          </OLButton>
        </div>
      </OLModalFooter>
    </OLModal>
  )
}
