# AI provider routing

Routes (`ai_routes`) are the canonical place to map a workflow / task to
a primary provider+model and an optional fallback. A route specifies:

- `route_key` (UNIQUE)
- `primary_provider_id`, `primary_model_id`
- `fallback_provider_id`, `fallback_model_id`
- `temperature`, `max_output_tokens`
- `response_format` (`text` | `json` | `markdown`)

## Resolution order

1. The runner loads the requested route (by `route_key`, falling back
   to `default.chat` if missing).
2. It tries the primary provider+model. On exception, it logs a
   request row with `status='failed'` and tries the fallback.
3. The fallback's request row is recorded with `status='fallback_used'`
   so usage analytics can spot routing degradation.
4. If no providers are configured, the runner falls back to the
   built-in `stub` provider so the system stays operable in dev.

## Stub provider (offline-safe default)

`stub` requires no external credentials. Outputs are deterministic
(hash-derived) and clearly tagged with `metadata.stub === true` so
production policy can refuse to index them (see
[ai-generated-content-indexing-policy.md](ai-generated-content-indexing-policy.md)).

## Real provider seams

`openai`, `anthropic`, `gemini`, `openrouter`, `ollama`, `local_http`,
`custom` are registered as adapters. Without a configured
`api_key_env`, they delegate to `stub` and tag the response with
`fallback_from`. Implementing live HTTP transport is intentionally
deferred — the seam is in place so that adding it later is purely
additive.

## Never returned

Provider HTTP responses **never** include the literal API key value.
The admin UI only ever sees the env-variable name (`api_key_env`)
plus a boolean indicating whether that env-var is currently set.
