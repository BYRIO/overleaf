## LLM provider presets

The LLM chat feature supports multiple “provider” presets, all proxied server-side (no keys in the browser). Streaming is not used right now.

### Supported presets
- `openai_style` (default): OpenAI-compatible `/chat/completions` with `Authorization: Bearer <key>`, body `{ model, messages, ... }`, response `choices[0].message.content`.
- `anthropic`: Messages API at `/v1/messages`, headers `x-api-key` + `anthropic-version: 2023-06-01`, body `{ model, max_tokens, messages, system? }`, response text from `content[].text`.
- `gemini`: Google Generative Language `:generateContent`, header `x-goog-api-key`, path `/v1beta/models/{model}:generateContent`, messages mapped to `contents[].parts[].text`, response from `candidates[0].content.parts[].text`.

### How it’s used
- User personal models now store `provider`, `apiUrl`, `apiKey`, `modelName` (plus optional `maxTokens/temperature` future-proof).
- `/project/:id/llm/models` returns server models (openai_style) and personal models with `provider`.
- `/project/:id/llm/chat` picks adapter by `provider` to build URL/headers/body and parse response.
- `/user/llm-settings` GET/POST exposes the models array; `/user/llm-settings/check` uses the selected provider for a test request.

### Frontend
- Account settings: each personal model has a provider dropdown (OpenAI-compatible / Anthropic / Google Gemini) and base URL hint.
- Chat quick-setup: includes provider select; saves as a new personal model and refreshes list.

### Notes
- Base URL should not include `/chat/completions`; adapters append their path as needed.
- For legacy single-model users, provider defaults to `openai_style`.
