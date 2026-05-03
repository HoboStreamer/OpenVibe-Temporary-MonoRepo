'use strict';

const {
    buildDownloadHeaders,
    requiresSignedPlayback,
    resolveCachePolicy,
    resolveSurrogateControl,
} = require('@openvibe/storage');
const { resolveMediaContentType } = require('./content-type');

function resolveLocation(media, locations, storage, options) {
    const source = options || {};
    const selection = storage.choosePlaybackSelection
        ? storage.choosePlaybackSelection({
            visibility: media.visibility,
            signed: requiresSignedPlayback({ visibility: media.visibility }),
            preferHot: source.preferHot !== false,
            locations,
            promotionStatus: source.promotionStatus,
            adminForce: source.adminForce,
        })
        : {
            provider: storage.choosePlaybackProvider({
                visibility: media.visibility,
                signed: requiresSignedPlayback({ visibility: media.visibility }),
                preferHot: source.preferHot !== false,
                locations,
            }),
            providerName: storage.choosePlaybackProvider({
                visibility: media.visibility,
                signed: requiresSignedPlayback({ visibility: media.visibility }),
                preferHot: source.preferHot !== false,
                locations,
            }).name(),
            role: null,
            location: null,
            hotTierActive: false,
            promotionStatus: 'not_hot',
            providerPolicy: storage.providerPolicy || null,
            canonicalProvider: storage.canonicalProviderName || null,
        };
    const provider = selection.provider;
    const location = selection.location
        || locations.find((row) => row.provider_name === provider.name())
        || locations[0]
        || null;
    return {
        location,
        selection,
    };
}

async function resolvePlayback(media, locations, storage, options) {
    const source = options || {};
    const resolution = resolveLocation(media, locations, storage, source);
    const location = resolution.location;
    const selection = resolution.selection || {};
    if (!location) {
        return {
            ok: false,
            reason: 'no_active_location',
            cache_control: resolveCachePolicy({ visibility: media.visibility, mediaType: media.type }),
            surrogate_control: resolveSurrogateControl({ visibility: media.visibility, mediaType: media.type }),
        };
    }

    const signed = requiresSignedPlayback({ visibility: media.visibility, signed: source.forceSigned === true || location.signed_url_required });
    const contentType = resolveMediaContentType(media, location);
    const download = signed
        ? await storage.signDownload({
            providerName: location.provider_name,
            mediaId: media.id,
            storageKey: location.storage_key,
            visibility: media.visibility,
            contentType,
            fileName: source.fileName,
            expiresInSeconds: source.expiresInSeconds,
        })
        : {
            provider: location.provider_name,
            url: storage.publicUrlFor(media.id, {
                providerName: location.provider_name,
                storageKey: location.storage_key,
            }) || location.public_url,
            expires_at: null,
        };

    const headers = buildDownloadHeaders({
        visibility: media.visibility,
        mediaType: media.type,
        signed,
        contentType,
        contentDisposition: source.fileName ? `inline; filename="${String(source.fileName).replace(/[\r\n"]/g, '_')}"` : null,
    });

    return {
        ok: true,
        media_id: media.id,
        provider_name: location.provider_name,
        role: location.role,
        selected_provider: selection.providerName || location.provider_name,
        selected_role: selection.role || location.role,
        hot_tier_active: !!selection.hotTierActive,
        canonical_provider: selection.canonicalProvider || storage.canonicalProviderName || null,
        provider_policy: selection.providerPolicy || storage.providerPolicy || null,
        promotion_status: selection.promotionStatus || 'not_hot',
        storage_key: location.storage_key,
        signed,
        url: download.url,
        expires_at: download.expires_at || null,
        content_type: contentType || null,
        headers,
        cache_control: headers['Cache-Control'],
        surrogate_control: headers['Surrogate-Control'],
    };
}

module.exports = {
    resolvePlayback,
};