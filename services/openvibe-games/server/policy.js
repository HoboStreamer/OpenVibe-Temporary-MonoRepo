'use strict';

function actorOfReq(req) {
    if (req && req.serviceActor) {
        return { type: 'service', id: String(req.serviceActor), role: 'service', username: String(req.serviceActor) };
    }
    const user = req && req.user;
    if (user && (user.sub || user.id)) {
        return {
            type: 'user',
            id: String(user.sub || user.id),
            role: String(user.role || 'user'),
            username: user.display_name || user.username || `user:${String(user.sub || user.id)}`,
        };
    }
    return { type: 'anonymous', id: null, role: 'anonymous', username: 'anon' };
}

function isPrivileged(req) {
    const actor = actorOfReq(req);
    return actor.type === 'service' || actor.role === 'admin' || actor.role === 'global_mod' || actor.role === 'mod';
}

function ownsUser(req, userId) {
    const actor = actorOfReq(req);
    return actor.type === 'service' || (actor.type === 'user' && String(actor.id) === String(userId));
}

function allow(reason) {
    return { allow: true, reason: reason || 'allowed' };
}

function deny(reason, status) {
    return { allow: false, reason: reason || 'forbidden', status: status || 403 };
}

function assert(result, meta) {
    if (result && result.allow) return true;
    const err = new Error(result && result.reason ? result.reason : 'forbidden');
    err.status = (result && result.status) || 403;
    err.reason = result && result.reason;
    err.meta = meta || null;
    throw err;
}

function decidePlayerRead() {
    return allow('player profiles are public');
}

function decidePlayerWrite({ req, userId }) {
    if (ownsUser(req, userId)) return allow('owner');
    if (isPrivileged(req)) return allow('privileged');
    return deny('player updates require owner, moderator, or service access');
}

function decideInventoryRead({ req, userId }) {
    if (ownsUser(req, userId)) return allow('owner');
    if (isPrivileged(req)) return allow('privileged');
    return deny('inventory is private to the player, staff, or service callers');
}

function decideInventoryWrite({ req, userId }) {
    return decideInventoryRead({ req, userId });
}

function decideCanvasPlace() {
    return allow('canvas accepts authenticated and anonymous placements');
}

function decideCanvasModeration({ req }) {
    if (isPrivileged(req)) return allow('privileged');
    return deny('canvas moderation requires staff or service access');
}

module.exports = {
    actorOfReq,
    assert,
    decidePlayerRead,
    decidePlayerWrite,
    decideInventoryRead,
    decideInventoryWrite,
    decideCanvasPlace,
    decideCanvasModeration,
    isPrivileged,
};
