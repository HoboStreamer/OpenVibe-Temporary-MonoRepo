'use strict';

// openvibe-network — staff / capability model.
//
// Single source of truth for OpenVibe role rank, capability map, and the
// staff endpoints used by admin.openvibe.network. The model deliberately
// mirrors the legacy hobo role hierarchy (`user < streamer < global_mod < admin`)
// so migrated users keep working capabilities, but the capability map is
// expanded to cover the OpenVibe registry / settings / migration surfaces.

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const audit = require('../audit');
const { broadcastInternalNotification } = require('../notifications/broadcast');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const ROLE_RANK = { user: 0, streamer: 1, global_mod: 2, admin: 3 };

const CAPABILITIES = {
    user: [],
    streamer: ['create_stream', 'manage_own_channel'],
    global_mod: [
        'moderate_global', 'manage_site_bans', 'view_all_logs',
    ],
    admin: [
        'admin_panel', 'manage_users', 'manage_roles', 'manage_settings',
        'broadcast_notifications', 'manage_storage', 'manage_registry',
        'manage_themes', 'manage_compat', 'manage_deploy',
    ],
};

function rankOf(role) {
    return ROLE_RANK[String(role || 'user').toLowerCase()] ?? 0;
}

function capabilitiesOf(role) {
    const out = new Set();
    for (const [r, caps] of Object.entries(CAPABILITIES)) {
        if (rankOf(r) <= rankOf(role)) caps.forEach((c) => out.add(c));
    }
    return [...out];
}

function ensureTables() {
    const d = db.get();
    d.exec(`
        CREATE TABLE IF NOT EXISTS staff_roles (
            user_id      TEXT PRIMARY KEY,
            role         TEXT NOT NULL DEFAULT 'user',
            granted_by   TEXT,
            granted_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS staff_audit (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_id    TEXT,
            actor_role  TEXT,
            action      TEXT NOT NULL,
            target_id   TEXT,
            detail_json TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_staff_audit_recent ON staff_audit(recorded_at DESC);
    `);
}

function getRole(userId) {
    if (!userId) return 'user';
    const row = db.get().prepare('SELECT role FROM staff_roles WHERE user_id = ?').get(String(userId));
    return row ? row.role : 'user';
}

function setRole({ userId, role, actor }) {
    if (!ROLE_RANK[role]) throw new Error(`unknown role: ${role}`);
    db.get().prepare(`
        INSERT INTO staff_roles (user_id, role, granted_by, granted_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            role = excluded.role,
            granted_by = excluded.granted_by,
            granted_at = CURRENT_TIMESTAMP
    `).run(String(userId), role, actor && actor.id ? String(actor.id) : null);
    recordAudit({ actor, action: 'role.update', target: userId, detail: { role } });
}

function recordAudit({ actor, action, target, detail }) {
    db.get().prepare(`
        INSERT INTO staff_audit (actor_id, actor_role, action, target_id, detail_json)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        actor && actor.id ? String(actor.id) : null,
        actor && actor.role ? actor.role : null,
        String(action),
        target == null ? null : String(target),
        detail ? JSON.stringify(detail) : null,
    );
}

function listGlobalModerators() {
    return db.get().prepare(
        "SELECT user_id, role, granted_by, granted_at FROM staff_roles WHERE role IN ('global_mod','admin') ORDER BY granted_at DESC",
    ).all();
}

function recentAudit({ limit = 100 } = {}) {
    return db.get().prepare(
        'SELECT id, actor_id, actor_role, action, target_id, detail_json, recorded_at FROM staff_audit ORDER BY id DESC LIMIT ?',
    ).all(Math.min(Number(limit) || 100, 500));
}

function readJsonIfExists(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function summarizeChecks(checks) {
    const summary = { green: 0, yellow: 0, red: 0 };
    for (const check of checks || []) {
        if (check && summary[check.status] != null) {
            summary[check.status] += 1;
        }
    }
    return summary;
}

function artifactInfo(rootDir, relativePath) {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) {
        return { path: relativePath, exists: false, size_bytes: 0, updated_at: null };
    }
    const stat = fs.statSync(fullPath);
    return {
        path: relativePath,
        exists: true,
        size_bytes: stat.size,
        updated_at: stat.mtime.toISOString(),
    };
}

function buildMigrationStatus(rootDir = REPO_ROOT) {
    const importPath = path.join('data', 'migrations', 'hobo-production-staging', 'openvibe-target', 'audit', 'import-report.json');
    const validationPath = path.join('data', 'migrations', 'hobo-production-staging', 'openvibe-target', 'audit', 'validation-summary.json');
    const stagingPath = path.join('data', 'migrations', 'hobo-production-staging', 'openvibe-target', 'audit', 'staging-load-report.json');
    const mediaPath = path.join('data', 'migrations', 'hobo-production-staging', 'openvibe-target', 'audit', 'media-backfill-report.json');
    const readinessPath = path.join('data', 'migrations', 'hobo-production-staging', 'openvibe-target', 'audit', 'readiness-report.json');
    const cutoverPath = path.join('data', 'migrations', 'cutover-report.json');

    const importReport = readJsonIfExists(path.join(rootDir, importPath));
    const validationReport = readJsonIfExists(path.join(rootDir, validationPath));
    const stagingReport = readJsonIfExists(path.join(rootDir, stagingPath));
    const mediaReport = readJsonIfExists(path.join(rootDir, mediaPath));
    const readinessReport = readJsonIfExists(path.join(rootDir, readinessPath));
    const cutoverReport = readJsonIfExists(path.join(rootDir, cutoverPath));

    const artifacts = [
        artifactInfo(rootDir, importPath),
        artifactInfo(rootDir, validationPath),
        artifactInfo(rootDir, stagingPath),
        artifactInfo(rootDir, mediaPath),
        artifactInfo(rootDir, readinessPath),
        artifactInfo(rootDir, cutoverPath),
    ];

    return {
        generated_at: new Date().toISOString(),
        artifacts,
        import: importReport ? {
            dataset_count: Object.keys(importReport.datasets || {}).length,
            exclusion_count: (importReport.exclusions || []).length,
            warning_count: (importReport.warnings || []).length,
        } : null,
        validation: validationReport ? {
            summary: validationReport.summary || summarizeChecks(validationReport.checks),
            dataset_count: Object.keys(validationReport.datasets || {}).length,
        } : null,
        staging: stagingReport ? {
            run_id: stagingReport.run_id || null,
            dry_run: !!stagingReport.dry_run,
            load_scope: stagingReport.load_scope || null,
            dataset_count: Object.keys(stagingReport.datasets || {}).length,
            manual_action_count: (stagingReport.manual_actions || []).length,
            selected_services: stagingReport.selected_services || [],
            selected_datasets: stagingReport.selected_datasets || [],
        } : null,
        media: mediaReport ? {
            copied_records: mediaReport.copied_records || 0,
            copied_bytes: mediaReport.copied_bytes || 0,
            missing_files: (mediaReport.missing_files || []).length,
            strict_mode: !!mediaReport.strict_mode,
        } : null,
        readiness: readinessReport ? {
            summary: readinessReport.summary || summarizeChecks(readinessReport.checks),
            manual_action_count: (readinessReport.manual_actions || []).length,
        } : null,
        cutover: cutoverReport ? {
            gate: cutoverReport.gate || null,
            summary: cutoverReport.summary || summarizeChecks(cutoverReport.checks),
            check_count: (cutoverReport.checks || []).length,
        } : null,
        manual_actions_preview: (stagingReport && stagingReport.manual_actions || []).slice(0, 10),
    };
}

async function fetchJson(url, internalKey) {
    if (!url) {
        return { ok: false, url: null, error: 'not configured' };
    }

    try {
        const response = await fetch(url, {
            headers: {
                'accept': 'application/json',
                'x-internal-key': internalKey,
                'x-openvibe-service': 'openvibe-network',
            },
        });
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = text || null;
        }
        return response.ok
            ? { ok: true, url, body }
            : { ok: false, url, status: response.status, body, error: body && body.error || `http_${response.status}` };
    } catch (error) {
        return { ok: false, url, error: error.message };
    }
}

function unwrapFetch(record) {
    if (!record) return null;
    if (record.ok) return record.body;
    if (record.body && typeof record.body === 'object' && !Array.isArray(record.body)) {
        return Object.assign({}, record.body, {
            error: record.error || record.body.error || null,
            http_status: record.status || null,
            url: record.url || null,
        });
    }
    return {
        error: record.error || 'request failed',
        http_status: record.status || null,
        url: record.url || null,
        body: record.body || null,
    };
}

async function buildRuntimeStatus(config) {
    // Phase 16 — pull a small capability summary from @openvibe/contracts so
    // the admin matrix can render shipped/deferred counts truthfully.
    let capabilityCatalog = null;
    try {
        const { describeProductCapabilityCatalog } = require('@openvibe/contracts/product-capabilities');
        capabilityCatalog = describeProductCapabilityCatalog();
    } catch (error) {
        capabilityCatalog = { error: error.message || 'capability_catalog_unavailable' };
    }

    const [
        eventsHealth,
        eventsReadiness,
        workersHealth,
        workersReadiness,
        workersRuntime,
        workersQueues,
        realtimeHealth,
        realtimeReadiness,
        realtimeConnections,
        realtimeBridge,
        tipsProduct,
        vipProduct,
        aiProduct,
        contentProduct,
        liveIntegrations,
    ] = await Promise.all([
        fetchJson(`${config.events.url}/health`, config.internalKey),
        fetchJson(`${config.events.url}/ready`, config.internalKey),
        fetchJson(`${config.workers.internalUrl}/health`, config.internalKey),
        fetchJson(`${config.workers.internalUrl}/ready`, config.internalKey),
        fetchJson(`${config.workers.internalUrl}/api/v1/runtime`, config.internalKey),
        fetchJson(`${config.workers.internalUrl}/api/v1/queues`, config.internalKey),
        fetchJson(`${config.realtime.internalUrl}/health`, config.internalKey),
        fetchJson(`${config.realtime.internalUrl}/ready`, config.internalKey),
        fetchJson(`${config.realtime.internalUrl}/api/v1/realtime/connections`, config.internalKey),
        fetchJson(`${config.realtime.internalUrl}/api/v1/realtime/bridge`, config.internalKey),
        config.billing && config.billing.internalUrl
            ? fetchJson(`${config.billing.internalUrl}/api/tips/product/status`, config.internalKey)
            : Promise.resolve(null),
        config.billing && config.billing.internalUrl
            ? fetchJson(`${config.billing.internalUrl}/api/vip/product/status`, config.internalKey)
            : Promise.resolve(null),
        config.ai && config.ai.internalUrl
            ? fetchJson(`${config.ai.internalUrl}/api/v1/ai/product/status`, config.internalKey)
            : Promise.resolve(null),
        config.content && config.content.internalUrl
            ? fetchJson(`${config.content.internalUrl}/api/v1/content/product/status`, config.internalKey)
            : Promise.resolve(null),
        config.live && config.live.internalUrl
            ? fetchJson(`${config.live.internalUrl}/api/v1/integrations/product/status`, config.internalKey)
            : Promise.resolve(null),
    ]);

    return {
        generated_at: new Date().toISOString(),
        services: {
            events: {
                health: unwrapFetch(eventsHealth),
                readiness: unwrapFetch(eventsReadiness),
            },
            workers: {
                health: unwrapFetch(workersHealth),
                readiness: unwrapFetch(workersReadiness),
                runtime: unwrapFetch(workersRuntime),
                queues: unwrapFetch(workersQueues),
            },
            realtime: {
                health: unwrapFetch(realtimeHealth),
                readiness: unwrapFetch(realtimeReadiness),
                connections: unwrapFetch(realtimeConnections),
                bridge: unwrapFetch(realtimeBridge),
            },
        },
        products: {
            tips: unwrapFetch(tipsProduct),
            vip: unwrapFetch(vipProduct),
            ai: unwrapFetch(aiProduct),
            content: unwrapFetch(contentProduct),
            live_integrations: unwrapFetch(liveIntegrations),
        },
        capabilities: capabilityCatalog,
    };
}

function actorOfReq(req) {
    const u = req.user || {};
    const role = u.role || (u.id ? getRole(u.id) : 'user');
    return { id: u.id, role, capabilities: capabilitiesOf(role) };
}

function serviceActorOfReq(req) {
    const serviceId = typeof req.serviceActor === 'string'
        ? req.serviceActor
        : req.serviceActor && req.serviceActor.id || null;
    return serviceId ? { id: serviceId, role: 'service', capabilities: ['broadcast_notifications'] } : null;
}

function requireCapability(cap) {
    return (req, res, next) => {
        const a = actorOfReq(req);
        if (!a.capabilities.includes(cap)) {
            return res.status(403).json({ error: 'forbidden', required: cap, role: a.role });
        }
        req.staffActor = a;
        next();
    };
}

function buildRouter(deps) {
    ensureTables();
    const r = express.Router();
    const config = deps && deps.config || null;

    r.get('/staff/capabilities', (req, res) => {
        const userId = req.query.user || (req.user && req.user.id) || null;
        const role = userId ? getRole(userId) : 'user';
        res.json({ user_id: userId, role, capabilities: capabilitiesOf(role) });
    });

    r.get('/staff/global-moderators', requireCapability('view_all_logs'), (_req, res) => {
        res.json({ items: listGlobalModerators() });
    });

    r.put('/staff/roles/:id', express.json(), requireCapability('manage_roles'), (req, res) => {
        const role = req.body && req.body.role;
        try {
            setRole({ userId: req.params.id, role, actor: req.staffActor });
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
        res.json({ ok: true, user_id: req.params.id, role });
    });

    r.get('/admin/users', requireCapability('manage_users'), (_req, res) => {
        const rows = db.get().prepare('SELECT user_id, role, granted_at FROM staff_roles ORDER BY user_id').all();
        // Also fetch recently active registered users (last 500 by created_at) with ban status
        let allUsers = [];
        try {
            allUsers = db.get().prepare(
                'SELECT id AS user_id, username, display_name, email, is_banned, ban_reason, created_at, last_login_at FROM auth_users ORDER BY created_at DESC LIMIT 500'
            ).all();
        } catch { /* auth_users may not be Postgres-backed yet */ }
        // Merge staff_roles into user list
        const roleMap = {};
        for (const r of rows) roleMap[r.user_id] = r;
        const merged = allUsers.map((u) => ({
            ...u,
            role: (roleMap[u.user_id] && roleMap[u.user_id].role) || 'user',
            granted_at: roleMap[u.user_id] && roleMap[u.user_id].granted_at || null,
        }));
        // Include staff with no auth_users row (legacy system users)
        for (const r of rows) {
            if (!merged.find((u) => u.user_id === r.user_id)) {
                merged.push({ user_id: r.user_id, username: r.user_id, role: r.role, granted_at: r.granted_at });
            }
        }
        res.json({ items: merged });
    });

    r.put('/admin/users/:id/role', express.json(), requireCapability('manage_roles'), (req, res) => {
        const role = req.body && req.body.role;
        try {
            setRole({ userId: req.params.id, role, actor: req.staffActor });
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
        res.json({ ok: true });
    });

    r.put('/admin/users/:id/ban', express.json(), requireCapability('manage_site_bans'), (req, res) => {
        const banned = req.body && req.body.banned !== false;
        const reason = (req.body && typeof req.body.reason === 'string') ? req.body.reason.slice(0, 500) : null;
        try {
            db.get().prepare(
                'UPDATE auth_users SET is_banned = ?, ban_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(banned ? 1 : 0, banned ? reason : null, req.params.id);
        } catch (err) {
            // Non-fatal if user not found in SQLite (may be Postgres-only)
        }
        recordAudit({ actor: req.staffActor, action: banned ? 'admin.ban' : 'admin.unban', target: req.params.id, detail: { reason, banned } });
        res.json({ ok: true, banned });
    });

    r.get('/admin/audit', requireCapability('view_all_logs'), (req, res) => {
        res.json({ items: recentAudit({ limit: req.query.limit }) });
    });

    r.get('/admin/migration-status', (_req, res) => {
        res.json(buildMigrationStatus());
    });

    r.get('/admin/runtime-status', async (_req, res) => {
        if (!config) return res.status(503).json({ error: 'runtime status configuration unavailable' });
        res.json(await buildRuntimeStatus(config));
    });

    r.post('/admin/broadcast', express.json(), requireCapability('broadcast_notifications'), (req, res) => {
        recordAudit({ actor: req.staffActor, action: 'admin.broadcast', target: null, detail: req.body || {} });
        res.json({ ok: true, queued: true });
    });

    r.post('/internal/notifications/broadcast', express.json(), (req, res) => {
        const serviceActor = serviceActorOfReq(req);
        if (!serviceActor) {
            return res.status(403).json({ error: 'internal service actor required' });
        }
        res.status(202).json(broadcastInternalNotification({ recordAudit }, req.body || {}, serviceActor));
    });

    return r;
}

module.exports = {
    CAPABILITIES,
    ROLE_RANK,
    actorOfReq,
    buildRouter,
    capabilitiesOf,
    ensureTables,
    getRole,
    rankOf,
    recentAudit,
    recordAudit,
    buildMigrationStatus,
    buildRuntimeStatus,
    requireCapability,
    setRole,
};
