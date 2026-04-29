'use strict';

const { jsonRequest } = require('./http');

class CapabilitiesClient {
    constructor(opts) {
        if (!opts || !opts.networkUrl) throw new Error('CapabilitiesClient: networkUrl required');
        this.networkUrl = String(opts.networkUrl).replace(/\/$/, '');
        this.internalKey = opts.internalKey || null;
        this.token = opts.token || null;
    }

    _u(path) { return `${this.networkUrl}${path}`; }
    _opts(overrides) {
        const next = overrides || {};
        return Object.assign({}, next, {
            internalKey: next.internalKey || this.internalKey || null,
            token: next.token || this.token || null,
        });
    }

    list(query, opts) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/v1/capabilities${qs ? `?${qs}` : ''}`), this._opts(opts));
    }

    get(capabilityId, query, opts) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/v1/capabilities/${encodeURIComponent(capabilityId)}${qs ? `?${qs}` : ''}`), this._opts(opts));
    }

    register(record, opts) {
        return jsonRequest(this._u('/api/v1/capabilities'), this._opts({ method: 'POST', body: record, ...(opts || {}) }));
    }

    validate(capabilityId, body, opts) {
        return jsonRequest(this._u(`/api/v1/capabilities/${encodeURIComponent(capabilityId)}/validate`), this._opts({ method: 'POST', body: body || {}, ...(opts || {}) }));
    }

    invoke(capabilityId, body, opts) {
        return jsonRequest(this._u(`/api/v1/capabilities/${encodeURIComponent(capabilityId)}/invoke`), this._opts({ method: 'POST', body: body || {}, ...(opts || {}) }));
    }

    getInvocation(invocationId, opts) {
        return jsonRequest(this._u(`/api/v1/capability-invocations/${encodeURIComponent(invocationId)}`), this._opts(opts));
    }
}

module.exports = { CapabilitiesClient };
