import PropTypes from 'prop-types'
import { memo, useCallback, useEffect, useState } from 'react'
import { debounce } from 'lodash'
import { Alert } from 'react-bootstrap'
import PdfViewerControls from './pdf-viewer-controls'
import { useProjectContext } from '../../../shared/context/project-context'
import usePersistedState from '../../../shared/hooks/use-persisted-state'
import useScopeValue from '../../../shared/context/util/scope-value-hook'
import { buildHighlightElement } from '../util/highlights'
import PDFJSWrapper from '../util/pdf-js-wrapper'

function PdfJsViewer({ url }) {
  const { _id: projectId } = useProjectContext()

  // state values persisted in localStorage to restore on load
  const [scale, setScale] = usePersistedState(
    `pdf-viewer-scale:${projectId}`,
    'page-width'
  )
  const [, setScrollTop] = usePersistedState(
    `pdf-viewer-scroll-top:${projectId}`,
    0
  )

  // state values shared with Angular scope (highlights => editor, position => synctex buttons
  const [highlights] = useScopeValue('pdf.highlights')
  const [, setPosition] = useScopeValue('pdf.position')

  // local state values
  const [pdfJsWrapper, setPdfJsWrapper] = useState()
  const [initialised, setInitialised] = useState(false)
  const [error, setError] = useState()

  // create the viewer when the container is mounted
  const handleContainer = useCallback(parent => {
    setPdfJsWrapper(parent ? new PDFJSWrapper(parent.firstChild) : undefined)
  }, [])

  // listen for initialize event
  useEffect(() => {
    if (pdfJsWrapper) {
      pdfJsWrapper.eventBus.on('pagesinit', () => {
        setInitialised(true)
      })
    }
  }, [pdfJsWrapper])

  // load the PDF document from the URL
  useEffect(() => {
    if (pdfJsWrapper && url) {
      setInitialised(false)
      setError(undefined)
      // TODO: anything else to be reset?

      pdfJsWrapper.loadDocument(url).catch(error => setError(error))
    }
  }, [pdfJsWrapper, url])

  useEffect(() => {
    if (pdfJsWrapper) {
      // listen for 'pdf:scroll-to-position' events
      const eventListener = event => {
        pdfJsWrapper.container.scrollTop = event.data.position
      }

      window.addEventListener('pdf:scroll-to-position', eventListener)

      return () => {
        window.removeEventListener('pdf:scroll-to-position', eventListener)
      }
    }
  }, [pdfJsWrapper])

  // listen for scroll events
  useEffect(() => {
    if (pdfJsWrapper) {
      // store the scroll position in localStorage, for the synctex button
      const storePosition = debounce(pdfViewer => {
        // set position for "sync to code" button
        try {
          setPosition(pdfViewer.currentPosition)
        } catch (error) {
          // console.error(error) // TODO
        }
      }, 500)

      // store the scroll position in localStorage, for use when reloading
      const storeScrollTop = debounce(pdfViewer => {
        // set position for "sync to code" button
        setScrollTop(pdfJsWrapper.container.scrollTop)
      }, 500)

      storePosition(pdfJsWrapper)

      const scrollListener = () => {
        storeScrollTop(pdfJsWrapper)
        storePosition(pdfJsWrapper)
      }

      pdfJsWrapper.container.addEventListener('scroll', scrollListener)

      return () => {
        pdfJsWrapper.container.removeEventListener('scroll', scrollListener)
      }
    }
  }, [setPosition, setScrollTop, pdfJsWrapper])

  // listen for double-click events
  useEffect(() => {
    if (pdfJsWrapper) {
      pdfJsWrapper.eventBus.on('textlayerrendered', textLayer => {
        const pageElement = textLayer.source.textLayerDiv.closest('.page')

        const doubleClickListener = event => {
          window.dispatchEvent(
            new CustomEvent('synctex:sync-to-position', {
              detail: pdfJsWrapper.clickPosition(event, pageElement, textLayer),
            })
          )
        }

        pageElement.addEventListener('dblclick', doubleClickListener)
      })
    }
  }, [pdfJsWrapper])

  // restore the saved scale and scroll position
  useEffect(() => {
    if (initialised && pdfJsWrapper) {
      setScale(scale => {
        pdfJsWrapper.viewer.currentScaleValue = scale
        return scale
      })

      // restore the scroll position
      setScrollTop(scrollTop => {
        if (scrollTop > 0) {
          pdfJsWrapper.container.scrollTop = scrollTop
        }
        return scrollTop
      })
    }
  }, [initialised, setScale, setScrollTop, pdfJsWrapper])

  // transmit scale value to the viewer when it changes
  useEffect(() => {
    if (pdfJsWrapper) {
      pdfJsWrapper.viewer.currentScaleValue = scale
    }
  }, [scale, pdfJsWrapper])

  // when highlights are created, build the highlight elements
  useEffect(() => {
    if (pdfJsWrapper && highlights?.length) {
      const elements = highlights.map(highlight =>
        buildHighlightElement(highlight, pdfJsWrapper.viewer)
      )

      // scroll to the first highlighted element
      elements[0].scrollIntoView({
        block: 'start',
        inline: 'nearest',
        behavior: 'smooth',
      })

      return () => {
        for (const element of elements) {
          element.remove()
        }
      }
    }
  }, [highlights, pdfJsWrapper])

  // set the scale in response to zoom option changes
  const setZoom = useCallback(
    zoom => {
      switch (zoom) {
        case 'fit-width':
          setScale('page-width')
          break

        case 'fit-height':
          setScale('page-height')
          break

        case 'zoom-in':
          setScale(pdfJsWrapper.viewer.currentScale * 1.25)
          break

        case 'zoom-out':
          setScale(pdfJsWrapper.viewer.currentScale * 0.75)
          break
      }
    },
    [pdfJsWrapper, setScale]
  )

  // adjust the scale when the container is resized
  useEffect(() => {
    if (pdfJsWrapper) {
      const resizeListener = () => {
        pdfJsWrapper.updateOnResize()
      }

      const resizeObserver = new ResizeObserver(resizeListener)
      resizeObserver.observe(pdfJsWrapper.container)

      window.addEventListener('resize', resizeListener)

      return () => {
        resizeObserver.disconnect()
        window.removeEventListener('resize', resizeListener)
      }
    }
  }, [pdfJsWrapper])

  /* eslint-disable jsx-a11y/no-noninteractive-tabindex */
  return (
    <div className="pdfjs-viewer" ref={handleContainer}>
      <div className="pdfjs-viewer-inner" tabIndex="0">
        <div className="pdfViewer" />
      </div>
      <div className="pdfjs-controls">
        <PdfViewerControls setZoom={setZoom} />
      </div>
      {error && (
        <div className="pdfjs-error">
          <Alert bsStyle="danger">{error.message}</Alert>
        </div>
      )}
    </div>
  )
}

PdfJsViewer.propTypes = {
  url: PropTypes.string.isRequired,
}

export default memo(PdfJsViewer)
