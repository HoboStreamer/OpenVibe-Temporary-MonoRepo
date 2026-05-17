'use strict';

// openvibe-network — notifications REST API
//
// Routes:
//   GET  /api/v1/notifications          — list user notifications (unread first)
//   GET  /api/v1/notifications/unread-count — badge count only
//   POST /api/v1/notifications          — create notification (internal service use)
//   POST /api/v1/notifications/:id/read — mark one notification read
//   POST /api/v1/notifications/read-all — mark all read
//   DELETE /api/v1/notifications/:id   — dismiss notification

const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const audit = require('../audit');

function nowIso() { return new Date().toISOString(); }
function randomId() { return crypto.randomBytes(16).toString('hex'); }

function ensureTables() {
    // control_notifications table is created in the main db.js schema.
    // Nothing extra needed here.
}

function listNotificationsForUser(userId, { limit = 50, unreadOnly = false, before = null } = {}) {
    const d = db.get();
    const cap = Math.min(Number(limit) || 50, 200);
    let sql = 'SELECT * FROM control_notifications WHERE user_id = ? AND is_dismissed = 0';
    const params = [String(userId)];
    if (unreadOnly) { sql += ' AND is_read = 0'; }
    if (before) {
        sql += ' AND created_at < ?';
        params.push(String(before));
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(cap);
    return d.prepare(sql).all(...params);
}

function countUnread(userId) {
    const row = db.get()
        .prepare('SELECT COUNT(*) as cnt FROM control_notifications WHERE user_id = ? AND is_read = 0 AND is_dismissed = 0')
        .get(String(userId));
    return row ? row.cnt : 0;
}

function getNotification(id) {
    return db.get().prepare('SELECT * FROM control_notifications WHERE id = ?').get(String(id));
}

function createNotification({ userId, type, title, message, category, priority, icon, senderUserId, senderName, senderAvatar, service, url, richContent, expiresAt }) {
    const id = randomId();
    const now = nowIso();
    db.get().prepare(`
        INSERT INTO control_notifications
            (id, user_id, type, category, priority, title, message, icon, sender_user_id, sender_name, sender_avatar, service, url, rich_content_json, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        String(userId),
        String(type || 'info'),
        category || null,
        priority || 'normal',
        String(title),
        message || null,
        icon || null,
        senderUserId || null,
        senderName || null,
        senderAvatar || null,
        service || null,
        url || null,
        richContent ? JSON.stringify(richContent) : null,
        expiresAt || null,
        now,
        now,
    );
    return getNotification(id);
}

function markRead(id, userId) {
    const now = nowIso();
    const result = db.get().prepare(`
        UPDATE control_notifications
        SET is_read = 1, read_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND is_read = 0
    `).run(now, now, String(id), String(userId));
    return result.changes > 0;
}

function markAllRead(userId) {
    const now = nowIso();
    const result = db.get().prepare(`
        UPDATE control_notifications
        SET is_read = 1, read_at = ?, updated_at = ?
        WHERE user_id = ? AND is_read = 0 AND is_dismissed = 0
    `).run(now, now, String(userId));
    return result.changes;
}

function dismiss(id, userId) {
    const now = nowIso();
    const result = db.get().prepare(`
        UPDATE control_notifications
        SET is_dismissed = 1, dismissed_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
    `).run(now, now, String(id), String(userId));
    return result.changes > 0;
}

function buildRouter({ events } = {}) {
    ensureTables();
    const r = express.Router();
    const json = express.json({ limit: '64kb' });

    // ── auth guard ───────────────────────────────────────────────
    function requireUser(req, res, next) {
        if (!req.user || !req.user.sub && !req.user.id) {
            return res.status(401).json({ error: 'authentication required' });
        }
        req.actorUserId = String(req.user.sub || req.user.id);
        next();
    }

    // ── GET /notifications ───────────────────────────────────────
    r.get('/notifications', requireUser, (req, res) => {
        const items = listNotificationsForUser(req.actorUserId, {
            limit: req.query.limit,
            unreadOnly: req.query.unread === '1' || req.query.unread_only === '1',
            before: req.query.before,
        });
        res.json({
            items,
            unread_count: countUnread(req.actorUserId),
        });
    });

    // ── GET /notifications/unread-count ─────────────────────────
    r.get('/notifications/unread-count', requireUser, (req, res) => {
        res.json({ count: countUnread(req.actorUserId) });
    });

    // ── POST /notifications — internal service endpoint ──────────
    r.post('/notifications', json, (req, res) => {
        // Allow service actors OR admins to create notifications.
        const serviceActor = req.serviceActor;
        const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'global_mod');
        if (!serviceActor && !isAdmin) {
            return res.status(403).json({ error: 'service actor or admin required' });
        }
        const b = req.body || {};
        if (!b.user_id) return res.status(400).json({ error: 'user_id required' });
        if (!b.title)   return res.status(400).json({ error: 'title required' });
        if (!b.type)    return res.status(400).json({ error: 'type required' });
        try {
            const notification = createNotification({
                userId:        b.user_id,
                type:          b.type,
                title:         b.title,
                message:       b.message,
                category:      b.category,
                priority:      b.priority,
                icon:          b.icon,
                senderUserId:  b.sender_user_id,
                senderName:    b.sender_name,
                senderAvatar:  b.sender_avatar,
                service:       b.service,
                url:           b.url,
                richContent:   b.rich_content,
                expiresAt:     b.expires_at,
            });
            audit.record({
                actorType: serviceActor ? 'service' : 'admin',
                actorId:   serviceActor ? (typeof serviceActor === 'string' ? serviceActor : serviceActor.id) : (req.user && req.user.id),
                action:    'notification.created',
                resource:  `notifications/${b.user_id}`,
                outcome:   'allow',
                detail:    { type: b.type, title: b.title },
            });
            res.status(201).json({ ok: true, notification });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /notifications/:id/read ─────────────────────────────
    r.post('/notifications/:id/read', requireUser, (req, res) => {
        const changed = markRead(req.params.id, req.actorUserId);
        res.json({ ok: true, changed, unread_count: countUnread(req.actorUserId) });
    });

    // ── POST /notifications/read-all ─────────────────────────────
    r.post('/notifications/read-all', requireUser, (req, res) => {
        const changed = markAllRead(req.actorUserId);
        res.json({ ok: true, changed, unread_count: 0 });
    });

    // ── DELETE /notifications/:id ────────────────────────────────
    r.delete('/notifications/:id', requireUser, (req, res) => {
        const changed = dismiss(req.params.id, req.actorUserId);
        res.json({ ok: true, changed });
    });

    return r;
}

module.exports = {
    buildRouter,
    createNotification,
    listNotificationsForUser,
    countUnread,
    markRead,
    markAllRead,
    dismiss,
};
