'use strict';

// openvibe-chat — model. Pure DB ops; HTTP wrappers in routes.js.

const crypto = require('crypto');
const db = require('./db');
const config = require('./config');

function newId(prefix) {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function safeJson(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

// ── rooms ────────────────────────────────────────────────
function hydrateRoom(r) {
    if (!r) return null;
    return {
        id: r.id, room_type: r.room_type,
        external_ref_type: r.external_ref_type, external_ref_id: r.external_ref_id,
        title: r.title, visibility: r.visibility,
        owner_type: r.owner_type, owner_id: r.owner_id,
        created_by_actor_type: r.created_by_actor_type,
        created_by_actor_id: r.created_by_actor_id,
        metadata: safeJson(r.metadata_json, {}),
        unread_count: Number(r.unread_count || 0),
        archived_at: r.archived_at || null,
        created_at: r.created_at, updated_at: r.updated_at,
    };
}

function createRoom(input) {
    const id = input.id || newId('room');
    db.get().prepare(`
        INSERT INTO chat_rooms (id, room_type, external_ref_type, external_ref_id,
            title, visibility, owner_type, owner_id,
            created_by_actor_type, created_by_actor_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, String(input.room_type),
        input.external_ref_type || null,
        input.external_ref_id != null ? String(input.external_ref_id) : null,
        input.title || null,
        input.visibility || 'public',
        input.owner_type || null,
        input.owner_id != null ? String(input.owner_id) : null,
        input.created_by_actor_type || null,
        input.created_by_actor_id != null ? String(input.created_by_actor_id) : null,
        JSON.stringify(input.metadata || {}),
    );
    return getRoom(id);
}

function getRoom(id) {
    return hydrateRoom(db.get().prepare(`SELECT * FROM chat_rooms WHERE id = ?`).get(String(id)));
}

function findRoomByExternal(refType, refId) {
    return hydrateRoom(db.get().prepare(
        `SELECT * FROM chat_rooms WHERE external_ref_type = ? AND external_ref_id = ? LIMIT 1`
    ).get(String(refType), String(refId)));
}

function ensureRoomForExternal(refType, refId, defaults) {
    const existing = findRoomByExternal(refType, refId);
    if (existing) return existing;
    return createRoom(Object.assign({ external_ref_type: refType, external_ref_id: refId }, defaults || {}));
}

function listRooms({ room_type, owner_type, owner_id, external_ref_type, limit }) {
    const where = ['archived_at IS NULL'];
    const args = [];
    if (room_type)    { where.push('room_type = ?'); args.push(String(room_type)); }
    if (owner_type)   { where.push('owner_type = ?'); args.push(String(owner_type)); }
    if (owner_id)     { where.push('owner_id = ?'); args.push(String(owner_id)); }
    if (external_ref_type) { where.push('external_ref_type = ?'); args.push(String(external_ref_type)); }
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const rows = db.get().prepare(
        `SELECT * FROM chat_rooms WHERE ${where.join(' AND ')} ORDER BY rowid DESC LIMIT ?`
    ).all(...args, cap);
    return rows.map(hydrateRoom);
}

function archiveRoom(id) {
    db.get().prepare(`UPDATE chat_rooms SET archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(id));
    return getRoom(id);
}

// ── participants ─────────────────────────────────────────
function upsertParticipant({ room_id, actor_type, actor_id, role, metadata }) {
    db.get().prepare(`
        INSERT INTO chat_participants (room_id, actor_type, actor_id, role, joined_at, metadata_json)
        VALUES (?, ?, ?, ?, STRFTIME('%Y-%m-%d %H:%M:%f', 'now'), ?)
        ON CONFLICT(room_id, actor_type, actor_id) DO UPDATE SET
            role = excluded.role,
            metadata_json = excluded.metadata_json
    `).run(String(room_id), String(actor_type), String(actor_id), role || 'participant', JSON.stringify(metadata || {}));
    return getParticipant(room_id, actor_type, actor_id);
}

function getParticipant(room_id, actor_type, actor_id) {
    const r = db.get().prepare(
        `SELECT * FROM chat_participants WHERE room_id = ? AND actor_type = ? AND actor_id = ?`
    ).get(String(room_id), String(actor_type), String(actor_id));
    if (!r) return null;
    return Object.assign({}, r, { metadata: safeJson(r.metadata_json, {}), last_read_at: r.last_read_at || null, last_seen_at: r.last_seen_at || null });
}

function removeParticipant(room_id, actor_type, actor_id) {
    db.get().prepare(
        `DELETE FROM chat_participants WHERE room_id = ? AND actor_type = ? AND actor_id = ?`
    ).run(String(room_id), String(actor_type), String(actor_id));
}

function listParticipants(room_id) {
    const rows = db.get().prepare(
        `SELECT * FROM chat_participants WHERE room_id = ? ORDER BY joined_at ASC`
    ).all(String(room_id));
    return rows.map(r => Object.assign({}, r, {
        metadata: safeJson(r.metadata_json, {}),
        last_read_at: r.last_read_at || null,
        last_seen_at: r.last_seen_at || null,
    }));
}

function markRoomRead(room_id, actor_type, actor_id) {
    db.get().prepare(`
        UPDATE chat_participants
        SET last_read_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now'),
            last_seen_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
        WHERE room_id = ? AND actor_type = ? AND actor_id = ?
    `).run(String(room_id), String(actor_type), String(actor_id));
    return getParticipant(room_id, actor_type, actor_id);
}

// ── messages ─────────────────────────────────────────────
function hydrateMessage(r) {
    if (!r) return null;
    return {
        id: r.id, room_id: r.room_id,
        sender_type: r.sender_type, sender_id: r.sender_id,
        message_type: r.message_type,
        body: r.body,
        rich_payload: r.rich_payload_json ? safeJson(r.rich_payload_json, null) : null,
        reply_to_message_id: r.reply_to_message_id,
        legacy_source: r.legacy_source, legacy_id: r.legacy_id,
        moderation_status: r.moderation_status,
        metadata: safeJson(r.metadata_json, {}),
        created_at: r.created_at,
        edited_at: r.edited_at || null,
        deleted_at: r.deleted_at || null,
    };
}

function createMessage(input) {
    const id = input.id || newId('msg');
    db.get().prepare(`
        INSERT INTO chat_messages (id, room_id, sender_type, sender_id, message_type,
            body, rich_payload_json, reply_to_message_id, legacy_source, legacy_id,
            moderation_status, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, STRFTIME('%Y-%m-%d %H:%M:%f', 'now'))
    `).run(
        id,
        String(input.room_id),
        String(input.sender_type || 'user'),
        input.sender_id != null ? String(input.sender_id) : null,
        String(input.message_type || 'text'),
        input.body != null ? String(input.body) : null,
        input.rich_payload ? JSON.stringify(input.rich_payload) : null,
        input.reply_to_message_id || null,
        input.legacy_source || null,
        input.legacy_id || null,
        input.moderation_status || 'visible',
        JSON.stringify(input.metadata || {}),
    );
    db.get().prepare(`UPDATE chat_rooms SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(input.room_id));
    return getMessage(id);
}

function getMessage(id) {
    return hydrateMessage(db.get().prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(String(id)));
}

function listMessages({ room_id, limit, before_id }) {
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const args = [String(room_id)];
    let sql = `SELECT * FROM chat_messages WHERE room_id = ? AND deleted_at IS NULL`;
    if (before_id) {
        sql += ` AND rowid < (SELECT rowid FROM chat_messages WHERE id = ?)`;
        args.push(String(before_id));
    }
    sql += ` ORDER BY rowid DESC LIMIT ?`;
    args.push(cap);
    const rows = db.get().prepare(sql).all(...args);
    return rows.map(hydrateMessage).reverse();
}

function editMessage(id, patch) {
    const cur = getMessage(id);
    if (!cur) return null;
    db.get().prepare(`
        UPDATE chat_messages SET body = ?, rich_payload_json = ?, edited_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        patch.body != null ? String(patch.body) : cur.body,
        patch.rich_payload != null ? JSON.stringify(patch.rich_payload) : (cur.rich_payload ? JSON.stringify(cur.rich_payload) : null),
        String(id),
    );
    return getMessage(id);
}

function deleteMessage(id) {
    db.get().prepare(`UPDATE chat_messages SET deleted_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(id));
    return getMessage(id);
}

function moderateMessage(id, status) {
    db.get().prepare(`UPDATE chat_messages SET moderation_status=? WHERE id=?`).run(String(status), String(id));
    return getMessage(id);
}

// ── DM helpers ───────────────────────────────────────────
function dmKey(a, b) {
    const norm = [a, b].map(x => `${x.actor_type}:${x.actor_id}`).sort();
    return norm.join('|');
}

function findOrCreateDmRoom(actorA, actorB) {
    const key = dmKey(actorA, actorB);
    const existing = findRoomByExternal('dm-pair', key);
    if (existing) return existing;
    const room = createRoom({
        room_type: 'dm',
        external_ref_type: 'dm-pair',
        external_ref_id: key,
        visibility: 'private',
        owner_type: actorA.actor_type,
        owner_id: actorA.actor_id,
    });
    upsertParticipant({ room_id: room.id, actor_type: actorA.actor_type, actor_id: actorA.actor_id, role: 'owner' });
    upsertParticipant({ room_id: room.id, actor_type: actorB.actor_type, actor_id: actorB.actor_id, role: 'participant' });
    return room;
}

function listDmsForActor(actor_type, actor_id) {
    const rows = db.get().prepare(`
        SELECT r.*,
               COALESCE((
                   SELECT COUNT(*)
                   FROM chat_messages m
                   WHERE m.room_id = r.id
                     AND m.deleted_at IS NULL
                     AND NOT (m.sender_type = p.actor_type AND COALESCE(m.sender_id, '') = COALESCE(p.actor_id, ''))
                     AND julianday(m.created_at) > julianday(COALESCE(p.last_read_at, p.joined_at, '1970-01-01 00:00:00'))
               ), 0) AS unread_count
        FROM chat_rooms r
        INNER JOIN chat_participants p ON p.room_id = r.id
        WHERE r.room_type = 'dm' AND r.archived_at IS NULL AND p.actor_type = ? AND p.actor_id = ?
        ORDER BY r.updated_at DESC
    `).all(String(actor_type), String(actor_id));
    return rows.map(hydrateRoom);
}

function getDmUnreadSummary(actor_type, actor_id) {
    const items = listDmsForActor(actor_type, actor_id);
    const rooms = items
        .filter((room) => room.unread_count > 0)
        .map((room) => ({ room_id: room.id, unread_count: room.unread_count }));
    return {
        total_unread: rooms.reduce((total, room) => total + room.unread_count, 0),
        rooms,
    };
}

// ── calls ────────────────────────────────────────────────
function hydrateCall(r) {
    if (!r) return null;
    return {
        id: r.id, room_id: r.room_id, call_type: r.call_type, status: r.status,
        started_by_actor_type: r.started_by_actor_type,
        started_by_actor_id: r.started_by_actor_id,
        target_actor_type: r.target_actor_type,
        target_actor_id: r.target_actor_id,
        started_at: r.started_at, answered_at: r.answered_at, ended_at: r.ended_at,
        metadata: safeJson(r.metadata_json, {}),
    };
}

function createCall(input) {
    const id = input.id || newId('call');
    db.get().prepare(`
        INSERT INTO chat_call_sessions (id, room_id, call_type, status,
            started_by_actor_type, started_by_actor_id,
            target_actor_type, target_actor_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, String(input.room_id),
        String(input.call_type || 'voice'),
        String(input.status || 'pending'),
        input.started_by_actor_type || null,
        input.started_by_actor_id != null ? String(input.started_by_actor_id) : null,
        input.target_actor_type || null,
        input.target_actor_id != null ? String(input.target_actor_id) : null,
        JSON.stringify(input.metadata || {}),
    );
    return getCall(id);
}

function getCall(id) {
    return hydrateCall(db.get().prepare(`SELECT * FROM chat_call_sessions WHERE id = ?`).get(String(id)));
}

function updateCallStatus(id, status, ts) {
    const stamp = ts || 'ended_at';
    if (status === 'active') {
        db.get().prepare(`UPDATE chat_call_sessions SET status=?, answered_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, String(id));
    } else if (status === 'ended' || status === 'declined' || status === 'missed' || status === 'failed') {
        db.get().prepare(`UPDATE chat_call_sessions SET status=?, ended_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, String(id));
    } else {
        db.get().prepare(`UPDATE chat_call_sessions SET status=? WHERE id=?`).run(status, String(id));
    }
    return getCall(id);
}

function recordCallSignal({ call_id, from_actor_type, from_actor_id, signal_type, payload }) {
    const r = db.get().prepare(`
        INSERT INTO chat_call_signals (call_id, from_actor_type, from_actor_id, signal_type, payload_json)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        String(call_id),
        from_actor_type || null,
        from_actor_id != null ? String(from_actor_id) : null,
        String(signal_type),
        JSON.stringify(payload || {}),
    );
    return { id: r.lastInsertRowid };
}

function listCallSignals(call_id, sinceId) {
    const args = [String(call_id)];
    let sql = `SELECT * FROM chat_call_signals WHERE call_id = ?`;
    if (sinceId) { sql += ` AND id > ?`; args.push(parseInt(sinceId, 10) || 0); }
    sql += ` ORDER BY id ASC LIMIT 200`;
    return db.get().prepare(sql).all(...args).map(r => Object.assign({}, r, { payload: safeJson(r.payload_json, {}) }));
}

function listActiveCalls() {
    const rows = db.get().prepare(
        `SELECT * FROM chat_call_sessions WHERE status IN ('pending','ringing','active') ORDER BY started_at DESC LIMIT 200`
    ).all();
    return rows.map(hydrateCall);
}

// ── TTS settings ─────────────────────────────────────────
function getTtsSettings(owner_type, owner_id) {
    const r = db.get().prepare(
        `SELECT * FROM chat_tts_settings WHERE owner_type = ? AND owner_id = ?`
    ).get(String(owner_type), String(owner_id));
    if (r) return Object.assign({}, r, { metadata: safeJson(r.metadata_json, {}) });
    return Object.assign({ owner_type, owner_id }, config.ttsDefaults, { metadata: {}, _defaults: true });
}

function upsertTtsSettings(input) {
    const cur = getTtsSettings(input.owner_type, input.owner_id);
    const merged = Object.assign({}, cur, input);
    db.get().prepare(`
        INSERT INTO chat_tts_settings (owner_type, owner_id, tts_enabled, read_chat, read_tips, read_redemptions,
            voice, volume, rate, pitch, max_length, min_tip_amount, filter_links, filter_emotes, queue_limit, metadata_json,
            updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(owner_type, owner_id) DO UPDATE SET
            tts_enabled = excluded.tts_enabled,
            read_chat = excluded.read_chat,
            read_tips = excluded.read_tips,
            read_redemptions = excluded.read_redemptions,
            voice = excluded.voice,
            volume = excluded.volume,
            rate = excluded.rate,
            pitch = excluded.pitch,
            max_length = excluded.max_length,
            min_tip_amount = excluded.min_tip_amount,
            filter_links = excluded.filter_links,
            filter_emotes = excluded.filter_emotes,
            queue_limit = excluded.queue_limit,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(input.owner_type), String(input.owner_id),
        merged.tts_enabled ? 1 : 0,
        merged.read_chat ? 1 : 0,
        merged.read_tips ? 1 : 0,
        merged.read_redemptions ? 1 : 0,
        String(merged.voice || 'default'),
        parseInt(merged.volume, 10) || 100,
        parseInt(merged.rate, 10) || 100,
        parseInt(merged.pitch, 10) || 100,
        parseInt(merged.max_length, 10) || 250,
        parseInt(merged.min_tip_amount, 10) || 0,
        merged.filter_links ? 1 : 0,
        merged.filter_emotes ? 1 : 0,
        parseInt(merged.queue_limit, 10) || 20,
        JSON.stringify(merged.metadata || {}),
    );
    return getTtsSettings(input.owner_type, input.owner_id);
}

// ── audio queue ──────────────────────────────────────────
function hydrateAudio(r) {
    if (!r) return null;
    return {
        id: r.id,
        owner_type: r.owner_type, owner_id: r.owner_id,
        queue_type: r.queue_type, status: r.status, priority: r.priority,
        source_type: r.source_type, source_id: r.source_id,
        requested_by_actor_type: r.requested_by_actor_type,
        requested_by_actor_id: r.requested_by_actor_id,
        text: r.text, audio_url: r.audio_url, media_id: r.media_id,
        external_provider: r.external_provider, external_url: r.external_url,
        playback: safeJson(r.playback_json, {}),
        metadata: safeJson(r.metadata_json, {}),
        created_at: r.created_at, started_at: r.started_at, finished_at: r.finished_at,
    };
}

function enqueueAudio(input) {
    const id = input.id || newId('aud');
    db.get().prepare(`
        INSERT INTO chat_audio_queue (id, owner_type, owner_id, queue_type, status, priority,
            source_type, source_id, requested_by_actor_type, requested_by_actor_id,
            text, audio_url, media_id, external_provider, external_url,
            playback_json, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        String(input.owner_type), String(input.owner_id),
        String(input.queue_type),
        String(input.status || 'queued'),
        parseInt(input.priority, 10) || 0,
        String(input.source_type || 'manual'),
        input.source_id || null,
        input.requested_by_actor_type || null,
        input.requested_by_actor_id != null ? String(input.requested_by_actor_id) : null,
        input.text || null,
        input.audio_url || null,
        input.media_id || null,
        input.external_provider || null,
        input.external_url || null,
        JSON.stringify(input.playback || {}),
        JSON.stringify(input.metadata || {}),
    );
    return getAudio(id);
}

function getAudio(id) {
    return hydrateAudio(db.get().prepare(`SELECT * FROM chat_audio_queue WHERE id = ?`).get(String(id)));
}

function listAudio({ owner_type, owner_id, queue_type, status, limit }) {
    const where = [];
    const args = [];
    if (owner_type) { where.push('owner_type = ?'); args.push(String(owner_type)); }
    if (owner_id)   { where.push('owner_id = ?');   args.push(String(owner_id)); }
    if (queue_type) { where.push('queue_type = ?'); args.push(String(queue_type)); }
    if (status)     { where.push('status = ?');     args.push(String(status)); }
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const sql = `SELECT * FROM chat_audio_queue ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY priority DESC, rowid ASC LIMIT ?`;
    return db.get().prepare(sql).all(...args, cap).map(hydrateAudio);
}

function setAudioStatus(id, status) {
    if (status === 'playing') {
        db.get().prepare(`UPDATE chat_audio_queue SET status=?, started_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, String(id));
    } else if (status === 'played' || status === 'failed' || status === 'skipped' || status === 'cancelled') {
        db.get().prepare(`UPDATE chat_audio_queue SET status=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, String(id));
    } else {
        db.get().prepare(`UPDATE chat_audio_queue SET status=? WHERE id=?`).run(status, String(id));
    }
    return getAudio(id);
}

function clearAudioQueue({ owner_type, owner_id, queue_type }) {
    const where = ['status IN (\'queued\',\'playing\')'];
    const args = [];
    if (owner_type) { where.push('owner_type = ?'); args.push(String(owner_type)); }
    if (owner_id)   { where.push('owner_id = ?');   args.push(String(owner_id)); }
    if (queue_type) { where.push('queue_type = ?'); args.push(String(queue_type)); }
    const r = db.get().prepare(
        `UPDATE chat_audio_queue SET status='cancelled', finished_at=CURRENT_TIMESTAMP WHERE ${where.join(' AND ')}`
    ).run(...args);
    return { cleared: r.changes };
}

// ── legacy mapping ───────────────────────────────────────
function recordLegacyMap({ source, kind, legacy_id, new_id }) {
    db.get().prepare(`
        INSERT OR IGNORE INTO chat_legacy_map (source, kind, legacy_id, new_id) VALUES (?, ?, ?, ?)
    `).run(String(source), String(kind), String(legacy_id), String(new_id));
}

function lookupLegacy(source, kind, legacy_id) {
    return db.get().prepare(
        `SELECT new_id FROM chat_legacy_map WHERE source=? AND kind=? AND legacy_id=?`
    ).get(String(source), String(kind), String(legacy_id));
}

module.exports = {
    newId,
    // rooms
    createRoom, getRoom, findRoomByExternal, ensureRoomForExternal, listRooms, archiveRoom,
    // participants
    upsertParticipant, getParticipant, removeParticipant, listParticipants, markRoomRead,
    // messages
    createMessage, getMessage, listMessages, editMessage, deleteMessage, moderateMessage,
    // dm
    findOrCreateDmRoom, listDmsForActor, getDmUnreadSummary,
    // calls
    createCall, getCall, updateCallStatus, recordCallSignal, listCallSignals, listActiveCalls,
    // tts
    getTtsSettings, upsertTtsSettings,
    // audio
    enqueueAudio, getAudio, listAudio, setAudioStatus, clearAudioQueue,
    // legacy
    recordLegacyMap, lookupLegacy,
};
