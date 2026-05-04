'use strict';

// openvibe-tips — DB access layer (pure queries, no policy).
// Uses db.get() from the persistence runtime — same pattern as openre-stream.

const { randomUUID } = require('crypto');
const dbRuntime = require('./db');

function db() { return dbRuntime.get(); }

// ─── Creators ────────────────────────────────────────────────────────────────

function getCreatorBySlug(slug) {
    return db().prepare('SELECT * FROM tips_creators WHERE slug = ?').get(slug);
}

function getCreatorById(id) {
    return db().prepare('SELECT * FROM tips_creators WHERE id = ?').get(id);
}

function getCreatorByUserId(userId) {
    return db().prepare('SELECT * FROM tips_creators WHERE user_id = ?').get(userId);
}

function listCreators({ status, limit } = {}) {
    const sql = status
        ? 'SELECT * FROM tips_creators WHERE status = ? ORDER BY created_at DESC LIMIT ?'
        : 'SELECT * FROM tips_creators ORDER BY created_at DESC LIMIT ?';
    const params = status ? [status, Number(limit) || 100] : [Number(limit) || 100];
    return db().prepare(sql).all(...params);
}

function upsertCreator({ id, user_id, slug, display_name, bio, avatar_url, accent_color, currency, native_enabled, custom_amounts, min_amount, status, metadata_json }) {
    const now = new Date().toISOString();
    const existingId = id || randomUUID();
    const existing = id ? getCreatorById(id) : null;
    if (existing) {
        db().prepare(`
            UPDATE tips_creators SET
                slug = ?, display_name = ?, bio = ?, avatar_url = ?, accent_color = ?,
                currency = ?, native_enabled = ?, custom_amounts = ?, min_amount = ?,
                status = ?, metadata_json = ?, updated_at = ?
            WHERE id = ?
        `).run(
            slug || existing.slug,
            display_name || existing.display_name,
            bio !== undefined ? bio : existing.bio,
            avatar_url !== undefined ? avatar_url : existing.avatar_url,
            accent_color || existing.accent_color,
            currency || existing.currency,
            native_enabled !== undefined ? (native_enabled ? 1 : 0) : existing.native_enabled,
            custom_amounts || existing.custom_amounts,
            min_amount !== undefined ? min_amount : existing.min_amount,
            status || existing.status,
            metadata_json || existing.metadata_json,
            now,
            id
        );
        return getCreatorById(id);
    }
    db().prepare(`
        INSERT INTO tips_creators
            (id, user_id, slug, display_name, bio, avatar_url, accent_color, currency,
             native_enabled, custom_amounts, min_amount, status, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        existingId, user_id, slug, display_name,
        bio || null, avatar_url || null,
        accent_color || '#f59e0b', currency || 'USD',
        native_enabled !== false ? 1 : 0,
        custom_amounts || '[1,5,10,25]',
        min_amount || 100,
        status || 'active',
        metadata_json || '{}',
        now, now
    );
    return getCreatorById(existingId);
}

// ─── Connectors ──────────────────────────────────────────────────────────────

function getConnector(id) {
    return db().prepare('SELECT * FROM tips_connectors WHERE id = ?').get(id);
}

function getConnectorByType(creator_id, connector_type) {
    return db().prepare('SELECT * FROM tips_connectors WHERE creator_id = ? AND connector_type = ?').get(creator_id, connector_type);
}

function listConnectors(creator_id) {
    return db().prepare('SELECT * FROM tips_connectors WHERE creator_id = ? ORDER BY created_at ASC').all(creator_id);
}

function upsertConnector({ id, creator_id, connector_type, label, config_json, status }) {
    const now = new Date().toISOString();
    const existing = id ? getConnector(id) : getConnectorByType(creator_id, connector_type);
    if (existing) {
        db().prepare(`
            UPDATE tips_connectors SET
                label = ?, config_json = ?, status = ?, updated_at = ?
            WHERE id = ?
        `).run(
            label !== undefined ? label : existing.label,
            config_json || existing.config_json,
            status || existing.status,
            now, existing.id
        );
        return getConnector(existing.id);
    }
    const newId = id || randomUUID();
    db().prepare(`
        INSERT INTO tips_connectors (id, creator_id, connector_type, label, config_json, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId, creator_id, connector_type, label || null, config_json || '{}', status || 'active', now, now);
    return getConnector(newId);
}

function touchConnector(id, eventCount) {
    const now = new Date().toISOString();
    db().prepare('UPDATE tips_connectors SET last_event_at = ?, event_count = event_count + ?, updated_at = ? WHERE id = ?')
        .run(now, eventCount || 1, now, id);
}

// ─── Tip events ──────────────────────────────────────────────────────────────

function insertTipEvent({ id, creator_id, connector_id, source, event_type, sender, amount_value, amount_currency, amount_minor, message, is_anonymous, visibility, external_id, raw_json }) {
    // Dedup: if external_id is present and already recorded for this source, skip
    if (external_id) {
        const existing = db().prepare(
            'SELECT id FROM tips_events WHERE source = ? AND external_id = ? LIMIT 1'
        ).get(source || 'native', external_id);
        if (existing) return null;
    }
    const eventId = id || randomUUID();
    const now = new Date().toISOString();
    db().prepare(`
        INSERT INTO tips_events
            (id, creator_id, connector_id, source, event_type, sender, amount_value,
             amount_currency, amount_minor, message, is_anonymous, visibility, external_id, raw_json, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        eventId, creator_id, connector_id || null, source || 'native',
        event_type || 'tip', sender || null,
        amount_value || null, amount_currency || 'USD', amount_minor || null,
        message || null, is_anonymous ? 1 : 0,
        visibility || 'public', external_id || null,
        raw_json || null, now
    );
    return db().prepare('SELECT * FROM tips_events WHERE id = ?').get(eventId) || null;
}

function listTipEvents({ creator_id, source, limit, before } = {}) {
    let sql = 'SELECT * FROM tips_events WHERE 1=1';
    const params = [];
    if (creator_id) { sql += ' AND creator_id = ?'; params.push(creator_id); }
    if (source)     { sql += ' AND source = ?';     params.push(source); }
    if (before)     { sql += ' AND received_at < ?'; params.push(before); }
    sql += ' ORDER BY received_at DESC LIMIT ?';
    params.push(Number(limit) || 50);
    return db().prepare(sql).all(...params);
}

function getTipEvent(id) {
    return db().prepare('SELECT * FROM tips_events WHERE id = ?').get(id);
}

// ─── Webhook tokens ──────────────────────────────────────────────────────────

function getWebhookToken(token) {
    const now = new Date().toISOString();
    const row = db().prepare('SELECT * FROM tips_webhook_tokens WHERE token = ?').get(token);
    if (row) db().prepare('UPDATE tips_webhook_tokens SET last_used_at = ? WHERE id = ?').run(now, row.id);
    return row;
}

function createWebhookToken({ creator_id, label }) {
    const id    = randomUUID();
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const now   = new Date().toISOString();
    db().prepare(`
        INSERT INTO tips_webhook_tokens (id, creator_id, token, label, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(id, creator_id, token, label || null, now);
    return db().prepare('SELECT * FROM tips_webhook_tokens WHERE id = ?').get(id);
}

function listWebhookTokens(creator_id) {
    return db().prepare('SELECT id, creator_id, label, last_used_at, created_at FROM tips_webhook_tokens WHERE creator_id = ? ORDER BY created_at DESC').all(creator_id);
}

module.exports = {
    getCreatorBySlug, getCreatorById, getCreatorByUserId, listCreators, upsertCreator,
    getConnector, getConnectorByType, listConnectors, upsertConnector, touchConnector,
    insertTipEvent, listTipEvents, getTipEvent,
    getWebhookToken, createWebhookToken, listWebhookTokens,
};
