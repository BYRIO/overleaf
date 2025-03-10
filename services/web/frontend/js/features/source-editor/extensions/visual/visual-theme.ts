import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const visualHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.link, class: 'ol-cm-link-text' },
    { tag: tags.url, class: 'ol-cm-url' },
    { tag: tags.typeName, class: 'ol-cm-monospace' },
    { tag: tags.attributeValue, class: 'ol-cm-monospace' },
    { tag: tags.keyword, class: 'ol-cm-monospace' },
    { tag: tags.string, class: 'ol-cm-monospace' },
    { tag: tags.punctuation, class: 'ol-cm-punctuation' },
    { tag: tags.literal, class: 'ol-cm-monospace' },
    {
      tag: tags.monospace,
      fontFamily: 'var(--source-font-family)',
      lineHeight: 1,
      overflowWrap: 'break-word',
    },
  ])
)

export const visualTheme = EditorView.theme({
  '&.cm-editor': {
    '--visual-font-family':
      "'Noto Serif', 'Palatino Linotype', 'Book Antiqua', Palatino, serif !important",
    '--visual-font-size': 'calc(var(--font-size) * 1.15)',
    '& .cm-content': {
      opacity: 0,
    },
    '&.ol-cm-parsed .cm-content': {
      opacity: 1,
      transition: 'opacity 0.1s ease-out',
    },
  },
  '.cm-content.cm-content': {
    overflowX: 'hidden', // needed so the callout elements don't overflow (requires line wrapping to be on)
    padding: '0 max(calc((100% - 100ch) / 2), 8%)', // max 100 characters per line
    fontFamily: 'var(--visual-font-family)',
    fontSize: 'var(--visual-font-size)',
  },
  '.cm-cursor-primary.cm-cursor-primary': {
    fontFamily: 'var(--visual-font-family)',
    fontSize: 'var(--visual-font-size)',
  },
  '.cm-line': {
    overflowX: 'visible', // needed so the callout elements can overflow when the content has padding
  },
  '.cm-gutter': {
    opacity: '0.5',
  },
  '.cm-tooltip': {
    fontSize: 'calc(var(--font-size) * 1.15) !important',
  },
  '.ol-cm-link-text': {
    textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  '.ol-cm-monospace': {
    fontFamily: 'var(--source-font-family)',
    lineHeight: 1,
    fontWeight: 'normal',
    fontStyle: 'normal',
    fontVariant: 'normal',
    textDecoration: 'none',
  },
  '.ol-cm-punctuation': {
    fontFamily: 'var(--source-font-family)',
    lineHeight: 1,
  },
  '.ol-cm-brace': {
    opacity: '0.5',
  },
  '.ol-cm-math': {
    overflow: 'hidden', // stop the margin from the inner math element affecting the block height
  },
  '.ol-cm-maketitle': {
    textAlign: 'center',
    paddingBottom: '2em',
  },
  '.ol-cm-title': {
    fontSize: '1.7em',
    cursor: 'pointer',
    padding: '0.5em',
    lineHeight: 'calc(var(--line-height) * 5/6)',
  },
  '.ol-cm-author': {
    display: 'inline-block',
    maxWidth: '45%',
    minWidth: '200px',
    verticalAlign: 'top',
    cursor: 'pointer',
  },
  '.ol-cm-author:not(:first-child)': {
    display: 'inline-block',
    marginLeft: '5%',
    maxWidth: '45%',
  },
  '.ol-cm-icon-brace': {
    filter: 'grayscale(1)',
    marginRight: '2px',
  },
  '.ol-cm-begin': {
    fontFamily: 'var(--source-font-family)',
    minHeight: '1em',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  '.ol-cm-end': {
    fontFamily: 'var(--source-font-family)',
    padding: '0.5em 0 1.5em',
    minHeight: '1em',
    textAlign: 'center',
    justifyContent: 'center',
    background: `linear-gradient(180deg, rgba(0,0,0,0) calc(50% - 1px), rgba(192,192,192,1) calc(50%), rgba(0,0,0,0) calc(50% + 1px))`,
  },
  '.ol-cm-environment-top': {
    paddingTop: '1em',
  },
  '.ol-cm-environment-bottom': {
    paddingBottom: '1em',
  },
  '.ol-cm-environment-first-line': {
    paddingTop: '0.5em !important',
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
  },
  '.ol-cm-environment-last-line': {
    paddingBottom: '1em !important',
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
  },
  '.ol-cm-environment-figure.ol-cm-environment-line, .ol-cm-environment-table.ol-cm-environment-line':
    {
      backgroundColor: 'rgba(125, 125, 125, 0.05)',
      padding: '0 12px',
    },
  '.ol-cm-environment-figure.ol-cm-environment-last-line, .ol-cm-environment-table.ol-cm-environment-last-line, .ol-cm-preamble-line.ol-cm-environment-last-line':
    {
      boxShadow: '0 2px 5px -3px rgb(125, 125, 125, 0.5)',
    },
  '.ol-cm-environment-padding': {
    flex: 1,
    height: '1px',
    background: `linear-gradient(180deg, rgba(0,0,0,0) calc(50% - 1px), rgba(192,192,192,1) calc(50%), rgba(0,0,0,0) calc(50% + 1px))`,
  },
  '.ol-cm-environment-name': {
    padding: '0 1em',
  },
  '.ol-cm-environment-name-abstract': {
    fontFamily: 'var(--visual-font-family)',
    fontSize: '1.2em',
    fontWeight: 550,
  },
  '.ol-cm-environment-name-abstract:first-letter': {
    textTransform: 'uppercase',
  },
  '.ol-cm-item': {
    paddingInlineStart: 'calc(var(--list-depth) * 2ch)',
  },
  '.ol-cm-item::before': {
    counterReset: 'list-item var(--list-ordinal)',
    content: 'counter(list-item, var(--list-type)) var(--list-suffix)',
  },
  '.ol-cm-heading': {
    fontWeight: 550,
    lineHeight: '1.35',
    color: 'inherit !important',
    background: 'inherit !important',
  },
  '.ol-cm-command-part': {
    fontSize: '2em',
  },
  '.ol-cm-command-chapter': {
    fontSize: '1.6em',
  },
  '.ol-cm-command-section': {
    fontSize: '1.44em',
  },
  '.ol-cm-command-subsection': {
    fontSize: '1.2em',
  },
  '.ol-cm-command-subsubsection': {
    fontSize: '1em',
  },
  '.ol-cm-command-paragraph': {
    fontSize: '1em',
  },
  '.ol-cm-command-subparagraph': {
    fontSize: '1em',
  },
  '.ol-cm-frame-title': {
    fontSize: '1.44em',
  },
  '.ol-cm-frame-subtitle': {
    fontSize: '1em',
  },
  '.ol-cm-divider': {
    borderBottom: '1px solid rgba(125, 125, 125, 0.1)',
    padding: '0.5em 6px',
    '&.ol-cm-frame-widget': {
      borderBottom: 'none',
      borderTop: '1px solid rgba(125, 125, 125, 0.1)',
    },
  },
  '.ol-cm-command-textbf': {
    fontWeight: 700,
  },
  '.ol-cm-command-textit': {
    fontStyle: 'italic',
  },
  '.ol-cm-command-textsc': {
    fontVariant: 'small-caps',
  },
  '.ol-cm-command-texttt': {
    fontFamily: 'monospace',
  },
  '.ol-cm-command-underline': {
    textDecoration: 'underline',
  },
  '.ol-cm-command-sout': {
    textDecoration: 'line-through',
  },
  '.ol-cm-command-emph': {
    fontStyle: 'italic',
    '& .ol-cm-command-textit': {
      fontStyle: 'normal',
    },
    '.ol-cm-command-textit &': {
      fontStyle: 'normal',
    },
  },
  '.ol-cm-command-url': {
    textDecoration: 'underline',
    // copied from tags.monospace
    fontFamily: 'var(--source-font-family)',
    lineHeight: 1,
    overflowWrap: 'break-word',
    hyphens: 'auto',
  },
  '.ol-cm-environment-centered.ol-cm-caption-line': {
    padding: '0 10%',
    textAlign: 'center',
  },
  '.ol-cm-caption-line .ol-cm-label': {
    marginRight: '1ch',
  },
  '.ol-cm-tex': {
    textTransform: 'uppercase',
    '& sup': {
      position: 'inherit',
      fontSize: '0.85em',
      verticalAlign: '0.15em',
      marginLeft: '-0.36em',
      marginRight: '-0.15em',
    },
    '& sub': {
      position: 'inherit',
      fontSize: '1em',
      verticalAlign: '-0.5ex',
      marginLeft: '-0.1667em',
      marginRight: '-0.125em',
    },
  },
  '.ol-cm-graphics': {
    display: 'block',
    maxWidth: 'min(300px, 100%)',
    paddingTop: '1em',
    paddingBottom: '1em',
    cursor: 'pointer',
    '.ol-cm-graphics-inline &': {
      display: 'inline',
    },
  },
  '.ol-cm-graphics-loading': {
    height: '300px', // guess that the height is the same as the max width
  },
  '.ol-cm-graphics-error': {
    border: '1px solid red',
    padding: '8px',
  },
  '.ol-cm-environment-centered .ol-cm-graphics': {
    margin: '0 auto',
  },
  '.ol-cm-command-verb .ol-cm-monospace': {
    color: 'inherit', // remove syntax highlighting colour from verbatim content
  },
  '.ol-cm-preamble-wrapper': {
    padding: '0.5em 0',
    '&.ol-cm-preamble-expanded': {
      paddingBottom: '0',
    },
  },
  '.ol-cm-preamble-widget, .ol-cm-end-document-widget': {
    padding: '0.25em 1em',
    borderRadius: '8px',
    fontFamily: '"Lato", sans-serif',
    fontSize: '14px',
    '.ol-cm-preamble-expanded &': {
      borderBottomLeftRadius: '0',
      borderBottomRightRadius: '0',
      borderBottom: '1px solid rgba(125, 125, 125, 0.2)',
    },
  },
  '.ol-cm-preamble-widget': {
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  '.ol-cm-preamble-expand-icon': {
    width: '32px',
    lineHeight: '32px',
    textAlign: 'center',
    transition: '0.2s ease-out',
    opacity: '0.5',
    '.ol-cm-preamble-widget:hover &': {
      opacity: '1',
    },
    '.ol-cm-preamble-expanded &': {
      transform: 'rotate(180deg)',
    },
  },
  '.ol-cm-preamble-line, .ol-cm-end-document-widget, .ol-cm-preamble-widget': {
    backgroundColor: 'rgba(125, 125, 125, 0.05)',
  },
  '.ol-cm-preamble-line': {
    padding: '0 12px',
    '&.ol-cm-environment-first-line': {
      borderRadius: '0',
    },
  },
  '.ol-cm-end-document-widget': {
    textAlign: 'center',
  },
})
