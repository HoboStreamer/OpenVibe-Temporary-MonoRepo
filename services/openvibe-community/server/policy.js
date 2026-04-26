'use strict';

class CommunityPolicyDeniedError extends Error {
    constructor(reason) {
        super(`community policy denied: ${reason}`);
        this.name = 'CommunityPolicyDeniedError';
        this.status = 403;
        this.reason = reason;
    }
}

function actorOfReq(req) {
    if (req && req.serviceActor) return { type: 'service', id: String(req.serviceActor), service: true };
    if (req && req.user) return { type: 'user', id: String(req.user.sub || req.user.id || req.user.user_id || ''), role: req.user.role || 'user' };
    return { type: 'anonymous', id: null };
}
function isAdmin(actor) { return actor.role === 'admin' || actor.role === 'owner' || actor.service === true; }

function decideRead({ req, target }) {
    const actor = actorOfReq(req);
    if (!target) return { allow: false, reason: 'target missing' };
    if (target.visibility === 'public' || target.visibility === 'unlisted') return { allow: true, reason: 'public' };
    if (target.visibility === 'private') {
        if (isAdmin(actor)) return { allow: true, reason: 'admin' };
        if (target.created_by_actor_type === actor.type && target.created_by_actor_id === actor.id) return { allow: true, reason: 'owner' };
        if (target.owner_type === actor.type && target.owner_id === actor.id) return { allow: true, reason: 'owner' };
        return { allow: false, reason: 'private resource' };
    }
    return { allow: true, reason: 'default' };
}
function decidePost({ req, thread }) {
    const actor = actorOfReq(req);
    if (actor.type === 'anonymous') return { allow: false, reason: 'anonymous cannot post' };
    if (!thread) return { allow: false, reason: 'thread missing' };
    if (thread.status === 'locked' && !isAdmin(actor)) return { allow: false, reason: 'thread locked' };
    if (thread.status === 'archived' && !isAdmin(actor)) return { allow: false, reason: 'thread archived' };
    return { allow: true, reason: 'ok' };
}
function decideEdit({ req, post }) {
    const actor = actorOfReq(req);
    if (!post) return { allow: false, reason: 'post missing' };
    if (isAdmin(actor)) return { allow: true, reason: 'admin' };
    if (post.author_type === actor.type && post.author_id === actor.id) return { allow: true, reason: 'self' };
    return { allow: false, reason: 'not author' };
}
function decideDelete({ req, post }) {
    const actor = actorOfReq(req);
    if (!post) return { allow: false, reason: 'post missing' };
    if (isAdmin(actor)) return { allow: true, reason: 'admin' };
    if (post.author_type === actor.type && post.author_id === actor.id) return { allow: true, reason: 'self' };
    return { allow: false, reason: 'not author' };
}
function decidePasteOwnership({ req, paste }) {
    const actor = actorOfReq(req);
    if (isAdmin(actor)) return { allow: true, reason: 'admin' };
    if (paste && paste.created_by_actor_type === actor.type && paste.created_by_actor_id === actor.id) return { allow: true, reason: 'self' };
    return { allow: false, reason: 'not paste owner' };
}
function decideRelayManage({ req }) {
    const actor = actorOfReq(req);
    if (isAdmin(actor)) return { allow: true, reason: 'admin' };
    return { allow: false, reason: 'admin only' };
}

function assert(decision, ctx) {
    if (!decision.allow) {
        const err = new CommunityPolicyDeniedError(decision.reason || 'denied');
        if (ctx) err.context = ctx;
        throw err;
    }
}

module.exports = {
    CommunityPolicyDeniedError,
    actorOfReq, isAdmin,
    decideRead, decidePost, decideEdit, decideDelete,
    decidePasteOwnership, decideRelayManage,
    assert,
};
