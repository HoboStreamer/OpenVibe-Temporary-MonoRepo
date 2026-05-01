'use strict';

// openvibe-network — policy engine seam.
//
// Every kernel route calls `policy.assert(...)` exactly once. This file is
// the single decision point. It is intentionally small today — Phase 1 only
// needs namespace ownership and capability invocation rules — but the
// signature is stable so we can grow it (mod tiers, quotas, age gating, ...)
// without rewriting every caller.
//
// Decision functions return { allow: bool, reason: string }. `assert` throws
// a PolicyDeniedError on deny; the audit log records both outcomes.

const audit = require('./audit');
const namespaces = require('@openvibe/contracts/namespaces');

class PolicyDeniedError extends Error {
    constructor(reason, detail) {
        super(`policy denied: ${reason}`);
        this.code = 'EPOLICY';
        this.status = 403;
        this.reason = reason;
        this.detail = detail || null;
    }
}

// ── helpers ───────────────────────────────────────────────────
function actorOfReq(req) {
    if (req && req.serviceActor) return { type: 'service', id: req.serviceActor };
    if (req && req.user) {
        const actorId = String(req.user.sub || req.user.id || '');
        if (req.user.actor_type === 'anon' || req.user.anonymous === true) {
            return { type: 'anonymous', id: actorId || null };
        }
        return { type: 'user', id: actorId };
    }
    return { type: 'anonymous', id: null };
}

function isAdmin(req) {
    return !!(req && req.user && req.user.role === 'admin');
}

// ── decisions ─────────────────────────────────────────────────
function decideUserModuleRead({ req, userId, namespace }) {
    const def = namespaces.getNamespaceDef(namespace);
    if (!def) {
        if (namespaces.isModNamespace(namespace)) {
            const actor = actorOfReq(req);
            const mod = namespaces.parseModNamespace(namespace);
            return {
                allow: isAdmin(req)
                    || (actor.type === 'service' && mod && actor.id === mod.modId)
                    || (actor.type === 'user' && String(userId) === actor.id),
                reason: 'mod-namespace reads require owning user, owning mod service, or admin',
            };
        }
        return { allow: false, reason: 'unknown namespace' };
    }
    const actor = actorOfReq(req);
    switch (def.read_scope) {
        case 'public':
            return { allow: !!req.user || !!req.serviceActor, reason: 'authenticated read of public namespace' };
        case 'self':
            return { allow: actor.type === 'user' && String(userId) === actor.id, reason: 'self-read only' };
        case 'service':
            return { allow: actor.type === 'service' || isAdmin(req), reason: 'owner service or admin only' };
        case 'admin':
            return { allow: isAdmin(req), reason: 'admin only' };
        default:
            return { allow: false, reason: `unknown read_scope: ${def.read_scope}` };
    }
}

function decideUserModuleWrite({ req, userId, namespace }) {
    const def = namespaces.getNamespaceDef(namespace);
    if (!def) {
        if (namespaces.isModNamespace(namespace)) {
            const mod = namespaces.parseModNamespace(namespace);
            return {
                allow: isAdmin(req) || (req.serviceActor != null && mod && req.serviceActor === mod.modId),
                reason: 'mod-namespace write requires owning mod service or admin',
            };
        }
        return { allow: false, reason: 'unknown namespace' };
    }
    const actor = actorOfReq(req);
    if (actor.type === 'service' && req.serviceActor === def.owner) {
        return { allow: true, reason: 'owner-service write' };
    }
    if (def.user_writable && actor.type === 'user' && String(userId) === actor.id) {
        return { allow: true, reason: 'self-write of user-writable namespace' };
    }
    if (isAdmin(req)) {
        return { allow: true, reason: 'admin override' };
    }
    return { allow: false, reason: 'caller is not owner service, owning user, or admin' };
}

function decideRegistryWrite({ req, registry }) {
    // For Phase 1 only services authenticated via X-Internal-Key (i.e. the
    // service-actor middleware set req.serviceActor) or admins may register.
    if (req.serviceActor) return { allow: true, reason: 'service actor' };
    if (isAdmin(req))     return { allow: true, reason: 'admin' };
    return { allow: false, reason: `${registry} writes require service actor or admin` };
}

function decideCapabilityInvoke({ req, capability, input }) {
    const actor = actorOfReq(req);
    const policyDef = capability && capability.policy ? capability.policy : {};
    const access = policyDef.access || policyDef.invoke_scope || 'authenticated';

    if (access === 'public') {
        return { allow: true, reason: 'public capability' };
    }
    if (actor.type === 'anonymous') {
        return { allow: false, reason: 'authentication required' };
    }
    if (isAdmin(req)) {
        return { allow: true, reason: 'admin override' };
    }
    if (Array.isArray(policyDef.allowed_actor_types) && !policyDef.allowed_actor_types.includes(actor.type)) {
        return { allow: false, reason: `capability requires actor types: ${policyDef.allowed_actor_types.join(',')}` };
    }

    switch (access) {
        case 'authenticated':
            return { allow: true, reason: 'authenticated actor' };
        case 'user':
            return { allow: actor.type === 'user', reason: 'user actor required' };
        case 'service':
            return { allow: actor.type === 'service', reason: 'service actor required' };
        case 'self': {
            const targetFields = [policyDef.target_field].concat(policyDef.target_field_aliases || []).filter(Boolean);
            const target = targetFields.map((field) => input && input[field]).find((value) => value != null && value !== '');
            if (actor.type === 'service') {
                return { allow: true, reason: 'service actor may act on behalf of self-scoped capability' };
            }
            return {
                allow: actor.type === 'user' && target != null && String(target) === actor.id,
                reason: 'self-scoped capability requires the target user to match the caller',
            };
        }
        default:
            return { allow: false, reason: `unknown capability access policy: ${access}` };
    }
}

// ── public assert/check ───────────────────────────────────────
function assert(decision, ctx) {
    const c = ctx || {};
    audit.record({
        actorType: c.actorType,
        actorId: c.actorId,
        action: c.action,
        resource: c.resource,
        outcome: decision.allow ? 'allow' : 'deny',
        detail: { reason: decision.reason, ...(c.detail || {}) },
    });
    if (!decision.allow) throw new PolicyDeniedError(decision.reason, c);
}

module.exports = {
    PolicyDeniedError,
    actorOfReq,
    isAdmin,
    decideUserModuleRead,
    decideUserModuleWrite,
    decideRegistryWrite,
    decideCapabilityInvoke,
    assert,
};
