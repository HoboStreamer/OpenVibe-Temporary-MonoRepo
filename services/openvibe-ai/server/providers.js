'use strict';

// openvibe-ai — provider registry.
// Real provider adapters are registered here. Each adapter accepts config and
// record metadata but never exposes API keys in responses.
//
// Default provider (`stub`) works with no external credentials.

const { stubProvider }      = require('./providers/stub');
const { openaiProvider }    = require('./providers/openai');
const { anthropicProvider } = require('./providers/anthropic');
const { ollamaProvider }    = require('./providers/ollama');

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

// ── OpenRouter seam (thin adapter using OpenAI-compatible API) ────────────────
function _openrouterSeam() {
    const ENV_KEY = 'OPENVIBE_AI_OPENROUTER_KEY';
    const https = require('https');
    function _getKey() { const v = process.env[ENV_KEY]; return v && v.trim() ? v.trim() : null; }
    function _post(body, apiKey) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify(body);
            const req = https.request({
                hostname: 'openrouter.ai',
                path: '/api/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://openvibe.network',
                    'X-Title': 'OpenVibe',
                    'Content-Length': Buffer.byteLength(payload),
                },
                timeout: 30000,
            }, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    try {
                        const json = JSON.parse(Buffer.concat(chunks).toString());
                        if (res.statusCode >= 400) { reject(Object.assign(new Error(`OpenRouter HTTP ${res.statusCode}`), { json })); }
                        else { resolve(json); }
                    } catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(new Error('OpenRouter timeout')); });
            req.write(payload); req.end();
        });
    }
    return {
        key: 'openrouter',
        supports(f) { return ['chat', 'generate', 'summarize'].includes(f); },
        async chat({ messages, model, temperature, max_tokens }) {
            const apiKey = _getKey();
            if (!apiKey) return { text: null, metadata: { stub: true, fallback_from: 'openrouter', reason: 'no api key' } };
            const result = await _post({ model: model || 'openai/gpt-4o-mini', messages: messages || [], temperature: temperature != null ? temperature : 0.7, max_tokens: max_tokens || 1024 }, apiKey);
            const choice = result.choices && result.choices[0];
            return { text: choice && choice.message && choice.message.content || '', metadata: { model: result.model, usage: result.usage, provider: 'openrouter' } };
        },
        async generate({ prompt, model, temperature, max_tokens }) {
            return this.chat({ messages: [{ role: 'user', content: prompt || '' }], model, temperature, max_tokens });
        },
        async summarize(args) { return openaiProvider.summarize.call(this, args); },
        async classify(args)  { return stubProvider.classify(args); },
        async extract(args)   { return stubProvider.extract(args); },
        async enrich(args)    { return stubProvider.enrich(args); },
        async embed(args)     { return stubProvider.embed(args); },
    };
}

// ── Local HTTP / custom seam (for self-hosted OpenAI-compatible APIs) ─────────
function _localHttpSeam() {
    const ENV_URL = 'OPENVIBE_AI_LOCAL_HTTP_URL';
    const http = require('http');
    const https = require('https');
    function _getUrl() { const v = process.env[ENV_URL]; return v && v.trim() ? v.trim().replace(/\/$/, '') : null; }
    function _post(baseUrl, body) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify(body);
            const url = new URL(baseUrl + '/v1/chat/completions');
            const mod = url.protocol === 'https:' ? https : http;
            const req = mod.request({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 30000 }, (res) => {
                const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); } });
            });
            req.on('error', reject); req.on('timeout', () => req.destroy(new Error('local_http timeout'))); req.write(payload); req.end();
        });
    }
    return {
        key: 'local_http',
        supports(f) { return ['chat', 'generate'].includes(f); },
        async chat({ messages, model, temperature, max_tokens }) {
            const baseUrl = _getUrl();
            if (!baseUrl) return { text: null, metadata: { stub: true, fallback_from: 'local_http', reason: 'OPENVIBE_AI_LOCAL_HTTP_URL not set' } };
            try {
                const result = await _post(baseUrl, { model: model || 'local', messages: messages || [], temperature: temperature != null ? temperature : 0.7, max_tokens: max_tokens || 1024 });
                const choice = result.choices && result.choices[0];
                return { text: choice && choice.message && choice.message.content || '', metadata: { model: result.model, provider: 'local_http' } };
            } catch (err) {
                return { text: null, metadata: { stub: true, fallback_from: 'local_http', reason: err.message } };
            }
        },
        async generate({ prompt, model, temperature, max_tokens }) { return this.chat({ messages: [{ role: 'user', content: prompt || '' }], model, temperature, max_tokens }); },
        async summarize(args) { return stubProvider.summarize(args); },
        async classify(args)  { return stubProvider.classify(args); },
        async extract(args)   { return stubProvider.extract(args); },
        async enrich(args)    { return stubProvider.enrich(args); },
        async embed(args)     { return stubProvider.embed(args); },
    };
}

register(stubProvider);
register(openaiProvider);
register(anthropicProvider);
register(ollamaProvider);
register(_openrouterSeam());
register(_localHttpSeam());
// 'gemini' and 'custom' are currently served by stub (no adapter yet)
register({ key: 'gemini',  supports: stubProvider.supports.bind(stubProvider), ...stubProvider, key: 'gemini'  });
register({ key: 'custom',  supports: stubProvider.supports.bind(stubProvider), ...stubProvider, key: 'custom'  });

module.exports = { register, get, has, list };

