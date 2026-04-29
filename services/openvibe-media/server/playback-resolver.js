'use strict';

const {
    buildDownloadHeaders,
    requiresSignedPlayback,
    resolveCachePolicy,
    resolveSurrogateControl,
} = require('@openvibe/storage');

function resolveLocation(media, locations, storage, options) {
    const source = options || {};
    const provider = storage.choosePlaybackProvider({
        visibility: media.visibility,
        signed: requiresSignedPlayback({ visibility: media.visibility }),
        preferHot: source.preferHot !== false,
        locations,
    });
    return locations.find((location) => location.provider_name === provider.name()) || locations[0] || null;
}

async function resolvePlayback(media, locations, storage, options) {
    const source = options || {};
    const location = resolveLocation(media, locations, storage, source);
    if (!location) {
        return {
            ok: false,
            reason: 'no_active_location',
            cache_control: resolveCachePolicy({ visibility: media.visibility, mediaType: media.type }),
            surrogate_control: resolveSurrogateControl({ visibility: media.visibility, mediaType: media.type }),
        };
    }

    const signed = requiresSignedPlayback({ visibility: media.visibility, signed: source.forceSigned === true || location.signed_url_required });
    const download = signed
        ? await storage.signDownload({
            providerName: location.provider_name,
            mediaId: media.id,
            storageKey: location.storage_key,
            visibility: media.visibility,
            contentType: media.mime_type,
            fileName: source.fileName,
            expiresInSeconds: source.expiresInSeconds,
        })
        : {
            provider: location.provider_name,
            url: location.public_url || storage.publicUrlFor(media.id, {
                providerName: location.provider_name,
                storageKey: location.storage_key,
            }),
            expires_at: null,
        };

    const headers = buildDownloadHeaders({
        visibility: media.visibility,
        mediaType: media.type,
        signed,
        contentType: media.mime_type,
        contentDisposition: source.fileName ? `inline; filename="${String(source.fileName).replace(/[\r\n"]/g, '_')}"` : null,
    });

    return {
        ok: true,
        media_id: media.id,
        provider_name: location.provider_name,
        role: location.role,
        storage_key: location.storage_key,
        signed,
        url: download.url,
        expires_at: download.expires_at || null,
        headers,
        cache_control: headers['Cache-Control'],
        surrogate_control: headers['Surrogate-Control'],
    };
}

module.exports = {
    resolvePlayback,
};