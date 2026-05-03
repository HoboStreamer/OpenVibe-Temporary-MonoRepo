'use strict';

const path = require('path');

const CONTENT_TYPE_BY_EXTENSION = Object.freeze({
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json; charset=utf-8',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.m4a': 'audio/mp4',
    '.m4v': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.oga': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.ogv': 'video/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ts': 'video/mp2t',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
});

function inferMediaContentTypeFromValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const withoutQuery = raw.split(/[?#]/, 1)[0];
    const ext = path.extname(withoutQuery).toLowerCase();
    return CONTENT_TYPE_BY_EXTENSION[ext] || null;
}

function resolveMediaContentType(media, location) {
    const metadata = media && media.metadata && typeof media.metadata === 'object' ? media.metadata : {};
    const directContentType = String(media && media.mime_type || metadata.mime_type || '').trim();
    if (directContentType) return directContentType;

    const candidates = [
        location && location.storage_key,
        location && location.storageKey,
        location && location.public_url,
        location && location.url,
        media && media.storage_key,
        media && media.public_url,
        metadata.storage_key,
        metadata.public_url,
        metadata.file_name,
        metadata.original_file_name,
        metadata.original_filename,
        metadata.legacy_path,
    ];

    for (const candidate of candidates) {
        const inferred = inferMediaContentTypeFromValue(candidate);
        if (inferred) return inferred;
    }

    return null;
}

module.exports = {
    CONTENT_TYPE_BY_EXTENSION,
    inferMediaContentTypeFromValue,
    resolveMediaContentType,
};