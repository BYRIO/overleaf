import PropTypes from 'prop-types'
import { Dropdown, MenuItem } from 'react-bootstrap'
import { Trans, useTranslation } from 'react-i18next'
import Icon from '../../../shared/components/icon'
import IconChecked from '../../../shared/components/icon-checked'
import ControlledDropdown from '../../../shared/components/controlled-dropdown'
import IconEditorOnly from './icon-editor-only'
import IconPdfOnly from './icon-pdf-only'

function IconCheckmark({ iconFor, pdfLayout, view }) {
  if (iconFor === 'editorOnly' && pdfLayout === 'flat' && view === 'editor') {
    return <IconChecked />
  } else if (iconFor === 'pdfOnly' && pdfLayout === 'flat' && view === 'pdf') {
    return <IconChecked />
  } else if (iconFor === 'sideBySide' && pdfLayout === 'sideBySide') {
    return <IconChecked />
  }
  // return empty icon for placeholder
  return <Icon type="" modifier="fw" />
}

function LayoutDropdownButton({
  reattach,
  detach,
  handleChangeLayout,
  detachMode,
  detachRole,
  pdfLayout,
  view,
}) {
  const { t } = useTranslation()

  // bsStyle is required for Dropdown.Toggle, but we will override style
  return (
    <>
      {detachMode === 'detaching' && (
        <div aria-live="assertive" className="sr-only">
          {t('layout_processing')}
        </div>
      )}
      <ControlledDropdown
        id="layout-dropdown"
        className="toolbar-item"
        disabled={detachMode === 'detaching'}
      >
        <Dropdown.Toggle className="btn-full-height" bsStyle="link">
          {detachMode === 'detaching' ? (
            <Icon type="refresh" modifier="fw" spin />
          ) : (
            <Icon type="columns" modifier="fw" />
          )}
          <span className="toolbar-label">{t('layout')}</span>
        </Dropdown.Toggle>
        <Dropdown.Menu id="layout-dropdown-list">
          <MenuItem header>{t('layout')}</MenuItem>

          <MenuItem
            disabled={detachRole === 'detacher'}
            onSelect={() => handleChangeLayout('sideBySide')}
          >
            <IconCheckmark
              iconFor="sideBySide"
              pdfLayout={pdfLayout}
              view={view}
            />
            <Icon type="columns" />
            {t('editor_and_pdf')}
          </MenuItem>

          <MenuItem
            onSelect={() => handleChangeLayout('flat', 'editor')}
            className="menu-item-with-svg"
          >
            <IconCheckmark
              iconFor="editorOnly"
              pdfLayout={pdfLayout}
              view={view}
            />
            <IconEditorOnly />
            <Trans
              i18nKey="editor_only_hide_pdf"
              components={[
                <span key="editor_only_hide_pdf" className="subdued" />,
              ]}
            />
          </MenuItem>

          <MenuItem
            disabled={detachRole === 'detacher'}
            onSelect={() => handleChangeLayout('flat', 'pdf')}
            className="menu-item-with-svg"
          >
            <IconCheckmark
              iconFor="pdfOnly"
              pdfLayout={pdfLayout}
              view={view}
            />
            <IconPdfOnly />
            <Trans
              i18nKey="pdf_only_hide_editor"
              components={[
                <span key="pdf_only_hide_editor" className="subdued" />,
              ]}
            />
          </MenuItem>

          <MenuItem divider />

          {detachRole === 'detacher' ? (
            <MenuItem onSelect={() => reattach()}>
              <Icon type="window-restore" modifier="fw" />
              {t('bring_pdf_back_to_tab')}
            </MenuItem>
          ) : (
            <MenuItem onSelect={() => detach()}>
              <Icon type="window-restore" modifier="fw" />
              {t('open_pdf_in_new_tab')}
            </MenuItem>
          )}
        </Dropdown.Menu>
      </ControlledDropdown>
    </>
  )
}

export default LayoutDropdownButton

IconCheckmark.propTypes = {
  iconFor: PropTypes.string.isRequired,
  pdfLayout: PropTypes.string.isRequired,
  view: PropTypes.string,
}

LayoutDropdownButton.propTypes = {
  reattach: PropTypes.func.isRequired,
  detach: PropTypes.func.isRequired,
  handleChangeLayout: PropTypes.func.isRequired,
  detachMode: PropTypes.string,
  detachRole: PropTypes.string,
  pdfLayout: PropTypes.string.isRequired,
  view: PropTypes.string,
}
