import {
  acceptCompletion,
  autocompletion,
  completionStatus,
  closeCompletion,
  moveCompletionSelection,
  startCompletion,
  Completion,
} from '@codemirror/autocomplete'
import { EditorView, keymap } from '@codemirror/view'
import { getBibkeyArgumentNode } from '../utils/tree-operations/ancestors'
import {
  Compartment,
  Extension,
  Prec,
  StateEffect,
  TransactionSpec,
} from '@codemirror/state'
import importOverleafModules from '../../../../macros/import-overleaf-module.macro'

const moduleExtensions: Array<(options: Record<string, any>) => Extension> =
  importOverleafModules('autoCompleteExtensions').map(
    (item: { import: { extension: Extension } }) => item.import.extension
  )

const autoCompleteConf = new Compartment()

type AutoCompleteOptions = {
  enabled: boolean
} & Record<string, any>

// Expose a minimal CM API for debugging in the console
if (typeof window !== 'undefined') {
  const cm = (window as any).CodeMirror || {}
  cm.startCompletion = cm.startCompletion || startCompletion
  cm.completionStatus = cm.completionStatus || completionStatus
  cm.completionState = cm.completionState || (autocompletion as any).completionState
  cm.autocompletion = cm.autocompletion || autocompletion
  cm.closeCompletion = cm.closeCompletion || closeCompletion
  cm.StateEffect = cm.StateEffect || StateEffect
  ;(window as any).CodeMirror = cm
}

export const autoComplete = ({ enabled, ...rest }: AutoCompleteOptions) =>
  autoCompleteConf.of(createAutoComplete({ enabled, ...rest }))

export const setAutoComplete = ({
  enabled,
  ...rest
}: AutoCompleteOptions): TransactionSpec => {
  return {
    effects: autoCompleteConf.reconfigure(
      createAutoComplete({ enabled, ...rest })
    ),
  }
}

const createAutoComplete = ({ enabled, ...rest }: AutoCompleteOptions) => {
  console.log('[AutoComplete] createAutoComplete enabled', enabled)
  if (!enabled) {
    return []
  }

  return [
    [
      autocompleteTheme,
      /**
       * A built-in extension which provides the autocomplete feature,
       * configured with a custom render function and
       * a zero interaction delay (so that keypresses are handled after the autocomplete is opened).
       */
      autocompletion({
        icons: false,
        defaultKeymap: false,
        addToOptions: [
          {
            // show a small type chip when available
            render: completion => {
              if (!completion.type) return null
              const span = document.createElement('span')
              span.classList.add('ol-cm-completionType')
              span.textContent = completion.type
              return span
            },
            position: 400,
          },
        ],
        optionClass: (completion: Completion) =>
          completion.type ? `ol-cm-completion-${completion.type}` : '',
        interactionDelay: 0,
      }),
      /**
       * A keymap which adds Tab for accepting a completion and Ctrl-Space for opening autocomplete.
       */
      Prec.highest(
        keymap.of([
          { key: 'Escape', run: closeCompletion },
          { key: 'ArrowDown', run: moveCompletionSelection(true) },
          { key: 'ArrowUp', run: moveCompletionSelection(false) },
          { key: 'PageDown', run: moveCompletionSelection(true, 'page') },
          { key: 'PageUp', run: moveCompletionSelection(false, 'page') },
          { key: 'Enter', run: acceptCompletion },
          { key: 'Tab', run: acceptCompletion },
        ])
      ),
      /**
       * A keymap which positions Ctrl-Space and Alt-Space below the corresponding bindings for advanced reference search.
       */
      Prec.high(
        keymap.of([
          {
            key: 'Ctrl-Space',
            run: (view: EditorView) => {
              try {
                const pos = view.state.selection.main.head
                const node = getBibkeyArgumentNode(view.state, pos)
                if (node) {
                  const from = node.from + 1
                  const to = node.to - 1
                  const existing = view.state.doc.sliceString(from, to)
                  const existingKeys = existing
                    .split(',')
                    .map(k => k.trim())
                    .filter(Boolean)
                  // try to grab the command name (naive approach)
                  const textBefore = view.state.doc.sliceString(
                    Math.max(0, node.from - 64),
                    node.from
                  )
                  const cmdMatch = textBefore.match(/\\([a-zA-Z*]+)/)
                  const commandName = cmdMatch ? cmdMatch[1] : null
                  window.dispatchEvent(
                    new CustomEvent('reference:openPicker', {
                      detail: { from, to, existingKeys, commandName },
                    })
                  )
                  return true
                }
              } catch (err) {
                // ignore and fallback to completion
              }
              return startCompletion(view)
            },
          },
          { key: 'Alt-Space', run: startCompletion },
        ])
      ),
    ],
    moduleExtensions.map(extension => extension({ ...rest })),
  ]
}

const AUTOCOMPLETE_LINE_HEIGHT = 1.4
/**
 * Styles for the autocomplete menu
 */
const autocompleteTheme = EditorView.baseTheme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    // shift the tooltip, so the completion aligns with the text
    marginLeft: '-4px',
    // force overlay above cursor/line highlights; use !important to override any inline/default z-index
    zIndex: '2000 !important',
    width: 'auto',
    minWidth: '320px',
    minHeight: '180px',
    maxWidth: '95vw',
    pointerEvents: 'auto',
    maxHeight: 'min(420px, 60vh)',
    overflowY: 'auto',
    // let CodeMirror position the tooltip; avoid forcing fixed positioning
    position: 'absolute',
    boxShadow: '2px 3px 5px rgba(0, 0, 0, 0.25)',
  },
  '&light .cm-tooltip.cm-tooltip-autocomplete, &light .cm-tooltip.cm-completionInfo':
    {
      border: '1px lightgray solid',
      background: '#fefefe',
      color: '#111',
      boxShadow: '2px 3px 5px rgb(0 0 0 / 20%)',
    },
  '&dark .cm-tooltip.cm-tooltip-autocomplete, &dark .cm-tooltip.cm-completionInfo':
    {
      border: '1px #484747 solid',
      boxShadow: '2px 3px 5px rgba(0, 0, 0, 0.51)',
      background: '#25282c',
      color: '#c1c1c1',
    },

  // match editor font family and font size, so the completion aligns with the text
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--source-font-family)',
    fontSize: 'var(--font-size)',
    maxHeight: 'inherit',
    overflowY: 'auto',
    width: '100%',
  },
  '.cm-tooltip.cm-tooltip-autocomplete li[role="option"]': {
    display: 'flex',
    justifyContent: 'space-between',
    lineHeight: AUTOCOMPLETE_LINE_HEIGHT, // increase the line height from default 1.2, for a larger target area
    outline: '1px solid transparent',
    padding: '4px 8px',
    width: '100%',
  },
  '.cm-tooltip.cm-tooltip-autocomplete ul li[aria-selected]': {
    color: 'inherit',
    fontWeight: 700,
    outline: '1px solid transparent',
  },
  '.cm-tooltip .cm-completionDetail': {
    display: 'none', // hide optional detail to avoid misaligned chips/noisy text
  },
  '&light .cm-tooltip.cm-tooltip-autocomplete li[role="option"]:hover': {
    outlineColor: '#abbffe',
    backgroundColor: 'rgba(233, 233, 253, 0.4)',
  },
  '&dark .cm-tooltip.cm-tooltip-autocomplete li[role="option"]:hover': {
    outlineColor: 'rgba(109, 150, 13, 0.8)',
    backgroundColor: 'rgba(58, 103, 78, 0.62)',
  },
  '&light .cm-tooltip.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: '#b8cbff !important',
    outlineColor: '#7da0f8',
  },
  '&dark .cm-tooltip.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: '#2f5940 !important',
    outlineColor: '#4ca870',
  },
  '.cm-completionMatchedText': {
    textDecoration: 'none', // remove default underline,
  },
  '&light .cm-completionMatchedText': {
    color: '#2d69c7',
  },
  '&dark .cm-completionMatchedText': {
    color: '#93ca12',
  },
  '.ol-cm-completionType': {
    paddingLeft: '1em',
    paddingRight: 0,
    width: 'auto',
    fontSize: '90%',
    fontFamily: 'var(--source-font-family)',
    opacity: '0.5',
  },
  '.cm-completionInfo .ol-cm-symbolCompletionInfo': {
    margin: 0,
    whiteSpace: 'normal',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  '.cm-completionInfo .ol-cm-symbolCharacter': {
    fontSize: '32px',
  },
})
