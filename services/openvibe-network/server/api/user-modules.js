'use strict';

// openvibe-network — user-modules API.
//
// Endpoints (mounted under /api/v1):
//   GET    /user-modules/:userId/:namespace
//   GET    /user-modules/:userId/:namespace/public
//   PUT    /user-modules/:userId/:namespace
//   PATCH  /user-modules/:userId/:namespace
//   GET    /user-modules/:userId
//   POST   /user-modules/:userId/batch
//   GET    /user-modules/:userId/:namespace/history

const express = require('express');

const db = require('../db');
const policy = require('../policy');
const namespaces = require('@openvibe/contracts/namespaces');
const {
    safeClone,
    unwrapDataSchema,
    mergePatch,
    validateSchema,
    filterReadableFields,
    collectWriteErrors,
    isPlainObject,
} = require('../schema-tools');

const MAX_USER_MODULE_BYTES = 64 * 1024;

function buildRouter(deps) {
    const r = express.Router();
    const { events } = deps;

    function resolveUserId(req, rawUserId) {
        if (String(rawUserId) !== 'me') return String(rawUserId);
        if (!req.user) return null;
        return String(req.user.sub || req.user.id || '');
    }

    function actorMeta(req) {
        const actor = policy.actorOfReq(req);
        return { actorType: actor.type, actorId: actor.id };
    }

    function assertKnownNamespace(namespace) {
        const def = namespaces.getNamespaceDef(namespace);
        if (!def && !namespaces.isModNamespace(namespace)) {
            const err = new Error(`unknown namespace: ${namespace}`);
            err.status = 400;
            throw err;
        }
    }

    function resolveOwner(req, namespace) {
        const def = namespaces.getNamespaceDef(namespace);
        if (def) return def.owner;
        const mod = namespaces.parseModNamespace(namespace);
        if (mod) return mod.modId;
        return req.serviceActor || 'unknown';
    }

    function getModuleRow(userId, namespace) {
        return db.get().prepare(
            `SELECT user_id, namespace, owner, schema_version, data_json, updated_at
               FROM user_modules
              WHERE user_id = ? AND namespace = ?`
        ).get(String(userId), String(namespace));
    }

    function getModuleContract(namespace) {
        const candidates = [
            `module:${namespace}`,
            `user_module:${namespace}`,
            `user-module:${namespace}`,
            String(namespace),
        ];
        const stmt = db.get().prepare(
            `SELECT contract_id, version, schema_json
               FROM contract_registry
              WHERE kind = 'user_module' AND contract_id = ?
              ORDER BY version DESC
              LIMIT 1`
        );
        for (const candidate of candidates) {
            const row = stmt.get(candidate);
            if (row) {
                return {
                    contract_id: row.contract_id,
                    version: row.version,
                    schema: safeParse(row.schema_json) || {},
                };
            }
        }
        return null;
    }

    function buildProjectionContext(req, userId, owner, publicOnly) {
        const actor = policy.actorOfReq(req);
        return {
            publicOnly: !!publicOnly,
            isAdmin: policy.isAdmin(req),
            isOwnerService: !!(req.serviceActor && owner && req.serviceActor === owner),
            isSelf: actor.type === 'user' && String(actor.id || '') === String(userId),
        };
    }

    function presentRow(row, req, publicOnly) {
        const contract = getModuleContract(row.namespace);
        const schema = unwrapDataSchema(contract && contract.schema);
        const rawData = safeParse(row.data_json) || {};
        const projected = schema
            ? filterReadableFields(schema, rawData, buildProjectionContext(req, row.user_id, row.owner, publicOnly))
            : safeClone(rawData);
        return {
            user_id: row.user_id,
            namespace: row.namespace,
            owner: row.owner,
            schema_version: row.schema_version,
            contract_id: contract && contract.contract_id || null,
            contract_version: contract && contract.version || null,
            data: projected === undefined ? {} : projected,
            updated_at: row.updated_at,
        };
    }

    function parseBodyData(reqBody) {
        const body = reqBody || {};
        if (body.data != null) return body.data;
        return {};
    }

    function parsePatch(reqBody) {
        const body = reqBody || {};
        if (isPlainObject(body.patch)) return body.patch;
        if (body.data != null) return body.data;
        return body;
    }

    function assertVersionMatch(existing, reqBody) {
        const expected = parsePositiveInt(reqBody && (reqBody.if_match_schema_version || reqBody.expected_schema_version));
        if (expected && existing && existing.schema_version !== expected) {
            const err = new Error(`schema version mismatch: expected ${expected}, found ${existing.schema_version}`);
            err.status = 409;
            throw err;
        }
    }

    function validateWrite({ req, userId, namespace, owner, data }) {
        const contract = getModuleContract(namespace);
        const schema = unwrapDataSchema(contract && contract.schema);
        const actor = policy.actorOfReq(req);
        const context = {
            isAdmin: policy.isAdmin(req),
            isOwnerService: !!(req.serviceActor && owner && req.serviceActor === owner),
            isSelf: actor.type === 'user' && String(actor.id || '') === String(userId),
        };
        const errors = [];

        if (schema) {
            collectWriteErrors(schema, data, context, errors);
            errors.push(...validateSchema(schema, data).errors);
        }

        if (Buffer.byteLength(JSON.stringify(data || {}), 'utf8') > MAX_USER_MODULE_BYTES) {
            errors.push(`$: module payload exceeds ${MAX_USER_MODULE_BYTES} bytes`);
        }

        return {
            ok: errors.length === 0,
            errors,
            contractVersion: contract && contract.version || null,
        };
    }

    function persistModule({ userId, namespace, owner, schemaVersion, data, actorType, actorId }) {
        const sql = db.get();
        const dataJson = JSON.stringify(data || {});
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
            `).run(String(userId), String(namespace), String(owner), schemaVersion, dataJson, actorType, actorId);

            sql.prepare(`
                INSERT INTO user_modules_history (user_id, namespace, schema_version, data_json, actor_type, actor_id)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(String(userId), String(namespace), schemaVersion, dataJson, actorType, actorId);
        });
        tx();
        return getModuleRow(userId, namespace);
    }

    function emitModuleUpdated(req, userId, namespace, schemaVersion) {
        if (!events) return;
        const a = actorMeta(req);
        events.publish('user.events', {
            event_type: 'user.module.updated',
            source: 'openvibe-network',
            actor_type: a.actorType,
            actor_id: a.actorId,
            payload: { user_id: String(userId), namespace, schema_version: schemaVersion },
        }).catch((err) => console.warn(`[user-modules] event publish failed: ${err.message}`));
    }

    r.get('/user-modules/:userId/:namespace/public', (req, res) => {
        const namespace = req.params.namespace;
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });
        const row = getModuleRow(userId, namespace);
        if (!row) return res.status(404).json({ error: 'not found' });
        res.json(presentRow(row, req, true));
    });

    r.post('/user-modules/:userId/batch', express.json({ limit: '256kb' }), (req, res) => {
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });
        const requestedNamespaces = Array.isArray(req.body && req.body.namespaces)
            ? req.body.namespaces.map(String)
            : [];
        if (requestedNamespaces.length === 0) {
            return res.status(400).json({ error: 'namespaces array required' });
        }

        const rows = requestedNamespaces
            .map((namespace) => getModuleRow(userId, namespace))
            .filter(Boolean)
            .filter((row) => policy.decideUserModuleRead({ req, userId, namespace: row.namespace }).allow)
            .map((row) => presentRow(row, req, false));

        const found = new Set(rows.map((row) => row.namespace));
        res.json({ items: rows, missing: requestedNamespaces.filter((namespace) => !found.has(namespace)) });
    });

    r.get('/user-modules/:userId/:namespace', (req, res) => {
        const namespace = req.params.namespace;
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });

        try {
            policy.assert(
                policy.decideUserModuleRead({ req, userId, namespace }),
                { ...actorMeta(req), action: 'read', resource: `user_module:${userId}:${namespace}` }
            );
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }

        const row = getModuleRow(userId, namespace);
        if (!row) return res.status(404).json({ error: 'not found' });
        res.json(presentRow(row, req, false));
    });

    r.put('/user-modules/:userId/:namespace', express.json({ limit: '256kb' }), (req, res) => {
        const namespace = req.params.namespace;
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });

        try {
            assertKnownNamespace(namespace);
            policy.assert(
                policy.decideUserModuleWrite({ req, userId, namespace }),
                { ...actorMeta(req), action: 'write', resource: `user_module:${userId}:${namespace}` }
            );

            const existing = getModuleRow(userId, namespace);
            assertVersionMatch(existing, req.body);

            const owner = resolveOwner(req, namespace);
            const data = parseBodyData(req.body);
            const validation = validateWrite({ req, userId, namespace, owner, data });
            if (!validation.ok) {
                return res.status(validation.errors.some(isOversizeError) ? 413 : 400)
                    .json({ error: 'invalid module payload', errors: validation.errors });
            }

            const schemaVersion = Number.isInteger(req.body && req.body.schema_version)
                ? req.body.schema_version
                : (validation.contractVersion || (existing && existing.schema_version) || 1);
            const a = actorMeta(req);
            const row = persistModule({
                userId,
                namespace,
                owner,
                schemaVersion,
                data,
                actorType: a.actorType,
                actorId: a.actorId,
            });
            emitModuleUpdated(req, userId, namespace, schemaVersion);
            return res.status(200).json(presentRow(row, req, false));
        } catch (err) {
            return res.status(err.status || 500).json({ error: err.message, reason: err.reason || null });
        }
    });

    r.patch('/user-modules/:userId/:namespace', express.json({ limit: '256kb' }), (req, res) => {
        const namespace = req.params.namespace;
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });

        try {
            assertKnownNamespace(namespace);
            policy.assert(
                policy.decideUserModuleWrite({ req, userId, namespace }),
                { ...actorMeta(req), action: 'patch', resource: `user_module:${userId}:${namespace}` }
            );

            const existing = getModuleRow(userId, namespace);
            if (!existing) return res.status(404).json({ error: 'not found' });
            assertVersionMatch(existing, req.body);

            const currentData = safeParse(existing.data_json) || {};
            const patch = parsePatch(req.body);
            const nextData = mergePatch(currentData, patch);
            const owner = resolveOwner(req, namespace);
            const validation = validateWrite({ req, userId, namespace, owner, data: nextData });
            if (!validation.ok) {
                return res.status(validation.errors.some(isOversizeError) ? 413 : 400)
                    .json({ error: 'invalid module patch', errors: validation.errors });
            }

            const schemaVersion = Number.isInteger(req.body && req.body.schema_version)
                ? req.body.schema_version
                : (validation.contractVersion || existing.schema_version || 1);
            const a = actorMeta(req);
            const row = persistModule({
                userId,
                namespace,
                owner,
                schemaVersion,
                data: nextData,
                actorType: a.actorType,
                actorId: a.actorId,
            });
            emitModuleUpdated(req, userId, namespace, schemaVersion);
            return res.status(200).json(presentRow(row, req, false));
        } catch (err) {
            return res.status(err.status || 500).json({ error: err.message, reason: err.reason || null });
        }
    });

    r.get('/user-modules/:userId', (req, res) => {
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });

        const rows = db.get().prepare(
            `SELECT user_id, namespace, owner, schema_version, data_json, updated_at
               FROM user_modules
              WHERE user_id = ?
              ORDER BY namespace`
        ).all(String(userId));

        const visible = rows
            .filter((row) => policy.decideUserModuleRead({ req, userId, namespace: row.namespace }).allow)
            .map((row) => presentRow(row, req, false));
        res.json({ items: visible });
    });

    r.get('/user-modules/:userId/:namespace/history', (req, res) => {
        const namespace = req.params.namespace;
        const userId = resolveUserId(req, req.params.userId);
        if (!userId) return res.status(401).json({ error: 'authentication required for /me alias' });

        const owner = resolveOwner(req, namespace);
        const isOwnerService = req.serviceActor && req.serviceActor === owner;
        if (!isOwnerService && !policy.isAdmin(req)) {
            return res.status(403).json({ error: 'history requires owner service or admin' });
        }

        const rows = db.get().prepare(
            `SELECT id, schema_version, data_json, actor_type, actor_id, recorded_at
               FROM user_modules_history
              WHERE user_id = ? AND namespace = ?
              ORDER BY id DESC
              LIMIT 200`
        ).all(String(userId), String(namespace));

        res.json({
            items: rows.map((row) => ({
                id: row.id,
                schema_version: row.schema_version,
                data: safeParse(row.data_json),
                actor_type: row.actor_type,
                actor_id: row.actor_id,
                recorded_at: row.recorded_at,
            })),
        });
    });

    return r;
}

function parsePositiveInt(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeParse(value) {
    try { return JSON.parse(value); } catch { return null; }
}

function isOversizeError(message) {
    return typeof message === 'string' && message.includes('exceeds');
}

module.exports = { buildRouter, MAX_USER_MODULE_BYTES };
