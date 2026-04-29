'use strict';

function normalizeProviderName(value) {
    const normalized = String(value || 'local').trim().toLowerCase();
    if (normalized === 'cloudflare-r2') return 'r2';
    if (normalized === 'backblaze-b2') return 'b2';
    return normalized || 'local';
}

function isS3CompatibleProvider(value) {
    return new Set(['s3', 'b2', 'r2']).has(normalizeProviderName(value));
}

function chooseWriteProvider(input) {
    const source = input || {};
    if (source.providerName) return normalizeProviderName(source.providerName);

    const canonicalProvider = normalizeProviderName(source.canonicalProvider || source.provider || 'local');
    const hotProvider = normalizeProviderName(source.hotProvider || canonicalProvider);
    const assetOriginProvider = normalizeProviderName(source.assetOriginProvider || hotProvider);
    const namespace = String(source.namespace || '').toLowerCase();
    const type = String(source.type || '').toLowerCase();
    const sizeBytes = Number(source.sizeBytes || 0);
    const scratchMaxBytes = Math.max(0, Number(source.scratchMaxBytes || 16 * 1024 * 1024));

    if (namespace.startsWith('live.') || ['segment', 'playlist', 'thumbnail'].includes(type)) {
        return hotProvider || canonicalProvider;
    }
    if (sizeBytes > 0 && sizeBytes <= scratchMaxBytes && ['image', 'thumbnail', 'attachment'].includes(type)) {
        return assetOriginProvider || hotProvider || canonicalProvider;
    }
    return canonicalProvider;
}

function choosePlaybackProvider(input) {
    const source = input || {};
    const locations = Array.isArray(source.locations) ? source.locations.filter(Boolean) : [];
    if (!locations.length) return normalizeProviderName(source.providerName || source.canonicalProvider || 'local');

    if (source.signed === true || String(source.visibility || '').toLowerCase() === 'private' || String(source.visibility || '').toLowerCase() === 'restricted') {
        const canonical = locations.find((location) => location.role === 'canonical') || locations[0];
        return normalizeProviderName(canonical.provider_name || canonical.provider || canonical.storage_provider || 'local');
    }

    if (source.preferHot !== false) {
        const hot = locations.find((location) => location.role === 'hot');
        if (hot) return normalizeProviderName(hot.provider_name || hot.provider || hot.storage_provider);
    }

    const publicLocation = locations.find((location) => location.public_url);
    if (publicLocation) return normalizeProviderName(publicLocation.provider_name || publicLocation.provider || publicLocation.storage_provider);

    const canonical = locations.find((location) => location.role === 'canonical') || locations[0];
    return normalizeProviderName(canonical.provider_name || canonical.provider || canonical.storage_provider || 'local');
}

module.exports = {
    choosePlaybackProvider,
    chooseWriteProvider,
    isS3CompatibleProvider,
    normalizeProviderName,
};