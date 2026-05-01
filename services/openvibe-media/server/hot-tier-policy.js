'use strict';

function toNumber(value, fallbackValue) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function bytesToGigabytes(value) {
    return toNumber(value, 0) / (1024 * 1024 * 1024);
}

function normalizeSiteMetrics(input) {
    const source = input || {};
    return {
        uniqueVideoViewers7d: toNumber(source.unique_video_viewers, 0),
        videoWatchMinutes7d: toNumber(source.video_watch_minutes, 0),
        originEgressGb7d: bytesToGigabytes(source.media_origin_egress_bytes),
        cacheMissGb7d: bytesToGigabytes(source.media_cache_miss_bytes),
        concurrentViewersPeak: toNumber(source.concurrent_viewers_peak, 0),
    };
}

function normalizeMediaMetrics(input) {
    const source = input || {};
    return {
        views24h: toNumber(source.views_24h, 0),
        views7d: toNumber(source.views_7d, 0),
        uniqueViewers24h: toNumber(source.unique_viewers_24h, 0),
        uniqueViewers7d: toNumber(source.unique_viewers_7d, 0),
        watchMinutes24h: toNumber(source.watch_minutes_24h, 0),
        watchMinutes7d: toNumber(source.watch_minutes_7d, 0),
        bytesServed24h: toNumber(source.bytes_served_24h, 0),
        bytesServed7d: toNumber(source.bytes_served_7d, 0),
        cacheMissGb24h: bytesToGigabytes(source.cache_miss_bytes_24h),
        cacheMissGb7d: bytesToGigabytes(source.cache_miss_bytes_7d),
        concurrentViewersPeak24h: toNumber(source.concurrent_viewers_peak_24h, 0),
        lastViewedAt: source.last_viewed_at || null,
    };
}

function thresholdHit(name, value, minimum) {
    return {
        name,
        value,
        minimum,
        passed: value >= minimum,
        ratio: minimum > 0 ? value / minimum : (value > 0 ? 1 : 0),
    };
}

function summarizeHits(hits) {
    const passed = hits.filter((hit) => hit.passed);
    return {
        hits,
        passed,
        passedAny: passed.length > 0,
        maxRatio: hits.reduce((maxValue, hit) => Math.max(maxValue, hit.ratio), 0),
    };
}

function evaluateSiteHotStatus(siteRollup, thresholds, options) {
    const source = options || {};
    const metrics = normalizeSiteMetrics(siteRollup);
    const siteThresholds = thresholds && thresholds.site || {};
    const summary = summarizeHits([
        thresholdHit('unique_video_viewers_7d', metrics.uniqueVideoViewers7d, toNumber(siteThresholds.minUniqueVideoViewers7d, 500)),
        thresholdHit('watch_minutes_7d', metrics.videoWatchMinutes7d, toNumber(siteThresholds.minWatchMinutes7d, 25000)),
        thresholdHit('origin_egress_gb_7d', metrics.originEgressGb7d, toNumber(siteThresholds.minOriginEgressGb7d, 500)),
        thresholdHit('concurrent_viewers_peak', metrics.concurrentViewersPeak, toNumber(siteThresholds.minConcurrentViewers, 75)),
    ]);
    const hot = summary.passedAny;
    return {
        hot,
        reason: hot ? 'site-threshold-met' : 'site-below-thresholds',
        metrics,
        threshold_hits: summary.passed,
        score: Number(summary.maxRatio.toFixed(4)),
        provider_policy: source.providerPolicy || null,
        require_site_hot: source.requireSiteHot !== false,
    };
}

function evaluateTrafficThresholds(metrics, thresholdConfig, names) {
    return summarizeHits(names.map(({ metric, threshold, label }) => {
        return thresholdHit(label, toNumber(metrics[metric], 0), toNumber(thresholdConfig[threshold], 0));
    }));
}

function evaluateMediaR2Promotion(media, mediaRollup, siteStatus, config, options) {
    const source = options || {};
    const metrics = normalizeMediaMetrics(mediaRollup);
    const thresholds = config && config.thresholds || {};
    const storageConfig = config || {};
    if (source.adminForce) {
        return {
            shouldPromote: true,
            forced: true,
            reason: 'admin-force',
            score: 1,
            metrics,
            threshold_hits: [{ name: 'admin_force', passed: true, value: 1, minimum: 1, ratio: 1 }],
        };
    }
    if (storageConfig.r2AutoPromotionEnabled === false) {
        return {
            shouldPromote: false,
            reason: 'auto-promotion-disabled',
            score: 0,
            metrics,
            threshold_hits: [],
        };
    }
    if (storageConfig.r2RequireSiteHot && !(siteStatus && siteStatus.hot)) {
        return {
            shouldPromote: false,
            reason: 'site-not-hot',
            score: 0,
            metrics,
            threshold_hits: [],
        };
    }
    const mediaKind = String(media && media.type || mediaRollup && mediaRollup.media_kind || '').toLowerCase();
    const targetThresholds = mediaKind === 'clip' ? thresholds.clip || {} : thresholds.vod || {};
    const summary = evaluateTrafficThresholds(metrics, targetThresholds, mediaKind === 'clip'
        ? [
            { metric: 'uniqueViewers24h', threshold: 'minUniqueViewers24h', label: 'clip_unique_viewers_24h' },
            { metric: 'uniqueViewers7d', threshold: 'minUniqueViewers7d', label: 'clip_unique_viewers_7d' },
            { metric: 'watchMinutes24h', threshold: 'minWatchMinutes24h', label: 'clip_watch_minutes_24h' },
            { metric: 'cacheMissGb24h', threshold: 'minCacheMissGb24h', label: 'clip_cache_miss_gb_24h' },
        ]
        : [
            { metric: 'uniqueViewers24h', threshold: 'minUniqueViewers24h', label: 'vod_unique_viewers_24h' },
            { metric: 'uniqueViewers7d', threshold: 'minUniqueViewers7d', label: 'vod_unique_viewers_7d' },
            { metric: 'watchMinutes24h', threshold: 'minWatchMinutes24h', label: 'vod_watch_minutes_24h' },
            { metric: 'watchMinutes7d', threshold: 'minWatchMinutes7d', label: 'vod_watch_minutes_7d' },
            { metric: 'cacheMissGb24h', threshold: 'minCacheMissGb24h', label: 'vod_cache_miss_gb_24h' },
            { metric: 'cacheMissGb7d', threshold: 'minCacheMissGb7d', label: 'vod_cache_miss_gb_7d' },
        ]);
    return {
        shouldPromote: summary.passedAny,
        reason: summary.passedAny ? 'media-hot-threshold-met' : 'media-below-thresholds',
        score: Number(summary.maxRatio.toFixed(4)),
        metrics,
        threshold_hits: summary.passed,
    };
}

function evaluateClipR2Promotion(media, mediaRollup, siteStatus, config, options) {
    return evaluateMediaR2Promotion(Object.assign({}, media || {}, { type: 'clip' }), mediaRollup, siteStatus, config, options);
}

function evaluatePartR2Promotion(part, partRollup, siteStatus, config, options) {
    const source = options || {};
    const metrics = {
        uniqueViewers24h: toNumber(partRollup && partRollup.unique_viewers_24h, 0),
        watchMinutes24h: toNumber(partRollup && partRollup.watch_minutes_24h, 0),
        cacheMissGb24h: bytesToGigabytes(partRollup && partRollup.cache_miss_bytes_24h),
        bytesServed24h: toNumber(partRollup && partRollup.bytes_served_24h, 0),
    };
    if (source.adminForce) {
        return {
            shouldPromote: true,
            forced: true,
            reason: 'admin-force',
            score: 1,
            metrics,
            threshold_hits: [{ name: 'admin_force', passed: true, value: 1, minimum: 1, ratio: 1 }],
        };
    }
    if (config && config.r2RequireSiteHot && !(siteStatus && siteStatus.hot)) {
        return {
            shouldPromote: false,
            reason: 'site-not-hot',
            score: 0,
            metrics,
            threshold_hits: [],
        };
    }
    const thresholds = config && config.thresholds && config.thresholds.vod || {};
    const summary = summarizeHits([
        thresholdHit('part_unique_viewers_24h', metrics.uniqueViewers24h, toNumber(thresholds.minUniqueViewers24h, 75)),
        thresholdHit('part_watch_minutes_24h', metrics.watchMinutes24h, toNumber(thresholds.minWatchMinutes24h, 1500)),
        thresholdHit('part_cache_miss_gb_24h', metrics.cacheMissGb24h, toNumber(thresholds.minCacheMissGb24h, 25)),
    ]);
    return {
        shouldPromote: summary.passedAny,
        reason: summary.passedAny ? 'part-hot-threshold-met' : 'part-below-thresholds',
        score: Number(summary.maxRatio.toFixed(4)),
        metrics,
        threshold_hits: summary.passed,
        part_id: part && part.id || null,
    };
}

function evaluateMediaR2Demotion(media, mediaRollup, siteStatus, config, options) {
    const source = options || {};
    if (source.adminForce) {
        return {
            shouldDemote: true,
            forced: true,
            reason: 'admin-force',
            score: 1,
            metrics: normalizeMediaMetrics(mediaRollup),
            threshold_hits: [],
        };
    }
    if (source.pinned || source.hasRetentionHold || source.liveActive) {
        return {
            shouldDemote: false,
            reason: source.pinned ? 'pinned' : source.hasRetentionHold ? 'retention-hold' : 'live-active',
            score: 0,
            metrics: normalizeMediaMetrics(mediaRollup),
            threshold_hits: [],
        };
    }
    const promotionDecision = evaluateMediaR2Promotion(media, mediaRollup, siteStatus, config, {});
    if (promotionDecision.shouldPromote) {
        return {
            shouldDemote: false,
            reason: 'still-hot',
            score: promotionDecision.score,
            metrics: promotionDecision.metrics,
            threshold_hits: promotionDecision.threshold_hits,
        };
    }
    const metrics = normalizeMediaMetrics(mediaRollup);
    const stale = !metrics.lastViewedAt || (Date.now() - Date.parse(metrics.lastViewedAt)) > (7 * 24 * 60 * 60 * 1000);
    const quiet = metrics.uniqueViewers24h < 5 && metrics.watchMinutes24h < 60 && metrics.cacheMissGb24h < 1;
    const siteQuiet = !(siteStatus && siteStatus.hot);
    const shouldDemote = stale || (quiet && siteQuiet);
    return {
        shouldDemote,
        reason: shouldDemote ? 'inactive-or-cold' : 'recent-activity',
        score: shouldDemote ? 1 : 0,
        metrics,
        threshold_hits: [],
    };
}

module.exports = {
    evaluateClipR2Promotion,
    evaluateMediaR2Demotion,
    evaluateMediaR2Promotion,
    evaluatePartR2Promotion,
    evaluateSiteHotStatus,
};
