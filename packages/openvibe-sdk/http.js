'use strict';

// OpenVibe — small JSON-over-HTTP helper. Every SDK client routes through
// this so we have one place to add tracing, retry, or transport swaps later.

async function jsonRequest(url, opts) {
    const o = opts || {};
    const headers = Object.assign(
        { 'Accept': 'application/json' },
        o.body ? { 'Content-Type': 'application/json' } : {},
        o.headers || {}
    );
    if (o.internalKey) headers['X-Internal-Key'] = o.internalKey;
    if (o.token) headers['Authorization'] = `Bearer ${o.token}`;

    let res;
    try {
        res = await fetch(url, {
            method: o.method || 'GET',
            headers,
            body: o.body ? JSON.stringify(o.body) : undefined,
        });
    } catch (err) {
        const e = new Error(`network error calling ${url}: ${err.message}`);
        e.cause = err;
        e.code = 'ENETWORK';
        throw e;
    }

    const text = await res.text();
    let body = null;
    if (text) {
        try { body = JSON.parse(text); }
        catch { body = text; }
    }

    if (!res.ok) {
        const err = new Error(
            `HTTP ${res.status} from ${url}: ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body || {}).slice(0, 200)}`
        );
        err.status = res.status;
        err.body = body;
        throw err;
    }

    return body;
}

module.exports = { jsonRequest };
