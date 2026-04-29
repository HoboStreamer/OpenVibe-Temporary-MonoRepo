'use strict';

function parseToken(raw) {
    const value = String(raw || '').trim().replace(/^Bearer\s+/i, '');
    if (!value) return null;
    if (value.startsWith('user:')) return { type: 'user', id: value.slice('user:'.length) };
    if (value.startsWith('service:')) return { type: 'service', id: value.slice('service:'.length) };
    if (value.startsWith('anon:')) return { type: 'anonymous', id: value.slice('anon:'.length) || null };
    return null;
}

function authenticateSocket(handshake, options) {
    const opts = options || {};
    const headers = handshake && handshake.headers ? handshake.headers : {};
    const auth = handshake && handshake.auth ? handshake.auth : {};
    const query = handshake && handshake.query ? handshake.query : {};

    const internalKey = headers['x-internal-key'] || auth.internalKey || query.internal_key;
    if (opts.internalKey && internalKey && String(internalKey) === String(opts.internalKey)) {
        return { type: 'service', id: String(auth.serviceId || query.service_id || 'internal-service') };
    }

    const actor = parseToken(auth.token || headers.authorization || query.token);
    if (actor) return actor;
    if (opts.allowAnonymous === false) {
        const error = new Error('authentication required');
        error.code = 'EAUTH';
        throw error;
    }
    return { type: 'anonymous', id: null };
}

function normalizeRoomName(value) {
    return String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9:_./-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
}

function canJoinRoom(actor, roomName) {
    const room = normalizeRoomName(roomName);
    if (!room) return false;
    if (!actor || actor.type === 'anonymous') return room.startsWith('public:');
    if (actor.type === 'service') return true;
    if (room.startsWith('dm:')) {
        return room.split(':').includes(String(actor.id));
    }
    return true;
}

module.exports = {
    authenticateSocket,
    canJoinRoom,
    normalizeRoomName,
    parseToken,
};