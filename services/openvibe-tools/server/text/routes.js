'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const text = require('../text/processor');

const apiLimit = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const router = express.Router();

function bodyText(req) {
    const t = req.body && typeof req.body.text === 'string' ? req.body.text : '';
    if (t.length > 500_000) throw new Error('Text too large (max 500 KB)');
    return t;
}

// ── API: Analyze ──────────────────────────────────────────────────
router.post('/api/analyze', apiLimit, express.json({ limit: '512kb' }), (req, res) => {
    try {
        const t = bodyText(req);
        res.json({ ok: true, stats: text.analyze(t) });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── API: Case transform ───────────────────────────────────────────
router.post('/api/case', apiLimit, express.json({ limit: '512kb' }), (req, res) => {
    try {
        const t = bodyText(req);
        const mode = String(req.body.mode || 'upper');
        res.json({ ok: true, result: text.transformCase(t, mode) });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── API: Encode/decode ────────────────────────────────────────────
router.post('/api/encode', apiLimit, express.json({ limit: '512kb' }), (req, res) => {
    try {
        const t = bodyText(req);
        const format = String(req.body.format || 'base64');
        const direction = req.body.direction === 'decode' ? 'decode' : 'encode';
        res.json({ ok: true, result: text.encode(t, format, direction) });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── API: Find & replace ───────────────────────────────────────────
router.post('/api/replace', apiLimit, express.json({ limit: '512kb' }), (req, res) => {
    try {
        const t = bodyText(req);
        const result = text.findReplace(t, req.body.find || '', req.body.replace || '', {
            regex: !!req.body.regex,
            caseInsensitive: !!req.body.caseInsensitive,
        });
        res.json({ ok: true, result });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── API: Sort lines ───────────────────────────────────────────────
router.post('/api/sort', apiLimit, express.json({ limit: '512kb' }), (req, res) => {
    try {
        const t = bodyText(req);
        const result = text.sortLines(t, {
            reverse: !!req.body.reverse,
            caseInsensitive: !!req.body.caseInsensitive,
            numeric: !!req.body.numeric,
            unique: !!req.body.unique,
        });
        res.json({ ok: true, result });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── API: Deduplicate lines ────────────────────────────────────────
router.post('/api/dedupe', apiLimit, express.json({ limit: '512kb' }), (req, res) => {
    try {
        const t = bodyText(req);
        const result = text.dedupe(t, { caseInsensitive: !!req.body.caseInsensitive });
        res.json({ ok: true, result });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
