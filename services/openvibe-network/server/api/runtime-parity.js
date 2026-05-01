'use strict';

const crypto = require('crypto');
const express = require('express');

const db = require('../db');
const policy = require('../policy');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseJson(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
}

function parseLimit(value, fallback = DEFAULT_LIMIT) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseBoolean(value, fallback = false) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function requireUserId(req, res) {
    const actor = policy.actorOfReq(req);
    if (actor.type !== 'user' || !actor.id) {
        res.status(401).json({ error: 'authenticated user required' });
        return null;
    }
    return String(actor.id);
}

function requireServiceOrAdmin(req, res) {
    if (req.serviceActor || policy.isAdmin(req)) return true;
    res.status(403).json({ error: 'service actor or admin required' });
    return false;
}

function hydrateNotification(row) {
    if (!row) return null;
    return {
        id: row.id,
        user_id: row.user_id,
        sender_user_id: row.sender_user_id || null,
        type: row.type,
        category: row.category || null,
        priority: row.priority || 'normal',
        title: row.title,
        message: row.message || null,
        icon: row.icon || null,
        sender_name: row.sender_name || null,
        sender_avatar: row.sender_avatar || null,
        service: row.service || null,
        url: row.url || null,
        rich_content: parseJson(row.rich_content_json, null),
        is_read: Boolean(row.is_read),
        is_dismissed: Boolean(row.is_dismissed),
        is_emailed: Boolean(row.is_emailed),
        read_at: row.read_at || null,
        dismissed_at: row.dismissed_at || null,
        expires_at: row.expires_at || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateFollow(row) {
    if (!row) return null;
    return {
        id: row.id,
        source: row.source,
        scope: row.scope,
        follower_user_id: row.follower_user_id,
        followed_user_id: row.followed_user_id,
        email_notify: Boolean(row.email_notify),
        push_notify: Boolean(row.push_notify),
        metadata: parseJson(row.metadata_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateOauthClient(row) {
    if (!row) return null;
    return {
        id: row.id,
        client_id: row.client_id,
        name: row.name,
        redirect_uris: parseJson(row.redirect_uris_json, []),
        is_first_party: Boolean(row.is_first_party),
        client_secret_redacted: Boolean(row.client_secret_redacted),
        metadata: parseJson(row.metadata_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function buildFollowId(followerUserId, followedUserId, scope) {
    return `follow:openvibe-network:${String(scope || 'network')}:${String(followerUserId)}:${String(followedUserId)}`;
}

function selectNotificationById(notificationId, userId) {
    return db.get().prepare(`
        SELECT *
          FROM control_notifications
         WHERE id = ? AND user_id = ?
         LIMIT 1
    `).get(String(notificationId), String(userId));
}

function buildRouter(_deps) {
    const r = express.Router();

    r.get('/notifications', (req, res) => {
        const userId = requireUserId(req, res);
        if (!userId) return;
        const includeDismissed = parseBoolean(req.query.include_dismissed, false);
        const unreadOnly = parseBoolean(req.query.unread_only, false);
        const limit = parseLimit(req.query.limit);
        const offset = parseOffset(req.query.offset);
        const where = ['user_id = ?'];
        const params = [userId];
        if (!includeDismissed) {
            where.push('is_dismissed = 0');
        }
        if (unreadOnly) {
            where.push('is_read = 0');
        }
        const items = db.get().prepare(`
            SELECT *
              FROM control_notifications
             WHERE ${where.join(' AND ')}
             ORDER BY datetime(created_at) DESC, id DESC
             LIMIT ? OFFSET ?
        `).all(...params, limit, offset);
        const unreadCount = db.get().prepare(`
            SELECT COUNT(*) AS count
              FROM control_notifications
             WHERE user_id = ?
               AND is_read = 0
               AND is_dismissed = 0
        `).get(userId).count;
        res.json({
            items: items.map(hydrateNotification),
            unread_count: unreadCount,
        });
    });

    r.patch('/notifications/:notificationId', (req, res) => {
        const userId = requireUserId(req, res);
        if (!userId) return;
        const current = selectNotificationById(req.params.notificationId, userId);
        if (!current) return res.status(404).json({ error: 'notification not found' });
        const body = req.body || {};
        const hasRead = Object.prototype.hasOwnProperty.call(body, 'is_read');
        const hasDismissed = Object.prototype.hasOwnProperty.call(body, 'is_dismissed');
        if (!hasRead && !hasDismissed) {
            return res.status(400).json({ error: 'is_read or is_dismissed is required' });
        }

        const nextRead = hasRead ? (parseBoolean(body.is_read, Boolean(current.is_read)) ? 1 : 0) : Number(current.is_read || 0);
        const nextDismissed = hasDismissed ? (parseBoolean(body.is_dismissed, Boolean(current.is_dismissed)) ? 1 : 0) : Number(current.is_dismissed || 0);
        db.get().prepare(`
            UPDATE control_notifications
               SET is_read = ?,
                   is_dismissed = ?,
                   read_at = CASE
                        WHEN ? = 1 THEN COALESCE(read_at, CURRENT_TIMESTAMP)
                        ELSE NULL
                   END,
                   dismissed_at = CASE
                        WHEN ? = 1 THEN COALESCE(dismissed_at, CURRENT_TIMESTAMP)
                        ELSE NULL
                   END,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND user_id = ?
        `).run(nextRead, nextDismissed, nextRead, nextDismissed, String(req.params.notificationId), userId);
        res.json(hydrateNotification(selectNotificationById(req.params.notificationId, userId)));
    });

    r.post('/internal/notifications', (req, res) => {
        if (!requireServiceOrAdmin(req, res)) return;
        const body = req.body || {};
        if (!body.user_id) return res.status(400).json({ error: 'user_id is required' });
        const item = {
            id: body.id ? String(body.id) : `notification:openvibe-network:${crypto.randomUUID()}`,
            user_id: String(body.user_id),
            sender_user_id: body.sender_user_id == null ? null : String(body.sender_user_id),
            type: String(body.type || 'internal.notification'),
            category: body.category == null ? null : String(body.category),
            priority: String(body.priority || 'normal'),
            title: String(body.title || body.message || 'Notification'),
            message: body.message == null ? null : String(body.message),
            icon: body.icon == null ? null : String(body.icon),
            sender_name: body.sender_name == null ? null : String(body.sender_name),
            sender_avatar: body.sender_avatar == null ? null : String(body.sender_avatar),
            service: body.service == null ? String(req.serviceActor || 'openvibe-network') : String(body.service),
            url: body.url == null ? null : String(body.url),
            rich_content_json: body.rich_content == null ? null : JSON.stringify(body.rich_content),
            is_read: parseBoolean(body.is_read, false) ? 1 : 0,
            is_dismissed: parseBoolean(body.is_dismissed, false) ? 1 : 0,
            is_emailed: parseBoolean(body.is_emailed, false) ? 1 : 0,
            expires_at: body.expires_at || null,
            created_at: body.created_at || null,
            updated_at: body.updated_at || body.created_at || null,
        };

        db.get().prepare(`
            INSERT INTO control_notifications (
                id, user_id, sender_user_id, type, category, priority, title, message,
                icon, sender_name, sender_avatar, service, url, rich_content_json,
                is_read, is_dismissed, is_emailed, expires_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
            ON CONFLICT(id) DO UPDATE SET
                user_id = excluded.user_id,
                sender_user_id = excluded.sender_user_id,
                type = excluded.type,
                category = excluded.category,
                priority = excluded.priority,
                title = excluded.title,
                message = excluded.message,
                icon = excluded.icon,
                sender_name = excluded.sender_name,
                sender_avatar = excluded.sender_avatar,
                service = excluded.service,
                url = excluded.url,
                rich_content_json = excluded.rich_content_json,
                is_read = excluded.is_read,
                is_dismissed = excluded.is_dismissed,
                is_emailed = excluded.is_emailed,
                expires_at = excluded.expires_at,
                created_at = COALESCE(control_notifications.created_at, excluded.created_at),
                updated_at = COALESCE(excluded.updated_at, CURRENT_TIMESTAMP)
        `).run(
            item.id,
            item.user_id,
            item.sender_user_id,
            item.type,
            item.category,
            item.priority,
            item.title,
            item.message,
            item.icon,
            item.sender_name,
            item.sender_avatar,
            item.service,
            item.url,
            item.rich_content_json,
            item.is_read,
            item.is_dismissed,
            item.is_emailed,
            item.expires_at,
            item.created_at,
            item.updated_at
        );

        res.status(201).json(hydrateNotification(db.get().prepare('SELECT * FROM control_notifications WHERE id = ?').get(item.id)));
    });

    r.get('/follows', (req, res) => {
        const direction = String(req.query.direction || 'following').toLowerCase();
        if (direction !== 'following' && direction !== 'followers') {
            return res.status(400).json({ error: 'direction must be following or followers' });
        }
        const userId = req.query.user_id ? String(req.query.user_id) : requireUserId(req, res);
        if (!userId) return;
        const scope = req.query.scope ? String(req.query.scope) : null;
        const limit = parseLimit(req.query.limit);
        const offset = parseOffset(req.query.offset);
        const subjectColumn = direction === 'followers' ? 'followed_user_id' : 'follower_user_id';
        const where = [`${subjectColumn} = ?`];
        const params = [userId];
        if (scope) {
            where.push('scope = ?');
            params.push(scope);
        }
        const rows = db.get().prepare(`
            SELECT *
              FROM social_follows
             WHERE ${where.join(' AND ')}
             ORDER BY datetime(created_at) DESC, id DESC
             LIMIT ? OFFSET ?
        `).all(...params, limit, offset);
        res.json({
            user_id: userId,
            direction,
            items: rows.map(hydrateFollow),
        });
    });

    r.get('/follows/stats/:userId', (req, res) => {
        const userId = String(req.params.userId);
        const scope = req.query.scope ? String(req.query.scope) : null;
        const scopeClause = scope ? ' AND scope = ?' : '';
        const scopeParams = scope ? [scope] : [];
        const followingCount = db.get().prepare(`
            SELECT COUNT(*) AS count
              FROM social_follows
             WHERE follower_user_id = ?${scopeClause}
        `).get(userId, ...scopeParams).count;
        const followerCount = db.get().prepare(`
            SELECT COUNT(*) AS count
              FROM social_follows
             WHERE followed_user_id = ?${scopeClause}
        `).get(userId, ...scopeParams).count;
        res.json({ user_id: userId, scope: scope || null, following_count: followingCount, follower_count: followerCount });
    });

    r.post('/follows/:targetUserId', (req, res) => {
        const followerUserId = requireUserId(req, res);
        if (!followerUserId) return;
        const followedUserId = String(req.params.targetUserId);
        if (followerUserId === followedUserId) {
            return res.status(400).json({ error: 'cannot follow yourself' });
        }
        const body = req.body || {};
        const scope = String(body.scope || 'network');
        const id = body.id ? String(body.id) : buildFollowId(followerUserId, followedUserId, scope);
        const metadata = typeof body.metadata === 'object' && body.metadata && !Array.isArray(body.metadata)
            ? Object.assign({}, body.metadata, { source: 'openvibe-network', created_via: 'api' })
            : { source: 'openvibe-network', created_via: 'api' };
        db.get().prepare(`
            INSERT INTO social_follows (
                id, source, scope, follower_user_id, followed_user_id,
                email_notify, push_notify, metadata_json, created_at, updated_at
            ) VALUES (?, 'openvibe-network', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(follower_user_id, followed_user_id, scope) DO UPDATE SET
                id = excluded.id,
                source = excluded.source,
                email_notify = excluded.email_notify,
                push_notify = excluded.push_notify,
                metadata_json = excluded.metadata_json,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            id,
            scope,
            followerUserId,
            followedUserId,
            parseBoolean(body.email_notify, false) ? 1 : 0,
            parseBoolean(body.push_notify, false) ? 1 : 0,
            JSON.stringify(metadata)
        );
        const row = db.get().prepare(`
            SELECT *
              FROM social_follows
             WHERE follower_user_id = ? AND followed_user_id = ? AND scope = ?
             LIMIT 1
        `).get(followerUserId, followedUserId, scope);
        res.status(201).json(hydrateFollow(row));
    });

    r.delete('/follows/:targetUserId', (req, res) => {
        const followerUserId = requireUserId(req, res);
        if (!followerUserId) return;
        const followedUserId = String(req.params.targetUserId);
        const scope = String(req.query.scope || 'network');
        const result = db.get().prepare(`
            DELETE FROM social_follows
             WHERE follower_user_id = ?
               AND followed_user_id = ?
               AND scope = ?
        `).run(followerUserId, followedUserId, scope);
        res.json({ ok: true, removed: result.changes > 0, scope });
    });

    r.get('/oauth-clients', (req, res) => {
        if (!requireServiceOrAdmin(req, res)) return;
        const limit = parseLimit(req.query.limit, 100);
        const offset = parseOffset(req.query.offset);
        const rows = db.get().prepare(`
            SELECT *
              FROM control_oauth_clients
             ORDER BY datetime(created_at) DESC, client_id ASC
             LIMIT ? OFFSET ?
        `).all(limit, offset);
        res.json({ items: rows.map(hydrateOauthClient) });
    });

    r.get('/oauth-clients/:clientId', (req, res) => {
        if (!requireServiceOrAdmin(req, res)) return;
        const row = db.get().prepare(`
            SELECT *
              FROM control_oauth_clients
             WHERE client_id = ?
             LIMIT 1
        `).get(String(req.params.clientId));
        if (!row) return res.status(404).json({ error: 'oauth client not found' });
        res.json(hydrateOauthClient(row));
    });

    return r;
}

module.exports = { buildRouter };