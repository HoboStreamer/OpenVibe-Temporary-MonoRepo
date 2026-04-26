'use strict';

const crypto = require('crypto');
const db = require('./db');

function newId(prefix) { return `${prefix}_${crypto.randomBytes(10).toString('hex')}`; }

function hydrateChannel(row) {
    if (!row) return null;
    let metadata = {}; try { metadata = JSON.parse(row.metadata_json || '{}'); } catch {}
    return Object.assign({}, row, { metadata });
}
function hydrateStream(row) {
    if (!row) return null;
    let metadata = {}; try { metadata = JSON.parse(row.metadata_json || '{}'); } catch {}
    return Object.assign({}, row, { metadata });
}

function upsertChannel({ slug, display_name, owner_user_id, description, avatar_url, metadata }) {
    const sql = db.get();
    const existing = sql.prepare(`SELECT * FROM live_channels WHERE slug = ?`).get(String(slug));
    if (existing) {
        sql.prepare(`
            UPDATE live_channels SET
                display_name = COALESCE(?, display_name),
                owner_user_id = COALESCE(?, owner_user_id),
                description = COALESCE(?, description),
                avatar_url = COALESCE(?, avatar_url),
                metadata_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(display_name || null, owner_user_id || null, description || null, avatar_url || null,
               JSON.stringify(metadata || {}), existing.id);
        return getChannelBySlug(slug);
    }
    const id = newId('lch');
    sql.prepare(`
        INSERT INTO live_channels (id, slug, display_name, owner_user_id, description, avatar_url, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, String(slug), display_name || null, owner_user_id || null, description || null,
           avatar_url || null, JSON.stringify(metadata || {}));
    return getChannelBySlug(slug);
}
function getChannelBySlug(slug) {
    return hydrateChannel(db.get().prepare(`SELECT * FROM live_channels WHERE slug = ?`).get(String(slug)));
}
function listChannels({ limit }) {
    const cap = Math.min(parseInt(limit, 10) || 50, 200);
    return db.get().prepare(`SELECT * FROM live_channels ORDER BY rowid DESC LIMIT ?`).all(cap).map(hydrateChannel);
}

function upsertStream({ id, channel_slug, channel_id, status, title, category, thumbnail_url, embed_url, vod_media_id, started_at, ended_at, metadata }) {
    const sql = db.get();
    const existing = sql.prepare(`SELECT * FROM live_streams WHERE id = ?`).get(String(id));
    if (existing) {
        sql.prepare(`
            UPDATE live_streams SET
                channel_slug = COALESCE(?, channel_slug),
                channel_id = COALESCE(?, channel_id),
                status = COALESCE(?, status),
                title = COALESCE(?, title),
                category = COALESCE(?, category),
                thumbnail_url = COALESCE(?, thumbnail_url),
                embed_url = COALESCE(?, embed_url),
                vod_media_id = COALESCE(?, vod_media_id),
                started_at = COALESCE(?, started_at),
                ended_at = COALESCE(?, ended_at),
                metadata_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(channel_slug || null, channel_id || null, status || null, title || null, category || null,
               thumbnail_url || null, embed_url || null, vod_media_id || null, started_at || null, ended_at || null,
               JSON.stringify(metadata || existing.metadata_json ? (metadata || JSON.parse(existing.metadata_json || '{}')) : {}),
               String(id));
        return getStreamById(id);
    }
    sql.prepare(`
        INSERT INTO live_streams (id, channel_slug, channel_id, status, title, category, thumbnail_url, embed_url, vod_media_id, started_at, ended_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(String(id), String(channel_slug || ''), channel_id || null, status || 'created', title || null, category || null,
           thumbnail_url || null, embed_url || null, vod_media_id || null, started_at || null, ended_at || null,
           JSON.stringify(metadata || {}));
    return getStreamById(id);
}
function getStreamById(id) {
    return hydrateStream(db.get().prepare(`SELECT * FROM live_streams WHERE id = ?`).get(String(id)));
}
function listStreams({ channel_slug, status, limit }) {
    const where = []; const args = [];
    if (channel_slug) { where.push('channel_slug = ?'); args.push(String(channel_slug)); }
    if (status)       { where.push('status = ?');       args.push(String(status)); }
    const cap = Math.min(parseInt(limit, 10) || 50, 200);
    const sql = where.length
        ? `SELECT * FROM live_streams WHERE ${where.join(' AND ')} ORDER BY rowid DESC LIMIT ?`
        : `SELECT * FROM live_streams ORDER BY rowid DESC LIMIT ?`;
    return db.get().prepare(sql).all(...args, cap).map(hydrateStream);
}
function getCurrentLiveStream(channel_slug) {
    return hydrateStream(db.get().prepare(`
        SELECT * FROM live_streams WHERE channel_slug = ? AND status = 'started' ORDER BY rowid DESC LIMIT 1
    `).get(String(channel_slug)));
}

function recordMirror({ stream_id, channel_slug, details }) {
    db.get().prepare(`
        INSERT INTO mirror_state (stream_id, channel_slug, mirrored_at, details_json)
        VALUES (?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(stream_id) DO UPDATE SET
            channel_slug = excluded.channel_slug,
            mirrored_at = CURRENT_TIMESTAMP,
            details_json = excluded.details_json
    `).run(String(stream_id), String(channel_slug || ''), JSON.stringify(details || {}));
}

function recordLegacy({ source, kind, legacy_id, new_id }) {
    db.get().prepare(`INSERT OR IGNORE INTO legacy_id_map (source, kind, legacy_id, new_id) VALUES (?, ?, ?, ?)`)
        .run(String(source), String(kind), String(legacy_id), String(new_id));
}

module.exports = {
    upsertChannel, getChannelBySlug, listChannels,
    upsertStream, getStreamById, listStreams, getCurrentLiveStream,
    recordMirror, recordLegacy,
};
