'use strict';

const MIME_EXTENSION_HINTS = Object.freeze({
    'application/json': 'json',
    'application/pdf': 'pdf',
    'application/vnd.apple.mpegurl': 'm3u8',
    'audio/aac': 'aac',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'text/plain': 'txt',
    'video/mp2t': 'ts',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
});

function sanitizeFragment(value, fallback) {
    const normalized = String(value == null ? '' : value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || String(fallback || 'unknown');
}

function normalizeExtension(extension, mimeType) {
    const hint = String(extension || '')
        .trim()
        .toLowerCase()
        .replace(/^\./, '')
        .replace(/[^a-z0-9]+/g, '');
    if (hint) return hint.slice(0, 12);
    return MIME_EXTENSION_HINTS[String(mimeType || '').toLowerCase()] || '';
}

function buildDatePath(now) {
    const date = new Date(now || Date.now());
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

function buildObjectKey(input) {
    const source = input || {};
    const namespace = sanitizeFragment(source.namespace, 'unknown');
    const category = sanitizeFragment(source.category || 'objects', 'objects');
    const mediaId = sanitizeFragment(source.mediaId, 'item');
    const variant = source.variant ? `-${sanitizeFragment(source.variant, 'variant')}` : '';
    const ext = normalizeExtension(source.extension, source.mimeType);
    const suffix = ext ? `.${ext}` : '';
    return `${namespace}/${category}/${buildDatePath(source.now)}/${mediaId}${variant}${suffix}`;
}

function buildDerivativeKey(input) {
    const source = Object.assign({}, input || {}, { category: 'derivatives' });
    return buildObjectKey(source);
}

function buildSegmentKey(input) {
    const source = Object.assign({}, input || {}, { category: 'segments' });
    return buildObjectKey(source);
}

function buildAnalysisKey(input) {
    const source = Object.assign({}, input || {}, { category: 'analysis' });
    return buildObjectKey(source);
}

module.exports = {
    buildAnalysisKey,
    buildDerivativeKey,
    buildObjectKey,
    buildSegmentKey,
    buildDatePath,
    normalizeExtension,
    sanitizeFragment,
};