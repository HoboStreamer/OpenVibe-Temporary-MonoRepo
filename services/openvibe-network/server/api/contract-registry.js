'use strict';

// openvibe-network — contract registry API.
//
// A "contract" is the schema for a versioned platform interface:
// event envelopes, capability inputs/outputs, user-module shapes,
// media metadata blobs, or service manifests.

const express = require('express');
const db = require('../db');
const policy = require('../policy');

const KINDS = new Set(['event', 'capability', 'user_module', 'media', 'service_manifest']);

function buildRouter(deps) {
    const r = express.Router();
    const { events } = deps;

    r.get('/contracts', (req, res) => {
        const filter = req.query.kind ? ' WHERE kind = ?' : '';
        const args = req.query.kind ? [String(req.query.kind)] : [];
        const rows = db.get().prepare(
            `SELECT contract_id, version, kind, owner_service, schema_json, description, deprecated, created_at, updated_at
             FROM contract_registry${filter} ORDER BY contract_id, version DESC`
        ).all(...args);
        res.json({ items: rows.map(hydrate) });
    });

    r.get('/contracts/:id', (req, res) => {
        const id = req.params.id;
        const version = req.query.version ? parseInt(req.query.version, 10) : null;
        const row = version
            ? db.get().prepare(`SELECT * FROM contract_registry WHERE contract_id = ? AND version = ?`).get(id, version)
            : db.get().prepare(`SELECT * FROM contract_registry WHERE contract_id = ? ORDER BY version DESC LIMIT 1`).get(id);
        if (!row) return res.status(404).json({ error: 'not found' });
        res.json(hydrate(row));
    });

    r.post('/contracts', express.json(), (req, res) => {
        const a = policy.actorOfReq(req);
        try {
            policy.assert(policy.decideRegistryWrite({ req, registry: 'contract_registry' }),
                { actorType: a.type, actorId: a.id, action: 'register', resource: `contract:${req.body && req.body.contract_id || '?'}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const b = req.body || {};
        if (!b.contract_id) return res.status(400).json({ error: 'contract_id required' });
        if (!b.kind || !KINDS.has(String(b.kind))) return res.status(400).json({ error: `kind must be one of ${[...KINDS].join(',')}` });
        if (!b.owner_service) return res.status(400).json({ error: 'owner_service required' });
        if (b.schema == null || typeof b.schema !== 'object') return res.status(400).json({ error: 'schema (object) required' });
        const version = Number.isInteger(b.version) && b.version > 0 ? b.version : 1;

        db.get().prepare(`
            INSERT INTO contract_registry (contract_id, version, kind, owner_service, schema_json, description, deprecated, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(contract_id, version) DO UPDATE SET
                kind = excluded.kind,
                owner_service = excluded.owner_service,
                schema_json = excluded.schema_json,
                description = excluded.description,
                deprecated = excluded.deprecated,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            String(b.contract_id),
            version,
            String(b.kind),
            String(b.owner_service),
            JSON.stringify(b.schema),
            b.description || null,
            b.deprecated ? 1 : 0
        );

        if (events) {
            events.publish('service.events', {
                event_type: 'service.contract.registered',
                source: 'openvibe-network',
                actor_type: a.type, actor_id: a.id,
                payload: { contract_id: b.contract_id, version, kind: b.kind, owner_service: b.owner_service },
            }).catch(err => console.warn(`[contract-registry] event publish failed: ${err.message}`));
        }

        res.status(201).json({ ok: true, contract_id: b.contract_id, version });
    });

    return r;
}

function hydrate(row) {
    return {
        contract_id: row.contract_id,
        version: row.version,
        kind: row.kind,
        owner_service: row.owner_service,
        schema: safeParse(row.schema_json) || {},
        description: row.description,
        deprecated: !!row.deprecated,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

module.exports = { buildRouter };
