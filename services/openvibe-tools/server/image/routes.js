'use strict';

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const image = require('../image/processor');
const { IMAGE_FORMATS } = require('../image/processor');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        cb(null, file.mimetype.startsWith('image/'));
    },
});

const processLimit = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

const router = express.Router();

function sendBuffer(res, result, basename) {
    res.setHeader('Content-Type', result.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${basename}.${result.ext}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.send(result.buffer);
}

// ── API: Convert ──────────────────────────────────────────────────
router.post('/api/convert', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const result = await image.convert(req.file.buffer, {
            format: req.body.format || 'png',
            quality: req.body.quality,
        });
        sendBuffer(res, result, 'converted');
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API: Resize ───────────────────────────────────────────────────
router.post('/api/resize', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const result = await image.resize(req.file.buffer, {
            width: req.body.width,
            height: req.body.height,
            fit: req.body.fit,
            format: req.body.format,
            quality: req.body.quality,
            noUpscale: req.body.noUpscale !== 'false',
        });
        sendBuffer(res, result, 'resized');
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API: Compress ─────────────────────────────────────────────────
router.post('/api/compress', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const result = await image.compress(req.file.buffer, {
            quality: req.body.quality,
            format: req.body.format,
        });
        sendBuffer(res, result, 'compressed');
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API: Crop ─────────────────────────────────────────────────────
router.post('/api/crop', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const result = await image.crop(req.file.buffer, {
            left: req.body.left,
            top: req.body.top,
            width: req.body.width,
            height: req.body.height,
            format: req.body.format,
            quality: req.body.quality,
        });
        sendBuffer(res, result, 'cropped');
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API: Metadata ──────────────────────────────────────────────────
router.post('/api/metadata', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const result = await image.imageMetadata(req.file.buffer);
        res.json({ ok: true, metadata: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API: Formats ──────────────────────────────────────────────────
router.get('/api/formats', (req, res) => {
    res.json({ formats: Object.keys(IMAGE_FORMATS) });
});

module.exports = router;
