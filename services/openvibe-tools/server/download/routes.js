'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const download = require('../download/processor');
const path = require('path');
const fs = require('fs');

const apiLimit = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

const router = express.Router();

// Validate URL is safe (http/https only, no private IPs)
function validateUrl(urlStr) {
    let u;
    try { u = new URL(urlStr); } catch (_) { return 'Invalid URL'; }
    if (!['http:', 'https:'].includes(u.protocol)) return 'Only http/https URLs are allowed';
    const host = u.hostname;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return 'Private/local URLs are not allowed';
    return null;
}

// ── API: Info (no download, just metadata) ────────────────────────
router.post('/api/info', apiLimit, express.json({ limit: '4kb' }), async (req, res) => {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const err = validateUrl(url);
    if (err) return res.status(400).json({ error: err });
    try {
        const info = await download.info(url);
        res.json({ ok: true, info });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── API: Download audio ────────────────────────────────────────────
router.post('/api/audio', apiLimit, express.json({ limit: '4kb' }), async (req, res) => {
    const { url, format, quality } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const err = validateUrl(url);
    if (err) return res.status(400).json({ error: err });

    let outputPath = null;
    try {
        const result = await download.downloadAudio(url, { format: format || 'mp3', quality });
        outputPath = result.outputPath;
        const basename = `download.${result.ext}`;
        res.setHeader('Content-Type', result.mime);
        res.setHeader('Content-Disposition', `attachment; filename="${basename}"`);
        res.sendFile(outputPath, { root: '/' }, () => {
            if (outputPath) fs.unlink(outputPath, () => {});
        });
    } catch (e) {
        if (outputPath) fs.unlink(outputPath, () => {});
        res.status(500).json({ error: e.message });
    }
});

// ── API: Download video ────────────────────────────────────────────
router.post('/api/video', apiLimit, express.json({ limit: '4kb' }), async (req, res) => {
    const { url, format } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const err = validateUrl(url);
    if (err) return res.status(400).json({ error: err });

    let outputPath = null;
    try {
        const result = await download.downloadVideo(url, { format });
        outputPath = result.outputPath;
        res.setHeader('Content-Type', result.mime);
        res.setHeader('Content-Disposition', `attachment; filename="download.${result.ext}"`);
        res.sendFile(outputPath, { root: '/' }, () => {
            if (outputPath) fs.unlink(outputPath, () => {});
        });
    } catch (e) {
        if (outputPath) fs.unlink(outputPath, () => {});
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
