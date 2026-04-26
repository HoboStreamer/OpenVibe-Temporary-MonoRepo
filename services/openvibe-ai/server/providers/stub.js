'use strict';

// openvibe-ai — deterministic stub provider. Works locally with NO external
// API keys. Used for tests, local development, and demos. Outputs are
// clearly labeled as `stub: true` in metadata.

const crypto = require('crypto');

function _hash(s) {
    return crypto.createHash('sha256').update(String(s || '')).digest('hex').slice(0, 16);
}
function _excerpt(s, n) {
    s = String(s || '');
    if (s.length <= n) return s;
    return s.slice(0, n - 1).trimEnd() + '…';
}
function _sentences(s, count) {
    const parts = String(s || '').split(/(?<=[.!?])\s+/).filter(Boolean);
    return parts.slice(0, count).join(' ') || _excerpt(s, 120);
}

const stubProvider = {
    key: 'stub',
    supports(feature) {
        return ['chat', 'generate', 'summarize', 'classify', 'extract', 'enrich', 'embed', 'json'].includes(feature);
    },
    async chat({ messages }) {
        const last = (messages || []).slice().reverse().find(m => m && m.role !== 'system') || { content: '' };
        const hash = _hash(JSON.stringify(messages || []));
        return {
            text: `[stub-chat ${hash}] You said: ${_excerpt(last.content || '', 240)}`,
            metadata: { stub: true, hash },
        };
    },
    async generate({ prompt }) {
        const hash = _hash(prompt);
        return {
            text: `[stub-generate ${hash}] ${_excerpt(prompt, 280)}`,
            metadata: { stub: true, hash },
        };
    },
    async summarize({ text, sources }) {
        const hash = _hash(text);
        return {
            summary: `[stub-summary ${hash}] ${_sentences(text, 2)}`,
            bullets: _sentences(text, 4).split(/(?<=[.!?])\s+/).slice(0, 4).map(s => s.trim()).filter(Boolean),
            sources: Array.isArray(sources) ? sources.map(s => ({ url: s.url || null, title: s.title || null })) : [],
            metadata: { stub: true, hash },
        };
    },
    async classify({ input, labels }) {
        const arr = Array.isArray(labels) && labels.length ? labels : ['unknown'];
        // deterministic pick: hash mod label count
        const idx = Math.abs(parseInt(_hash(input).slice(0, 6), 16)) % arr.length;
        return {
            label: arr[idx],
            confidence: 0.5,
            scores: arr.map((l, i) => ({ label: l, score: i === idx ? 0.5 : 0.1 })),
            metadata: { stub: true },
        };
    },
    async extract({ input, schema }) {
        const fields = schema && Object.keys(schema.properties || schema || {}) || [];
        const out = {};
        for (const f of fields) out[f] = `[stub:${f}]`;
        return { data: out, metadata: { stub: true, fields } };
    },
    async enrich({ input, schema }) {
        return this.extract({ input, schema });
    },
    async embed({ input }) {
        // deterministic toy 8-dim "embedding" derived from hash bytes
        const h = crypto.createHash('sha256').update(String(input || '')).digest();
        const v = [];
        for (let i = 0; i < 8; i++) v.push((h[i] - 128) / 128);
        return { embedding: v, dimensions: 8, metadata: { stub: true } };
    },
};

module.exports = { stubProvider };
