'use strict';

// OpenVibe — thin client for the network service registries. Resolves URLs
// for sister services and registers/queries the service+capability+contract
// rows. Used by every other OpenVibe service at boot.

const { jsonRequest } = require('./http');

class RegistryClient {
    /**
     * @param {object} opts
     * @param {string} opts.networkUrl    Public URL of openvibe-network (e.g. http://127.0.0.1:4100)
     * @param {string} [opts.internalKey] X-Internal-Key for write operations
     */
    constructor(opts) {
        if (!opts || !opts.networkUrl) throw new Error('RegistryClient: networkUrl required');
        this.networkUrl = String(opts.networkUrl).replace(/\/$/, '');
        this.internalKey = opts.internalKey || null;
    }

    _u(p) { return `${this.networkUrl}${p}`; }

    // ── service registry ───────────────────────────────────────
    listServices() {
        return jsonRequest(this._u('/api/v1/services'));
    }
    getService(id) {
        return jsonRequest(this._u(`/api/v1/services/${encodeURIComponent(id)}`));
    }
    registerService(record) {
        return jsonRequest(this._u('/api/v1/services'), {
            method: 'POST', internalKey: this.internalKey, body: record,
        });
    }
    heartbeat(id) {
        return jsonRequest(this._u(`/api/v1/services/${encodeURIComponent(id)}/heartbeat`), {
            method: 'POST', internalKey: this.internalKey, body: {},
        });
    }

    // ── capability registry ────────────────────────────────────
    listCapabilities() {
        return jsonRequest(this._u('/api/v1/capabilities'));
    }
    registerCapability(record) {
        return jsonRequest(this._u('/api/v1/capabilities'), {
            method: 'POST', internalKey: this.internalKey, body: record,
        });
    }

    // ── contract registry ──────────────────────────────────────
    listContracts() {
        return jsonRequest(this._u('/api/v1/contracts'));
    }
    registerContract(record) {
        return jsonRequest(this._u('/api/v1/contracts'), {
            method: 'POST', internalKey: this.internalKey, body: record,
        });
    }

    // ── url registry (legacy hobo + openvibe overlay) ──────────
    resolvedUrls() {
        return jsonRequest(this._u('/api/v1/url-registry/resolved'));
    }
}

module.exports = { RegistryClient };
