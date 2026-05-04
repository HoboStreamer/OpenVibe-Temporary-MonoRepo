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

function hydrateRecording(row) {
    if (!row) return null;
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch {}
    return {
        id: row.id,
        stream_id: row.stream_id,
        channel_slug: row.channel_slug,
        status: row.status,
        dvr_playlist_url: row.dvr_playlist_url,
        source_manifest_url: row.source_manifest_url,
        started_at: row.started_at,
        ended_at: row.ended_at,
        metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateClip(row) {
    if (!row) return null;
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch {}
    return {
        id: row.id,
        stream_id: row.stream_id,
        owner_user_id: row.owner_user_id,
        title: row.title,
        status: row.status,
        start_ms: row.start_ms,
        end_ms: row.end_ms,
        media_id: row.media_id,
        metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
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

function updateChannel(slug, fields) {
    const sql = db.get();
    const existing = sql.prepare(`SELECT * FROM channels WHERE slug = ?`).get(String(slug));
    if (!existing) return null;
    const allowed = ['display_name', 'metadata_json'];
    // Merge metadata if provided
    const currentMeta = JSON.parse(existing.metadata_json || '{}');
    if (fields.metadata) Object.assign(currentMeta, fields.metadata);
    if (fields.visibility) currentMeta.visibility = fields.visibility;
    if (fields.nsfw !== undefined) currentMeta.nsfw = !!fields.nsfw;
    if (fields.recording_enabled !== undefined) currentMeta.recording_enabled = !!fields.recording_enabled;
    if (fields.chat_enabled !== undefined) currentMeta.chat_enabled = !!fields.chat_enabled;
    if (fields.description !== undefined) currentMeta.description = fields.description;
    const displayName = fields.display_name !== undefined ? fields.display_name : existing.display_name;
    sql.prepare(`UPDATE channels SET display_name = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(displayName || null, JSON.stringify(currentMeta), existing.id);
    return getChannelById(existing.id);
}

function regenerateStreamKey(slug) {
    const sql = db.get();
    const existing = sql.prepare(`SELECT * FROM channels WHERE slug = ?`).get(String(slug));
    if (!existing) return null;
    const newKey = crypto.randomBytes(20).toString('hex');
    const meta = JSON.parse(existing.metadata_json || '{}');
    meta.stream_key = newKey;
    sql.prepare(`UPDATE channels SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(JSON.stringify(meta), existing.id);
    const ch = getChannelById(existing.id);
    ch.stream_key = newKey;
    return ch;
}
function getChannelById(id) {
    return hydrateChannel(db.get().prepare(`SELECT * FROM channels WHERE id = ?`).get(String(id)));
}
function getChannelBySlug(slug) {
    return hydrateChannel(db.get().prepare(`SELECT * FROM channels WHERE slug = ?`).get(String(slug)));
}
function listChannels({ owner_user_id, limit }) {
    const cap = Math.min(parseInt(limit, 10) || 50, 200);
    if (owner_user_id) {
        return db.get().prepare(`SELECT * FROM channels WHERE owner_user_id = ? ORDER BY rowid DESC LIMIT ?`)
            .all(String(owner_user_id), cap)
            .map(hydrateChannel);
    }
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
function updateDestination(id, fields) {
    const sql = db.get();
    const existing = sql.prepare(`SELECT * FROM restream_destinations WHERE id = ?`).get(String(id));
    if (!existing) return null;
    const kind       = fields.kind       !== undefined ? String(fields.kind)       : existing.kind;
    const label      = fields.label      !== undefined ? (fields.label || null)    : existing.label;
    const target_url = fields.target_url !== undefined ? String(fields.target_url) : existing.target_url;
    const target_key = fields.target_key !== undefined ? (fields.target_key || null) : existing.target_key;
    const enabled    = fields.enabled    !== undefined ? (fields.enabled ? 1 : 0)  : existing.enabled;
    sql.prepare(`UPDATE restream_destinations SET kind=?, label=?, target_url=?, target_key=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(kind, label, target_url, target_key, enabled, String(id));
    return getDestinationById(String(id));
}
function deleteDestination(id) {
    const sql = db.get();
    const existing = sql.prepare(`SELECT id FROM restream_destinations WHERE id = ?`).get(String(id));
    if (!existing) return false;
    sql.prepare(`DELETE FROM restream_destinations WHERE id = ?`).run(String(id));
    return true;
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
function listOutputsByStreamId(streamId) {
    return db.get().prepare(`SELECT * FROM output_state WHERE stream_id = ? ORDER BY updated_at DESC`)
        .all(String(streamId));
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

function upsertRecording({ stream_id, channel_slug, status, dvr_playlist_url, source_manifest_url, started_at, ended_at, metadata }) {
    const existing = db.get().prepare(`SELECT * FROM recordings WHERE stream_id = ?`).get(String(stream_id));
    if (existing) {
        db.get().prepare(`
            UPDATE recordings SET
                channel_slug = COALESCE(?, channel_slug),
                status = COALESCE(?, status),
                dvr_playlist_url = COALESCE(?, dvr_playlist_url),
                source_manifest_url = COALESCE(?, source_manifest_url),
                started_at = COALESCE(?, started_at),
                ended_at = COALESCE(?, ended_at),
                metadata_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE stream_id = ?
        `).run(
            channel_slug || null,
            status || null,
            dvr_playlist_url || null,
            source_manifest_url || null,
            started_at || null,
            ended_at || null,
            JSON.stringify(metadata || {}),
            String(stream_id),
        );
        return getRecordingByStreamId(stream_id);
    }
    const id = newId('rec');
    db.get().prepare(`
        INSERT INTO recordings (id, stream_id, channel_slug, status, dvr_playlist_url, source_manifest_url, started_at, ended_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        String(stream_id),
        channel_slug || null,
        status || 'recording',
        dvr_playlist_url || null,
        source_manifest_url || null,
        started_at || null,
        ended_at || null,
        JSON.stringify(metadata || {}),
    );
    return getRecordingByStreamId(stream_id);
}

function getRecordingByStreamId(streamId) {
    return hydrateRecording(db.get().prepare(`SELECT * FROM recordings WHERE stream_id = ?`).get(String(streamId)));
}

function upsertRecordingSegment({ recording_id, segment_index, start_ms, duration_ms, media_id, storage_key, playlist_url, metadata }) {
    const existing = db.get().prepare(`SELECT * FROM recording_segments WHERE recording_id = ? AND segment_index = ?`).get(String(recording_id), Number(segment_index));
    if (existing) {
        db.get().prepare(`
            UPDATE recording_segments SET
                start_ms = ?, duration_ms = ?, media_id = ?, storage_key = ?, playlist_url = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE recording_id = ? AND segment_index = ?
        `).run(
            Number(start_ms || 0),
            Number(duration_ms || 0),
            media_id || null,
            storage_key || null,
            playlist_url || null,
            JSON.stringify(metadata || {}),
            String(recording_id),
            Number(segment_index),
        );
    } else {
        db.get().prepare(`
            INSERT INTO recording_segments (id, recording_id, segment_index, start_ms, duration_ms, media_id, storage_key, playlist_url, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            newId('seg'),
            String(recording_id),
            Number(segment_index),
            Number(start_ms || 0),
            Number(duration_ms || 0),
            media_id || null,
            storage_key || null,
            playlist_url || null,
            JSON.stringify(metadata || {}),
        );
    }
    return listRecordingSegments(recording_id).find((segment) => segment.segment_index === Number(segment_index)) || null;
}

function listRecordingSegments(recordingId, { limit } = {}) {
    const cap = Math.min(parseInt(limit, 10) || 1000, 5000);
    return db.get().prepare(`SELECT * FROM recording_segments WHERE recording_id = ? ORDER BY segment_index ASC LIMIT ?`).all(String(recordingId), cap).map((row) => {
        let metadata = {};
        try { metadata = JSON.parse(row.metadata_json || '{}'); } catch {}
        return {
            id: row.id,
            recording_id: row.recording_id,
            segment_index: row.segment_index,
            start_ms: row.start_ms,
            duration_ms: row.duration_ms,
            media_id: row.media_id,
            storage_key: row.storage_key,
            playlist_url: row.playlist_url,
            metadata,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    });
}

function createClipProject({ stream_id, owner_user_id, title, status, start_ms, end_ms, media_id, metadata }) {
    const id = newId('clip');
    db.get().prepare(`
        INSERT INTO clip_projects (id, stream_id, owner_user_id, title, status, start_ms, end_ms, media_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        String(stream_id),
        owner_user_id || null,
        title || null,
        status || 'draft',
        Number(start_ms || 0),
        Number(end_ms || 0),
        media_id || null,
        JSON.stringify(metadata || {}),
    );
    return getClipProjectById(id);
}

function getClipProjectById(id) {
    return hydrateClip(db.get().prepare(`SELECT * FROM clip_projects WHERE id = ?`).get(String(id)));
}

function listClipProjects({ stream_id, limit }) {
    const cap = Math.min(parseInt(limit, 10) || 100, 500);
    const rows = stream_id
        ? db.get().prepare(`SELECT * FROM clip_projects WHERE stream_id = ? ORDER BY created_at DESC LIMIT ?`).all(String(stream_id), cap)
        : db.get().prepare(`SELECT * FROM clip_projects ORDER BY created_at DESC LIMIT ?`).all(cap);
    return rows.map(hydrateClip);
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
    updateChannel, regenerateStreamKey,
    createStream, startStream, endStream, attachVod, getStreamById, listStreams,
    recordIngestConnected, recordIngestDisconnected,
    createDestination, updateDestination, deleteDestination, getDestinationById, listDestinations,
    setOutputState, listOutputsByStreamId,
    recordMirror, getMirrorState,
    createClipProject, getClipProjectById, getRecordingByStreamId,
    recordLegacy, lookupLegacy,
    listClipProjects, listRecordingSegments, upsertRecording, upsertRecordingSegment,
};
