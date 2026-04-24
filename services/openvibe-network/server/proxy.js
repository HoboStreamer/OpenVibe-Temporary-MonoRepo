'use strict';

// openvibe-network — transparent proxy to legacy hobo-tools UIs (admin,
// themes, my-account). Used by the host-router as a back-compat layer so
// the OpenVibe-branded subdomains keep working while the underlying UIs are
// being migrated.

const { Readable } = require('stream');

const HOP_HEADERS = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

function buildHoboToolsProxy(config) {
    const upstreamPublic = config.hoboTools.publicUrl || config.hoboTools.internalUrl;
    if (!upstreamPublic) {
        return (req, res) => res.status(503).json({
            error: 'legacy hobo-tools is not configured — set HOBO_TOOLS_URL / HOBO_TOOLS_INTERNAL_URL',
        });
    }
    const target = String(config.hoboTools.internalUrl || upstreamPublic).replace(/\/$/, '');

    return async function proxy(req, res) {
        const url = `${target}${req.originalUrl}`;
        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) {
            if (!HOP_HEADERS.has(k.toLowerCase())) headers[k] = v;
        }
        // Make sure the upstream sees the original host so its host-aware
        // routing (my.hobo.tools, login.hobo.tools, ...) still works.
        if (config.hoboTools.publicUrl) {
            try { headers['host'] = new URL(config.hoboTools.publicUrl).host; } catch { /* ignore */ }
        }
        headers['x-forwarded-host'] = req.headers.host || '';
        headers['x-forwarded-proto'] = (req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http'));
        headers['x-openvibe-proxied'] = '1';

        let body;
        if (!['GET', 'HEAD'].includes(req.method)) {
            // express.json() may already have parsed; re-serialize when present
            if (req.body && typeof req.body === 'object' && !(req.body instanceof Buffer)) {
                body = JSON.stringify(req.body);
                headers['content-type'] = headers['content-type'] || 'application/json';
            } else if (req.body) {
                body = req.body;
            }
        }

        let upstream;
        try {
            upstream = await fetch(url, { method: req.method, headers, body, redirect: 'manual' });
        } catch (err) {
            console.warn(`[Proxy→hobo-tools] ${req.method} ${url} failed: ${err.message}`);
            return res.status(502).json({ error: 'upstream hobo-tools unreachable', detail: err.message });
        }

        res.status(upstream.status);
        upstream.headers.forEach((value, key) => {
            if (!HOP_HEADERS.has(key.toLowerCase())) res.setHeader(key, value);
        });
        res.setHeader('x-openvibe-via', 'hobo-tools-proxy');

        if (!upstream.body) return res.end();
        Readable.fromWeb(upstream.body).pipe(res);
    };
}

module.exports = { buildHoboToolsProxy };
