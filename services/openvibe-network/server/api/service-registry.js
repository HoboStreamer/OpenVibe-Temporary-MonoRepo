'use strict';

// openvibe-network — service registry API.

const express = require('express');
const db = require('../db');
const policy = require('../policy');

function buildRouter(deps) {
    const r = express.Router();
    const { events } = deps;

    r.get('/services', (_req, res) => {
        const rows = db.get().prepare(
            `SELECT service_id, display_name, description, internal_url, public_url,
                    capabilities_json, topics_json, metadata_json, last_heartbeat,
                    created_at, updated_at
             FROM service_registry ORDER BY service_id`
        ).all();
        res.json({ items: rows.map(hydrate) });
    });

    r.get('/services/:id', (req, res) => {
        const row = db.get().prepare(
            `SELECT * FROM service_registry WHERE service_id = ?`
        ).get(req.params.id);
        if (!row) return res.status(404).json({ error: 'not found' });
        res.json(hydrate(row));
    });

    r.post('/services', express.json(), async (req, res) => {
        const a = policy.actorOfReq(req);
        try {
            policy.assert(policy.decideRegistryWrite({ req, registry: 'service_registry' }),
                { actorType: a.type, actorId: a.id, action: 'register', resource: `service:${req.body && req.body.service_id || '?'}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const b = req.body || {};
        if (!b.service_id || !/^[a-z0-9_-]{2,64}$/i.test(String(b.service_id))) {
            return res.status(400).json({ error: 'service_id must match /^[a-z0-9_-]{2,64}$/' });
        }
        if (!b.display_name) return res.status(400).json({ error: 'display_name required' });

        db.get().prepare(`
            INSERT INTO service_registry (service_id, display_name, description, internal_url, public_url,
                                          capabilities_json, topics_json, metadata_json, last_heartbeat, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(service_id) DO UPDATE SET
                display_name = excluded.display_name,
                description = excluded.description,
                internal_url = excluded.internal_url,
                public_url = excluded.public_url,
                capabilities_json = excluded.capabilities_json,
                topics_json = excluded.topics_json,
                metadata_json = excluded.metadata_json,
                last_heartbeat = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            String(b.service_id),
            String(b.display_name),
            b.description || null,
            b.internal_url || null,
            b.public_url || null,
            JSON.stringify(Array.isArray(b.capabilities) ? b.capabilities : []),
            JSON.stringify(Array.isArray(b.topics) ? b.topics : []),
            JSON.stringify(b.metadata || {})
        );

        if (events) {
            events.publish('service.events', {
                event_type: 'service.registered',
                source: 'openvibe-network',
                actor_type: a.type, actor_id: a.id,
                payload: { service_id: b.service_id },
            }).catch(err => console.warn(`[service-registry] event publish failed: ${err.message}`));
        }

        const row = db.get().prepare(`SELECT * FROM service_registry WHERE service_id = ?`).get(String(b.service_id));
        res.status(201).json(hydrate(row));
    });

    r.post('/services/:id/heartbeat', express.json(), (req, res) => {
        const a = policy.actorOfReq(req);
        try {
            policy.assert(policy.decideRegistryWrite({ req, registry: 'service_registry.heartbeat' }),
                { actorType: a.type, actorId: a.id, action: 'heartbeat', resource: `service:${req.params.id}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const upd = db.get().prepare(
            `UPDATE service_registry SET last_heartbeat = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE service_id = ?`
        ).run(req.params.id);
        if (upd.changes === 0) return res.status(404).json({ error: 'not registered' });
        res.json({ ok: true, last_heartbeat: new Date().toISOString() });
    });

    return r;
}

function hydrate(row) {
    return {
        service_id: row.service_id,
        display_name: row.display_name,
        description: row.description,
        internal_url: row.internal_url,
        public_url: row.public_url,
        capabilities: safeParse(row.capabilities_json) || [],
        topics: safeParse(row.topics_json) || [],
        metadata: safeParse(row.metadata_json) || {},
        last_heartbeat: row.last_heartbeat,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

module.exports = { buildRouter };
