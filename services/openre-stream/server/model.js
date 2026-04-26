'use strict';

// openre-stream — channel + stream + ingest + restream model. Pure DB ops.

const crypto = require('crypto');
const db = require('./db');

function newId(prefix) { return `${prefix}_${crypto.randomBytes(10).toString('hex')}`; }

function hydrateChannel(row) {
    if (!row) return null;
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch {}
    return {
        id: row.id, slug: row.slug, owner_user_id: row.owner_user_id,
        display_name: row.display_name, metadata,
        created_at: row.created_at, updated_at: row.updated_at,
    };
}
function hydrateStream(row) {
    if (!row) return null;
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch {}
    return {
        id: row.id, channel_id: row.channel_id, stream_key: row.stream_key, protocol: row.protocol,
        status: row.status, title: row.title, category: row.category, metadata,
        started_at: row.started_at, ended_at: row.ended_at, vod_media_id: row.vod_media_id,
        created_at: row.created_at, updated_at: row.updated_at,
    };
}

// ── channels ─────────────────────────────────────────────────
function upsertChannel({ slug, owner_user_id, display_name, metadata }) {
    const sql = db.get();
    const existing = sql.prepare(`SELECT * FROM channels WHERE slug = ?`).get(String(slug));
    if (existing) {
        sql.prepare(`UPDATE channels SET owner_user_id = ?, display_name = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(String(owner_user_id), display_name || existing.display_name, JSON.stringify(metadata || {}), existing.id);
        return getChannelById(existing.id);
    }
    const id = newId('chn');
    sql.prepare(`INSERT INTO channels (id, slug, owner_user_id, display_name, metadata_json) VALUES (?, ?, ?, ?, ?)`)
        .run(id, String(slug), String(owner_user_id), display_name || null, JSON.stringify(metadata || {}));
    return getChannelById(id);
}
function getChannelById(id) {
    return hydrateChannel(db.get().prepare(`SELECT * FROM channels WHERE id = ?`).get(String(id)));
}
function getChannelBySlug(slug) {
    return hydrateChannel(db.get().prepare(`SELECT * FROM channels WHERE slug = ?`).get(String(slug)));
}
function listChannels({ limit }) {
    const cap = Math.min(parseInt(limit, 10) || 50, 200);
    return db.get().prepare(`SELECT * FROM channels ORDER BY rowid DESC LIMIT ?`).all(cap).map(hydrateChannel);
}

// ── streams ──────────────────────────────────────────────────
function createStream({ channel_id, protocol, title, category, metadata, stream_key }) {
    const id = newId('strm');
    db.get().prepare(`
        INSERT INTO streams (id, channel_id, stream_key, protocol, title, category, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, String(channel_id), stream_key || null, protocol || 'rtmp', title || null, category || null, JSON.stringify(metadata || {}));
    return getStreamById(id);
}
function startStream(id) {
    db.get().prepare(`UPDATE streams SET status='started', started_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id = ?`).run(String(id));
    return getStreamById(id);
}
function endStream(id, { vod_media_id } = {}) {
    db.get().prepare(`UPDATE streams SET status='ended', ended_at=CURRENT_TIMESTAMP, vod_media_id=COALESCE(?, vod_media_id), updated_at=CURRENT_TIMESTAMP WHERE id = ?`)
        .run(vod_media_id || null, String(id));
    return getStreamById(id);
}
function attachVod(id, vod_media_id) {
    db.get().prepare(`UPDATE streams SET vod_media_id=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`).run(String(vod_media_id), String(id));
    return getStreamById(id);
}
function getStreamById(id) {
    return hydrateStream(db.get().prepare(`SELECT * FROM streams WHERE id = ?`).get(String(id)));
}
function listStreams({ channel_id, status, limit }) {
    const where = []; const args = [];
    if (channel_id) { where.push('channel_id = ?'); args.push(String(channel_id)); }
    if (status)     { where.push('status = ?');     args.push(String(status)); }
    const cap = Math.min(parseInt(limit, 10) || 50, 200);
    const sql = where.length
        ? `SELECT * FROM streams WHERE ${where.join(' AND ')} ORDER BY rowid DESC LIMIT ?`
        : `SELECT * FROM streams ORDER BY rowid DESC LIMIT ?`;
    return db.get().prepare(sql).all(...args, cap).map(hydrateStream);
}

// ── ingest sessions ──────────────────────────────────────────
function recordIngestConnected({ stream_id, protocol, client_addr, details }) {
    const r = db.get().prepare(`
        INSERT INTO ingest_sessions (stream_id, protocol, connected_at, client_addr, details_json)
        VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).run(String(stream_id), String(protocol), client_addr || null, JSON.stringify(details || {}));
    return r.lastInsertRowid;
}
function recordIngestDisconnected({ stream_id }) {
    db.get().prepare(`
        UPDATE ingest_sessions SET disconnected_at = CURRENT_TIMESTAMP
        WHERE stream_id = ? AND disconnected_at IS NULL
    `).run(String(stream_id));
}

// ── restream destinations ────────────────────────────────────
function createDestination({ owner_user_id, kind, label, target_url, target_key, enabled, metadata }) {
    const id = newId('dst');
    db.get().prepare(`
        INSERT INTO restream_destinations (id, owner_user_id, kind, label, target_url, target_key, enabled, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, String(owner_user_id), String(kind), label || null, String(target_url), target_key || null, enabled === false ? 0 : 1, JSON.stringify(metadata || {}));
    return getDestinationById(id);
}
function getDestinationById(id) {
    const r = db.get().prepare(`SELECT * FROM restream_destinations WHERE id = ?`).get(String(id));
    if (!r) return null;
    let metadata = {};
    try { metadata = JSON.parse(r.metadata_json || '{}'); } catch {}
    return Object.assign({}, r, { enabled: !!r.enabled, metadata });
}
function listDestinations({ owner_user_id }) {
    const where = []; const args = [];
    if (owner_user_id) { where.push('owner_user_id = ?'); args.push(String(owner_user_id)); }
    const sql = where.length
        ? `SELECT * FROM restream_destinations WHERE ${where.join(' AND ')} ORDER BY rowid DESC`
        : `SELECT * FROM restream_destinations ORDER BY rowid DESC LIMIT 200`;
    return db.get().prepare(sql).all(...args).map(r => {
        let metadata = {};
        try { metadata = JSON.parse(r.metadata_json || '{}'); } catch {}
        return Object.assign({}, r, { enabled: !!r.enabled, metadata });
    });
}
function setOutputState({ stream_id, destination_id, state, last_error }) {
    db.get().prepare(`
        INSERT INTO output_state (stream_id, destination_id, state, last_error)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(stream_id, destination_id) DO UPDATE SET
            state = excluded.state,
            last_error = excluded.last_error,
            updated_at = CURRENT_TIMESTAMP
    `).run(String(stream_id), String(destination_id), String(state), last_error || null);
}

// ── mirror state ─────────────────────────────────────────────
function recordMirror({ stream_id, live_url, channel_slug, details }) {
    db.get().prepare(`
        INSERT INTO mirror_state (stream_id, mirrored_at, live_url, channel_slug, details_json)
        VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)
        ON CONFLICT(stream_id) DO UPDATE SET
            mirrored_at = CURRENT_TIMESTAMP,
            live_url = excluded.live_url,
            channel_slug = excluded.channel_slug,
            details_json = excluded.details_json
    `).run(String(stream_id), live_url || null, channel_slug || null, JSON.stringify(details || {}));
}
function getMirrorState(stream_id) {
    return db.get().prepare(`SELECT * FROM mirror_state WHERE stream_id = ?`).get(String(stream_id));
}

// ── legacy mapping ───────────────────────────────────────────
function recordLegacy({ source, kind, legacy_id, new_id }) {
    db.get().prepare(`INSERT OR IGNORE INTO legacy_id_map (source, kind, legacy_id, new_id) VALUES (?, ?, ?, ?)`)
        .run(String(source), String(kind), String(legacy_id), String(new_id));
}
function lookupLegacy(source, kind, legacy_id) {
    return db.get().prepare(`SELECT new_id FROM legacy_id_map WHERE source=? AND kind=? AND legacy_id=?`)
        .get(String(source), String(kind), String(legacy_id));
}

module.exports = {
    upsertChannel, getChannelById, getChannelBySlug, listChannels,
    createStream, startStream, endStream, attachVod, getStreamById, listStreams,
    recordIngestConnected, recordIngestDisconnected,
    createDestination, getDestinationById, listDestinations, setOutputState,
    recordMirror, getMirrorState,
    recordLegacy, lookupLegacy,
};
