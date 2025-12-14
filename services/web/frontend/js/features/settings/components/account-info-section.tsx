import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getUserFacingMessage,
  postJSON,
} from '../../../infrastructure/fetch-json'
import getMeta from '../../../utils/meta'
import useAsync from '../../../shared/hooks/use-async'
import { useUserContext } from '../../../shared/context/user-context'
import OLButton from '@/shared/components/ol/ol-button'
import OLNotification from '@/shared/components/ol/ol-notification'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormText from '@/shared/components/ol/ol-form-text'

type LLMModelInput = {
  id?: string
  modelName: string
  apiUrl: string
  apiKey?: string
  hasApiKey?: boolean
  isDefault?: boolean
  provider?: 'openai_style' | 'anthropic' | 'gemini'
}

function AccountInfoSection() {
  const { t } = useTranslation()
  const { hasAffiliationsFeature } = getMeta('ol-ExposedSettings')
  const isExternalAuthenticationSystemUsed = getMeta(
    'ol-isExternalAuthenticationSystemUsed'
  )
  const shouldAllowEditingDetails = getMeta('ol-shouldAllowEditingDetails')
  const {
    first_name: initialFirstName,
    last_name: initialLastName,
    email: initialEmail,
    sshkeys,
    llmSettings,
  } = useUserContext()

  const [email, setEmail] = useState(initialEmail)
  const [firstName, setFirstName] = useState(initialFirstName)
  const [lastName, setLastName] = useState(initialLastName)
  const { isLoading, isSuccess, isError, error, runAsync } = useAsync()
  const [isFormValid, setIsFormValid] = useState(true)

  const [showSshPublic, setShowSshPublic] = useState(false)
  const [sshPublic, setSshPublic] = useState(sshkeys?.Public || '')

  // LLM Settings state
  const [useOwnLLMSettings, setUseOwnLLMSettings] = useState(llmSettings?.useOwnSettings || false)
  const [llmModels, setLlmModels] = useState<LLMModelInput[]>(
    (llmSettings?.models && llmSettings.models.length > 0)
      ? llmSettings.models.map(m => ({
          id: m.id,
          modelName: m.modelName,
          apiUrl: m.apiUrl,
          apiKey: '',
          hasApiKey: m.hasApiKey,
          isDefault: m.isDefault,
          provider: m.provider || 'openai_style',
        }))
      : [{
          modelName: llmSettings?.modelName || '',
          apiUrl: llmSettings?.apiUrl || '',
          apiKey: '',
          hasApiKey: llmSettings?.hasApiKey,
          isDefault: true,
          provider: 'openai_style',
        }]
  )
  const [isCheckingConnection, setIsCheckingConnection] = useState(false)
  const [connectionCheckResult, setConnectionCheckResult] = useState<{ success: boolean, message: string } | null>(null)
  const { isLoading: isLlmSaving, isSuccess: isLlmSuccess, isError: isLlmError, error: llmError, runAsync: runLlmAsync } = useAsync()
  const { isLoading: isSshSaving, isSuccess: isSshSuccess, isError: isSshError, error: sshError, runAsync: runSshAsync } = useAsync()

  const setModelField = (index: number, field: keyof LLMModelInput, value: any) => {
    setLlmModels(models => {
      const clone = [...models]
      clone[index] = { ...clone[index], [field]: value }
      return clone
    })
  }

  const setDefaultModel = (index: number) => {
    setLlmModels(models =>
      models.map((m, i) => ({
        ...m,
        isDefault: i === index,
      }))
    )
  }

  const addModel = () => {
    setLlmModels(models => [
      ...models,
      { modelName: '', apiUrl: '', apiKey: '', hasApiKey: false, isDefault: models.length === 0, provider: 'openai_style' },
    ])
  }

  const removeModel = (index: number) => {
    setLlmModels(models => {
      const filtered = models.filter((_, i) => i !== index)
      if (filtered.length > 0 && !filtered.some(m => m.isDefault)) {
        filtered[0].isDefault = true
      }
      return filtered.length > 0
        ? filtered
        : [{ modelName: '', apiUrl: '', apiKey: '', hasApiKey: false, isDefault: true, provider: 'openai_style' }]
    })
  }

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value)
    setIsFormValid(event.target.validity.valid)
  }

  const handleFirstNameChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFirstName(event.target.value)
  }

  const handleLastNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLastName(event.target.value)
  }

  const canUpdateEmail =
    !hasAffiliationsFeature && !isExternalAuthenticationSystemUsed
  const canUpdateNames = shouldAllowEditingDetails

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleCheckLLMConnection = async () => {
    const targetModel = llmModels.find(m => m.isDefault) || llmModels[0]
    if (!targetModel) return
    if (!targetModel.modelName || !targetModel.apiUrl || (!targetModel.apiKey && !targetModel.hasApiKey)) {
      setConnectionCheckResult({
        success: false,
        message: 'Please provide API URL, API key, and model name for the default model',
      })
      return
    }

    setIsCheckingConnection(true)
    setConnectionCheckResult(null)
    try {
      const response = await postJSON('/user/llm-settings/check', {
        body: {
          apiUrl: targetModel.apiUrl,
          apiKey: targetModel.apiKey,
          modelName: targetModel.modelName,
          provider: targetModel.provider || 'openai_style',
        },
      })
      setConnectionCheckResult({ success: true, message: response.message || 'Connection successful' })
    } catch (err: any) {
      setConnectionCheckResult({ success: false, message: err.message || 'Connection failed' })
    } finally {
      setIsCheckingConnection(false)
    }
  }

  const handleSaveLLMSettings = () => {
    const sanitizedModels = llmModels.map(m => ({
      id: m.id,
      modelName: m.modelName,
      apiUrl: m.apiUrl,
      apiKey: m.apiKey,
      isDefault: m.isDefault,
      provider: m.provider || 'openai_style',
    }))

    runLlmAsync(
      postJSON('/user/llm-settings', {
        body: {
          useOwnLLMSettings,
          llmModels: sanitizedModels,
        },
      })
    ).then(() => {
      setLlmModels(models =>
        models.map(m => ({
          ...m,
          hasApiKey: m.hasApiKey || !!m.apiKey,
          apiKey: '', // clear transient key after save
        }))
      )
    }).catch(() => {})
  }

  const handleToggleUseOwnLLMSettings = (checked: boolean) => {
    setUseOwnLLMSettings(checked)

    // If unchecking, clear all LLM settings and save to backend
    if (!checked) {
      setLlmModels([{ modelName: '', apiUrl: '', apiKey: '', hasApiKey: false, isDefault: true }])
      setConnectionCheckResult(null)

      // Save the cleared settings to the backend
      runLlmAsync(
        postJSON('/user/llm-settings', {
          body: {
            useOwnLLMSettings: false,
            llmApiKey: undefined,
            llmModelName: '',
            llmApiUrl: '',
          },
        })
      ).catch(() => {})
    }
  }

  const handleSaveSshKeys = () => {
    runSshAsync(
      postJSON('/user/settings', {
        body: {
          sshPublicKey: sshPublic,
        },
      })
    ).catch(() => {})
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isFormValid) {
      return
    }
    runAsync(
      postJSON('/user/settings', {
        body: {
          email: canUpdateEmail ? email : undefined,
          first_name: canUpdateNames ? firstName : undefined,
          last_name: canUpdateNames ? lastName : undefined,
        },
      })
    ).catch(() => {})
  }

  return (
    <>
      <h3 id="update-account-info">{t('update_account_info')}</h3>
      <form id="account-info-form" onSubmit={handleSubmit}>
        {hasAffiliationsFeature ? null : (
          <ReadOrWriteFormGroup
            id="email-input"
            type="email"
            label={t('email')}
            value={email}
            handleChange={handleEmailChange}
            canEdit={canUpdateEmail}
            required
          />
        )}
        <ReadOrWriteFormGroup
          id="first-name-input"
          type="text"
          label={t('first_name')}
          value={firstName}
          maxLength={255}
          handleChange={handleFirstNameChange}
          canEdit={canUpdateNames}
          required={false}
        />
        <ReadOrWriteFormGroup
          id="last-name-input"
          type="text"
          label={t('last_name')}
          maxLength={255}
          value={lastName}
          handleChange={handleLastNameChange}
          canEdit={canUpdateNames}
          required={false}
        />
        {isSuccess ? (
          <OLFormGroup>
            <OLNotification
              type="success"
              content={t('thanks_settings_updated')}
            />
          </OLFormGroup>
        ) : null}
        {isError ? (
          <OLFormGroup>
            <OLNotification
              type="error"
              content={getUserFacingMessage(error) ?? ''}
            />
          </OLFormGroup>
        ) : null}
        {canUpdateEmail || canUpdateNames ? (
          <OLFormGroup>
            <OLButton
              type="submit"
              variant="primary"
              form="account-info-form"
              disabled={!isFormValid}
              isLoading={isLoading}
              loadingLabel={t('saving') + '…'}
              aria-labelledby={isLoading ? undefined : 'update-account-info'}
            >
              {t('update')}
            </OLButton>
          </OLFormGroup>
        ) : null}
      </form>

      {/* SSH Keys Section - Improved */}
      {(sshkeys?.Public || sshkeys?.Private) && (
        <>
          <h3 id="ssh-keys" style={{ marginTop: '2rem' }}>SSH Keys</h3>
          
          {sshkeys?.Public && (
            <OLFormGroup controlId="ssh-public-key-input">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <OLFormLabel>SSH Public Key</OLFormLabel>
                <div>
                  <OLButton
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(sshkeys.Public)}
                    style={{ marginRight: '0.5rem' }}
                  >
                    Copy
                  </OLButton>
                  <OLButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowSshPublic(!showSshPublic)}
                  >
                    {showSshPublic ? 'Hide' : 'Show'}
                  </OLButton>
                </div>
              </div>
              {showSshPublic && (
                <textarea
                  className="form-control"
                  readOnly
                  value={sshkeys.Public}
                  rows={4}
                  style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '0.5rem' }}
                />
              )}
            </OLFormGroup>
          )}

          {sshkeys?.Private && (
            <OLFormGroup controlId="ssh-private-key-input">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <OLFormLabel>SSH Private Key</OLFormLabel>
                <div>
                  <OLButton
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(sshkeys.Private)}
                    style={{ marginRight: '0.5rem' }}
                  >
                    Copy
                  </OLButton>
                  <OLButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowSshPrivate(!showSshPrivate)}
                  >
                    {showSshPrivate ? 'Hide' : 'Show'}
                  </OLButton>
                </div>
              </div>
              {showSshPrivate && (
                <textarea
                  className="form-control"
                  readOnly
                  value={sshkeys.Private}
                  rows={6}
                  style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '0.5rem' }}
                />
              )}
            </OLFormGroup>
          )}
        </>
      )}

      {/* SSH Keys Section - editable */}
      <h3 id="ssh-keys" style={{ marginTop: '2rem' }}>SSH Keys</h3>
      <OLFormGroup controlId="ssh-public-key-input">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <OLFormLabel>SSH Public Key</OLFormLabel>
          <div>
            <OLButton
              variant="secondary"
              size="sm"
              onClick={() => copyToClipboard(sshPublic)}
              style={{ marginRight: '0.5rem' }}
            >
              Copy
            </OLButton>
            <OLButton
              variant="secondary"
              size="sm"
              onClick={() => setShowSshPublic(!showSshPublic)}
            >
              {showSshPublic ? 'Hide' : 'Show'}
            </OLButton>
          </div>
        </div>
        {showSshPublic && (
          <textarea
            className="form-control"
            value={sshPublic}
            onChange={e => setSshPublic(e.target.value)}
            rows={4}
            style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '0.5rem' }}
          />
        )}
      </OLFormGroup>
      <OLFormText>平台不存储私钥，请仅粘贴公钥，私钥请自行保管。</OLFormText>

      <OLFormGroup>
        <OLButton
          variant="primary"
          onClick={handleSaveSshKeys}
          disabled={isSshSaving}
          isLoading={isSshSaving}
          loadingLabel={t('saving') + '…'}
        >
          保存 SSH 密钥
        </OLButton>
      </OLFormGroup>

      {isSshSuccess && (
        <OLFormGroup>
          <OLNotification type="success" content="SSH 密钥已保存" />
        </OLFormGroup>
      )}
      {isSshError && (
        <OLFormGroup>
          <OLNotification
            type="error"
            content={getUserFacingMessage(sshError) ?? '保存 SSH 密钥失败'}
          />
        </OLFormGroup>
      )}

      {/* LLM Settings Section */}
      <h3 id="llm-settings" style={{ marginTop: '2rem' }}>LLM Settings</h3>
      <OLFormGroup>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="checkbox"
            id="use-own-llm-settings"
            checked={useOwnLLMSettings}
            onChange={(e) => handleToggleUseOwnLLMSettings(e.target.checked)}
            style={{ marginRight: '0.5rem' }}
          />
          <OLFormLabel htmlFor="use-own-llm-settings">
            Use my own LLM settings
          </OLFormLabel>
        </div>
      </OLFormGroup>

      {useOwnLLMSettings && (
        <>
          <OLFormGroup>
            <OLFormLabel>Personal models</OLFormLabel>
            {llmModels.map((model, index) => (
              <div
                key={model.id || index}
                style={{
                  border: '1px solid var(--editor-border-color)',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="radio"
                    name="llm-default-model"
                    checked={!!model.isDefault}
                    onChange={() => setDefaultModel(index)}
                    aria-label="Set as default model"
                  />
                  <span style={{ fontWeight: 600 }}>Default</span>
                </div>
                <OLFormGroup controlId={`llm-model-name-${index}`}>
                  <OLFormLabel>Model Name</OLFormLabel>
                  <OLFormControl
                    type="text"
                    value={model.modelName}
                    onChange={(e) => setModelField(index, 'modelName', e.target.value)}
                    placeholder="e.g., gpt-4o-mini"
                  />
                </OLFormGroup>
                <OLFormGroup controlId={`llm-api-url-${index}`}>
                  <OLFormLabel>API URL</OLFormLabel>
                  <OLFormControl
                    type="text"
                    value={model.apiUrl}
                    onChange={(e) => setModelField(index, 'apiUrl', e.target.value)}
                    placeholder="https://api.openai.com/v1 (no /chat/completions)"
                  />
                  <OLFormText>
                    For OpenAI-style: base URL only, we append /chat/completions. Anthropic: base like https://api.anthropic.com. Gemini: base like https://generativelanguage.googleapis.com (model goes in path).
                  </OLFormText>
                </OLFormGroup>
                <OLFormGroup controlId={`llm-api-key-${index}`}>
                  <OLFormLabel>API Key</OLFormLabel>
                  <OLFormControl
                    type="password"
                    value={model.apiKey || ''}
                    onChange={(e) => setModelField(index, 'apiKey', e.target.value)}
                    placeholder={model.hasApiKey ? '***' : 'Enter API Key'}
                  />
                  {model.hasApiKey && !model.apiKey && (
                    <OLFormText>Existing API key is set. Enter a new one to update.</OLFormText>
                  )}
                </OLFormGroup>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <OLFormGroup controlId={`llm-provider-${index}`} style={{ flex: 1 }}>
                    <OLFormLabel>Provider</OLFormLabel>
                    <select
                      className="form-control"
                      value={model.provider || 'openai_style'}
                      onChange={(e) => setModelField(index, 'provider', e.target.value as LLMModelInput['provider'])}
                    >
                      <option value="openai_style">OpenAI-compatible</option>
                      <option value="anthropic">Anthropic (Claude)</option>
                      <option value="gemini">Google Gemini</option>
                    </select>
                  </OLFormGroup>
                  <OLButton
                    variant="secondary"
                    onClick={() => removeModel(index)}
                    disabled={llmModels.length === 1}
                  >
                    Remove
                  </OLButton>
                </div>
              </div>
            ))}
            <OLButton variant="secondary" onClick={addModel}>
              Add model
            </OLButton>
          </OLFormGroup>

          {connectionCheckResult && (
            <OLFormGroup>
              <OLNotification
                type={connectionCheckResult.success ? 'success' : 'error'}
                content={connectionCheckResult.message}
              />
            </OLFormGroup>
          )}

          <OLFormGroup>
            <OLButton
              variant="secondary"
              onClick={handleCheckLLMConnection}
              disabled={isCheckingConnection || llmModels.some(m => !m.modelName || !m.apiUrl || (!m.apiKey && !m.hasApiKey))}
              isLoading={isCheckingConnection}
              loadingLabel="Checking..."
              style={{ marginRight: '0.5rem' }}
            >
              Check Connection (default model)
            </OLButton>
            <OLButton
              variant="primary"
              onClick={handleSaveLLMSettings}
              disabled={
                isLlmSaving ||
                llmModels.length === 0 ||
                llmModels.some(m => !m.modelName || !m.apiUrl || (!m.apiKey && !m.hasApiKey))
              }
              isLoading={isLlmSaving}
              loadingLabel={t('saving') + '…'}
            >
              Save LLM Settings
            </OLButton>
          </OLFormGroup>

          {isLlmSuccess && (
            <OLFormGroup>
              <OLNotification
                type="success"
                content="LLM settings saved successfully"
              />
            </OLFormGroup>
          )}

          {isLlmError && (
            <OLFormGroup>
              <OLNotification
                type="error"
                content={getUserFacingMessage(llmError) ?? 'Failed to save LLM settings'}
              />
            </OLFormGroup>
          )}
        </>
      )}
    </>
  )
}

type ReadOrWriteFormGroupProps = {
  id: string
  type: string
  label: string
  value?: string
  handleChange: (event: any) => void
  canEdit: boolean
  maxLength?: number
  required: boolean
}

function ReadOrWriteFormGroup({
  id,
  type,
  label,
  value,
  handleChange,
  canEdit,
  maxLength,
  required,
}: ReadOrWriteFormGroupProps) {
  const [validationMessage, setValidationMessage] = useState('')

  const handleInvalid = (event: React.InvalidEvent<HTMLInputElement>) => {
    event.preventDefault()
  }

  const handleChangeAndValidity = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    handleChange(event)
    setValidationMessage(event.target.validationMessage)
  }

  if (!canEdit) {
    return (
      <OLFormGroup controlId={id}>
        <OLFormLabel>{label}</OLFormLabel>
        <OLFormControl type="text" readOnly value={value} />
      </OLFormGroup>
    )
  }

  return (
    <OLFormGroup controlId={id}>
      <OLFormLabel>{label}</OLFormLabel>
      <OLFormControl
        type={type}
        required={required}
        value={value}
        maxLength={maxLength}
        data-ol-dirty={!!validationMessage}
        onChange={handleChangeAndValidity}
        onInvalid={handleInvalid}
      />
      {validationMessage && (
        <OLFormText type="error">{validationMessage}</OLFormText>
      )}
    </OLFormGroup>
  )
}

export default AccountInfoSection
