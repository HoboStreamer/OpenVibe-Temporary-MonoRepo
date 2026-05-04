'use strict';

// openvibe-api — proxy helper. Forwards an incoming Express request to a
// downstream service URL and pipes the response back.
//
// Security notes:
//   - Hop-by-hop headers (connection, keep-alive, transfer-encoding) are
//     stripped from both the forwarded request and the response.
//   - The X-Internal-Key header is stripped from incoming requests before
//     forwarding to prevent external callers from impersonating internal
//     service traffic.
//   - Authorization headers ARE forwarded so downstream services can verify
//     the end-user's JWT.

const http  = require('http');
const https = require('https');

const HOP_BY_HOP = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

// Headers an external caller must not be able to inject
const STRIP_INCOMING = new Set(['x-internal-key', 'x-forwarded-for', 'x-real-ip']);

function proxyRequest(req, res, targetBaseUrl, opts) {
    const options = opts || {};
    const suffix  = options.pathSuffix !== undefined ? options.pathSuffix : req.originalUrl;
    const target  = `${targetBaseUrl}${suffix}`;

    let targetUrl;
    try { targetUrl = new URL(target); } catch {
        return res.status(502).json({ error: 'invalid proxy target URL', target });
    }

    const isHttps  = targetUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const outHeaders = {};
    for (const [k, v] of Object.entries(req.headers || {})) {
        const lower = k.toLowerCase();
        if (!HOP_BY_HOP.has(lower) && !STRIP_INCOMING.has(lower)) {
            outHeaders[lower] = v;
        }
    }

    // Forward the real IP from the gateway
    outHeaders['x-forwarded-for'] = req.ip || req.socket.remoteAddress || 'unknown';
    outHeaders['x-forwarded-host'] = req.hostname;
    outHeaders['x-forwarded-proto'] = req.protocol;
    outHeaders['x-gateway'] = 'openvibe-api';

    const proxyOpts = {
        hostname: targetUrl.hostname,
        port:     targetUrl.port || (isHttps ? 443 : 80),
        path:     targetUrl.pathname + (targetUrl.search || ''),
        method:   req.method,
        headers:  outHeaders,
        timeout:  (options.timeoutMs || 15000),
    };

    const proxyReq = transport.request(proxyOpts, (proxyRes) => {
        const statusCode = proxyRes.statusCode || 502;

        const responseHeaders = {};
        for (const [k, v] of Object.entries(proxyRes.headers || {})) {
            const lower = k.toLowerCase();
            if (!HOP_BY_HOP.has(lower)) responseHeaders[lower] = v;
        }
        responseHeaders['x-served-by'] = 'openvibe-api';

        res.writeHead(statusCode, responseHeaders);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) res.status(504).json({ error: 'upstream timeout' });
    });

    proxyReq.on('error', (err) => {
        console.error(`[openvibe-api] proxy error to ${target}: ${err.message}`);
        if (!res.headersSent) res.status(502).json({ error: 'upstream unavailable', service: targetBaseUrl });
    });

    if (req.body && typeof req.body === 'object') {
        const bodyStr = JSON.stringify(req.body);
        proxyReq.setHeader('content-length', Buffer.byteLength(bodyStr));
        proxyReq.setHeader('content-type', 'application/json');
        proxyReq.write(bodyStr);
        proxyReq.end();
    } else {
        req.pipe(proxyReq, { end: true });
    }
}

module.exports = { proxyRequest };
