'use strict';

const DEFAULT_PROVIDER_POLICY = 'legacy-auto-hot';

function normalizeProviderName(value) {
    const normalized = String(value || 'local').trim().toLowerCase();
    if (normalized === 'cloudflare-r2') return 'r2';
    if (normalized === 'backblaze-b2') return 'b2';
    return normalized || 'local';
}

function normalizePolicyName(value, fallbackValue) {
    const normalized = String(value || fallbackValue || DEFAULT_PROVIDER_POLICY).trim().toLowerCase();
    return normalized || DEFAULT_PROVIDER_POLICY;
}

function boolFromInput(value, fallbackValue) {
    if (value == null || value === '') return fallbackValue;
    if (typeof value === 'boolean') return value;
    return String(value).trim().toLowerCase() === 'true';
}

function numberFromInput(value, fallbackValue) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function locationProviderName(location) {
    if (!location) return 'local';
    return normalizeProviderName(location.provider_name || location.provider || location.storage_provider || 'local');
}

function isActiveLocation(location) {
    return !!location && String(location.status || 'active').toLowerCase() === 'active';
}

function isScratchAsset(type, sizeBytes, scratchMaxBytes) {
    return sizeBytes > 0
        && sizeBytes <= scratchMaxBytes
        && new Set(['image', 'thumbnail', 'attachment', 'avatar', 'preview']).has(String(type || '').toLowerCase());
}

function isS3CompatibleProvider(value) {
    return new Set(['s3', 'b2', 'r2']).has(normalizeProviderName(value));
}

function chooseWritePlan(input) {
    const source = input || {};
    const canonicalProvider = normalizeProviderName(source.canonicalProvider || source.provider || 'local');
    const defaultPlaybackProvider = normalizeProviderName(source.defaultPlaybackProvider || canonicalProvider);
    const hotProvider = normalizeProviderName(source.hotProvider || canonicalProvider);
    const assetOriginProvider = normalizeProviderName(source.assetOriginProvider || canonicalProvider);
    const providerPolicy = normalizePolicyName(source.providerPolicy,
        canonicalProvider === 'b2' && hotProvider === 'r2'
            ? 'b2-default-r2-on-demand'
            : DEFAULT_PROVIDER_POLICY);
    const hotProviderEnabled = boolFromInput(source.hotProviderEnabled,
        providerPolicy !== 'b2-default-r2-on-demand');
    const r2AutoPromotionEnabled = boolFromInput(source.r2AutoPromotionEnabled,
        providerPolicy === 'b2-default-r2-on-demand');

    if (source.providerName) {
        const explicitProvider = normalizeProviderName(source.providerName);
        const explicitRole = source.role
            ? String(source.role)
            : explicitProvider === hotProvider && hotProvider !== canonicalProvider
                ? 'hot'
                : explicitProvider === assetOriginProvider && assetOriginProvider !== canonicalProvider
                    ? 'asset-origin'
                    : 'canonical';
        return {
            providerName: explicitProvider,
            role: explicitRole,
            reason: 'explicit-provider-override',
            providerPolicy,
            canonicalProvider,
            defaultPlaybackProvider,
            hotProvider,
            hotProviderEnabled,
            r2AutoPromotionEnabled,
            assetOriginProvider,
        };
    }

    const namespace = String(source.namespace || '').toLowerCase();
    const type = String(source.type || '').toLowerCase();
    const sizeBytes = numberFromInput(source.sizeBytes, 0);
    const scratchMaxBytes = Math.max(0, numberFromInput(source.scratchMaxBytes, 16 * 1024 * 1024));
    const forceHotProvider = boolFromInput(source.forceHotProvider, false);
    const promotionCopy = boolFromInput(source.promotionCopy, false)
        || new Set(['promotion', 'promotion-copy', 'copy-to-hot']).has(String(source.operation || source.writeMode || '').toLowerCase());
    const hotLiveMode = boolFromInput(source.hotLiveMode, false);
    const assetEligible = isScratchAsset(type, sizeBytes, scratchMaxBytes);

    if (providerPolicy === 'b2-default-r2-on-demand') {
        if (promotionCopy) {
            return {
                providerName: hotProvider,
                role: 'hot',
                reason: 'promotion-copy',
                providerPolicy,
                canonicalProvider,
                defaultPlaybackProvider,
                hotProvider,
                hotProviderEnabled,
                r2AutoPromotionEnabled,
                assetOriginProvider,
            };
        }
        if (forceHotProvider || hotLiveMode) {
            return {
                providerName: hotProvider,
                role: 'hot',
                reason: forceHotProvider ? 'forced-hot-write' : 'hot-live-write',
                providerPolicy,
                canonicalProvider,
                defaultPlaybackProvider,
                hotProvider,
                hotProviderEnabled,
                r2AutoPromotionEnabled,
                assetOriginProvider,
            };
        }
        if (assetEligible) {
            return {
                providerName: assetOriginProvider,
                role: assetOriginProvider === canonicalProvider ? 'canonical' : 'asset-origin',
                reason: 'small-asset-origin',
                providerPolicy,
                canonicalProvider,
                defaultPlaybackProvider,
                hotProvider,
                hotProviderEnabled,
                r2AutoPromotionEnabled,
                assetOriginProvider,
            };
        }
        return {
            providerName: canonicalProvider,
            role: 'canonical',
            reason: 'canonical-default',
            providerPolicy,
            canonicalProvider,
            defaultPlaybackProvider,
            hotProvider,
            hotProviderEnabled,
            r2AutoPromotionEnabled,
            assetOriginProvider,
        };
    }

    if (namespace.startsWith('live.') || ['segment', 'playlist', 'thumbnail'].includes(type)) {
        return {
            providerName: hotProvider || canonicalProvider,
            role: hotProvider === canonicalProvider ? 'canonical' : 'hot',
            reason: 'legacy-hot-routing',
            providerPolicy,
            canonicalProvider,
            defaultPlaybackProvider,
            hotProvider,
            hotProviderEnabled,
            r2AutoPromotionEnabled,
            assetOriginProvider,
        };
    }
    if (assetEligible) {
        const providerName = assetOriginProvider || hotProvider || canonicalProvider;
        return {
            providerName,
            role: providerName === canonicalProvider ? 'canonical' : 'asset-origin',
            reason: 'legacy-asset-origin',
            providerPolicy,
            canonicalProvider,
            defaultPlaybackProvider,
            hotProvider,
            hotProviderEnabled,
            r2AutoPromotionEnabled,
            assetOriginProvider,
        };
    }
    return {
        providerName: canonicalProvider,
        role: 'canonical',
        reason: 'legacy-canonical-default',
        providerPolicy,
        canonicalProvider,
        defaultPlaybackProvider,
        hotProvider,
        hotProviderEnabled,
        r2AutoPromotionEnabled,
        assetOriginProvider,
    };
}

function chooseWriteProvider(input) {
    return chooseWritePlan(input).providerName;
}

function choosePlaybackPlan(input) {
    const source = input || {};
    const locations = Array.isArray(source.locations) ? source.locations.filter(Boolean) : [];
    const activeLocations = locations.filter(isActiveLocation);
    const canonicalProvider = normalizeProviderName(source.canonicalProvider || source.provider || 'local');
    const defaultPlaybackProvider = normalizeProviderName(source.defaultPlaybackProvider || canonicalProvider);
    const hotProvider = normalizeProviderName(source.hotProvider || canonicalProvider);
    const providerPolicy = normalizePolicyName(source.providerPolicy,
        canonicalProvider === 'b2' && hotProvider === 'r2'
            ? 'b2-default-r2-on-demand'
            : DEFAULT_PROVIDER_POLICY);

    if (!locations.length) {
        const providerName = normalizeProviderName(source.providerName || defaultPlaybackProvider || canonicalProvider || 'local');
        return {
            providerName,
            role: providerName === hotProvider && hotProvider !== canonicalProvider ? 'hot' : 'canonical',
            location: null,
            hotTierActive: false,
            promotionStatus: 'not_hot',
            providerPolicy,
            canonicalProvider,
            defaultPlaybackProvider,
            hotProvider,
        };
    }

    const preferHot = source.preferHot !== false;
    const hotLocation = preferHot
        ? activeLocations.find((location) => location.role === 'hot' && locationProviderName(location) === hotProvider)
        : null;
    const canonicalLocation = activeLocations.find((location) => location.role === 'canonical' && locationProviderName(location) === defaultPlaybackProvider)
        || activeLocations.find((location) => location.role === 'canonical' && locationProviderName(location) === canonicalProvider)
        || activeLocations.find((location) => location.role === 'canonical');
    const assetOriginLocation = activeLocations.find((location) => location.role === 'asset-origin' && (location.public_url || location.publicUrl));
    const publicLocation = activeLocations.find((location) => location.public_url || location.publicUrl);
    const fallbackLocation = activeLocations[0] || locations[0] || null;
    const location = hotLocation || assetOriginLocation || canonicalLocation || publicLocation || fallbackLocation;
    const providerName = normalizeProviderName(locationProviderName(location) || defaultPlaybackProvider || canonicalProvider || 'local');
    const hasDeletedHotLocation = locations.some((locationRow) => locationRow.role === 'hot' && !isActiveLocation(locationRow));
    const promotionStatus = source.promotionStatus
        || (hotLocation
            ? (boolFromInput(source.adminForce, false) ? 'forced' : 'promoted')
            : hasDeletedHotLocation
                ? 'demoted'
                : 'not_hot');

    return {
        providerName,
        role: location && location.role || (providerName === hotProvider && hotProvider !== canonicalProvider ? 'hot' : 'canonical'),
        location,
        hotTierActive: !!hotLocation,
        promotionStatus,
        providerPolicy,
        canonicalProvider,
        defaultPlaybackProvider,
        hotProvider,
    };
}

function choosePlaybackProvider(input) {
    return choosePlaybackPlan(input).providerName;
}

module.exports = {
    choosePlaybackPlan,
    choosePlaybackProvider,
    chooseWritePlan,
    chooseWriteProvider,
    isS3CompatibleProvider,
    normalizeProviderName,
};