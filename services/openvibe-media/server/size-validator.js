'use strict';

function validatePublicPlaybackSize(media, options) {
    const source = options || {};
    const maxBytes = Number(source.publicPlaybackMaxBytes || 500 * 1024 * 1024);
    const targetBytes = Number(source.targetPublicObjectBytes || 256 * 1024 * 1024);
    const warnBytes = Number(source.warnPublicObjectBytes || 384 * 1024 * 1024);
    if (!media) return { ok: false, reason: 'media_missing', max_bytes: maxBytes, target_bytes: targetBytes, warn_bytes: warnBytes };
    if (String(media.visibility || 'public') !== 'public') {
        return { ok: true, reason: 'non_public_media', max_bytes: maxBytes, target_bytes: targetBytes, warn_bytes: warnBytes };
    }
    const actualBytes = Number(media.size_bytes || 0);
    if (actualBytes <= maxBytes) {
        return {
            ok: true,
            reason: 'within_limit',
            max_bytes: maxBytes,
            target_bytes: targetBytes,
            warn_bytes: warnBytes,
            actual_bytes: actualBytes,
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
    };
}

module.exports = {
    validatePublicPlaybackSize,
};