'use strict';

function inferLocationRoleForStorage(storage, providerName) {
    if (!storage) return 'canonical';
    if (providerName === storage.hotProviderName) return 'hot';
    if (providerName === storage.assetOriginProviderName) return 'asset-origin';
    return 'canonical';
}

function createPlaybackPayloadBuilder({ storage, storageModel, resolvePlayback }) {
    return async function buildPlaybackPayload(media, options) {
        const locations = storageModel.listLocations(media.id);
        if (!locations.length && media.storage_key) {
            locations.push({
                provider_name: media.storage_provider,
                role: inferLocationRoleForStorage(storage, media.storage_provider),
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
