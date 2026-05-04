'use strict';

// Minimal HTTP fetch helper for aggregating data from internal services.
const http  = require('http');
const https = require('https');

function fetchJson(url, opts) {
    return new Promise((resolve, reject) => {
        const parsed   = new URL(url);
        const isHttps  = parsed.protocol === 'https:';
        const options  = {
            hostname: parsed.hostname,
            port:     parsed.port || (isHttps ? 443 : 80),
            path:     parsed.pathname + (parsed.search || ''),
            method:   (opts && opts.method) || 'GET',
            headers:  Object.assign(
                { 'accept': 'application/json' },
                (opts && opts.headers) || {}
            ),
            timeout: (opts && opts.timeoutMs) || 5000,
        };
        const transport = isHttps ? https : http;
        const req = transport.request(options, (res) => {
            let body = '';
            res.on('data', (d) => { body += d; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { resolve({ _raw: body }); }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error(`timeout: ${url}`)); });
        req.on('error', reject);
        req.end();
    });
}

/**
 * Fetch a JSON endpoint from a service.
 * Returns `{ ok: false, error: string }` on failure so the dashboard can
 * show partial data rather than crashing.
 */
async function safeFetch(url, internalKey) {
    try {
        return await fetchJson(url, {
            headers: internalKey ? { 'x-internal-key': internalKey } : {},
        });
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

module.exports = { safeFetch };
