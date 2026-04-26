'use strict';

// OpenVibe — stream-lifecycle client. Wraps the openre-stream HTTP API for
// callers that need to register/start/end streams or list mirror state.
// openvibe-live also calls this to register canonical channel/stream pages
// and to read mirror status.

const { jsonRequest } = require('./http');

class StreamClient {
    constructor(opts) {
        if (!opts || !opts.streamUrl) throw new Error('StreamClient: streamUrl required');
        this.streamUrl = String(opts.streamUrl).replace(/\/$/, '');
        this.internalKey = opts.internalKey || null;
        this.callerService = opts.service || null;
    }

    _u(p) { return `${this.streamUrl}${p}`; }
    _hdrs() {
        const h = {};
        if (this.callerService) h['X-OpenVibe-Service'] = this.callerService;
        return h;
    }

    registerChannel(body) {
        return jsonRequest(this._u('/api/v1/channels'), {
            method: 'POST', internalKey: this.internalKey, headers: this._hdrs(), body,
        });
    }

    startStream(body) {
        return jsonRequest(this._u('/api/v1/streams'), {
            method: 'POST', internalKey: this.internalKey, headers: this._hdrs(), body,
        });
    }

    ingestConnected(streamId, body) {
        return jsonRequest(this._u(`/api/v1/streams/${encodeURIComponent(streamId)}/ingest/connected`), {
            method: 'POST', internalKey: this.internalKey, headers: this._hdrs(), body: body || {},
        });
    }

    ingestDisconnected(streamId, body) {
        return jsonRequest(this._u(`/api/v1/streams/${encodeURIComponent(streamId)}/ingest/disconnected`), {
            method: 'POST', internalKey: this.internalKey, headers: this._hdrs(), body: body || {},
        });
    }

    endStream(streamId, body) {
        return jsonRequest(this._u(`/api/v1/streams/${encodeURIComponent(streamId)}/end`), {
            method: 'POST', internalKey: this.internalKey, headers: this._hdrs(), body: body || {},
        });
    }

    attachVod(streamId, body) {
        return jsonRequest(this._u(`/api/v1/streams/${encodeURIComponent(streamId)}/vod`), {
            method: 'POST', internalKey: this.internalKey, headers: this._hdrs(), body,
        });
    }

    listStreams(query) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/v1/streams${qs ? '?' + qs : ''}`), {
            internalKey: this.internalKey, headers: this._hdrs(),
        });
    }

    getStream(streamId) {
        return jsonRequest(this._u(`/api/v1/streams/${encodeURIComponent(streamId)}`), {
            internalKey: this.internalKey, headers: this._hdrs(),
        });
    }

    listRestreamDestinations(streamId) {
        return jsonRequest(this._u(`/api/v1/streams/${encodeURIComponent(streamId)}/destinations`), {
            internalKey: this.internalKey, headers: this._hdrs(),
        });
    }
}

module.exports = { StreamClient };
