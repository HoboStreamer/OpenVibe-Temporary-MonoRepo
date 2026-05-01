'use strict';

const db = require('./db');

function hydrateVodPart(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        recording_id: row.recording_id,
        media_id: row.media_id,
        part_number: Number(row.part_number),
        variant: row.variant,
        status: row.status,
        started_offset_ms: Number(row.started_offset_ms || 0),
        ended_offset_ms: row.ended_offset_ms == null ? null : Number(row.ended_offset_ms),
        duration_ms: Number(row.duration_ms || 0),
        total_bytes: Number(row.total_bytes || 0),
        segment_count: Number(row.segment_count || 0),
        provider_name: row.provider_name,
        playlist_storage_key: row.playlist_storage_key || null,
        part_index_storage_key: row.part_index_storage_key || null,
        created_at: row.created_at,
        closed_at: row.closed_at || null,
        verified_at: row.verified_at || null,
    };
}

function hydratePartialSegment(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        segment_id: row.segment_id,
        recording_id: row.recording_id,
        variant: row.variant,
        segment_index: Number(row.segment_index || 0),
        part_number: Number(row.part_number || 0),
        stream_offset_ms: Number(row.stream_offset_ms || 0),
        duration_ms: Number(row.duration_ms || 0),
        provider_name: row.provider_name,
        storage_key: row.storage_key,
        size_bytes: Number(row.size_bytes || 0),
        sha256: row.sha256 || null,
        status: row.status,
        created_at: row.created_at,
        verified_at: row.verified_at || null,
    };
}

function createPart(input) {
    const source = input || {};
    const result = db.get().prepare(`
        INSERT INTO vod_parts (
            recording_id, media_id, part_number, variant, status,
            started_offset_ms, ended_offset_ms, duration_ms, total_bytes, segment_count,
            provider_name, playlist_storage_key, part_index_storage_key,
            closed_at, verified_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        String(source.recordingId),
        String(source.mediaId),
        Number(source.partNumber),
        String(source.variant || 'source'),
        String(source.status || 'open'),
        Number(source.startedOffsetMs || 0),
        source.endedOffsetMs == null ? null : Number(source.endedOffsetMs),
        Number(source.durationMs || 0),
        Number(source.totalBytes || 0),
        Number(source.segmentCount || 0),
        String(source.providerName || 'b2'),
        source.playlistStorageKey || null,
        source.partIndexStorageKey || null,
        source.closedAt || null,
        source.verifiedAt || null,
    );
    return getPartById(result.lastInsertRowid);
}

function getPartById(id) {
    return hydrateVodPart(db.get().prepare(`SELECT * FROM vod_parts WHERE id = ?`).get(Number(id)));
}

function getLatestPart(recordingId, variant) {
    return hydrateVodPart(db.get().prepare(`
        SELECT * FROM vod_parts WHERE recording_id = ? AND variant = ? ORDER BY part_number DESC LIMIT 1
    `).get(String(recordingId), String(variant || 'source')));
}

function getOpenPart(recordingId, variant) {
    return hydrateVodPart(db.get().prepare(`
        SELECT * FROM vod_parts WHERE recording_id = ? AND variant = ? AND status = 'open' ORDER BY part_number DESC LIMIT 1
    `).get(String(recordingId), String(variant || 'source')));
}

function listPartsByRecordingId(recordingId, variant) {
    const sql = variant
        ? `SELECT * FROM vod_parts WHERE recording_id = ? AND variant = ? ORDER BY part_number ASC`
        : `SELECT * FROM vod_parts WHERE recording_id = ? ORDER BY variant ASC, part_number ASC`;
    const rows = variant
        ? db.get().prepare(sql).all(String(recordingId), String(variant))
        : db.get().prepare(sql).all(String(recordingId));
    return rows.map(hydrateVodPart);
}

function updatePart(id, patch) {
    const current = getPartById(id);
    if (!current) return null;
    const next = Object.assign({}, current, patch || {});
    db.get().prepare(`
        UPDATE vod_parts SET
            status = ?,
            started_offset_ms = ?,
            ended_offset_ms = ?,
            duration_ms = ?,
            total_bytes = ?,
            segment_count = ?,
            provider_name = ?,
            playlist_storage_key = ?,
            part_index_storage_key = ?,
            closed_at = ?,
            verified_at = ?
        WHERE id = ?
    `).run(
        String(next.status || 'open'),
        Number(next.started_offset_ms || 0),
        next.ended_offset_ms == null ? null : Number(next.ended_offset_ms),
        Number(next.duration_ms || 0),
        Number(next.total_bytes || 0),
        Number(next.segment_count || 0),
        String(next.provider_name || 'b2'),
        next.playlist_storage_key || null,
        next.part_index_storage_key || null,
        next.closed_at || null,
        next.verified_at || null,
        Number(id),
    );
    return getPartById(id);
}

function closePart(id, patch) {
    return updatePart(id, Object.assign({}, patch || {}, {
        status: patch && patch.status || 'closed',
        closed_at: patch && patch.closed_at || new Date().toISOString(),
    }));
}

function upsertPartialSegment(input) {
    const source = input || {};
    db.get().prepare(`
        INSERT INTO vod_partial_segments (
            segment_id, recording_id, variant, segment_index, part_number,
            stream_offset_ms, duration_ms, provider_name, storage_key,
            size_bytes, sha256, status, verified_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(recording_id, variant, segment_index, part_number) DO UPDATE SET
            segment_id = excluded.segment_id,
            stream_offset_ms = excluded.stream_offset_ms,
            duration_ms = excluded.duration_ms,
            provider_name = excluded.provider_name,
            storage_key = excluded.storage_key,
            size_bytes = excluded.size_bytes,
            sha256 = excluded.sha256,
            status = excluded.status,
            verified_at = excluded.verified_at
    `).run(
        String(source.segmentId),
        String(source.recordingId),
        String(source.variant || 'source'),
        Number(source.segmentIndex || 0),
        Number(source.partNumber || 0),
        Number(source.streamOffsetMs || 0),
        Number(source.durationMs || 0),
        String(source.providerName || 'b2'),
        String(source.storageKey),
        Number(source.sizeBytes || 0),
        source.sha256 || null,
        String(source.status || 'ready'),
        source.verifiedAt || null,
    );
    return getPartialSegment(source.recordingId, source.variant, source.segmentIndex, source.partNumber);
}

function getPartialSegment(recordingId, variant, segmentIndex, partNumber) {
    return hydratePartialSegment(db.get().prepare(`
        SELECT * FROM vod_partial_segments
        WHERE recording_id = ? AND variant = ? AND segment_index = ? AND part_number = ?
    `).get(String(recordingId), String(variant || 'source'), Number(segmentIndex || 0), Number(partNumber || 0)));
}

function listPartialSegmentsByRecordingId(recordingId, variant) {
    const sql = variant
        ? `SELECT * FROM vod_partial_segments WHERE recording_id = ? AND variant = ? ORDER BY part_number ASC, segment_index ASC`
        : `SELECT * FROM vod_partial_segments WHERE recording_id = ? ORDER BY variant ASC, part_number ASC, segment_index ASC`;
    const rows = variant
        ? db.get().prepare(sql).all(String(recordingId), String(variant))
        : db.get().prepare(sql).all(String(recordingId));
    return rows.map(hydratePartialSegment);
}

function ensureOpenPart(input) {
    const source = input || {};
    const variant = String(source.variant || 'source');
    const existing = getOpenPart(source.recordingId, variant);
    if (existing) return existing;
    const latest = getLatestPart(source.recordingId, variant);
    return createPart({
        recordingId: source.recordingId,
        mediaId: source.mediaId,
        partNumber: latest ? latest.part_number + 1 : 1,
        variant,
        status: 'open',
        startedOffsetMs: source.startedOffsetMs || 0,
        providerName: source.providerName || 'b2',
        playlistStorageKey: source.playlistStorageKey || null,
        partIndexStorageKey: source.partIndexStorageKey || null,
    });
}

function rollPartForSegment(input) {
    const source = input || {};
    const targetBytes = Math.max(1, Number(source.targetBytes || 256 * 1024 * 1024));
    const maxBytes = Math.max(targetBytes, Number(source.maxBytes || 500 * 1024 * 1024));
    const targetDurationMs = Math.max(1000, Number(source.targetDurationMs || 30 * 60 * 1000));
    const maxDurationMs = Math.max(targetDurationMs, Number(source.maxDurationMs || 60 * 60 * 1000));
    const variant = String(source.variant || 'source');
    let part = ensureOpenPart({
        recordingId: source.recordingId,
        mediaId: source.mediaId,
        variant,
        startedOffsetMs: source.streamOffsetMs || 0,
        providerName: source.providerName || 'b2',
        playlistStorageKey: source.playlistStorageKey || null,
        partIndexStorageKey: source.partIndexStorageKey || null,
    });

    const segmentBytes = Number(source.sizeBytes || 0);
    const segmentDurationMs = Number(source.durationMs || 0);
    const segmentEndMs = Number(source.streamOffsetMs || 0) + segmentDurationMs;
    const nextTotalBytes = Number(part.total_bytes || 0) + segmentBytes;
    const nextDurationMs = Math.max(Number(part.duration_ms || 0), segmentEndMs - Number(part.started_offset_ms || 0));

    if (part.segment_count > 0 && (nextTotalBytes > maxBytes || nextDurationMs > maxDurationMs)) {
        part = closePart(part.id, {
            ended_offset_ms: Number(source.streamOffsetMs || 0),
            duration_ms: Number(part.duration_ms || 0),
            total_bytes: Number(part.total_bytes || 0),
            segment_count: Number(part.segment_count || 0),
        });
        part = ensureOpenPart({
            recordingId: source.recordingId,
            mediaId: source.mediaId,
            variant,
            startedOffsetMs: source.streamOffsetMs || 0,
            providerName: source.providerName || 'b2',
            playlistStorageKey: source.playlistStorageKey || null,
            partIndexStorageKey: source.partIndexStorageKey || null,
        });
    }

    const partialSegment = upsertPartialSegment({
        segmentId: source.segmentId,
        recordingId: source.recordingId,
        variant,
        segmentIndex: source.segmentIndex,
        partNumber: part.part_number,
        streamOffsetMs: source.streamOffsetMs,
        durationMs: source.durationMs,
        providerName: source.providerName || part.provider_name,
        storageKey: source.storageKey,
        sizeBytes: source.sizeBytes,
        sha256: source.sha256,
        status: source.status || 'ready',
        verifiedAt: source.verifiedAt || null,
    });

    const updatedPart = updatePart(part.id, {
        status: 'open',
        ended_offset_ms: segmentEndMs,
        duration_ms: Math.max(Number(part.duration_ms || 0), segmentEndMs - Number(part.started_offset_ms || 0)),
        total_bytes: Number(part.total_bytes || 0) + segmentBytes,
        segment_count: Number(part.segment_count || 0) + 1,
        provider_name: source.providerName || part.provider_name,
        playlist_storage_key: source.playlistStorageKey || part.playlist_storage_key,
        part_index_storage_key: source.partIndexStorageKey || part.part_index_storage_key,
    });

    const rollover = Number(updatedPart.total_bytes || 0) >= targetBytes || Number(updatedPart.duration_ms || 0) >= targetDurationMs;
    let nextPart = null;
    let closedPart = updatedPart;
    if (rollover) {
        closedPart = closePart(updatedPart.id, {
            ended_offset_ms: updatedPart.ended_offset_ms,
            duration_ms: updatedPart.duration_ms,
            total_bytes: updatedPart.total_bytes,
            segment_count: updatedPart.segment_count,
        });
        nextPart = ensureOpenPart({
            recordingId: source.recordingId,
            mediaId: source.mediaId,
            variant,
            startedOffsetMs: segmentEndMs,
            providerName: source.providerName || updatedPart.provider_name,
            playlistStorageKey: source.playlistStorageKey || updatedPart.playlist_storage_key,
            partIndexStorageKey: source.partIndexStorageKey || updatedPart.part_index_storage_key,
        });
    }

    return {
        part: rollover ? closedPart : updatedPart,
        partialSegment,
        rollover,
        rollover_reason: rollover
            ? Number(updatedPart.total_bytes || 0) >= targetBytes && Number(updatedPart.duration_ms || 0) >= targetDurationMs
                ? 'target-bytes-and-duration-reached'
                : Number(updatedPart.total_bytes || 0) >= targetBytes
                    ? 'target-bytes-reached'
                    : 'target-duration-reached'
            : null,
        nextPart,
    };
 }
 
 module.exports = {
    closePart,
    createPart,
    ensureOpenPart,
     getOpenPart,
    getPartById,
     getPartialSegment,
     getLatestPart,
     listPartialSegmentsByRecordingId,
     listPartsByRecordingId,
     rollPartForSegment,
     updatePart,
     upsertPartialSegment,
 };
