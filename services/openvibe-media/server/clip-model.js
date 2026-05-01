'use strict';

const crypto = require('crypto');

const db = require('./db');

function safeJson(value, fallbackValue) {
    try {
        return JSON.parse(value || 'null') || fallbackValue;
    } catch {
        return fallbackValue;
    }
}

function newClipId() {
    return `clip_${crypto.randomBytes(10).toString('hex')}`;
}

function hydrateClip(row) {
    if (!row) return null;
    return {
        id: row.id,
        source_stream_id: row.source_stream_id,
        source_media_id: row.source_media_id,
        owner_user_id: row.owner_user_id,
        title: row.title,
        status: row.status,
        start_ms: row.start_ms,
        end_ms: row.end_ms,
        playback_media_id: row.playback_media_id,
        metadata: safeJson(row.metadata_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateClipExport(row) {
    if (!row) return null;
    return {
        id: row.id,
        clip_id: row.clip_id,
        job_id: row.job_id,
        status: row.status,
        media_id: row.media_id,
        error: row.error,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function createClip(input) {
    const source = input || {};
    const id = source.id || newClipId();
    db.get().prepare(`
        INSERT INTO clip_projects (
            id, source_stream_id, source_media_id, owner_user_id, title,
            status, start_ms, end_ms, playback_media_id, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        source.sourceStreamId || null,
        source.sourceMediaId || null,
        source.ownerUserId || null,
        source.title || 'Untitled clip',
        source.status || 'draft',
        Number(source.startMs || 0),
        Number(source.endMs || 0),
        source.playbackMediaId || null,
        JSON.stringify(source.metadata || {}),
    );
    return getClipById(id);
}

function getClipById(id) {
    return hydrateClip(db.get().prepare(`SELECT * FROM clip_projects WHERE id = ?`).get(String(id)));
}

function updateClip(id, patch) {
    const current = getClipById(id);
    if (!current) return null;
    const next = Object.assign({}, current, patch || {});
    const metadata = patch && patch.metadata
        ? Object.assign({}, current.metadata || {}, patch.metadata)
        : current.metadata || {};
    db.get().prepare(`
        UPDATE clip_projects SET
            source_stream_id = ?,
            source_media_id = ?,
            owner_user_id = ?,
            title = ?,
            status = ?,
            start_ms = ?,
            end_ms = ?,
            playback_media_id = ?,
            metadata_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        next.source_stream_id || null,
        next.source_media_id || null,
        next.owner_user_id || null,
        next.title || 'Untitled clip',
        next.status || 'draft',
        Number(next.start_ms || 0),
        Number(next.end_ms || 0),
        next.playback_media_id || null,
        JSON.stringify(metadata),
        String(id),
    );
    return getClipById(id);
}

function deleteClip(id) {
    return updateClip(id, { status: 'deleted', metadata: { deleted_at: new Date().toISOString() } });
}

function listClipsByMediaId(mediaId) {
    return db.get().prepare(`
        SELECT * FROM clip_projects WHERE source_media_id = ? OR playback_media_id = ? ORDER BY created_at DESC
    `).all(String(mediaId), String(mediaId)).map(hydrateClip);
}

function listClipsByStreamId(streamId) {
    return db.get().prepare(`
        SELECT * FROM clip_projects WHERE source_stream_id = ? ORDER BY created_at DESC
    `).all(String(streamId)).map(hydrateClip);
}

function createClipExport(input) {
    const source = input || {};
    const result = db.get().prepare(`
        INSERT INTO clip_exports (clip_id, job_id, status, media_id, error)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        String(source.clipId),
        source.jobId || null,
        source.status || 'queued',
        source.mediaId || null,
        source.error || null,
    );
    return getClipExportById(result.lastInsertRowid);
}

function getClipExportById(id) {
    return hydrateClipExport(db.get().prepare(`SELECT * FROM clip_exports WHERE id = ?`).get(Number(id)));
}

function updateClipExport(id, patch) {
    const current = getClipExportById(id);
    if (!current) return null;
    const next = Object.assign({}, current, patch || {});
    db.get().prepare(`
        UPDATE clip_exports SET
            job_id = ?,
            status = ?,
            media_id = ?,
            error = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        next.job_id || null,
        String(next.status || 'queued'),
        next.media_id || null,
        next.error || null,
        Number(id),
    );
    return getClipExportById(id);
}

function listClipExports(clipId) {
    return db.get().prepare(`
        SELECT * FROM clip_exports WHERE clip_id = ? ORDER BY created_at DESC
    `).all(String(clipId)).map(hydrateClipExport);
}

function getLatestClipExport(clipId) {
    return hydrateClipExport(db.get().prepare(`
        SELECT * FROM clip_exports WHERE clip_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(String(clipId)));
}

function listClipExportsByMediaId(mediaId) {
    return db.get().prepare(`
        SELECT * FROM clip_exports WHERE media_id = ? ORDER BY created_at DESC
    `).all(String(mediaId)).map(hydrateClipExport);
}

module.exports = {
    createClip,
    createClipExport,
    deleteClip,
    getClipById,
    getClipExportById,
    getLatestClipExport,
    listClipExportsByMediaId,
    listClipExports,
    listClipsByMediaId,
    listClipsByStreamId,
    updateClipExport,
    updateClip,
};
