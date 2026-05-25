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

function isModerator(model, room, actor) {
    if (!actor || !actor.id) return false;
    const p = model.getParticipant(room.id, actor.type, actor.id);
    return !!(p && (p.role === 'owner' || p.role === 'mod'));
}

function decideSend({ req, room, model, senderType, senderId }) {
    if (!room) return { allow: false, reason: 'room not found' };
    if (room.archived_at) return { allow: false, reason: 'room archived' };
    if (isAdmin(req)) return { allow: true, reason: 'admin' };
    if (req && req.serviceActor) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);

    // Ban check — uses effective sender identity (may differ from auth identity for anon)
    const effectiveSenderType = senderType || actor.type;
    const effectiveSenderId   = senderId   || actor.id;
    if (effectiveSenderId && model.isUserBanned(room.id, effectiveSenderType, effectiveSenderId)) {
        return { allow: false, reason: 'banned from room' };
    }

    if (actor.type === 'anonymous') {
        // Allow anonymous sends to public rooms — identity is carried via metadata.sender_name
        if (room.visibility === 'public' && !ROOM_TYPES_REQUIRING_MEMBERSHIP.has(room.room_type)) {
            return { allow: true, reason: 'anonymous public room' };
        }
        return { allow: false, reason: 'anonymous send not allowed in non-public rooms' };
    }

    if (ROOM_TYPES_REQUIRING_MEMBERSHIP.has(room.room_type) || room.visibility === 'private' || room.visibility === 'restricted') {
        if (!isParticipant(model, room, actor)) return { allow: false, reason: 'private room: not participant' };
    }
    const p = model.getParticipant(room.id, actor.type, actor.id);
    if (p && p.role === 'blocked') return { allow: false, reason: 'blocked from room' };
    return { allow: true, reason: 'ok' };
}

function decideMod({ req, room, model }) {
    if (!room) return { allow: false, reason: 'room not found' };
    if (isAdmin(req)) return { allow: true, reason: 'admin' };
    if (req && req.serviceActor) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);
    if (actor.type !== 'user' || !actor.id) return { allow: false, reason: 'not authenticated' };
    if (isModerator(model, room, actor)) return { allow: true, reason: 'mod' };
    return { allow: false, reason: 'not a moderator of this room' };
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
