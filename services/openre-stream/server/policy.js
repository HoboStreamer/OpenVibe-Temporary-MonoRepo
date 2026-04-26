'use strict';

// openre-stream — policy seam.
// Channels are owned by a single user; streams inherit that ownership.
// Service callers (openvibe-live, openvibe-events) may always read; writes
// require either the owning user, the registering owner-service, or admin.

class StreamPolicyDeniedError extends Error {
    constructor(reason, detail) {
        super(`stream policy denied: ${reason}`);
        this.code = 'ESTREAMPOLICY';
        this.status = 403;
        this.reason = reason;
        this.detail = detail || null;
    }
}

function actorOfReq(req) {
    if (req && req.serviceActor) return { type: 'service', id: req.serviceActor };
    if (req && req.user)         return { type: 'user',    id: String(req.user.sub || req.user.id || '') };
    return { type: 'anonymous', id: null };
}

function isAdmin(req) {
    return !!(req && req.user && req.user.role === 'admin');
}

function decideChannelWrite({ req, ownerUserId }) {
    if (isAdmin(req)) return { allow: true, reason: 'admin' };
    const a = actorOfReq(req);
    if (a.type === 'service') return { allow: true, reason: 'service write' };
    if (a.type === 'user' && String(ownerUserId) === a.id) return { allow: true, reason: 'owning user' };
    return { allow: false, reason: 'channel write requires owning user, service, or admin' };
}

function decideStreamWrite({ req, channel }) {
    if (!channel) return { allow: false, reason: 'channel not found' };
    return decideChannelWrite({ req, ownerUserId: channel.owner_user_id });
}

function decideRead() {
    return { allow: true, reason: 'public read' };
}

function assert(decision, ctx) {
    if (!decision.allow) throw new StreamPolicyDeniedError(decision.reason, ctx || null);
}

module.exports = {
    StreamPolicyDeniedError,
    actorOfReq, isAdmin,
    decideChannelWrite, decideStreamWrite, decideRead,
    assert,
};
