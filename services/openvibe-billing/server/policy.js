'use strict';

// openvibe-billing — single decision point for billing/tips/VIP policy.
// Mirrors openvibe-chat/policy: pure functions return { allow, reason } and
// `assert(decision)` throws BillingPolicyDeniedError on deny.

class BillingPolicyDeniedError extends Error {
    constructor(reason, detail) {
        super(`billing policy denied: ${reason}`);
        this.code = 'EBILLINGPOLICY';
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

function isService(req) { return !!(req && req.serviceActor); }

function ownsTarget(actor, owner_type, owner_id) {
    if (!actor || !actor.id) return false;
    if (actor.type !== owner_type) return false;
    return String(actor.id) === String(owner_id);
}

// ── wallet / ledger reads ──
function decideWalletRead({ req, owner_type, owner_id }) {
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);
    if (ownsTarget(actor, owner_type, owner_id)) return { allow: true, reason: 'self' };
    return { allow: false, reason: 'wallet visible only to owner / admin / service' };
}

// ── wallet adjust (admin or service-only) ──
function decideAdjust({ req }) {
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    return { allow: false, reason: 'admin/service required' };
}

// ── credits charge (self, service, admin) ──
function decideCharge({ req, owner_type, owner_id }) {
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);
    if (ownsTarget(actor, owner_type, owner_id)) return { allow: true, reason: 'self-spend' };
    return { allow: false, reason: 'cannot charge other actor wallet' };
}

// ── checkout creation (self, service, admin) ──
function decideCheckoutCreate({ req, owner_type, owner_id }) {
    return decideCharge({ req, owner_type, owner_id });
}

// ── tip creation (sender must be self/service/admin) ──
function decideTip({ req, sender_actor_type, sender_actor_id }) {
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);
    if (actor.type === sender_actor_type && String(actor.id) === String(sender_actor_id)) return { allow: true, reason: 'self' };
    return { allow: false, reason: 'cannot tip on behalf of another actor' };
}

// ── refund (admin/service only — preserves ledger integrity guarantees) ──
function decideRefund({ req }) {
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    return { allow: false, reason: 'refund requires admin/service' };
}

// ── plan management (owner, service, admin) ──
function decidePlanManage({ req, owner_type, owner_id }) {
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);
    if (ownsTarget(actor, owner_type, owner_id)) return { allow: true, reason: 'plan owner' };
    return { allow: false, reason: 'not plan owner' };
}

// ── subscription create (subscriber == self/service/admin) ──
function decideSubscriptionCreate({ req, subscriber_actor_type, subscriber_actor_id }) {
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);
    if (actor.type === subscriber_actor_type && String(actor.id) === String(subscriber_actor_id)) {
        return { allow: true, reason: 'self' };
    }
    return { allow: false, reason: 'cannot subscribe on behalf of another actor' };
}

// ── subscription cancel (subscriber, plan owner, service, admin) ──
function decideSubscriptionCancel({ req, subscription }) {
    if (!subscription) return { allow: false, reason: 'subscription not found' };
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    const actor = actorOfReq(req);
    if (actor.type === subscription.subscriber_actor_type && String(actor.id) === String(subscription.subscriber_actor_id)) {
        return { allow: true, reason: 'subscriber' };
    }
    if (actor.type === subscription.target_owner_type && String(actor.id) === String(subscription.target_owner_id)) {
        return { allow: true, reason: 'plan owner' };
    }
    return { allow: false, reason: 'not subscriber or plan owner' };
}

// ── economy freeze/unfreeze (admin/service only) ──
function decideEconomyFreeze({ req }) {
    if (isAdmin(req))   return { allow: true, reason: 'admin' };
    if (isService(req)) return { allow: true, reason: 'service actor' };
    return { allow: false, reason: 'admin/service required' };
}

function assert(decision, ctx) {
    if (!decision.allow) throw new BillingPolicyDeniedError(decision.reason, ctx || null);
}

module.exports = {
    BillingPolicyDeniedError,
    actorOfReq, isAdmin, isService,
    decideWalletRead, decideAdjust, decideCharge, decideCheckoutCreate,
    decideTip, decideRefund,
    decidePlanManage, decideSubscriptionCreate, decideSubscriptionCancel,
    decideEconomyFreeze,
    assert,
};
