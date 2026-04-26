'use strict';

// openvibe-ai — provider registry. Real provider adapters are added here as
// thin seams: they accept config + record metadata but never expose API keys.
//
// Default provider (`stub`) works with no external credentials.

const { stubProvider } = require('./providers/stub');

const _registry = new Map();

function register(provider) {
    if (!provider || !provider.key) throw new Error('provider.key required');
    _registry.set(provider.key, provider);
    return provider;
}

function get(key) {
    const p = _registry.get(key);
    if (!p) throw Object.assign(new Error(`unknown ai provider: ${key}`), { status: 400 });
    return p;
}
function has(key) { return _registry.has(key); }
function list()   { return Array.from(_registry.keys()); }

// ── External provider seams (skeletal — no real network calls without key)
// Each seam validates that the env-var name is configured before attempting
// any HTTP request. Without a configured key, calls fall through to stub.
function _httpSeam(key, displayKey) {
    return {
        key,
        supports(f) { return ['chat', 'generate', 'summarize', 'classify', 'extract', 'enrich'].includes(f); },
        _envVar(envName) {
            const v = envName ? process.env[envName] : null;
            return v && String(v).trim() ? v : null;
        },
        async chat(args) {
            // Without a real key, always fall through to stub for safe local dev.
            if (!this._envVar(args && args._api_key_env)) {
                return Object.assign({}, await stubProvider.chat(args), {
                    metadata: { stub: true, fallback_from: key, reason: 'no api key configured' },
                });
            }
            // Real adapter would go here. We intentionally do not implement HTTP
            // calls in Phase 7 to keep the service offline-safe by default.
            return Object.assign({}, await stubProvider.chat(args), {
                metadata: { stub: true, fallback_from: key, reason: 'real adapter deferred' },
            });
        },
        async generate(args)  { return this.chat({ messages: [{ role: 'user', content: args.prompt || '' }], _api_key_env: args._api_key_env }); },
        async summarize(args) { return stubProvider.summarize(args); },
        async classify(args)  { return stubProvider.classify(args); },
        async extract(args)   { return stubProvider.extract(args); },
        async enrich(args)    { return stubProvider.enrich(args); },
        async embed(args)     { return stubProvider.embed(args); },
    };
}

register(stubProvider);
register(_httpSeam('openai',     'OpenAI'));
register(_httpSeam('anthropic',  'Anthropic'));
register(_httpSeam('gemini',     'Gemini'));
register(_httpSeam('openrouter', 'OpenRouter'));
register(_httpSeam('ollama',     'Ollama'));
register(_httpSeam('local_http', 'Local HTTP'));
register(_httpSeam('custom',     'Custom'));

module.exports = { register, get, has, list };
