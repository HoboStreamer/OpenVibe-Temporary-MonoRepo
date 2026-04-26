'use strict';

// OpenVibe — media-service HTTP client. Wraps the openvibe-media REST API
// so callers don't talk to it directly. Mirrors RegistryClient/EventsClient
// shape: every method returns a JSON response or throws on transport error.

const { jsonRequest } = require('./http');

class MediaClient {
    constructor(opts) {
        if (!opts || !opts.mediaUrl) throw new Error('MediaClient: mediaUrl required');
        this.mediaUrl    = String(opts.mediaUrl).replace(/\/$/, '');
        this.internalKey = opts.internalKey || null;
        this.callerService = opts.service || null; // X-OpenVibe-Service header value
    }

    _u(p) { return `${this.mediaUrl}${p}`; }
    _hdrs() {
        const h = {};
        if (this.callerService) h['X-OpenVibe-Service'] = this.callerService;
        return h;
    }

    /**
     * Initialize an upload. Returns { media, upload: { url, method, fields } }.
     * Body fields:
     *   namespace        (required, e.g. 'live.vods')
     *   owner_type       'user' | 'service' | 'mod' | 'system'
     *   owner_id         actor id of the resource owner
     *   type             'image' | 'video' | 'vod' | 'clip' | 'thumbnail' | ...
     *   visibility       optional, defaults from namespace
     *   storage_tier     optional, defaults from namespace
     *   mime_type        optional
     *   size_bytes       optional (helps quota check)
     *   metadata         optional object
     */
    initUpload(body, opts) {
        return jsonRequest(this._u('/api/v1/media/upload/init'), {
            method: 'POST',
            internalKey: (opts && opts.internalKey) || this.internalKey,
            token: opts && opts.token,
            headers: this._hdrs(),
            body,
        });
    }

    /**
     * Mark an upload complete. Body: { sha256?, size_bytes?, mime_type?, metadata? }.
     */
    completeUpload(mediaId, body, opts) {
        return jsonRequest(this._u(`/api/v1/media/${encodeURIComponent(mediaId)}/upload/complete`), {
            method: 'POST',
            internalKey: (opts && opts.internalKey) || this.internalKey,
            token: opts && opts.token,
            headers: this._hdrs(),
            body: body || {},
        });
    }

    getMedia(mediaId, opts) {
        return jsonRequest(this._u(`/api/v1/media/${encodeURIComponent(mediaId)}`), {
            internalKey: (opts && opts.internalKey) || this.internalKey,
            token: opts && opts.token,
            headers: this._hdrs(),
        });
    }

    listMedia(query, opts) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/v1/media${qs ? '?' + qs : ''}`), {
            internalKey: (opts && opts.internalKey) || this.internalKey,
            token: opts && opts.token,
            headers: this._hdrs(),
        });
    }

    deleteMedia(mediaId, opts) {
        return jsonRequest(this._u(`/api/v1/media/${encodeURIComponent(mediaId)}`), {
            method: 'DELETE',
            internalKey: (opts && opts.internalKey) || this.internalKey,
            token: opts && opts.token,
            headers: this._hdrs(),
        });
    }

    archiveMedia(mediaId, opts) {
        return jsonRequest(this._u(`/api/v1/media/${encodeURIComponent(mediaId)}/archive`), {
            method: 'POST',
            internalKey: (opts && opts.internalKey) || this.internalKey,
            headers: this._hdrs(),
            body: {},
        });
    }

    restoreMedia(mediaId, opts) {
        return jsonRequest(this._u(`/api/v1/media/${encodeURIComponent(mediaId)}/restore`), {
            method: 'POST',
            internalKey: (opts && opts.internalKey) || this.internalKey,
            headers: this._hdrs(),
            body: {},
        });
    }

    listJobs(query, opts) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/v1/admin/jobs${qs ? '?' + qs : ''}`), {
            internalKey: (opts && opts.internalKey) || this.internalKey,
            headers: this._hdrs(),
        });
    }

    getQuota(ownerType, ownerId, namespace, opts) {
        const qs = new URLSearchParams({ owner_type: ownerType, owner_id: String(ownerId), namespace }).toString();
        return jsonRequest(this._u(`/api/v1/quota?${qs}`), {
            internalKey: (opts && opts.internalKey) || this.internalKey,
            headers: this._hdrs(),
        });
    }
}

module.exports = { MediaClient };
