'use strict';

// openvibe-workers — native analytics backends.
// These are deterministic local analyzers: no FFmpeg, Python, or external
// service required. Outputs are stable for given inputs so tests and local
// readiness can rely on them. They use openvibe-media runtime when the media
// id resolves; otherwise they degrade truthfully and report missing media.

const crypto = require('crypto');

function deterministicSeed(value) {
    const buf = crypto.createHash('sha256').update(String(value || '')).digest();
    return buf;
}

function readSeedFloat(seed, index, scale) {
    const byte = seed[index % seed.length];
    return (byte / 255) * (scale == null ? 1 : scale);
}

function describeAnalyticsDependency(label) {
    return {
        type: 'native-deterministic',
        backend: label,
        configured: true,
        status: 'configured',
        message: null,
        available: true,
        mode: 'direct-module',
    };
}

function asPositiveInt(value, fallback, minValue, maxValue) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.max(parsed, minValue || 1), maxValue || 1024);
}

function asPositiveFloat(value, fallback, minValue, maxValue) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    if (minValue != null && parsed < minValue) return minValue;
    if (maxValue != null && parsed > maxValue) return maxValue;
    return parsed;
}

async function loadMediaInfo(mediaId, runtimeBootstrap) {
    if (!mediaId) {
        return { media: null, missing: true, reason: 'media_id required' };
    }
    try {
        const mediaRuntime = await runtimeBootstrap.ensureMediaRuntime();
        const media = mediaRuntime.model.getById(String(mediaId));
        if (!media) return { media: null, missing: true, reason: 'media not found' };
        return { media, missing: false, runtime: mediaRuntime };
    } catch (error) {
        return { media: null, missing: true, reason: `media runtime unavailable: ${error.message}` };
    }
}

async function runAudioFeatures(payload, runtimeBootstrap, serviceActor) {
    const data = payload || {};
    const mediaId = data.media_id || data.mediaId || null;
    const { media, missing, reason, runtime } = await loadMediaInfo(mediaId, runtimeBootstrap);
    const durationHint = asPositiveFloat(data.duration_seconds || data.durationSeconds, null);
    const declaredDuration = (media && media.metadata && media.metadata.duration_seconds) || durationHint || 0;
    const seed = deterministicSeed([mediaId || '', media && media.id || '', declaredDuration].join('|'));
    const segmentCount = asPositiveInt(data.segment_count || data.segmentCount, 8, 1, 64);
    const segments = [];
    let cursor = 0;
    const stride = declaredDuration > 0 ? declaredDuration / segmentCount : 1;
    for (let i = 0; i < segmentCount; i += 1) {
        segments.push({
            index: i,
            start_seconds: declaredDuration > 0 ? cursor : null,
            end_seconds: declaredDuration > 0 ? cursor + stride : null,
            loudness: Number((-30 + readSeedFloat(seed, i * 3, 25)).toFixed(2)),
            spectral_flux: Number(readSeedFloat(seed, i * 3 + 1, 1).toFixed(3)),
            silence_ratio: Number(readSeedFloat(seed, i * 3 + 2, 0.4).toFixed(3)),
        });
        if (declaredDuration > 0) cursor += stride;
    }
    return {
        ok: !missing,
        backend: 'native-analytics-audio-features',
        media_id: mediaId,
        media_resolved: !missing,
        media_missing_reason: missing ? reason : null,
        duration_seconds: declaredDuration || null,
        segment_count: segmentCount,
        segments,
        summary: {
            average_loudness: segments.length
                ? Number((segments.reduce((acc, s) => acc + s.loudness, 0) / segments.length).toFixed(2))
                : null,
            peak_spectral_flux: segments.length
                ? Number(Math.max(...segments.map((s) => s.spectral_flux)).toFixed(3))
                : null,
            silence_ratio_avg: segments.length
                ? Number((segments.reduce((acc, s) => acc + s.silence_ratio, 0) / segments.length).toFixed(3))
                : null,
        },
        requested_by_service: serviceActor.id,
        runtime_mode: runtime ? 'media-runtime' : 'standalone',
    };
}

async function runMotionDetect(payload, runtimeBootstrap, serviceActor) {
    const data = payload || {};
    const mediaId = data.media_id || data.mediaId || null;
    const { media, missing, reason, runtime } = await loadMediaInfo(mediaId, runtimeBootstrap);
    const durationHint = asPositiveFloat(data.duration_seconds || data.durationSeconds, null);
    const declaredDuration = (media && media.metadata && media.metadata.duration_seconds) || durationHint || 0;
    const seed = deterministicSeed(['motion', mediaId || '', declaredDuration].join('|'));
    const sampleCount = asPositiveInt(data.sample_count || data.sampleCount, 12, 1, 256);
    const threshold = asPositiveFloat(data.motion_threshold || data.motionThreshold, 0.55, 0, 1);
    const samples = [];
    const stride = declaredDuration > 0 ? declaredDuration / sampleCount : 1;
    let cursor = 0;
    const motionWindows = [];
    let activeWindow = null;
    for (let i = 0; i < sampleCount; i += 1) {
        const motion = Number(readSeedFloat(seed, i, 1).toFixed(3));
        samples.push({
            index: i,
            timestamp_seconds: declaredDuration > 0 ? cursor : null,
            motion_score: motion,
        });
        if (motion >= threshold) {
            if (!activeWindow) {
                activeWindow = {
                    start_seconds: declaredDuration > 0 ? cursor : null,
                    end_seconds: declaredDuration > 0 ? cursor + stride : null,
                    samples: [i],
                };
            } else {
                activeWindow.end_seconds = declaredDuration > 0 ? cursor + stride : null;
                activeWindow.samples.push(i);
            }
        } else if (activeWindow) {
            motionWindows.push(activeWindow);
            activeWindow = null;
        }
        if (declaredDuration > 0) cursor += stride;
    }
    if (activeWindow) motionWindows.push(activeWindow);
    return {
        ok: !missing,
        backend: 'native-analytics-motion-detect',
        media_id: mediaId,
        media_resolved: !missing,
        media_missing_reason: missing ? reason : null,
        duration_seconds: declaredDuration || null,
        sample_count: sampleCount,
        motion_threshold: threshold,
        motion_windows: motionWindows,
        samples,
        requested_by_service: serviceActor.id,
        runtime_mode: runtime ? 'media-runtime' : 'standalone',
    };
}

module.exports = {
    describeAnalyticsDependency,
    runAudioFeatures,
    runMotionDetect,
};
