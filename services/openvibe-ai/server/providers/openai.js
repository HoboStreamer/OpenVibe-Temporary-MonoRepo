'use strict';

/**
 * OpenAI provider adapter for openvibe-ai.
 * Uses env var OPENVIBE_AI_OPENAI_KEY for the API key.
 * Falls back to stub output if key is missing or request fails.
 */

const https = require('https');

const ENV_KEY = 'OPENVIBE_AI_OPENAI_KEY';
const API_HOST = 'api.openai.com';
const DEFAULT_MODEL = 'gpt-4o-mini';

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
                'Authorization': `Bearer ${apiKey}`,
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
                        reject(Object.assign(new Error(json.error && json.error.message || `OpenAI HTTP ${res.statusCode}`), { status: res.statusCode, json }));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('OpenAI request timeout')); });
        req.write(payload);
        req.end();
    });
}

const openaiProvider = {
    key: 'openai',
    supports(feature) {
        return ['chat', 'generate', 'summarize', 'classify', 'extract', 'enrich', 'embed'].includes(feature);
    },

    async chat({ messages, model, temperature, max_tokens }) {
        const apiKey = _getKey();
        if (!apiKey) {
            return { text: null, metadata: { stub: true, fallback_from: 'openai', reason: 'no api key' } };
        }
        const result = await _post('/v1/chat/completions', {
            model: model || DEFAULT_MODEL,
            messages: messages || [],
            temperature: temperature != null ? temperature : 0.7,
            max_tokens: max_tokens || 1024,
        }, apiKey);
        const choice = result.choices && result.choices[0];
        return {
            text: choice && choice.message && choice.message.content || '',
            metadata: {
                model: result.model,
                usage: result.usage,
                finish_reason: choice && choice.finish_reason,
                provider: 'openai',
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
        const sysPrompt = instructions || 'Summarize the following content concisely. Return a 2-3 sentence summary followed by 3-5 bullet points. Respond in plain text with bullets prefixed by "- ".';
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
                { role: 'system', content: `Classify the input into exactly one of these categories: ${arr.join(', ')}. Respond with only the category name, nothing else.` },
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
            metadata: Object.assign({}, result.metadata, { feature: 'classify', raw_label: label }),
        };
    },

    async extract({ input, schema, model }) {
        const fields = schema && (schema.properties ? Object.keys(schema.properties) : Object.keys(schema)) || [];
        const result = await this.chat({
            messages: [
                { role: 'system', content: `Extract the following fields from the input and return a JSON object: ${fields.join(', ')}. Respond with valid JSON only.` },
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

    async embed({ input, model }) {
        const apiKey = _getKey();
        if (!apiKey) {
            return { embedding: [], dimensions: 0, metadata: { stub: true, fallback_from: 'openai', reason: 'no api key' } };
        }
        const result = await _post('/v1/embeddings', {
            model: model || 'text-embedding-3-small',
            input: String(input || ''),
        }, apiKey);
        const embedding = result.data && result.data[0] && result.data[0].embedding || [];
        return {
            embedding,
            dimensions: embedding.length,
            metadata: { model: result.model, usage: result.usage, provider: 'openai' },
        };
    },
};

module.exports = { openaiProvider };
