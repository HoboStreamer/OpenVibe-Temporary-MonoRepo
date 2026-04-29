'use strict';

function requiresSignedPlayback(input) {
    const source = input || {};
    const visibility = String(source.visibility || 'public').toLowerCase();
    return visibility === 'private' || visibility === 'restricted' || source.signed === true;
}

function resolveCachePolicy(input) {
    const source = input || {};
    if (requiresSignedPlayback(source)) return 'private, no-store';
    if (source.isPlaylist) return 'public, max-age=3, s-maxage=3, stale-while-revalidate=15';
    if (source.isSegment) return 'public, max-age=86400, s-maxage=86400, immutable';
    if (source.mediaType === 'thumbnail' || source.mediaType === 'image') {
        return 'public, max-age=31536000, s-maxage=31536000, immutable';
    }
    return 'public, max-age=300, s-maxage=300, stale-while-revalidate=60';
}

function resolveSurrogateControl(input) {
    const source = input || {};
    if (requiresSignedPlayback(source)) return 'private';
    if (source.isPlaylist) return 'max-age=3, stale-while-revalidate=15';
    if (source.isSegment) return 'max-age=86400';
    return 'max-age=300, stale-while-revalidate=60';
}

function buildDownloadHeaders(input) {
    const source = input || {};
    const headers = {
        'Cache-Control': resolveCachePolicy(source),
        'Surrogate-Control': resolveSurrogateControl(source),
    };
    if (source.contentType) headers['Content-Type'] = source.contentType;
    if (source.contentDisposition) headers['Content-Disposition'] = source.contentDisposition;
    return headers;
}

module.exports = {
    buildDownloadHeaders,
    requiresSignedPlayback,
    resolveCachePolicy,
    resolveSurrogateControl,
};