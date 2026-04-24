'use strict';

// openvibe-network — capability registry API.

const express = require('express');
const db = require('../db');
const policy = require('../policy');

function buildRouter(deps) {
    const r = express.Router();
    const { events } = deps;

    r.get('/capabilities', (req, res) => {
        const filter = req.query.owner_service ? ' WHERE owner_service = ?' : '';
        const args = req.query.owner_service ? [String(req.query.owner_service)] : [];
        const rows = db.get().prepare(
            `SELECT capability_id, version, owner_service, description,
                    input_schema_json, output_schema_json, policy_json, rate_limit_json,
                    emits_topics_json, deprecated, created_at, updated_at
             FROM capability_registry${filter}
             ORDER BY capability_id, version DESC`
        ).all(...args);
        res.json({ items: rows.map(hydrate) });
    });

    r.get('/capabilities/:id', (req, res) => {
        const id = req.params.id;
        const version = req.query.version ? parseInt(req.query.version, 10) : null;
        const row = version
            ? db.get().prepare(`SELECT * FROM capability_registry WHERE capability_id = ? AND version = ?`).get(id, version)
            : db.get().prepare(`SELECT * FROM capability_registry WHERE capability_id = ? ORDER BY version DESC LIMIT 1`).get(id);
        if (!row) return res.status(404).json({ error: 'not found' });
        res.json(hydrate(row));
    });

    r.post('/capabilities', express.json(), (req, res) => {
        const a = policy.actorOfReq(req);
        try {
            policy.assert(policy.decideRegistryWrite({ req, registry: 'capability_registry' }),
                { actorType: a.type, actorId: a.id, action: 'register', resource: `capability:${req.body && req.body.capability_id || '?'}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const b = req.body || {};
        if (!b.capability_id || typeof b.capability_id !== 'string') return res.status(400).json({ error: 'capability_id required' });
        if (!b.owner_service)  return res.status(400).json({ error: 'owner_service required' });
        const version = Number.isInteger(b.version) && b.version > 0 ? b.version : 1;

        db.get().prepare(`
            INSERT INTO capability_registry (capability_id, version, owner_service, description,
                input_schema_json, output_schema_json, policy_json, rate_limit_json,
                emits_topics_json, deprecated, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(capability_id, version) DO UPDATE SET
                owner_service = excluded.owner_service,
                description = excluded.description,
                input_schema_json = excluded.input_schema_json,
                output_schema_json = excluded.output_schema_json,
                policy_json = excluded.policy_json,
                rate_limit_json = excluded.rate_limit_json,
                emits_topics_json = excluded.emits_topics_json,
                deprecated = excluded.deprecated,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            String(b.capability_id),
            version,
            String(b.owner_service),
            b.description || null,
            JSON.stringify(b.input_schema || {}),
            JSON.stringify(b.output_schema || {}),
            JSON.stringify(b.policy || {}),
            JSON.stringify(b.rate_limit || {}),
            JSON.stringify(Array.isArray(b.emits_topics) ? b.emits_topics : []),
            b.deprecated ? 1 : 0
        );

        if (events) {
            events.publish('service.events', {
                event_type: 'service.capability.registered',
                source: 'openvibe-network',
                actor_type: a.type, actor_id: a.id,
                payload: { capability_id: b.capability_id, version, owner_service: b.owner_service },
            }).catch(err => console.warn(`[capability-registry] event publish failed: ${err.message}`));
        }

        res.status(201).json({ ok: true, capability_id: b.capability_id, version });
    });

    return r;
}

function hydrate(row) {
    return {
        capability_id: row.capability_id,
        version: row.version,
        owner_service: row.owner_service,
        description: row.description,
        input_schema: safeParse(row.input_schema_json) || {},
        output_schema: safeParse(row.output_schema_json) || {},
        policy: safeParse(row.policy_json) || {},
        rate_limit: safeParse(row.rate_limit_json) || {},
        emits_topics: safeParse(row.emits_topics_json) || [],
        deprecated: !!row.deprecated,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

module.exports = { buildRouter };
