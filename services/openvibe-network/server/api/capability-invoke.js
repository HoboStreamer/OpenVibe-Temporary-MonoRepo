'use strict';

const crypto = require('crypto');
const express = require('express');

const db = require('../db');
const policy = require('../policy');
const audit = require('../audit');
const { createCapabilityDispatcher } = require('../capabilities');
const { safeClone, validateSchema } = require('../schema-tools');

const RATE_LIMIT_WINDOWS = new Map();

function buildRouter(deps) {
    const r = express.Router();
    const { events, config } = deps;
    const dispatcher = createCapabilityDispatcher({ config, internalKey: config.internalKey });

    r.post('/capabilities/:id/validate', express.json({ limit: '256kb' }), (req, res) => {
        const capability = resolveCapability(req.params.id, req.body && req.body.version);
        if (!capability) return res.status(404).json({ error: 'capability not found' });

        const actor = policy.actorOfReq(req);
        const input = applyPolicyDefaults(capability, actor, extractInvokeInput(req.body));
        const validation = validateSchema(capability.input_schema || {}, input);
        const decision = policy.decideCapabilityInvoke({ req, capability, input });
        const errors = validation.errors.slice();
        if (capability.deprecated && !(req.body && req.body.allow_deprecated)) {
            errors.push(`${capability.capability_id}: capability is deprecated`);
        }

        res.json({
            ok: validation.ok && decision.allow && errors.length === 0,
            capability_id: capability.capability_id,
            version: capability.version,
            input,
            policy: decision,
            errors,
        });
    });

    r.post('/capabilities/:id/invoke', express.json({ limit: '256kb' }), async (req, res) => {
        const capability = resolveCapability(req.params.id, req.body && req.body.version);
        if (!capability) return res.status(404).json({ error: 'capability not found' });

        const actor = policy.actorOfReq(req);
        const input = applyPolicyDefaults(capability, actor, extractInvokeInput(req.body));
        const traceId = crypto.randomUUID();
        const idempotencyKey = extractIdempotencyKey(req);

        if (capability.deprecated && !(req.body && req.body.allow_deprecated)) {
            return res.status(409).json({
                error: 'capability is deprecated',
                capability_id: capability.capability_id,
                version: capability.version,
                trace_id: traceId,
            });
        }

        const validation = validateSchema(capability.input_schema || {}, input);
        if (!validation.ok) {
            return res.status(400).json({
                error: 'invalid capability input',
                capability_id: capability.capability_id,
                version: capability.version,
                trace_id: traceId,
                errors: validation.errors,
            });
        }

        try {
            policy.assert(
                policy.decideCapabilityInvoke({ req, capability, input }),
                {
                    actorType: actor.type,
                    actorId: actor.id,
                    action: 'invoke',
                    resource: `capability:${capability.capability_id}`,
                    detail: { version: capability.version },
                }
            );
            enforceRateLimit(capability.rate_limit || {}, actor, capability.capability_id);
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason, trace_id: traceId });
        }

        if (idempotencyKey) {
            const cached = findIdempotentInvocation(capability.capability_id, actor, idempotencyKey);
            if (cached) {
                if (cached.status === 'pending') {
                    return res.status(409).json({
                        error: 'capability invocation already in progress for this idempotency key',
                        invocation_id: cached.invocation_id,
                        trace_id: cached.trace_id,
                    });
                }
                return res.status(cached.http_status || 200).json(cached.response || cached.error || { invocation_id: cached.invocation_id });
            }
        }

        const invocationId = crypto.randomUUID();
        const targetService = dispatcher.targetServiceFor(capability.capability_id);
        insertInvocation({
            invocationId,
            capability,
            actor,
            traceId,
            idempotencyKey,
            targetService,
            request: input,
        });

        try {
            const dispatched = await dispatcher.dispatch({ capabilityId: capability.capability_id, input, actor });
            const responseBody = {
                invocation_id: invocationId,
                capability_id: capability.capability_id,
                version: capability.version,
                target_service: dispatched.target_service || targetService,
                trace_id: traceId,
                status: 'succeeded',
                result: dispatched.result,
            };
            completeInvocation(invocationId, 200, responseBody);
            audit.record({
                actorType: actor.type,
                actorId: actor.id,
                action: 'invoke.complete',
                resource: `capability:${capability.capability_id}`,
                outcome: 'allow',
                detail: { invocation_id: invocationId, target_service: dispatched.target_service || targetService, trace_id: traceId },
            });
            emitEvent(events, 'capability.invoked', actor, {
                invocation_id: invocationId,
                capability_id: capability.capability_id,
                version: capability.version,
                target_service: dispatched.target_service || targetService,
                trace_id: traceId,
            });
            return res.status(200).json(responseBody);
        } catch (err) {
            const status = err.status || 500;
            const errorBody = {
                invocation_id: invocationId,
                capability_id: capability.capability_id,
                version: capability.version,
                target_service: targetService,
                trace_id: traceId,
                status: 'failed',
                error: err.message,
                detail: err.body || null,
            };
            failInvocation(invocationId, status, errorBody);
            audit.record({
                actorType: actor.type,
                actorId: actor.id,
                action: 'invoke.complete',
                resource: `capability:${capability.capability_id}`,
                outcome: 'error',
                detail: { invocation_id: invocationId, trace_id: traceId, message: err.message, status },
            });
            emitEvent(events, 'capability.failed', actor, {
                invocation_id: invocationId,
                capability_id: capability.capability_id,
                version: capability.version,
                target_service: targetService,
                trace_id: traceId,
                status,
                message: err.message,
            });
            return res.status(status).json(errorBody);
        }
    });

    r.get('/capability-invocations/:id', (req, res) => {
        const row = db.get().prepare(`SELECT * FROM capability_invocations WHERE invocation_id = ?`).get(String(req.params.id));
        if (!row) return res.status(404).json({ error: 'not found' });
        const actor = policy.actorOfReq(req);
        if (!(policy.isAdmin(req) || actor.type === 'service' || (actor.type === row.actor_type && String(actor.id || '') === String(row.actor_id || '')))) {
            return res.status(403).json({ error: 'forbidden' });
        }
        res.json(hydrateInvocation(row));
    });

    return r;
}

function resolveCapability(id, requestedVersion) {
    const version = Number.isInteger(requestedVersion) ? requestedVersion : parsePositiveInt(requestedVersion);
    const row = version
        ? db.get().prepare(`SELECT * FROM capability_registry WHERE capability_id = ? AND version = ?`).get(String(id), version)
        : db.get().prepare(`SELECT * FROM capability_registry WHERE capability_id = ? ORDER BY version DESC LIMIT 1`).get(String(id));
    if (!row) return null;
    return {
        capability_id: row.capability_id,
        version: row.version,
        owner_service: row.owner_service,
        description: row.description,
        input_schema: safeParse(row.input_schema_json) || {},
        output_schema: safeParse(row.output_schema_json) || {},
        policy: safeParse(row.policy_json) || {},
        rate_limit: safeParse(row.rate_limit_json) || {},
        deprecated: !!row.deprecated,
    };
}

function extractInvokeInput(body) {
    const payload = body || {};
    if (payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)) {
        return safeClone(payload.input);
    }
    const out = Object.assign({}, payload);
    delete out.version;
    delete out.allow_deprecated;
    delete out.idempotency_key;
    return out;
}

function extractIdempotencyKey(req) {
    const bodyKey = req.body && req.body.idempotency_key;
    const headerKey = req.headers['idempotency-key'];
    if (typeof bodyKey === 'string' && bodyKey.trim()) return bodyKey.trim();
    if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();
    return null;
}

function applyPolicyDefaults(capability, actor, input) {
    const out = safeClone(input || {});
    const policyDef = capability.policy || {};
    if (policyDef.access === 'self' && actor && actor.type === 'user') {
        const names = [policyDef.target_field].concat(policyDef.target_field_aliases || []).filter(Boolean);
        const hasTarget = names.some((name) => out[name] != null && out[name] !== '');
        if (!hasTarget && names[0]) out[names[0]] = actor.id;
        if ((names.includes('owner_id') || names.includes('ownerId')) && out.owner_type == null && out.ownerType == null) {
            out.owner_type = 'user';
        }
    }
    return out;
}

function insertInvocation({ invocationId, capability, actor, traceId, idempotencyKey, targetService, request }) {
    db.get().prepare(`
        INSERT INTO capability_invocations (
            invocation_id, capability_id, capability_version, actor_type, actor_id, trace_id,
            idempotency_key, target_service, request_json, status, http_status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 202, CURRENT_TIMESTAMP)
    `).run(
        invocationId,
        capability.capability_id,
        capability.version,
        actor.type || null,
        actor.id != null ? String(actor.id) : null,
        traceId,
        idempotencyKey || null,
        targetService || null,
        JSON.stringify(request || {})
    );
}

function completeInvocation(invocationId, httpStatus, responseBody) {
    db.get().prepare(`
        UPDATE capability_invocations
           SET status = 'succeeded', http_status = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE invocation_id = ?
    `).run(httpStatus, JSON.stringify(responseBody || {}), invocationId);
}

function failInvocation(invocationId, httpStatus, errorBody) {
    db.get().prepare(`
        UPDATE capability_invocations
           SET status = 'failed', http_status = ?, error_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE invocation_id = ?
    `).run(httpStatus, JSON.stringify(errorBody || {}), invocationId);
}

function findIdempotentInvocation(capabilityId, actor, idempotencyKey) {
    const row = db.get().prepare(`
        SELECT * FROM capability_invocations
         WHERE capability_id = ?
           AND actor_type = ?
           AND actor_id IS ?
           AND idempotency_key = ?
         ORDER BY created_at DESC
         LIMIT 1
    `).get(
        capabilityId,
        actor.type || null,
        actor.id != null ? String(actor.id) : null,
        idempotencyKey
    );
    return row ? hydrateInvocation(row) : null;
}

function hydrateInvocation(row) {
    return {
        invocation_id: row.invocation_id,
        capability_id: row.capability_id,
        capability_version: row.capability_version,
        actor_type: row.actor_type,
        actor_id: row.actor_id,
        trace_id: row.trace_id,
        idempotency_key: row.idempotency_key,
        target_service: row.target_service,
        status: row.status,
        http_status: row.http_status,
        request: safeParse(row.request_json) || {},
        response: safeParse(row.response_json) || null,
        error: safeParse(row.error_json) || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function emitEvent(events, eventType, actor, payload) {
    if (!events) return;
    events.publish('service.events', {
        event_type: eventType,
        source: 'openvibe-network',
        actor_type: actor.type,
        actor_id: actor.id,
        payload,
    }).catch((err) => console.warn(`[capability-invoke] event publish failed: ${err.message}`));
}

function enforceRateLimit(rateLimit, actor, capabilityId) {
    const perMinute = parsePositiveInt(rateLimit.requests_per_minute || rateLimit.per_minute || rateLimit.rpm);
    if (!perMinute || actor.type === 'anonymous') return;

    const bucketKey = `${capabilityId}:${actor.type}:${actor.id || 'anonymous'}`;
    const now = Date.now();
    const current = RATE_LIMIT_WINDOWS.get(bucketKey);
    if (!current || current.resetAt <= now) {
        RATE_LIMIT_WINDOWS.set(bucketKey, { count: 1, resetAt: now + 60_000 });
        return;
    }
    if (current.count >= perMinute) {
        const err = new Error('rate limit exceeded');
        err.status = 429;
        throw err;
    }
    current.count += 1;
}

function parsePositiveInt(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeParse(value) {
    try { return JSON.parse(value); } catch { return null; }
}

module.exports = { buildRouter };
