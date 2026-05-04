'use strict';

// openvibe-tips — access policy decisions.

class TipsPolicyDeniedError extends Error {
    constructor(message, { code, reason, detail, status } = {}) {
        super(message || 'Access denied');
        this.name  = 'TipsPolicyDeniedError';
        this.code  = code  || 'TIPS_DENIED';
        this.reason = reason || null;
        this.detail = detail || null;
        this.status = status || 403;
    }
}

function actorOfReq(req) {
    if (req.serviceActor) {
        return { type: 'service', id: typeof req.serviceActor === 'string' ? req.serviceActor : req.serviceActor.id || 'unidentified-service' };
    }
    if (req.user && req.user.sub) {
        return { type: req.user.actor_type || 'user', id: req.user.sub };
    }
    return { type: 'anonymous', id: 'anonymous' };
}

function isAdmin(actor) {
    return actor.type === 'service' || actor.type === 'admin';
}

function isOwner(actor, creator) {
    if (!creator) return false;
    return actor.type === 'user' && actor.id === creator.user_id;
}

// ── Decisions ────────────────────────────────────────────────────────────────

function decideReadPublic() {
    return { allow: true, reason: 'public resource' };
}

function decideManageCreator({ req, creator } = {}) {
    const actor = actorOfReq(req);
    if (isAdmin(actor)) return { allow: true, reason: 'service/admin actor' };
    if (isOwner(actor, creator)) return { allow: true, reason: 'creator owner' };
    // Allow creator creation without a creator record (it doesn't exist yet)
    if (!creator && actor.type === 'user') return { allow: true, reason: 'creating own profile' };
    return { allow: false, reason: 'must be creator owner or service actor' };
}

function decideManageConnector({ req, creator } = {}) {
    return decideManageCreator({ req, creator });
}

function decideSendTip({ req } = {}) {
    const actor = actorOfReq(req);
    if (actor.type === 'anonymous') return { allow: false, reason: 'must be authenticated to send native tips' };
    return { allow: true, reason: 'authenticated user' };
}

function decideAdminAction({ req } = {}) {
    const actor = actorOfReq(req);
    if (isAdmin(actor)) return { allow: true, reason: 'service/admin actor' };
    return { allow: false, reason: 'service or admin actor required' };
}

function assert(decision, actorMeta) {
    if (!decision || !decision.allow) {
        throw new TipsPolicyDeniedError(
            'Access denied: ' + (decision && decision.reason || 'policy check failed'),
            { code: 'TIPS_DENIED', reason: decision && decision.reason || null, detail: actorMeta || null }
        );
    }
}

module.exports = {
    TipsPolicyDeniedError,
    actorOfReq,
    decideReadPublic,
    decideManageCreator,
    decideManageConnector,
    decideSendTip,
    decideAdminAction,
    assert,
};
