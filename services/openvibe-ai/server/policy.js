'use strict';

// openvibe-ai — single decision point for AI/SEO/source policy.

class AiPolicyDeniedError extends Error {
    constructor(reason, detail) {
        super(`ai policy denied: ${reason}`);
        this.code = 'EAIPOLICY';
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
function isAdmin(req)   { return !!(req && req.user && req.user.role === 'admin'); }
function isService(req) { return !!(req && req.serviceActor); }

function assert(decision, ctx) {
    if (!decision || decision.allow) return decision;
    const err = new AiPolicyDeniedError(decision.reason || 'denied', Object.assign({}, ctx || {}));
    throw err;
}

// admin/service-only: provider/model/route mutation, source registry mutation,
// economy-style admin endpoints
function decideAdminMutation({ req }) {
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    return { allow: false, reason: 'admin/service required' };
}

// Run creation: any authenticated actor (service/user/admin); anonymous is
// rejected to prevent unattributed AI usage.
function decideRunCreate({ req }) {
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    if (req && req.user) return { allow: true, reason: 'authenticated user' };
    return { allow: false, reason: 'authentication required for ai run' };
}

// SEO/ingestion/quality helpers — service or admin.
function decideContentOp({ req }) {
    return decideAdminMutation({ req });
}

// Read endpoints (status, list providers/routes summaries) — public-readable
// metadata only. We still exclude raw key env names for non-service callers.
function decidePublicRead() { return { allow: true, reason: 'public' }; }

// Source/citation private read — for now restricted to admin/service.
function decideSourceRead({ req }) {
    return decideAdminMutation({ req });
}

module.exports = {
    AiPolicyDeniedError, actorOfReq, isAdmin, isService, assert,
    decideAdminMutation, decideRunCreate, decideContentOp,
    decidePublicRead, decideSourceRead,
};
