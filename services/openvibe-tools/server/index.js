'use strict';

// ═══════════════════════════════════════════════════════════════
// OpenVibe Tools Service — Port 5700
// Audio, image, text, and download processing utility hub.
// ═══════════════════════════════════════════════════════════════

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { createServiceRuntime } = require('@openvibe/runtime');
const { attachIconAssets } = require('@openvibe/icons/express');

const config = require('./config');
const retention = require('./retention');
const audioRoutes = require('./audio/routes');
const imageRoutes = require('./image/routes');
const downloadRoutes = require('./download/routes');
const textRoutes = require('./text/routes');

const app = express();

// ── Trusted proxy (Cloudflare → nginx → node) ───────────────────
app.set('trust proxy', 2);

// ── Helmet ───────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS ─────────────────────────────────────────────────────────
const allowedOrigins = [
    'https://openvibe.tools',
    'https://openvibe.network',
    'https://openvibe.live',
    ...(config.nodeEnv === 'development' ? ['http://localhost:3000', 'http://localhost:5700'] : []),
];
app.use(cors({
    origin(origin, cb) {
        if (!origin || allowedOrigins.some(o => origin === o || origin.endsWith('.openvibe.network'))) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    },
    credentials: false,
}));

// ── Static files ──────────────────────────────────────────────────
const publicDir = path.resolve(__dirname, '..', 'public');
attachIconAssets(app);
app.use(express.static(publicDir, { extensions: ['html'] }));

// ── Feature routes ────────────────────────────────────────────────
app.use('/audio', audioRoutes);
app.use('/image', imageRoutes);
app.use('/download', downloadRoutes);
app.use('/text', textRoutes);

// ── finditfixit proxy ─────────────────────────────────────────────
// Forwards requests to the local Python proxy (finditfixits-proxy.py on :7779)
// so the browser never has to call localhost directly.
const http = require('http');
function proxyToFinditfixit(path, res) {
    const opts = { hostname: '127.0.0.1', port: 7779, path, method: 'GET', headers: { 'User-Agent': 'openvibe-tools/1.0' } };
    const req2 = http.request(opts, (r2) => {
        let body = '';
        r2.on('data', (c) => { body += c; });
        r2.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            res.status(r2.statusCode || 200).send(body);
        });
    });
    req2.on('error', () => res.status(502).json({ error: 'proxy offline — run finditfixits-proxy.py' }));
    req2.setTimeout(15000, () => { req2.destroy(); res.status(504).json({ error: 'proxy timeout' }); });
    req2.end();
}
app.get('/api/finditfixit/deals',  (_req, res) => proxyToFinditfixit('/', res));
app.get('/api/finditfixit/findit', (req, res) => {
    const q = req.query.q ? '?q=' + encodeURIComponent(req.query.q) : '';
    proxyToFinditfixit('/findit' + q, res);
});
app.get('/api/finditfixit/status', (req, res) => {
    const lo = req.query.last_online ? '?last_online=' + encodeURIComponent(req.query.last_online) : '';
    proxyToFinditfixit('/status' + lo, res);
});

// ── Runtime health/metrics/ready endpoints ────────────────────────
const runtime = createServiceRuntime({
    name: 'openvibe-tools',
    version: process.env.npm_package_version || '0.1.0',
});
runtime.attach(app);

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.status(404).send('<h1>404 Not Found</h1>');
});

// ── Error handler ─────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('[tools] error:', err.message);
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Internal error' });
    res.status(500).send('<h1>500 Internal Server Error</h1>');
});

// ── Start ─────────────────────────────────────────────────────────
const server = app.listen(config.port, config.host, () => {
    retention.start();
    console.log(`[tools] OpenVibe Tools running on http://${config.host}:${config.port}`);
});

process.on('SIGTERM', () => {
    retention.stop();
    server.close(() => process.exit(0));
});

module.exports = app;
