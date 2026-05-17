'use strict';

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { AUDIO_FORMATS } = require('../audio/processor');
const audio = require('../audio/processor');
const fs = require('fs');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const ok = file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/');
        cb(null, ok);
    },
});

const processLimit = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

const router = express.Router();

// ── Upload & save to tmp ──────────────────────────────────────────
function saveTmp(buffer, origName) {
    const crypto = require('crypto');
    const path = require('path');
    const config = require('../config');
    const ext = path.extname(origName || '').slice(1) || 'bin';
    const outPath = path.join(config.tmpDir, `${crypto.randomBytes(12).toString('hex')}.${ext}`);
    fs.writeFileSync(outPath, buffer);
    return outPath;
}

// ── GET / — Audio hub landing (HTML) ────────────────────────────
router.get('/', (req, res) => {
    res.redirect('/audio/convert');
});

// ── API: Convert ─────────────────────────────────────────────────
router.post('/api/convert', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let inputPath = null;
    let outputPath = null;
    try {
        inputPath = saveTmp(req.file.buffer, req.file.originalname);
        const result = await audio.convert(inputPath, {
            format: req.body.format || 'mp3',
            bitrate: req.body.bitrate,
            sampleRate: req.body.sampleRate,
            channels: req.body.channels,
        });
        outputPath = result.outputPath;
        const outName = `converted.${result.ext}`;
        res.setHeader('Content-Type', result.mime);
        res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
        res.setHeader('X-Duration', String(result.duration));
        res.sendFile(outputPath, { root: '/' }, () => {
            audio.cleanTmp(inputPath);
            audio.cleanTmp(outputPath);
        });
    } catch (err) {
        audio.cleanTmp(inputPath);
        audio.cleanTmp(outputPath);
        res.status(500).json({ error: err.message });
    }
});

// ── API: Normalize ────────────────────────────────────────────────
router.post('/api/normalize', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let inputPath = null, outputPath = null;
    try {
        inputPath = saveTmp(req.file.buffer, req.file.originalname);
        const result = await audio.normalize(inputPath, {
            lufs: req.body.lufs,
            format: req.body.format || 'mp3',
        });
        outputPath = result.outputPath;
        res.setHeader('Content-Type', result.mime);
        res.setHeader('Content-Disposition', `attachment; filename="normalized.${result.ext}"`);
        res.sendFile(outputPath, { root: '/' }, () => {
            audio.cleanTmp(inputPath);
            audio.cleanTmp(outputPath);
        });
    } catch (err) {
        audio.cleanTmp(inputPath);
        audio.cleanTmp(outputPath);
        res.status(500).json({ error: err.message });
    }
});

// ── API: Trim ─────────────────────────────────────────────────────
router.post('/api/trim', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let inputPath = null, outputPath = null;
    try {
        inputPath = saveTmp(req.file.buffer, req.file.originalname);
        const result = await audio.trim(inputPath, {
            start: req.body.start,
            end: req.body.end,
            format: req.body.format || 'mp3',
        });
        outputPath = result.outputPath;
        res.setHeader('Content-Type', result.mime);
        res.setHeader('Content-Disposition', `attachment; filename="trimmed.${result.ext}"`);
        res.sendFile(outputPath, { root: '/' }, () => {
            audio.cleanTmp(inputPath);
            audio.cleanTmp(outputPath);
        });
    } catch (err) {
        audio.cleanTmp(inputPath);
        audio.cleanTmp(outputPath);
        res.status(500).json({ error: err.message });
    }
});

// ── API: Metadata ─────────────────────────────────────────────────
router.post('/api/metadata', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let inputPath = null;
    try {
        inputPath = saveTmp(req.file.buffer, req.file.originalname);
        const result = await audio.metadata(inputPath);
        res.json({ ok: true, metadata: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        audio.cleanTmp(inputPath);
    }
});

// ── API: Speed ────────────────────────────────────────────────────
router.post('/api/speed', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let inputPath = null, outputPath = null;
    try {
        inputPath = saveTmp(req.file.buffer, req.file.originalname);
        const result = await audio.speed(inputPath, {
            rate: req.body.rate,
            format: req.body.format || 'mp3',
        });
        outputPath = result.outputPath;
        res.setHeader('Content-Type', result.mime);
        res.setHeader('Content-Disposition', `attachment; filename="speed.${result.ext}"`);
        res.sendFile(outputPath, { root: '/' }, () => {
            audio.cleanTmp(inputPath);
            audio.cleanTmp(outputPath);
        });
    } catch (err) {
        audio.cleanTmp(inputPath);
        audio.cleanTmp(outputPath);
        res.status(500).json({ error: err.message });
    }
});

// ── API: Reverse ──────────────────────────────────────────────────
router.post('/api/reverse', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let inputPath = null, outputPath = null;
    try {
        inputPath = saveTmp(req.file.buffer, req.file.originalname);
        const result = await audio.reverse(inputPath, { format: req.body.format || 'mp3' });
        outputPath = result.outputPath;
        res.setHeader('Content-Type', result.mime);
        res.setHeader('Content-Disposition', `attachment; filename="reversed.${result.ext}"`);
        res.sendFile(outputPath, { root: '/' }, () => {
            audio.cleanTmp(inputPath);
            audio.cleanTmp(outputPath);
        });
    } catch (err) {
        audio.cleanTmp(inputPath);
        audio.cleanTmp(outputPath);
        res.status(500).json({ error: err.message });
    }
});

// ── API: Extract audio from video ─────────────────────────────────
router.post('/api/extract', processLimit, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let inputPath = null, outputPath = null;
    try {
        inputPath = saveTmp(req.file.buffer, req.file.originalname);
        const result = await audio.extractAudio(inputPath, { format: req.body.format || 'mp3' });
        outputPath = result.outputPath;
        res.setHeader('Content-Type', result.mime);
        res.setHeader('Content-Disposition', `attachment; filename="audio.${result.ext}"`);
        res.sendFile(outputPath, { root: '/' }, () => {
            audio.cleanTmp(inputPath);
            audio.cleanTmp(outputPath);
        });
    } catch (err) {
        audio.cleanTmp(inputPath);
        audio.cleanTmp(outputPath);
        res.status(500).json({ error: err.message });
    }
});

// ── API: Formats list ─────────────────────────────────────────────
router.get('/api/formats', (req, res) => {
    res.json({ formats: Object.keys(AUDIO_FORMATS) });
});

module.exports = router;
