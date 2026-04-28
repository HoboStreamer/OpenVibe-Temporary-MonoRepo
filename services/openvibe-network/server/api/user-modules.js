'use strict';

// openvibe-network — user-modules API.
//
// Endpoints (mounted under /api/v1):
//   GET    /user-modules/:userId/:namespace
//   PUT    /user-modules/:userId/:namespace      (full overwrite, requires owner-service or self+writable)
//   GET    /user-modules/:userId                 (list all namespaces visible to caller)
//   GET    /user-modules/:userId/:namespace/history
//
// All writes are audited; the previous value is preserved in user_modules_history.

const express = require('express');
const db = require('../db');
const policy = require('../policy');
const audit = require('../audit');
const namespaces = require('@openvibe/contracts/namespaces');

function buildRouter(deps) {
    const r = express.Router();
    const { events } = deps;

    function resolveUserId(req, rawUserId) {
        if (String(rawUserId) !== 'me') return String(rawUserId);
        if (!req.user) return null;
        return String(req.user.sub || req.user.id || '');
    }

    function actorMeta(req) {
        const a = policy.actorOfReq(req);
        return { actorType: a.type, actorId: a.id };
    }

    // GET single
    r.get('/user-modules/:userId/:namespace', (req, res) => {
        const namespace = req.params.namespace;
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });
        try {
            policy.assert(policy.decideUserModuleRead({ req, userId, namespace }),
                { ...actorMeta(req), action: 'read', resource: `user_module:${userId}:${namespace}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const row = db.get().prepare(
            `SELECT user_id, namespace, owner, schema_version, data_json, updated_at
             FROM user_modules WHERE user_id = ? AND namespace = ?`
        ).get(String(userId), String(namespace));
        if (!row) return res.status(404).json({ error: 'not found' });
        res.json(hydrate(row));
    });

    // PUT (upsert full)
    r.put('/user-modules/:userId/:namespace', express.json(), async (req, res) => {
        const namespace = req.params.namespace;
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });
        const body = req.body || {};
        const def = namespaces.getNamespaceDef(namespace);
        if (!def && !namespaces.isModNamespace(namespace)) {
            return res.status(400).json({ error: `unknown namespace: ${namespace}` });
        }
        try {
            policy.assert(policy.decideUserModuleWrite({ req, userId, namespace }),
                { ...actorMeta(req), action: 'write', resource: `user_module:${userId}:${namespace}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }

        const owner = (def && def.owner) || (namespaces.parseModNamespace(namespace) || {}).modId || req.serviceActor || 'unknown';
        const schemaVersion = Number.isInteger(body.schema_version) ? body.schema_version : 1;
        const data = body.data != null ? body.data : {};
        const dataJson = JSON.stringify(data);
        const a = actorMeta(req);

        const sql = db.get();
        const tx = sql.transaction(() => {
            sql.prepare(`
                INSERT INTO user_modules (user_id, namespace, owner, schema_version, data_json, updated_by_actor_type, updated_by_actor_id, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, namespace) DO UPDATE SET
                    owner = excluded.owner,
                    schema_version = excluded.schema_version,
                    data_json = excluded.data_json,
                    updated_by_actor_type = excluded.updated_by_actor_type,
                    updated_by_actor_id = excluded.updated_by_actor_id,
                    updated_at = CURRENT_TIMESTAMP
            `).run(String(userId), String(namespace), owner, schemaVersion, dataJson, a.actorType, a.actorId);

            sql.prepare(`
                INSERT INTO user_modules_history (user_id, namespace, schema_version, data_json, actor_type, actor_id)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(String(userId), String(namespace), schemaVersion, dataJson, a.actorType, a.actorId);
        });
        tx();

        // Best-effort fan-out: failure here must NOT fail the write.
        if (events) {
            events.publish('user.events', {
                event_type: 'user.module.updated',
                source: 'openvibe-network',
                actor_type: a.actorType,
                actor_id: a.actorId,
                payload: { user_id: String(userId), namespace, schema_version: schemaVersion },
            }).catch(err => console.warn(`[user-modules] event publish failed: ${err.message}`));
        }

        const row = sql.prepare(
            `SELECT user_id, namespace, owner, schema_version, data_json, updated_at
             FROM user_modules WHERE user_id = ? AND namespace = ?`
        ).get(String(userId), String(namespace));
        res.status(200).json(hydrate(row));
    });

    // List all namespaces for a user (filtered to ones the caller may read)
    r.get('/user-modules/:userId', (req, res) => {
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });
        const rows = db.get().prepare(
            `SELECT user_id, namespace, owner, schema_version, data_json, updated_at
             FROM user_modules WHERE user_id = ? ORDER BY namespace`
        ).all(String(userId));
        const visible = rows
            .filter(row => policy.decideUserModuleRead({ req, userId, namespace: row.namespace }).allow)
            .map(hydrate);
        res.json({ items: visible });
    });

    // History (admin-or-owner-service only)
    r.get('/user-modules/:userId/:namespace/history', (req, res) => {
        const namespace = req.params.namespace;
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });
        const def = namespaces.getNamespaceDef(namespace);
        const owner = def ? def.owner : (namespaces.parseModNamespace(namespace) || {}).modId || null;
        const isOwnerService = req.serviceActor && req.serviceActor === owner;
        if (!isOwnerService && !policy.isAdmin(req)) {
            return res.status(403).json({ error: 'history requires owner service or admin' });
        }
        const rows = db.get().prepare(
            `SELECT id, schema_version, data_json, actor_type, actor_id, recorded_at
             FROM user_modules_history WHERE user_id = ? AND namespace = ?
             ORDER BY id DESC LIMIT 200`
        ).all(String(userId), String(namespace));
        res.json({ items: rows.map(r => ({ ...r, data: safeParse(r.data_json) })) });
    });

    return r;
}

function hydrate(row) {
    return {
        user_id: row.user_id,
        namespace: row.namespace,
        owner: row.owner,
        schema_version: row.schema_version,
        data: safeParse(row.data_json),
        updated_at: row.updated_at,
    };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

module.exports = { buildRouter };
