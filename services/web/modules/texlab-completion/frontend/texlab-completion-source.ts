import { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import getMeta from '@/utils/meta'
import { FetchError, postJSON } from '@/infrastructure/fetch-json'

type DocCache = {
  text: string
  version: number
}

const logDebug = (...args: any[]) => {
  if (typeof console !== 'undefined' && getMeta('ol-debug') === 'true') {
    console.debug('[TexlabCompletion]', ...args)
  }
}

function positionToOffset(text: string, pos: { line: number; character: number }): number {
  const lines = text.split('\n')
  const clampedLine = Math.min(Math.max(pos.line, 0), Math.max(lines.length - 1, 0))
  let offset = 0
  for (let i = 0; i < clampedLine; i++) {
    offset += lines[i].length + 1 // +1 for the newline
  }
  const lineText = lines[clampedLine] || ''
  const clampedChar = Math.min(Math.max(pos.character, 0), lineText.length)
  return offset + clampedChar
}

const docCache = new Map<string, DocCache>()

function getDocPath(): string {
  // Prefer the current open doc name from the unstable store (set in IdeProvider)
  const store = (window as any).overleaf?.unstable?.store
  const name = store?.get?.('editor.open_doc_name')
  return typeof name === 'string' && name.length > 0 ? name : 'main.tex'
}

function computeChange(
  prevText: string,
  nextText: string
): { from: number; to: number; text: string } | null {
  if (prevText === nextText) return null
  let start = 0
  const minLen = Math.min(prevText.length, nextText.length)
  while (start < minLen && prevText[start] === nextText[start]) start++

  let endPrev = prevText.length - 1
  let endNext = nextText.length - 1
  while (
    endPrev >= start &&
    endNext >= start &&
    prevText[endPrev] === nextText[endNext]
  ) {
    endPrev--
    endNext--
  }

  return {
    from: start,
    to: endPrev + 1,
    text: nextText.slice(start, endNext + 1),
  }
}

const shouldTrigger = (context: CompletionContext) => {
  const before = context.state.sliceDoc(Math.max(0, context.pos - 1), context.pos)
  return before === '\\' || /[\\a-zA-Z]/.test(before)
}

const kindToType = (kind?: number): string | undefined => {
  const map: Record<number, string> = {
    1: 'text',
    2: 'method',
    3: 'function',
    4: 'constructor',
    5: 'field',
    6: 'variable',
    7: 'class',
    8: 'interface',
    9: 'module',
    10: 'property',
    11: 'unit',
    12: 'value',
    13: 'enum',
    14: 'keyword',
    15: 'snippet',
    16: 'color',
    17: 'file',
    18: 'reference',
    19: 'folder',
    20: 'enumMember',
    21: 'constant',
    22: 'struct',
    23: 'event',
    24: 'operator',
    25: 'typeParam',
  }
  return kind ? map[kind] : undefined
}

async function fetchTexlabCompletion(
  context: CompletionContext
): Promise<CompletionResult | null> {
  const projectId = getMeta('ol-project_id')
  if (!projectId) return null

  const docText = context.state.doc.toString()
  const offset = context.pos
  logDebug('context pos', offset)
  const docPath = getDocPath()

  const cached = docCache.get(docPath)
  let version = cached?.version ?? 0
  let fullText: string | undefined
  let changes: Array<{ from: number; to: number; text: string }> | undefined

  if (!cached) {
    version = 1
    fullText = docText
    docCache.set(docPath, { text: docText, version })
  } else {
    const change = computeChange(cached.text, docText)
    if (!change) {
      version = cached.version
    } else {
      version = cached.version + 1
      changes = [change]
      docCache.set(docPath, { text: docText, version })
    }
  }

  async function sendRequest(forceFullText = false) {
    const payloadVersion =
      forceFullText && cached ? cached.version + 1 : version
    const payloadText = forceFullText ? cached?.text ?? docText : fullText
    const payload = {
      docPath,
      offset,
      version: payloadVersion,
      fullText: payloadText,
      changes: forceFullText ? undefined : changes,
    }
    if (payloadText) {
      docCache.set(docPath, { text: payloadText, version: payloadVersion })
    }
    return await postJSON(`/project/${projectId}/texlab/complete`, {
      body: payload,
    })
  }

  try {
    let res: any
    try {
      res = await sendRequest(false)
    } catch (err) {
      logDebug('request failed, err=', err)
      if (err instanceof FetchError && err.response?.status === 409) {
        // Server lost state, retry with full text
        res = await sendRequest(true)
      } else {
        throw err
      }
    }
    logDebug('completion response items', Array.isArray(res?.items) ? res.items.length : 0)
    const mapped = (res.items || [])
      .map((item: any) => {
        const rawLabel =
          (typeof item.label === 'string' && item.label.trim()) ||
          (typeof item.insertText === 'string' && item.insertText.trim()) ||
          ''
        if (!rawLabel) return null
        // drop punctuation-only suggestions which clutter the list
        if (!/[A-Za-z]/.test(rawLabel[0])) return null

        const insertText = item.insertText || rawLabel
        const applyText = item.textEdit?.newText || insertText
        const range = item.textEdit?.range
        let from =
          range?.start != null
            ? positionToOffset(docText, range.start)
            : context.pos
        let to =
          range?.end != null ? positionToOffset(docText, range.end) : context.pos
        // ensure cursor falls within replacement range; some servers may be off-by-one
        if (context.pos < from) from = context.pos
        if (context.pos > to) to = context.pos

        const apply = (view: any, _completion: any, _from: number, _to: number) => {
          view.dispatch({
            changes: { from, to, insert: applyText },
            scrollIntoView: true,
          })
        }
        const displayLabel = rawLabel.startsWith('\\')
          ? rawLabel
          : `\\${rawLabel}`
        logDebug('option mapped', { label: rawLabel, from, to })
        const type = kindToType(item.kind)
        return {
          rawLabel,
          option: {
            label: displayLabel,
            // hide detail in UI to avoid noisy chips; keep available for future diagnostics if needed
            detail: undefined,
            apply,
            type,
          },
          range: { from, to },
        }
      })
      .filter(Boolean) as Array<{
      rawLabel: string
      option: any
      range: { from: number; to: number }
    }>
    const resultFrom = mapped[0]?.range.from ?? context.pos
    const resultTo = mapped[0]?.range.to ?? context.pos
    logDebug('completion range', { from: resultFrom, to: resultTo })
    return {
      from: resultFrom,
      to: resultTo,
      options: mapped.map(item => item.option),
      // 按用户已输入前缀过滤结果（去掉前导反斜杠）
      filter: true,
      validFor: text => {
        const prefix = text.replace(/^\\/, '').toLowerCase()
        return mapped.some(item =>
          item.rawLabel.toLowerCase().startsWith(prefix)
        )
      },
    }
  } catch (err) {
    logDebug('completion error, returning null', err)
    // Ignore errors; just return no completions
    return null
  }
}

const texlabCompletionSource = async (
  context: CompletionContext
): Promise<CompletionResult | null> => {
  if (!shouldTrigger(context)) return null
  return await fetchTexlabCompletion(context)
}

export default texlabCompletionSource
