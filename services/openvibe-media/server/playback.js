'use strict';

function inferLocationRoleForStorage(storage, providerName, options) {
    const source = options || {};
    if (source.role) return String(source.role);
    if (!storage) return 'canonical';
    const normalizedProvider = String(providerName || '').trim().toLowerCase();
    const canonicalProvider = String(storage.canonicalProviderName || '').trim().toLowerCase();
    const hotProvider = String(storage.hotProviderName || '').trim().toLowerCase();
    const assetOriginProvider = String(storage.assetOriginProviderName || '').trim().toLowerCase();
    if (normalizedProvider && normalizedProvider === canonicalProvider) return 'canonical';
    if (normalizedProvider && normalizedProvider === hotProvider && hotProvider && hotProvider !== canonicalProvider) return 'hot';
    if (normalizedProvider && normalizedProvider === assetOriginProvider && assetOriginProvider && assetOriginProvider !== canonicalProvider) return 'asset-origin';
    return 'canonical';
}

function createPlaybackPayloadBuilder({ storage, storageModel, resolvePlayback }) {
    return async function buildPlaybackPayload(media, options) {
        const locations = storageModel.listLocations(media.id);
        if (!locations.length && media.storage_key) {
            locations.push({
                provider_name: media.storage_provider,
                role: media.metadata && media.metadata.storage_target && media.metadata.storage_target.role
                    || inferLocationRoleForStorage(storage, media.storage_provider),
                storage_key: media.storage_key,
                public_url: media.public_url,
                signed_url_required: media.visibility !== 'public',
            });
        }
        return resolvePlayback(media, locations, storage, options || {});
    };
}

module.exports = {
    createPlaybackPayloadBuilder,
    inferLocationRoleForStorage,
};
