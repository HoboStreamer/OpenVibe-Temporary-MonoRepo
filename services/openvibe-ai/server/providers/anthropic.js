'use strict';

/**
 * Anthropic (Claude) provider adapter for openvibe-ai.
 * Uses env var OPENVIBE_AI_ANTHROPIC_KEY for the API key.
 * Falls back gracefully if key is missing.
 */

const https = require('https');

const ENV_KEY = 'OPENVIBE_AI_ANTHROPIC_KEY';
const API_HOST = 'api.anthropic.com';
const DEFAULT_MODEL = 'claude-3-5-haiku-20241022';
const API_VERSION = '2023-06-01';

function _getKey() {
    const v = process.env[ENV_KEY];
    return v && v.trim() ? v.trim() : null;
}

function _post(path, body, apiKey) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = https.request({
            hostname: API_HOST,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': API_VERSION,
                'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 30000,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                try {
                    const json = JSON.parse(Buffer.concat(chunks).toString());
                    if (res.statusCode >= 400) {
                        reject(Object.assign(new Error(json.error && json.error.message || `Anthropic HTTP ${res.statusCode}`), { status: res.statusCode, json }));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('Anthropic request timeout')); });
        req.write(payload);
        req.end();
    });
}

function _toAnthropicMessages(messages) {
    // Separate system prompt from the user/assistant turns
    const system = (messages || []).filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const turns  = (messages || []).filter((m) => m.role !== 'system');
    return { system: system || undefined, messages: turns };
}

const anthropicProvider = {
    key: 'anthropic',
    supports(feature) {
        return ['chat', 'generate', 'summarize', 'classify', 'extract', 'enrich'].includes(feature);
    },

    async chat({ messages, model, temperature, max_tokens }) {
        const apiKey = _getKey();
        if (!apiKey) {
            return { text: null, metadata: { stub: true, fallback_from: 'anthropic', reason: 'no api key' } };
        }
        const { system, messages: turns } = _toAnthropicMessages(messages);
        const body = {
            model: model || DEFAULT_MODEL,
            max_tokens: max_tokens || 1024,
            messages: turns,
        };
        if (system) body.system = system;
        if (temperature != null) body.temperature = temperature;
        const result = await _post('/v1/messages', body, apiKey);
        const content = result.content && result.content[0];
        return {
            text: content && content.text || '',
            metadata: {
                model: result.model,
                usage: result.usage,
                stop_reason: result.stop_reason,
                provider: 'anthropic',
            },
        };
    },

    async generate({ prompt, model, temperature, max_tokens }) {
        return this.chat({
            messages: [{ role: 'user', content: prompt || '' }],
            model,
            temperature,
            max_tokens,
        });
    },

    async summarize({ text, instructions, model }) {
        const sysPrompt = instructions || 'Summarize the following content concisely. Return a 2-3 sentence summary followed by 3-5 bullet points prefixed by "- ".';
        const result = await this.chat({
            messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: String(text || '') }],
            model: model || DEFAULT_MODEL,
            temperature: 0.3,
        });
        const raw = result.text || '';
        const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
        const bullets = lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
        const summary = lines.filter((l) => !l.startsWith('- ')).join(' ');
        return {
            summary: summary || raw.slice(0, 280),
            bullets,
            metadata: Object.assign({}, result.metadata, { feature: 'summarize' }),
        };
    },

    async classify({ input, labels, model }) {
        const arr = Array.isArray(labels) && labels.length ? labels : ['unknown'];
        const result = await this.chat({
            messages: [
                { role: 'system', content: `Classify the input into exactly one of these categories: ${arr.join(', ')}. Respond with only the category name.` },
                { role: 'user', content: String(input || '') },
            ],
            model: model || DEFAULT_MODEL,
            temperature: 0,
            max_tokens: 32,
        });
        const label = (result.text || '').trim().replace(/['"]/g, '');
        const matched = arr.find((l) => l.toLowerCase() === label.toLowerCase()) || arr[0];
        return {
            label: matched,
            confidence: 0.9,
            scores: arr.map((l) => ({ label: l, score: l === matched ? 0.9 : 0.01 })),
            metadata: Object.assign({}, result.metadata, { feature: 'classify' }),
        };
    },

    async extract({ input, schema, model }) {
        const fields = schema && (schema.properties ? Object.keys(schema.properties) : Object.keys(schema)) || [];
        const result = await this.chat({
            messages: [
                { role: 'system', content: `Extract these fields from the input and return valid JSON only: ${fields.join(', ')}.` },
                { role: 'user', content: String(input || '') },
            ],
            model: model || DEFAULT_MODEL,
            temperature: 0,
            max_tokens: 512,
        });
        let data = {};
        try { data = JSON.parse(result.text || '{}'); } catch { /* best-effort */ }
        return { data, metadata: Object.assign({}, result.metadata, { feature: 'extract' }) };
    },

    async enrich({ input, schema, model }) {
        return this.extract({ input, schema, model });
    },
};

module.exports = { anthropicProvider };
