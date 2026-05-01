'use strict';

function buildCandidate(sourceType, row, sizeBytes, extra) {
    return Object.assign({
        source_type: sourceType,
        size_bytes: Number(sizeBytes || 0),
    }, extra || {}, row || {});
}

function collectPublicPlaybackObjects(media, options) {
    const source = options || {};
    const items = [];
    if (media) {
        items.push(buildCandidate('media', {
            media_id: media.id,
            provider_name: media.storage_provider || null,
            storage_key: media.storage_key || null,
            role: 'canonical',
        }, media.size_bytes));
    }
    for (const location of source.locations || []) {
        items.push(buildCandidate('location', {
            media_id: location.media_id || media && media.id || null,
            provider_name: location.provider_name || null,
            storage_key: location.storage_key || null,
            role: location.role || 'canonical',
            location_id: location.id || null,
        }, location.size_bytes));
    }
    for (const part of source.parts || []) {
        items.push(buildCandidate('vod_part', {
            media_id: part.media_id || media && media.id || null,
            provider_name: part.provider_name || null,
            storage_key: part.playlist_storage_key || part.part_index_storage_key || null,
            part_id: part.id,
            part_number: part.part_number,
        }, part.total_bytes));
    }
    for (const segment of source.segments || []) {
        items.push(buildCandidate('recording_segment', {
            media_id: segment.media_id || media && media.id || null,
            storage_key: segment.storage_key || null,
            segment_id: segment.id,
            segment_index: segment.segment_index,
        }, segment.size_bytes));
    }
    for (const partialSegment of source.partialSegments || []) {
        items.push(buildCandidate('vod_partial_segment', {
            media_id: media && media.id || null,
            provider_name: partialSegment.provider_name || null,
            storage_key: partialSegment.storage_key || null,
            part_number: partialSegment.part_number,
            segment_index: partialSegment.segment_index,
        }, partialSegment.size_bytes));
    }
    for (const clipExport of source.clipExports || []) {
        items.push(buildCandidate('clip_export', {
            media_id: clipExport.media_id || media && media.id || null,
            export_id: clipExport.id || null,
            status: clipExport.status || null,
        }, clipExport.size_bytes || 0));
    }
    return items.filter((item) => Number(item.size_bytes || 0) > 0);
}

function validatePublicObjectSize(candidate, options) {
    const source = options || {};
    const maxBytes = Number(source.publicPlaybackMaxBytes || 500 * 1024 * 1024);
    const targetBytes = Number(source.targetPublicObjectBytes || 256 * 1024 * 1024);
    const warnBytes = Number(source.warnPublicObjectBytes || 384 * 1024 * 1024);
    const actualBytes = Number(candidate && candidate.size_bytes || 0);
    return {
        ok: actualBytes <= maxBytes,
        actual_bytes: actualBytes,
        max_bytes: maxBytes,
        target_bytes: targetBytes,
        warn_bytes: warnBytes,
        warning: actualBytes > warnBytes
            ? 'warn_threshold_exceeded'
            : actualBytes > targetBytes
                ? 'target_threshold_exceeded'
                : null,
        candidate,
    };
}

function validatePublicPlaybackSize(media, options) {
    const source = options || {};
    const maxBytes = Number(source.publicPlaybackMaxBytes || 500 * 1024 * 1024);
    const targetBytes = Number(source.targetPublicObjectBytes || 256 * 1024 * 1024);
    const warnBytes = Number(source.warnPublicObjectBytes || 384 * 1024 * 1024);
    if (!media) return { ok: false, reason: 'media_missing', max_bytes: maxBytes, target_bytes: targetBytes, warn_bytes: warnBytes };
    if (String(media.visibility || 'public') !== 'public') {
        return { ok: true, reason: 'non_public_media', max_bytes: maxBytes, target_bytes: targetBytes, warn_bytes: warnBytes };
    }
    const candidates = collectPublicPlaybackObjects(media, source);
    const validations = candidates.map((candidate) => validatePublicObjectSize(candidate, source));
    const blockingObjects = validations.filter((decision) => !decision.ok).map((decision) => decision.candidate);
    const warningObjects = validations.filter((decision) => decision.warning).map((decision) => Object.assign({}, decision.candidate, { warning: decision.warning }));
    const actualBytes = Number(media.size_bytes || 0);
    if (!blockingObjects.length) {
        return {
            ok: true,
            reason: 'within_limit',
            max_bytes: maxBytes,
            target_bytes: targetBytes,
            warn_bytes: warnBytes,
            actual_bytes: actualBytes,
            object_count: candidates.length,
            objects: candidates,
            warning_objects: warningObjects,
            warning: actualBytes > warnBytes
                ? 'warn_threshold_exceeded'
                : actualBytes > targetBytes
                    ? 'target_threshold_exceeded'
                    : null,
        };
    }
    return {
        ok: false,
        reason: 'public_media_too_large',
        max_bytes: maxBytes,
        target_bytes: targetBytes,
        warn_bytes: warnBytes,
        actual_bytes: actualBytes,
        object_count: candidates.length,
        objects: candidates,
        blocking_objects: blockingObjects,
        warning_objects: warningObjects,
    };
}

module.exports = {
    collectPublicPlaybackObjects,
    validatePublicObjectSize,
    validatePublicPlaybackSize,
};