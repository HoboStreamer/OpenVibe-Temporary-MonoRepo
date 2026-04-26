'use strict';

// OpenVibe — community-service HTTP client. Wraps the openvibe-community REST API.

const { jsonRequest } = require('./http');

class CommunityClient {
    constructor(opts) {
        if (!opts || !opts.communityUrl) throw new Error('CommunityClient: communityUrl required');
        this.communityUrl = String(opts.communityUrl).replace(/\/$/, '');
        this.internalKey  = opts.internalKey || null;
        this.callerService = opts.service || null;
    }
    _u(p) { return `${this.communityUrl}${p}`; }
    _hdrs() {
        const h = {};
        if (this.callerService) h['X-OpenVibe-Service'] = this.callerService;
        return h;
    }

    // spaces
    listSpaces(query) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/community/spaces${qs ? '?' + qs : ''}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    createSpace(body) {
        return jsonRequest(this._u('/api/community/spaces'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }
    getSpace(idOrSlug) {
        return jsonRequest(this._u(`/api/community/spaces/${encodeURIComponent(idOrSlug)}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }

    // categories
    listCategories(spaceId) {
        return jsonRequest(this._u(`/api/community/spaces/${encodeURIComponent(spaceId)}/categories`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    createCategory(spaceId, body) {
        return jsonRequest(this._u(`/api/community/spaces/${encodeURIComponent(spaceId)}/categories`), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }

    // threads/posts
    listThreads(query) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/community/threads${qs ? '?' + qs : ''}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    createThread(body) {
        return jsonRequest(this._u('/api/community/threads'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }
    getThread(idOrSlug) {
        return jsonRequest(this._u(`/api/community/threads/${encodeURIComponent(idOrSlug)}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    listPosts(threadId) {
        return jsonRequest(this._u(`/api/community/threads/${encodeURIComponent(threadId)}/posts`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    createPost(threadId, body) {
        return jsonRequest(this._u(`/api/community/threads/${encodeURIComponent(threadId)}/posts`), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }

    // reusable comments
    listComments(refType, refId) {
        const qs = new URLSearchParams({ ref_type: refType, ref_id: refId }).toString();
        return jsonRequest(this._u(`/api/community/comments?${qs}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    addComment(body) {
        return jsonRequest(this._u('/api/community/comments'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }

    // pastes
    listPastes(query) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/community/pastes${qs ? '?' + qs : ''}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    createPaste(body) {
        return jsonRequest(this._u('/api/community/pastes'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }
    getPaste(slug) {
        return jsonRequest(this._u(`/api/community/pastes/${encodeURIComponent(slug)}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }

    // discord
    listRelays() {
        return jsonRequest(this._u('/api/community/discord/relays'), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    createRelay(body) {
        return jsonRequest(this._u('/api/community/discord/relays'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }
    discordWebhook(body) {
        return jsonRequest(this._u('/api/community/discord/webhook'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }
}

module.exports = { CommunityClient };
