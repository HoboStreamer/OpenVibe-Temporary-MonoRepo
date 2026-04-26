'use strict';

// openvibe-chat — single decision point for chat policy.

const ROOM_TYPES_REQUIRING_MEMBERSHIP = new Set(['dm', 'group_dm', 'private']);

class ChatPolicyDeniedError extends Error {
    constructor(reason, detail) {
        super(`chat policy denied: ${reason}`);
        this.code = 'ECHATPOLICY';
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

function isParticipant(model, room, actor) {
    if (!actor || !actor.id) return false;
    return !!model.getParticipant(room.id, actor.type, actor.id);
}

function decideRead({ req, room, model }) {
    if (!room) return { allow: false, reason: 'room not found' };
    if (isAdmin(req)) return { allow: true, reason: 'admin' };
    if (req && req.serviceActor) return { allow: true, reason: 'service actor' };
    if (room.visibility === 'public' || room.visibility === 'unlisted') return { allow: true, reason: 'public room' };
    const actor = actorOfReq(req);
    if (isParticipant(model, room, actor)) return { allow: true, reason: 'participant' };
    return { allow: false, reason: 'private room: not participant' };
}

function decideSend({ req, room, model }) {
    if (!room) return { allow: false, reason: 'room not found' };
    if (room.archived_at) return { allow: false, reason: 'room archived' };
    if (isAdmin(req)) return { allow: true, reason: 'admin' };
    if (req && req.serviceActor) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);
    if (actor.type === 'anonymous') return { allow: false, reason: 'anonymous send not allowed' };

    if (ROOM_TYPES_REQUIRING_MEMBERSHIP.has(room.room_type) || room.visibility === 'private' || room.visibility === 'restricted') {
        if (!isParticipant(model, room, actor)) return { allow: false, reason: 'private room: not participant' };
    }
    // Block check
    const p = model.getParticipant(room.id, actor.type, actor.id);
    if (p && p.role === 'blocked') return { allow: false, reason: 'blocked from room' };
    return { allow: true, reason: 'ok' };
}

function decideEdit({ req, message }) {
    if (!message) return { allow: false, reason: 'message not found' };
    if (isAdmin(req)) return { allow: true, reason: 'admin' };
    const actor = actorOfReq(req);
    if (actor.type === message.sender_type && actor.id && String(actor.id) === String(message.sender_id || '')) {
        return { allow: true, reason: 'self-edit' };
    }
    if (req && req.serviceActor) return { allow: true, reason: 'service actor' };
    return { allow: false, reason: 'cannot edit other actor message' };
}

function decideDelete({ req, message, room, model }) {
    if (!message) return { allow: false, reason: 'message not found' };
    if (isAdmin(req)) return { allow: true, reason: 'admin' };
    const actor = actorOfReq(req);
    if (actor.type === message.sender_type && actor.id && String(actor.id) === String(message.sender_id || '')) {
        return { allow: true, reason: 'self-delete' };
    }
    if (room) {
        const p = model.getParticipant(room.id, actor.type, actor.id);
        if (p && (p.role === 'owner' || p.role === 'mod')) return { allow: true, reason: 'mod' };
    }
    if (req && req.serviceActor) return { allow: true, reason: 'service actor' };
    return { allow: false, reason: 'not author or mod' };
}

function decideTtsOwnership({ req, owner_type, owner_id }) {
    if (isAdmin(req)) return { allow: true, reason: 'admin' };
    if (req && req.serviceActor) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);
    if (actor.type === owner_type && String(actor.id) === String(owner_id)) return { allow: true, reason: 'self' };
    return { allow: false, reason: 'not owner' };
}

function decideCallParticipant({ req, call }) {
    if (!call) return { allow: false, reason: 'call not found' };
    if (isAdmin(req)) return { allow: true, reason: 'admin' };
    if (req && req.serviceActor) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);
    if (actor.type === call.started_by_actor_type && String(actor.id) === String(call.started_by_actor_id)) return { allow: true, reason: 'caller' };
    if (actor.type === call.target_actor_type && String(actor.id) === String(call.target_actor_id)) return { allow: true, reason: 'callee' };
    return { allow: false, reason: 'not call participant' };
}

function assert(decision, ctx) {
    if (!decision.allow) throw new ChatPolicyDeniedError(decision.reason, ctx || null);
}

module.exports = {
    ChatPolicyDeniedError,
    actorOfReq, isAdmin,
    decideRead, decideSend, decideEdit, decideDelete,
    decideTtsOwnership, decideCallParticipant,
    assert,
};
