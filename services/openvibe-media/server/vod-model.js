'use strict';

const crypto = require('crypto');

const config = require('./config');
const db = require('./db');
const model = require('./model');
const partModel = require('./part-model');

function safeJson(value, fallbackValue) {
    try {
        return JSON.parse(value || 'null') || fallbackValue;
    } catch {
        return fallbackValue;
    }
}

function newRecordingId() {
    return `rec_${crypto.randomBytes(10).toString('hex')}`;
}

function newSegmentId() {
    return `seg_${crypto.randomBytes(10).toString('hex')}`;
}

function hydrateRecording(row) {
    if (!row) return null;
    return {
        id: row.id,
        stream_id: row.stream_id,
        channel_slug: row.channel_slug,
        media_id: row.media_id,
        status: row.status,
        storage_key: row.storage_key,
        metadata: safeJson(row.metadata_json, {}),
        started_at: row.started_at,
        ended_at: row.ended_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateSegment(row) {
    if (!row) return null;
    return {
        id: row.id,
        recording_id: row.recording_id,
        segment_index: row.segment_index,
        start_ms: row.start_ms,
        duration_ms: row.duration_ms,
        media_id: row.media_id,
        storage_key: row.storage_key,
        playlist_key: row.playlist_key,
        size_bytes: row.size_bytes,
        status: row.status,
        metadata: safeJson(row.metadata_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function createRecording(input) {
    const source = input || {};
    const id = source.id || newRecordingId();
    db.get().prepare(`
        INSERT INTO stream_recordings (
            id, stream_id, channel_slug, media_id, status, storage_key,
            started_at, ended_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        String(source.streamId),
        source.channelSlug || null,
        source.mediaId || null,
        source.status || 'recording',
        source.storageKey || null,
        source.startedAt || null,
        source.endedAt || null,
        JSON.stringify(source.metadata || {}),
    );
    return getRecordingById(id);
}

function getRecordingById(id) {
    return hydrateRecording(db.get().prepare(`SELECT * FROM stream_recordings WHERE id = ?`).get(String(id)));
}

function getRecordingByMediaId(mediaId) {
    return hydrateRecording(db.get().prepare(`
        SELECT * FROM stream_recordings WHERE media_id = ? ORDER BY COALESCE(started_at, created_at) DESC, created_at DESC LIMIT 1
    `).get(String(mediaId)));
}

function getLatestRecordingByStreamId(streamId) {
    return hydrateRecording(db.get().prepare(`
        SELECT * FROM stream_recordings WHERE stream_id = ? ORDER BY COALESCE(started_at, created_at) DESC, created_at DESC LIMIT 1
    `).get(String(streamId)));
}

function listRecordingsByStreamId(streamId) {
    return db.get().prepare(`
        SELECT * FROM stream_recordings WHERE stream_id = ? ORDER BY COALESCE(started_at, created_at) DESC, created_at DESC
    `).all(String(streamId)).map(hydrateRecording);
}

function upsertSegment(input) {
    const source = input || {};
    const id = source.id || newSegmentId();
    db.get().prepare(`
        INSERT INTO recording_segments (
            id, recording_id, segment_index, start_ms, duration_ms, media_id,
            storage_key, playlist_key, size_bytes, status, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(recording_id, segment_index) DO UPDATE SET
            media_id = excluded.media_id,
            storage_key = excluded.storage_key,
            playlist_key = excluded.playlist_key,
            size_bytes = excluded.size_bytes,
            status = excluded.status,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        id,
        String(source.recordingId),
        Number(source.segmentIndex || 0),
        Number(source.startMs || 0),
        Number(source.durationMs || 0),
        source.mediaId || null,
        source.storageKey || null,
        source.playlistKey || null,
        Number(source.sizeBytes || 0),
        source.status || 'ready',
        JSON.stringify(source.metadata || {}),
    );
    let segment = listSegmentsByRecordingId(source.recordingId).find((item) => item.segment_index === Number(source.segmentIndex || 0)) || null;
    const recording = getRecordingById(source.recordingId);
    const recordingMedia = recording && recording.media_id ? model.getById(recording.media_id) : null;
    const parting = config.storage && config.storage.parting || {};
    if (segment && (source.mediaId || recording && recording.media_id)) {
        const partResult = partModel.rollPartForSegment({
            segmentId: segment.id,
            recordingId: source.recordingId,
            mediaId: source.mediaId || recording && recording.media_id,
            variant: source.variant || 'source',
            segmentIndex: segment.segment_index,
            streamOffsetMs: segment.start_ms,
            durationMs: segment.duration_ms,
            providerName: source.providerName
                || source.provider_name
                || source.storageProvider
                || recordingMedia && recordingMedia.storage_provider
                || 'b2',
            storageKey: segment.storage_key,
            sizeBytes: segment.size_bytes,
            sha256: source.sha256 || null,
            playlistStorageKey: source.playlistKey || segment.playlist_key || null,
            partIndexStorageKey: source.partIndexStorageKey || null,
            targetBytes: parting.targetBytes,
            maxBytes: parting.maxBytes,
            targetDurationMs: Number(parting.targetSeconds || 1800) * 1000,
            maxDurationMs: Number(parting.maxSeconds || 3600) * 1000,
            status: segment.status,
        });
        if (partResult && partResult.partialSegment) {
            const metadata = Object.assign({}, segment.metadata || {}, {
                part_id: partResult.part && partResult.part.id || null,
                part_number: partResult.partialSegment.part_number,
                part_rollover: !!partResult.rollover,
                part_rollover_reason: partResult.rollover_reason || null,
            });
            db.get().prepare(`
                UPDATE recording_segments SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).run(JSON.stringify(metadata), String(segment.id));
            segment = hydrateSegment(db.get().prepare(`SELECT * FROM recording_segments WHERE id = ?`).get(String(segment.id)));
        }
    }
    return segment;
}

function listSegmentsByRecordingId(recordingId) {
    return db.get().prepare(`
        SELECT * FROM recording_segments WHERE recording_id = ? ORDER BY segment_index ASC
    `).all(String(recordingId)).map(hydrateSegment);
}

function listSegmentsByStreamId(streamId) {
    return db.get().prepare(`
        SELECT s.*
        FROM recording_segments s
        JOIN stream_recordings r ON r.id = s.recording_id
        WHERE r.stream_id = ?
        ORDER BY s.segment_index ASC
    `).all(String(streamId)).map(hydrateSegment);
}

function buildTimeline(streamId) {
    const recording = getLatestRecordingByStreamId(streamId);
    const segments = recording ? listSegmentsByRecordingId(recording.id) : [];
    const parts = recording ? partModel.listPartsByRecordingId(recording.id) : [];
    const durationMs = segments.reduce((maxValue, segment) => {
        return Math.max(maxValue, Number(segment.start_ms || 0) + Number(segment.duration_ms || 0));
    }, 0);
    const readySegments = segments.filter((segment) => segment.status === 'ready').length;
    return {
        stream_id: String(streamId),
        recording,
        duration_ms: durationMs,
        segment_count: segments.length,
        ready_segment_count: readySegments,
        missing_segment_count: segments.length - readySegments,
        part_count: parts.length,
        open_part_number: parts.find((part) => part.status === 'open') && parts.find((part) => part.status === 'open').part_number || null,
        started_at: recording && recording.started_at || null,
        ended_at: recording && recording.ended_at || null,
    };
}

function listPreviewSprites(streamId) {
    return listSegmentsByStreamId(streamId).map((segment, index) => ({
        id: `sprite-${segment.id}`,
        segment_id: segment.id,
        tile_index: index,
        start_ms: segment.start_ms,
        end_ms: Number(segment.start_ms || 0) + Number(segment.duration_ms || 0),
        sprite_url: segment.metadata && segment.metadata.preview_sprite_url || null,
        storage_key: segment.storage_key || null,
    }));
}

module.exports = {
    buildTimeline,
    createRecording,
    getLatestRecordingByStreamId,
    getOpenPart: partModel.getOpenPart,
    getPartById: partModel.getPartById,
    getRecordingById,
    getRecordingByMediaId,
    listPreviewSprites,
    listPartialSegmentsByRecordingId: partModel.listPartialSegmentsByRecordingId,
    listPartsByRecordingId: partModel.listPartsByRecordingId,
    listRecordingsByStreamId,
    listSegmentsByRecordingId,
    listSegmentsByStreamId,
    upsertSegment,
};
