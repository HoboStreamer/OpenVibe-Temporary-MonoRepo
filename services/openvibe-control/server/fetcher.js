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
        if (opts && opts.body) {
            req.write(opts.body);
        }
        req.end();
    });
}

/**
 * Fetch a JSON endpoint from a service.
 * Returns `{ ok: false, error: string }` on failure so the dashboard can
 * show partial data rather than crashing.
 *
 * opts.method   — HTTP method (default 'GET')
 * opts.body     — JSON string body (sets Content-Type automatically)
 * opts.userId   — forwarded as x-forwarded-user header (for admin impersonation)
 * opts.role     — forwarded as x-forwarded-role header
 */
async function safeFetch(url, internalKey, opts) {
    try {
        const headers = { accept: 'application/json' };
        if (internalKey) headers['x-internal-key'] = internalKey;
        if (opts && opts.body) headers['content-type'] = 'application/json';
        if (opts && opts.userId) headers['x-forwarded-user'] = String(opts.userId);
        if (opts && opts.role)   headers['x-forwarded-role']  = String(opts.role);

        return await fetchJson(url, {
            method:  opts && opts.method || 'GET',
            headers,
            body:    opts && opts.body || undefined,
        });
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

module.exports = { safeFetch };
