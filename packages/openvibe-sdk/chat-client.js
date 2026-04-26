'use strict';

// OpenVibe — chat-service HTTP client. Wraps the openvibe-chat REST API.

const { jsonRequest } = require('./http');

class ChatClient {
    constructor(opts) {
        if (!opts || !opts.chatUrl) throw new Error('ChatClient: chatUrl required');
        this.chatUrl     = String(opts.chatUrl).replace(/\/$/, '');
        this.internalKey = opts.internalKey || null;
        this.callerService = opts.service || null;
    }
    _u(p) { return `${this.chatUrl}${p}`; }
    _hdrs() {
        const h = {};
        if (this.callerService) h['X-OpenVibe-Service'] = this.callerService;
        return h;
    }

    listRooms(query) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/chat/rooms${qs ? '?' + qs : ''}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    createRoom(body) {
        return jsonRequest(this._u('/api/chat/rooms'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }
    getRoom(roomId) {
        return jsonRequest(this._u(`/api/chat/rooms/${encodeURIComponent(roomId)}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    listMessages(roomId, query) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages${qs ? '?' + qs : ''}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    sendMessage(roomId, body) {
        return jsonRequest(this._u(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages`), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }

    // DMs
    listDms() {
        return jsonRequest(this._u('/api/chat/dms'), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    openDm(body) {
        return jsonRequest(this._u('/api/chat/dms'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }

    // Calls
    startCall(body) {
        return jsonRequest(this._u('/api/chat/calls'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }
    endCall(callId) {
        return jsonRequest(this._u(`/api/chat/calls/${encodeURIComponent(callId)}/end`), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body: {} });
    }

    // TTS
    getTtsSettings(query) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/chat/tts/settings${qs ? '?' + qs : ''}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
    putTtsSettings(body) {
        return jsonRequest(this._u('/api/chat/tts/settings'), { method: 'PUT', headers: this._hdrs(), internalKey: this.internalKey, body });
    }
    enqueueTts(body) {
        return jsonRequest(this._u('/api/chat/tts/queue'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }
    skipTts(body) {
        return jsonRequest(this._u('/api/chat/tts/skip'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body: body || {} });
    }
    clearTts(body) {
        return jsonRequest(this._u('/api/chat/tts/clear'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body: body || {} });
    }

    // Audio queue
    enqueueAudio(body) {
        return jsonRequest(this._u('/api/chat/audio/queue'), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body });
    }
    listAudio(query) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/chat/audio/queue${qs ? '?' + qs : ''}`), { headers: this._hdrs(), internalKey: this.internalKey });
    }
}

module.exports = { ChatClient };
