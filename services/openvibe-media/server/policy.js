'use strict';

// openvibe-media — single decision point for all media policy. Every write
// route calls policy.assert(...) exactly once; reads call policy.canRead(...)
// to filter results. This mirrors openvibe-network/server/policy.js.

const namespaces = require('@openvibe/contracts/media-namespaces');

class MediaPolicyDeniedError extends Error {
    constructor(reason, detail) {
        super(`media policy denied: ${reason}`);
        this.code = 'EMEDIAPOLICY';
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

function decideUpload({ req, namespace, ownerType, ownerId }) {
    const def = namespaces.getMediaNamespaceDef(namespace);
    if (!def) {
        if (namespaces.isModMediaNamespace(namespace)) {
            return { allow: !!req.serviceActor, reason: 'mod-media namespace requires service actor' };
        }
        return { allow: false, reason: `unknown media namespace: ${namespace}` };
    }
    const actor = actorOfReq(req);
    if (isAdmin(req)) return { allow: true, reason: 'admin override' };

    // Service-owned: only the owning service may write.
    if (actor.type === 'service' && req.serviceActor === def.owner) {
        return { allow: true, reason: 'owner-service write' };
    }

    // User-writable: the owning user may upload to their own owner_id.
    if (def.user_writable && actor.type === 'user' && ownerType === 'user' && String(ownerId) === actor.id) {
        return { allow: true, reason: 'self-write of user-writable namespace' };
    }

    return { allow: false, reason: 'caller is not owner service, owning user, or admin' };
}

function decideRead({ req, media }) {
    if (!media) return { allow: false, reason: 'media not found' };
    if (isAdmin(req)) return { allow: true, reason: 'admin override' };

    const actor = actorOfReq(req);
    const def = namespaces.getMediaNamespaceDef(media.namespace) || {};
    const ownerService = def.owner;

    // Owner service can always read its own namespace.
    if (actor.type === 'service' && req.serviceActor === ownerService) {
        return { allow: true, reason: 'owner-service read' };
    }

    if (media.visibility === 'public') {
        return { allow: true, reason: 'public visibility' };
    }
    if (media.visibility === 'unlisted') {
        return { allow: true, reason: 'unlisted (knowledge of id)' };
    }

    // private / restricted: owner only
    if (actor.type === 'user' && media.owner_type === 'user' && String(media.owner_id) === actor.id) {
        return { allow: true, reason: 'owning-user read' };
    }
    if (actor.type === 'service' && media.owner_type === 'service' && String(media.owner_id) === actor.id) {
        return { allow: true, reason: 'owning-service read' };
    }
    return { allow: false, reason: 'private/restricted media: caller not owner' };
}

function decideDelete({ req, media }) {
    if (!media) return { allow: false, reason: 'media not found' };
    if (isAdmin(req)) return { allow: true, reason: 'admin override' };
    const actor = actorOfReq(req);
    const def = namespaces.getMediaNamespaceDef(media.namespace) || {};
    if (actor.type === 'service' && req.serviceActor === def.owner) {
        return { allow: true, reason: 'owner-service delete' };
    }
    if (actor.type === 'user' && media.owner_type === 'user' && String(media.owner_id) === actor.id) {
        return { allow: true, reason: 'owning-user delete' };
    }
    return { allow: false, reason: 'caller is not owner or admin' };
}

function decideAdmin({ req }) {
    if (isAdmin(req)) return { allow: true, reason: 'admin' };
    if (req && req.serviceActor) return { allow: true, reason: 'service actor' };
    return { allow: false, reason: 'admin or service actor required' };
}

function assert(decision, ctx) {
    if (!decision.allow) throw new MediaPolicyDeniedError(decision.reason, ctx || null);
}

module.exports = {
    MediaPolicyDeniedError,
    actorOfReq,
    isAdmin,
    decideUpload,
    decideRead,
    decideDelete,
    decideAdmin,
    assert,
};
