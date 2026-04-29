'use strict';

const { jsonRequest } = require('./http');

class UserModulesClient {
    constructor(opts) {
        if (!opts || !opts.networkUrl) throw new Error('UserModulesClient: networkUrl required');
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

    get(userId, namespace, opts) {
        return jsonRequest(this._u(`/api/v1/user-modules/${encodeURIComponent(userId)}/${encodeURIComponent(namespace)}`), this._opts(opts));
    }

    getPublic(userId, namespace, opts) {
        return jsonRequest(this._u(`/api/v1/user-modules/${encodeURIComponent(userId)}/${encodeURIComponent(namespace)}/public`), this._opts(opts));
    }

    put(userId, namespace, body, opts) {
        return jsonRequest(this._u(`/api/v1/user-modules/${encodeURIComponent(userId)}/${encodeURIComponent(namespace)}`), this._opts({ method: 'PUT', body: body || {}, ...(opts || {}) }));
    }

    patch(userId, namespace, body, opts) {
        return jsonRequest(this._u(`/api/v1/user-modules/${encodeURIComponent(userId)}/${encodeURIComponent(namespace)}`), this._opts({ method: 'PATCH', body: body || {}, ...(opts || {}) }));
    }

    list(userId, opts) {
        return jsonRequest(this._u(`/api/v1/user-modules/${encodeURIComponent(userId)}`), this._opts(opts));
    }

    batch(userId, namespaces, opts) {
        return jsonRequest(this._u(`/api/v1/user-modules/${encodeURIComponent(userId)}/batch`), this._opts({ method: 'POST', body: { namespaces: namespaces || [] }, ...(opts || {}) }));
    }

    history(userId, namespace, opts) {
        return jsonRequest(this._u(`/api/v1/user-modules/${encodeURIComponent(userId)}/${encodeURIComponent(namespace)}/history`), this._opts(opts));
    }
}

module.exports = { UserModulesClient };
