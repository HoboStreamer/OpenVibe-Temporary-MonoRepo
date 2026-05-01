'use strict';

const accessRollupModel = require('./access-rollup-model');
const model = require('./model');
const promotionModel = require('./promotion-model');
const storageModel = require('./storage-model');
const {
    evaluateClipR2Promotion,
    evaluateMediaR2Demotion,
    evaluateMediaR2Promotion,
    evaluatePartR2Promotion,
    evaluateSiteHotStatus,
} = require('./hot-tier-policy');

function activeCanonicalLocation(media) {
    const canonical = storageModel.findLocation(media.id, {
        role: 'canonical',
        status: 'active',
    });
    if (canonical) return canonical;
    if (!media.storage_key) return null;
    return {
        media_id: media.id,
        provider_name: media.storage_provider,
        role: 'canonical',
        storage_key: media.storage_key,
        public_url: media.public_url || null,
        signed_url_required: media.visibility !== 'public',
        checksum_sha256: media.sha256 || null,
        size_bytes: Number(media.size_bytes || 0),
        status: 'active',
        metadata: {},
    };
}

function activeHotLocation(mediaId, hotProviderName) {
    return storageModel.findLocation(mediaId, {
        providerName: hotProviderName,
        role: 'hot',
        status: 'active',
    });
}

function buildStorageConfig(storage) {
    return {
        providerPolicy: storage.providerPolicy,
        hotProviderEnabled: storage.hotProviderEnabled,
        r2AutoPromotionEnabled: storage.r2AutoPromotionEnabled,
        r2RequireSiteHot: storage.r2RequireSiteHot,
        thresholds: storage.thresholds || {},
        parting: storage.parting || {},
    };
}

function getSiteHeatStatus(storage) {
    const latest = accessRollupModel.getLatestSiteHeatRollup('7d') || accessRollupModel.recomputeSiteHeatRollup('7d');
    return {
        rollup: latest,
        status: evaluateSiteHotStatus(latest, storage.thresholds || {}, {
            providerPolicy: storage.providerPolicy,
            requireSiteHot: storage.r2RequireSiteHot,
        }),
    };
}

async function promoteMediaToHot(storage, media, evaluation, options) {
    const source = options || {};
    const canonical = activeCanonicalLocation(media);
    if (!canonical) {
        return {
            ok: false,
            action: 'promote',
            reason: 'missing-canonical-location',
            media_id: media.id,
        };
    }
    const existingHot = activeHotLocation(media.id, storage.hotProviderName);
    if (existingHot) {
        return {
            ok: true,
            action: 'already-promoted',
            media_id: media.id,
            location: existingHot,
            evaluation,
        };
    }

    const decision = promotionModel.createPromotionDecision({
        mediaId: media.id,
        decision: 'promote',
        fromProvider: canonical.provider_name,
        toProvider: storage.hotProviderName,
        reason: evaluation.reason || source.reason || 'promotion-requested',
        score: evaluation.score || 0,
        metrics: evaluation.metrics || {},
        state: 'queued',
    });

    const copied = await storage.copyObjectBetweenProviders({
        sourceProviderName: canonical.provider_name,
        targetProviderName: storage.hotProviderName,
        sourceStorageKey: canonical.storage_key,
        targetStorageKey: canonical.storage_key,
        contentType: media.mime_type,
        metadata: {
            media_id: media.id,
            promoted_from_provider: canonical.provider_name,
            promotion_reason: evaluation.reason || source.reason || 'promotion-requested',
        },
        mediaId: media.id,
        expectedSizeBytes: canonical.size_bytes || media.size_bytes,
        expectedSha256: canonical.checksum_sha256 || media.sha256 || null,
    });

    const hotLocation = storageModel.recordLocation({
        mediaId: media.id,
        providerName: storage.hotProviderName,
        role: 'hot',
        storageKey: copied.storageKey,
        publicUrl: copied.publicUrl,
        signedUrlRequired: media.visibility !== 'public',
        checksumSha256: copied.sha256 || canonical.checksum_sha256 || media.sha256 || null,
        sizeBytes: copied.sizeBytes || canonical.size_bytes || media.size_bytes || 0,
        metadata: {
            promoted_from_provider: canonical.provider_name,
            promotion_decision_id: decision.id,
            reason: evaluation.reason || source.reason || 'promotion-requested',
            forced: !!source.adminForce,
        },
    });
    promotionModel.markPromotionDecisionApplied(decision.id, 'applied');
    model.recordLifecycle(media.id, {
        from_status: media.status,
        to_status: media.status,
        from_tier: media.storage_tier,
        to_tier: media.storage_tier,
        actor: { type: source.actorType || 'system', id: source.actorId || 'promotion-worker' },
        detail: {
            action: 'promote-r2',
            from_provider: canonical.provider_name,
            to_provider: storage.hotProviderName,
            score: evaluation.score || 0,
            metrics: evaluation.metrics || {},
            forced: !!source.adminForce,
        },
    });
    return {
        ok: true,
        action: 'promoted',
        media_id: media.id,
        location: hotLocation,
        decision: promotionModel.getPromotionDecisionById(decision.id),
        evaluation,
    };
}

async function demoteMediaFromHot(storage, media, evaluation, options) {
    const source = options || {};
    const hotLocation = activeHotLocation(media.id, storage.hotProviderName);
    if (!hotLocation) {
        return {
            ok: true,
            action: 'already-cold',
            media_id: media.id,
            evaluation,
        };
    }
    const canonical = activeCanonicalLocation(media);
    if (!canonical) {
        return {
            ok: false,
            action: 'demote',
            media_id: media.id,
            reason: 'missing-canonical-location',
            evaluation,
        };
    }
    if (!source.adminForce && promotionModel.hasActiveRetentionHold({ mediaId: media.id, objectKey: hotLocation.storage_key })) {
        return {
            ok: false,
            action: 'demote-blocked',
            media_id: media.id,
            reason: 'retention-hold',
            evaluation,
        };
    }

    const decision = promotionModel.createPromotionDecision({
        mediaId: media.id,
        decision: 'demote',
        fromProvider: hotLocation.provider_name,
        toProvider: canonical.provider_name,
        reason: evaluation.reason || source.reason || 'demotion-requested',
        score: evaluation.score || 0,
        metrics: evaluation.metrics || {},
        state: 'queued',
    });
    await storage.deleteObjectFromProvider({
        providerName: hotLocation.provider_name,
        storageKey: hotLocation.storage_key,
    });
    storageModel.markLocationStatus(hotLocation.id, 'deleted', {
        demoted_at: new Date().toISOString(),
        reason: evaluation.reason || source.reason || 'demotion-requested',
        promotion_decision_id: decision.id,
    });
    promotionModel.markPromotionDecisionApplied(decision.id, 'applied');
    model.recordLifecycle(media.id, {
        from_status: media.status,
        to_status: media.status,
        from_tier: media.storage_tier,
        to_tier: media.storage_tier,
        actor: { type: source.actorType || 'system', id: source.actorId || 'promotion-worker' },
        detail: {
            action: 'demote-r2',
            from_provider: hotLocation.provider_name,
            to_provider: canonical.provider_name,
            score: evaluation.score || 0,
            metrics: evaluation.metrics || {},
            forced: !!source.adminForce,
        },
    });
    return {
        ok: true,
        action: 'demoted',
        media_id: media.id,
        evaluation,
        decision: promotionModel.getPromotionDecisionById(decision.id),
    };
}

async function reconcileMediaStorage(storage, mediaInput, options) {
    const source = options || {};
    const media = typeof mediaInput === 'string' ? model.getById(mediaInput) : mediaInput;
    if (!media) {
        return {
            ok: false,
            reason: 'media-not-found',
            media_id: typeof mediaInput === 'string' ? mediaInput : null,
        };
    }
    const storageConfig = buildStorageConfig(storage);
    const siteHeat = getSiteHeatStatus(storageConfig);
    const mediaRollup = accessRollupModel.getMediaAccessRollup(media.id);
    const hotLocation = activeHotLocation(media.id, storage.hotProviderName);
    const hasRetentionHold = promotionModel.hasActiveRetentionHold({ mediaId: media.id });
    const liveActive = String(media.status || '').toLowerCase() === 'recording';
    const evaluation = String(media.type || '').toLowerCase() === 'clip'
        ? evaluateClipR2Promotion(media, mediaRollup, siteHeat.status, storageConfig, { adminForce: source.adminForce === true })
        : evaluateMediaR2Promotion(media, mediaRollup, siteHeat.status, storageConfig, { adminForce: source.adminForce === true });
    const demotion = evaluateMediaR2Demotion(media, mediaRollup, siteHeat.status, storageConfig, {
        adminForce: source.adminForce === 'demote',
        hasRetentionHold,
        liveActive,
        pinned: !!(media.metadata && media.metadata.hot_tier_pinned),
    });

    if (source.dryRun) {
        return {
            ok: true,
            action: 'dry-run',
            media_id: media.id,
            site_hot: siteHeat.status,
            evaluation,
            demotion,
            hot_location_active: !!hotLocation,
        };
    }

    if ((source.forcePromote || source.adminForce === true || evaluation.shouldPromote) && !hotLocation) {
        return promoteMediaToHot(storage, media, evaluation, source);
    }
    if (hotLocation && hasRetentionHold && !source.forceDemote && source.adminForce !== 'demote' && !evaluation.shouldPromote) {
        return {
            ok: false,
            action: 'demote-blocked',
            media_id: media.id,
            reason: 'retention-hold',
            site_hot: siteHeat.status,
            evaluation,
            demotion,
            hot_location_active: true,
        };
    }
    if ((source.forceDemote || source.adminForce === 'demote' || demotion.shouldDemote) && hotLocation) {
        return demoteMediaFromHot(storage, media, demotion, source);
    }
    return {
        ok: true,
        action: hotLocation ? 'kept-hot' : 'kept-canonical',
        media_id: media.id,
        site_hot: siteHeat.status,
        evaluation,
        demotion,
        hot_location_active: !!hotLocation,
    };
}

async function listHotTierCandidates(storage, options) {
    const source = options || {};
    const limit = Math.min(Math.max(Number(source.limit) || 50, 1), 200);
    const siteHeat = getSiteHeatStatus(buildStorageConfig(storage));
    const rollups = accessRollupModel.listMediaAccessRollups({ limit });
    return rollups.map((rollup) => {
        const media = model.getById(rollup.media_id);
        if (!media) return null;
        const evaluation = String(media.type || '').toLowerCase() === 'clip'
            ? evaluateClipR2Promotion(media, rollup, siteHeat.status, buildStorageConfig(storage), {})
            : evaluateMediaR2Promotion(media, rollup, siteHeat.status, buildStorageConfig(storage), {});
        const hotLocation = activeHotLocation(media.id, storage.hotProviderName);
        return {
            media_id: media.id,
            media_kind: media.type,
            namespace: media.namespace,
            hot_location_active: !!hotLocation,
            should_promote: evaluation.shouldPromote,
            score: evaluation.score,
            reason: evaluation.reason,
            threshold_hits: evaluation.threshold_hits,
            metrics: evaluation.metrics,
        };
    }).filter(Boolean);
}

function getHotTierStatus(storage) {
    const siteHeat = getSiteHeatStatus(buildStorageConfig(storage));
    return {
        provider_policy: storage.providerPolicy,
        canonical_provider: storage.canonicalProviderName,
        hot_provider: storage.hotProviderName,
        hot_provider_enabled: storage.hotProviderEnabled,
        r2_auto_promotion_enabled: storage.r2AutoPromotionEnabled,
        r2_require_site_hot: storage.r2RequireSiteHot,
        site_hot: siteHeat.status,
        latest_site_rollup: siteHeat.rollup,
        active_hot_location_count: storageModel.countLocations({ role: 'hot', providerName: storage.hotProviderName, status: 'active' }),
        queued_decision_count: promotionModel.listPromotionDecisions({ state: 'queued', limit: 1000 }).length,
        recent_decisions: promotionModel.listPromotionDecisions({ limit: 20 }),
        active_retention_holds: promotionModel.listRetentionHolds({ activeOnly: true, limit: 100 }),
    };
}

function getPromotionStatus(storage, mediaId) {
    const media = model.getById(mediaId);
    if (!media) return null;
    const siteHeat = getSiteHeatStatus(buildStorageConfig(storage));
    const mediaRollup = accessRollupModel.getMediaAccessRollup(media.id);
    const evaluation = String(media.type || '').toLowerCase() === 'clip'
        ? evaluateClipR2Promotion(media, mediaRollup, siteHeat.status, buildStorageConfig(storage), {})
        : evaluateMediaR2Promotion(media, mediaRollup, siteHeat.status, buildStorageConfig(storage), {});
    return {
        media_id: media.id,
        site_hot: siteHeat.status,
        rollup: mediaRollup,
        evaluation,
        latest_decision: promotionModel.getLatestPromotionDecision(media.id),
        locations: storageModel.listLocations(media.id),
        active_hold_count: promotionModel.listRetentionHolds({ mediaId: media.id, activeOnly: true, limit: 100 }).length,
    };
}

function evaluatePartHotCandidates(storage, mediaId, parts, partRollups) {
    const siteHeat = getSiteHeatStatus(buildStorageConfig(storage));
    return (parts || []).map((part) => {
        const partRollup = (partRollups || []).find((row) => Number(row.part_id) === Number(part.id));
        const evaluation = evaluatePartR2Promotion(part, partRollup, siteHeat.status, buildStorageConfig(storage), {});
        return {
            part_id: part.id,
            media_id: mediaId,
            part_number: part.part_number,
            should_promote: evaluation.shouldPromote,
            reason: evaluation.reason,
            score: evaluation.score,
            threshold_hits: evaluation.threshold_hits,
            metrics: evaluation.metrics,
        };
    });
}

module.exports = {
    evaluatePartHotCandidates,
    getHotTierStatus,
    getPromotionStatus,
    listHotTierCandidates,
    reconcileMediaStorage,
};
