'use strict';

function validatePublicPlaybackSize(media, options) {
    const source = options || {};
    const maxBytes = Number(source.publicPlaybackMaxBytes || 512 * 1024 * 1024);
    if (!media) return { ok: false, reason: 'media_missing' };
    if (String(media.visibility || 'public') !== 'public') return { ok: true, reason: 'non_public_media' };
    if (Number(media.size_bytes || 0) <= maxBytes) return { ok: true, reason: 'within_limit' };
    return {
        ok: false,
        reason: 'public_media_too_large',
        max_bytes: maxBytes,
        actual_bytes: Number(media.size_bytes || 0),
    };
}

module.exports = {
    validatePublicPlaybackSize,
};