'use strict';

// openvibe-network — staff / capability model.
//
// Single source of truth for OpenVibe role rank, capability map, and the
// staff endpoints used by admin.openvibe.network. The model deliberately
// mirrors the legacy hobo role hierarchy (`user < streamer < global_mod < admin`)
// so migrated users keep working capabilities, but the capability map is
// expanded to cover the OpenVibe registry / settings / migration surfaces.

const express = require('express');
const db = require('../db');
const audit = require('../audit');

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

function actorOfReq(req) {
    const u = req.user || {};
    const role = u.role || (u.id ? getRole(u.id) : 'user');
    return { id: u.id, role, capabilities: capabilitiesOf(role) };
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

function buildRouter() {
    ensureTables();
    const r = express.Router();

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
        res.json({ items: rows });
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
        recordAudit({ actor: req.staffActor, action: 'admin.ban', target: req.params.id, detail: req.body || {} });
        res.json({ ok: true, queued: true });
    });

    r.get('/admin/audit', requireCapability('view_all_logs'), (req, res) => {
        res.json({ items: recentAudit({ limit: req.query.limit }) });
    });

    r.post('/admin/broadcast', express.json(), requireCapability('broadcast_notifications'), (req, res) => {
        recordAudit({ actor: req.staffActor, action: 'admin.broadcast', target: null, detail: req.body || {} });
        res.json({ ok: true, queued: true });
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
    requireCapability,
    setRole,
};
