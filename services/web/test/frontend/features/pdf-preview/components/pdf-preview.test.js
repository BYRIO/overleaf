import { expect } from 'chai'
import sinon from 'sinon'
import fetchMock from 'fetch-mock'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import PdfPreview from '../../../../../frontend/js/features/pdf-preview/components/pdf-preview'
import { renderWithEditorContext } from '../../../helpers/render-with-context'

const outputFiles = [
  {
    path: 'output.pdf',
    build: '123',
    url: '/build/output.pdf', // TODO: PDF URL to render
    type: 'pdf',
  },
  {
    path: 'output.bbl',
    build: '123',
    url: '/build/output.bbl',
    type: 'bbl',
  },
  {
    path: 'output.bib',
    build: '123',
    url: '/build/output.bib',
    type: 'bib',
  },
  {
    path: 'example.txt',
    build: '123',
    url: '/build/example.txt',
    type: 'txt',
  },
  {
    path: 'output.log',
    build: '123',
    url: '/build/output.log',
    type: 'log',
  },
  {
    path: 'output.blg',
    build: '123',
    url: '/build/output.blg',
    type: 'blg',
  },
]

const mockCompile = () =>
  fetchMock.post('express:/project/:projectId/compile', {
    body: {
      status: 'success',
      clsiServerId: 'foo',
      compileGroup: 'priority',
      pdfDownloadDomain: '',
      outputFiles,
    },
  })

const mockCompileError = status =>
  fetchMock.post('express:/project/:projectId/compile', {
    body: {
      status,
      clsiServerId: 'foo',
      compileGroup: 'priority',
    },
  })

const mockValidationProblems = validationProblems =>
  fetchMock.post('express:/project/:projectId/compile', {
    body: {
      status: 'validation-problems',
      validationProblems,
      clsiServerId: 'foo',
      compileGroup: 'priority',
    },
  })

const mockClearCache = () =>
  fetchMock.delete('express:/project/:projectId/output', 204)

const defaultFileResponses = {
  '/build/output.blg': 'This is BibTeX, Version 4.0', // FIXME
  '/build/output.log': `
The LaTeX compiler output
  * With a lot of details

Wrapped in an HTML <pre> element with
      preformatted text which is to be presented exactly
            as written in the HTML file

                                              (whitespace included™)

The text is typically rendered using a non-proportional ("monospace") font.

LaTeX Font Info:    External font \`cmex10' loaded for size
(Font)              <7> on input line 18.
LaTeX Font Info:    External font \`cmex10' loaded for size
(Font)              <5> on input line 18.
! Undefined control sequence.
<recently read> \\Zlpha

 main.tex, line 23

`,
}

const mockBuildFile = (responses = defaultFileResponses) =>
  fetchMock.get('express:/build/:file', (_url, options, request) => {
    const url = new URL(_url, 'https://example.com')

    if (url.pathname in responses) {
      return responses[url.pathname]
    }

    return 404
  })

const storeAndFireEvent = (key, value) => {
  localStorage.setItem(key, value)
  fireEvent(window, new StorageEvent('storage', { key }))
}

const scope = {
  settings: {
    syntaxValidation: false,
  },
  editor: {
    sharejs_doc: {
      doc_id: 'test-doc',
      getSnapshot: () => 'some doc content',
    },
  },
}

describe('<PdfPreview/>', function () {
  var clock

  beforeEach(function () {
    clock = sinon.useFakeTimers({
      shouldAdvanceTime: true,
      now: Date.now(),
    })
    // xhrMock.setup()
  })

  afterEach(function () {
    clock.runAll()
    clock.restore()
    // xhrMock.teardown()
    fetchMock.reset()
    localStorage.clear()
  })

  it('renders the PDF preview', async function () {
    mockCompile()
    mockBuildFile()

    renderWithEditorContext(<PdfPreview />, { scope })

    // wait for "compile on load" to finish
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })
  })

  it('runs a compile when the Recompile button is pressed', async function () {
    mockCompile()
    mockBuildFile()

    renderWithEditorContext(<PdfPreview />, { scope })

    // wait for "compile on load" to finish
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    // press the Recompile button => compile
    const button = screen.getByRole('button', { name: 'Recompile' })
    button.click()
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    expect(fetchMock.calls()).to.have.length(6)
  })

  it('runs a compile on doc change if autocompile is enabled', async function () {
    mockCompile()
    mockBuildFile()

    renderWithEditorContext(<PdfPreview />, { scope })

    // wait for "compile on load" to finish
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    // switch on auto compile
    storeAndFireEvent('autocompile_enabled:project123', true)

    // fire a doc:changed event => compile
    fireEvent(window, new CustomEvent('doc:changed'))
    clock.tick(2000) // AUTO_COMPILE_DEBOUNCE

    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    expect(fetchMock.calls()).to.have.length(6)
  })

  it('does not run a compile on doc change if autocompile is disabled', async function () {
    mockCompile()
    mockBuildFile()

    renderWithEditorContext(<PdfPreview />, { scope })

    // wait for "compile on load" to finish
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    // make sure auto compile is switched off
    storeAndFireEvent('autocompile_enabled:project123', false)

    // fire a doc:changed event => no compile
    fireEvent(window, new CustomEvent('doc:changed'))
    clock.tick(2000) // AUTO_COMPILE_DEBOUNCE
    screen.getByRole('button', { name: 'Recompile' })

    expect(fetchMock.calls()).to.have.length(3)
  })

  it('does not run a compile on doc change if autocompile is blocked by syntax check', async function () {
    mockCompile()
    mockBuildFile()

    renderWithEditorContext(<PdfPreview />, {
      scope: {
        ...scope,
        'settings.syntaxValidation': true, // enable linting in the editor
        hasLintingError: true, // mock a linting error
      },
    })

    // wait for "compile on load" to finish
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    // switch on auto compile and syntax checking
    storeAndFireEvent('autocompile_enabled:project123', true)
    storeAndFireEvent('stop_on_validation_error:project123', true)

    // fire a doc:changed event => no compile
    fireEvent(window, new CustomEvent('doc:changed'))
    clock.tick(2000) // AUTO_COMPILE_DEBOUNCE
    screen.getByRole('button', { name: 'Recompile' })
    await screen.findByText('Code check failed')

    expect(fetchMock.calls()).to.have.length(3)
  })

  it('displays an error message if there was a compile error', async function () {
    mockCompileError('compile-in-progress')

    renderWithEditorContext(<PdfPreview />, { scope })

    // wait for "compile on load" to finish
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    screen.getByText(
      'Please wait for your other compile to finish before trying again.'
    )

    expect(fetchMock.called('express:/project/:projectId/compile')).to.be.true // TODO: auto_compile query param
    expect(fetchMock.called('express:/build/:file')).to.be.false // TODO: actual path
  })

  it('displays error messages if there were validation problems', async function () {
    const validationProblems = {
      sizeCheck: {
        resources: [
          { path: 'foo/bar', kbSize: 76221 },
          { path: 'bar/baz', kbSize: 2342 },
        ],
      },
      mainFile: true,
      conflictedPaths: [
        {
          path: 'foo/bar',
        },
        {
          path: 'foo/baz',
        },
      ],
    }

    mockValidationProblems(validationProblems)

    renderWithEditorContext(<PdfPreview />, { scope })

    // wait for "compile on load" to finish
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    screen.getByText('Project too large')
    screen.getByText('Unknown main document')
    screen.getByText('Conflicting Paths Found')

    expect(fetchMock.called('express:/project/:projectId/compile')).to.be.true // TODO: auto_compile query param
    expect(fetchMock.called('express:/build/:file')).to.be.false // TODO: actual path
  })

  it('sends a clear cache request when the button is pressed', async function () {
    mockCompile()
    mockBuildFile()
    mockClearCache()

    renderWithEditorContext(<PdfPreview />, { scope })

    // wait for "compile on load" to finish
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    const logsButton = screen.getByRole('button', {
      name: 'This project has an error',
    })
    logsButton.click()

    const clearCacheButton = await screen.findByRole('button', {
      name: 'Clear cached files',
    })
    expect(clearCacheButton.hasAttribute('disabled')).to.be.false

    // click the button
    clearCacheButton.click()
    expect(clearCacheButton.hasAttribute('disabled')).to.be.true
    await waitFor(() => {
      expect(clearCacheButton.hasAttribute('disabled')).to.be.false
    })

    expect(fetchMock.called('express:/project/:projectId/compile')).to.be.true // TODO: auto_compile query param
    expect(fetchMock.called('express:/build/:file')).to.be.true // TODO: actual path
  })

  it('handle "recompile from scratch"', async function () {
    mockCompile()
    mockBuildFile()
    mockClearCache()

    renderWithEditorContext(<PdfPreview />, { scope })

    // wait for "compile on load" to finish
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    // show the logs UI
    const logsButton = screen.getByRole('button', {
      name: 'This project has an error',
    })
    logsButton.click()

    const clearCacheButton = await screen.findByRole('button', {
      name: 'Clear cached files',
    })
    expect(clearCacheButton.hasAttribute('disabled')).to.be.false

    const recompileFromScratch = screen.getByRole('menuitem', {
      name: 'Recompile from scratch',
      hidden: true,
    })
    recompileFromScratch.click()

    expect(clearCacheButton.hasAttribute('disabled')).to.be.true

    // wait for compile to finish
    await screen.findByRole('button', { name: 'Compiling…' })
    await screen.findByRole('button', { name: 'Recompile' })

    expect(fetchMock.called('express:/project/:projectId/compile')).to.be.true // TODO: auto_compile query param
    expect(fetchMock.called('express:/project/:projectId/output')).to.be.true
    expect(fetchMock.called('express:/build/:file')).to.be.true // TODO: actual path
  })
})
