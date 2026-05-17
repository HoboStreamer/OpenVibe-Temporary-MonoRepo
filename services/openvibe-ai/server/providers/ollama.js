'use strict';

/**
 * Ollama local provider adapter for openvibe-ai.
 * Calls a local Ollama instance (default http://127.0.0.1:11434).
 * Env: OPENVIBE_AI_OLLAMA_URL to override base URL.
 *      OPENVIBE_AI_OLLAMA_MODEL to set default model (default: llama3).
 * Falls back gracefully if Ollama is unreachable.
 */

const http = require('http');
const https = require('https');

function _getBaseUrl() {
    const v = process.env.OPENVIBE_AI_OLLAMA_URL;
    return v && v.trim() ? v.trim().replace(/\/$/, '') : 'http://127.0.0.1:11434';
}

function _getDefaultModel() {
    const v = process.env.OPENVIBE_AI_OLLAMA_MODEL;
    return v && v.trim() ? v.trim() : 'llama3';
}

function _post(baseUrl, path, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const url = new URL(baseUrl + path);
        const mod = url.protocol === 'https:' ? https : http;
        const req = mod.request({
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + (url.search || ''),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 60000,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                try {
                    const json = JSON.parse(Buffer.concat(chunks).toString());
                    if (res.statusCode >= 400) {
                        reject(Object.assign(new Error(`Ollama HTTP ${res.statusCode}`), { status: res.statusCode, json }));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('Ollama request timeout')); });
        req.write(payload);
        req.end();
    });
}

const ollamaProvider = {
    key: 'ollama',
    supports(feature) {
        return ['chat', 'generate', 'summarize', 'classify', 'extract', 'enrich', 'embed'].includes(feature);
    },

    async chat({ messages, model, temperature, max_tokens }) {
        const baseUrl = _getBaseUrl();
        const chosenModel = model || _getDefaultModel();
        let result;
        try {
            result = await _post(baseUrl, '/api/chat', {
                model: chosenModel,
                messages: messages || [],
                stream: false,
                options: {
                    temperature: temperature != null ? temperature : 0.7,
                    num_predict: max_tokens || 1024,
                },
            });
        } catch (err) {
            return { text: null, metadata: { stub: true, fallback_from: 'ollama', reason: err.message, provider: 'ollama' } };
        }
        return {
            text: result.message && result.message.content || '',
            metadata: {
                model: result.model,
                done: result.done,
                provider: 'ollama',
                eval_count: result.eval_count,
            },
        };
    },

    async generate({ prompt, model, temperature, max_tokens }) {
        const baseUrl = _getBaseUrl();
        const chosenModel = model || _getDefaultModel();
        let result;
        try {
            result = await _post(baseUrl, '/api/generate', {
                model: chosenModel,
                prompt: prompt || '',
                stream: false,
                options: {
                    temperature: temperature != null ? temperature : 0.7,
                    num_predict: max_tokens || 1024,
                },
            });
        } catch (err) {
            return { text: null, metadata: { stub: true, fallback_from: 'ollama', reason: err.message } };
        }
        return {
            text: result.response || '',
            metadata: { model: result.model, done: result.done, provider: 'ollama' },
        };
    },

    async summarize({ text, instructions, model }) {
        const prompt = `${instructions || 'Summarize the following concisely in 2-3 sentences, then give 3-5 bullet points prefixed by "- ".'}\n\n${String(text || '')}`;
        const result = await this.generate({ prompt, model, temperature: 0.3 });
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
        const result = await this.generate({
            prompt: `Classify this into one of [${arr.join(', ')}]. Reply with only the category name.\n\n${String(input || '')}`,
            model,
            temperature: 0,
            max_tokens: 24,
        });
        const label = (result.text || '').trim().replace(/['"]/g, '');
        const matched = arr.find((l) => l.toLowerCase() === label.toLowerCase()) || arr[0];
        return {
            label: matched,
            confidence: 0.8,
            scores: arr.map((l) => ({ label: l, score: l === matched ? 0.8 : 0.05 })),
            metadata: Object.assign({}, result.metadata, { feature: 'classify' }),
        };
    },

    async extract({ input, schema, model }) {
        const fields = schema && (schema.properties ? Object.keys(schema.properties) : Object.keys(schema)) || [];
        const result = await this.generate({
            prompt: `Extract these fields from the input and respond with valid JSON only: ${fields.join(', ')}.\n\nInput:\n${String(input || '')}`,
            model,
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
        const baseUrl = _getBaseUrl();
        const chosenModel = model || 'nomic-embed-text';
        let result;
        try {
            result = await _post(baseUrl, '/api/embeddings', {
                model: chosenModel,
                prompt: String(input || ''),
            });
        } catch (err) {
            return { embedding: [], dimensions: 0, metadata: { stub: true, fallback_from: 'ollama', reason: err.message } };
        }
        const embedding = result.embedding || [];
        return {
            embedding,
            dimensions: embedding.length,
            metadata: { model: chosenModel, provider: 'ollama' },
        };
    },
};

module.exports = { ollamaProvider };
