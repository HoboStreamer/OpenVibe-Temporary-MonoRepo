'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-media-hot-tier-'));
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.DB_PATH = path.join(tempRoot, 'media.db');
process.env.OPENVIBE_MEDIA_HOT_ROOT = path.join(tempRoot, 'storage');
process.env.OPENVIBE_MEDIA_MULTIPART_ROOT = path.join(tempRoot, 'multipart');
process.env.OPENVIBE_MEDIA_PROVIDER_POLICY = 'b2-default-r2-on-demand';
process.env.OPENVIBE_MEDIA_CANONICAL_PROVIDER = 'b2';
process.env.OPENVIBE_MEDIA_DEFAULT_PLAYBACK_PROVIDER = 'b2';
process.env.OPENVIBE_MEDIA_HOT_PROVIDER = 'r2';
process.env.OPENVIBE_MEDIA_HOT_PROVIDER_ENABLED = 'false';
process.env.OPENVIBE_MEDIA_R2_AUTO_PROMOTION_ENABLED = 'true';
process.env.OPENVIBE_MEDIA_R2_REQUIRE_SITE_HOT = 'true';
process.env.OPENVIBE_MEDIA_ASSET_ORIGIN_PROVIDER = 'local';
process.env.OPENVIBE_MEDIA_B2_BUCKET = 'b2-bucket';
process.env.OPENVIBE_MEDIA_B2_ENDPOINT = 'https://b2.example.test';
process.env.OPENVIBE_MEDIA_B2_PUBLIC_BASE_URL = 'https://b2.example.test/public';
process.env.OPENVIBE_MEDIA_R2_BUCKET = 'r2-bucket';
process.env.OPENVIBE_MEDIA_R2_ENDPOINT = 'https://r2.example.test';
process.env.OPENVIBE_MEDIA_R2_PUBLIC_BASE_URL = 'https://r2.example.test/public';
process.env.PUBLIC_BASE_URL = 'http://media.test';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const accessRollupModel = require('../server/access-rollup-model');
const lifecyclePolicy = require('../server/lifecycle-policy');
const model = require('../server/model');
const partModel = require('../server/part-model');
const promotionModel = require('../server/promotion-model');
const storageModel = require('../server/storage-model');
const { buildStorage } = require('../server/storage');
const { resolvePlayback } = require('../server/playback-resolver');

const GB = 1024 * 1024 * 1024;

(function playbackFallsBackToB2UntilR2HotExists() {
    const storage = buildStorage(config.storage);
    const media = model.create({
        owner_type: 'user',
        owner_id: '42',
        namespace: 'live.vods',
        type: 'vod',
        status: 'ready',
        visibility: 'public',
        storage_provider: 'b2',
        storage_key: 'live/vods/med_hot_policy.mp4',
        public_url: 'https://b2.example.test/public/live/vods/med_hot_policy.mp4',
        mime_type: 'video/mp4',
        size_bytes: 1024,
    });
    storageModel.recordLocation({
        mediaId: media.id,
        providerName: 'b2',
        role: 'canonical',
        storageKey: media.storage_key,
        publicUrl: media.public_url,
        sizeBytes: media.size_bytes,
    });

    return resolvePlayback(media, storageModel.listLocations(media.id), storage, {}).then(async (canonicalPlayback) => {
        assert.strictEqual(canonicalPlayback.provider_name, 'b2');
        assert.strictEqual(canonicalPlayback.selected_provider, 'b2');
        assert.strictEqual(canonicalPlayback.hot_tier_active, false);

        storageModel.recordLocation({
            mediaId: media.id,
            providerName: 'r2',
            role: 'hot',
            storageKey: media.storage_key,
            publicUrl: 'https://r2.example.test/public/live/vods/med_hot_policy.mp4',
            sizeBytes: media.size_bytes,
        });
        const hotPlayback = await resolvePlayback(media, storageModel.listLocations(media.id), storage, {});
        assert.strictEqual(hotPlayback.provider_name, 'r2');
        assert.strictEqual(hotPlayback.selected_provider, 'r2');
        assert.strictEqual(hotPlayback.hot_tier_active, true);
        assert.strictEqual(hotPlayback.promotion_status, 'promoted');
    });
})();

(async function lifecyclePromotionAndDemotionStayConservative() {
    const media = model.create({
        owner_type: 'user',
        owner_id: '7',
        namespace: 'live.vods',
        type: 'vod',
        status: 'ready',
        visibility: 'public',
        storage_provider: 'b2',
        storage_key: 'live/vods/med_promote.mp4',
        public_url: 'https://b2.example.test/public/live/vods/med_promote.mp4',
        mime_type: 'video/mp4',
        size_bytes: 8 * 1024 * 1024,
    });
    storageModel.recordLocation({
        mediaId: media.id,
        providerName: 'b2',
        role: 'canonical',
        storageKey: media.storage_key,
        publicUrl: media.public_url,
        sizeBytes: media.size_bytes,
        checksumSha256: 'abc123',
    });

    const storageStub = {
        providerPolicy: 'b2-default-r2-on-demand',
        canonicalProviderName: 'b2',
        hotProviderName: 'r2',
        hotProviderEnabled: false,
        r2AutoPromotionEnabled: true,
        r2RequireSiteHot: true,
        thresholds: config.storage.thresholds,
        parting: config.storage.parting,
        async copyObjectBetweenProviders(input) {
            return {
                provider: 'r2',
                storageKey: input.targetStorageKey,
                sizeBytes: input.expectedSizeBytes,
                sha256: input.expectedSha256 || 'abc123',
                publicUrl: `https://r2.example.test/public/${input.targetStorageKey}`,
                verified: true,
            };
        },
        async deleteObjectFromProvider() {
            return true;
        },
    };

    accessRollupModel.recordSiteHeatRollup({
        windowName: '7d',
        uniqueVideoViewers: 10,
        videoWatchMinutes: 120,
        mediaOriginEgressBytes: 2 * GB,
        mediaCacheMissBytes: 1 * GB,
        concurrentViewersPeak: 2,
    });
    accessRollupModel.upsertMediaAccessRollup({
        mediaId: media.id,
        mediaKind: 'vod',
        uniqueViewers24h: 10,
        uniqueViewers7d: 10,
        watchMinutes24h: 120,
        watchMinutes7d: 300,
        cacheMissBytes24h: 1 * GB,
        cacheMissBytes7d: 2 * GB,
        lastViewedAt: new Date().toISOString(),
    });
    const coldResult = await lifecyclePolicy.reconcileMediaStorage(storageStub, media.id, { dryRun: true });
    assert.strictEqual(coldResult.evaluation.shouldPromote, false);

    accessRollupModel.recordSiteHeatRollup({
        windowName: '7d',
        uniqueVideoViewers: 900,
        videoWatchMinutes: 48000,
        mediaOriginEgressBytes: 700 * GB,
        mediaCacheMissBytes: 300 * GB,
        concurrentViewersPeak: 120,
    });
    accessRollupModel.upsertMediaAccessRollup({
        mediaId: media.id,
        mediaKind: 'vod',
        uniqueViewers24h: 180,
        uniqueViewers7d: 420,
        watchMinutes24h: 3200,
        watchMinutes7d: 12000,
        cacheMissBytes24h: 32 * GB,
        cacheMissBytes7d: 180 * GB,
        lastViewedAt: new Date().toISOString(),
    });
    const promoted = await lifecyclePolicy.reconcileMediaStorage(storageStub, media.id, {});
    assert.strictEqual(promoted.action, 'promoted');
    assert.ok(storageModel.findLocation(media.id, { providerName: 'r2', role: 'hot', status: 'active' }));

    accessRollupModel.recordSiteHeatRollup({
        windowName: '7d',
        uniqueVideoViewers: 30,
        videoWatchMinutes: 800,
        mediaOriginEgressBytes: 10 * GB,
        mediaCacheMissBytes: 3 * GB,
        concurrentViewersPeak: 3,
    });
    accessRollupModel.upsertMediaAccessRollup({
        mediaId: media.id,
        mediaKind: 'vod',
        uniqueViewers24h: 0,
        uniqueViewers7d: 4,
        watchMinutes24h: 0,
        watchMinutes7d: 30,
        cacheMissBytes24h: 0,
        cacheMissBytes7d: 1 * GB,
        lastViewedAt: '2026-04-01T00:00:00.000Z',
    });
    const demoted = await lifecyclePolicy.reconcileMediaStorage(storageStub, media.id, {});
    assert.strictEqual(demoted.action, 'demoted');
    assert.strictEqual(storageModel.findLocation(media.id, { providerName: 'r2', role: 'hot', status: 'active' }), null);

    accessRollupModel.recordSiteHeatRollup({
        windowName: '7d',
        uniqueVideoViewers: 900,
        videoWatchMinutes: 48000,
        mediaOriginEgressBytes: 700 * GB,
        mediaCacheMissBytes: 300 * GB,
        concurrentViewersPeak: 120,
    });
    accessRollupModel.upsertMediaAccessRollup({
        mediaId: media.id,
        mediaKind: 'vod',
        uniqueViewers24h: 180,
        uniqueViewers7d: 420,
        watchMinutes24h: 3200,
        watchMinutes7d: 12000,
        cacheMissBytes24h: 32 * GB,
        cacheMissBytes7d: 180 * GB,
        lastViewedAt: new Date().toISOString(),
    });
    await lifecyclePolicy.reconcileMediaStorage(storageStub, media.id, {});
    promotionModel.createRetentionHold({
        mediaId: media.id,
        holdType: 'virtual-clip-dependency',
        reason: 'clip still depends on source segments',
        referenceId: 'clip_hold',
    });
    accessRollupModel.recordSiteHeatRollup({
        windowName: '7d',
        uniqueVideoViewers: 1,
        videoWatchMinutes: 10,
        mediaOriginEgressBytes: 0,
        mediaCacheMissBytes: 0,
        concurrentViewersPeak: 1,
    });
    accessRollupModel.upsertMediaAccessRollup({
        mediaId: media.id,
        mediaKind: 'vod',
        uniqueViewers24h: 0,
        uniqueViewers7d: 0,
        watchMinutes24h: 0,
        watchMinutes7d: 0,
        cacheMissBytes24h: 0,
        cacheMissBytes7d: 0,
        lastViewedAt: '2026-04-01T00:00:00.000Z',
    });
    const blocked = await lifecyclePolicy.reconcileMediaStorage(storageStub, media.id, {});
    assert.strictEqual(blocked.action, 'demote-blocked');
})();

(function partHotCandidatesCanPromoteIndependently() {
    const media = model.create({
        owner_type: 'user',
        owner_id: '8',
        namespace: 'live.vods',
        type: 'vod',
        status: 'ready',
        visibility: 'public',
        storage_provider: 'b2',
        storage_key: 'live/vods/med_part_hot.mp4',
        public_url: 'https://b2.example.test/public/live/vods/med_part_hot.mp4',
        mime_type: 'video/mp4',
        size_bytes: 2048,
    });
    const part = partModel.createPart({
        recordingId: 'rec_part_hot',
        mediaId: media.id,
        partNumber: 1,
        variant: 'source',
        providerName: 'b2',
        startedOffsetMs: 0,
        durationMs: 120000,
        totalBytes: 300 * 1024 * 1024,
        segmentCount: 4,
        status: 'closed',
    });
    accessRollupModel.recordSiteHeatRollup({
        windowName: '7d',
        uniqueVideoViewers: 1200,
        videoWatchMinutes: 52000,
        mediaOriginEgressBytes: 900 * GB,
        mediaCacheMissBytes: 350 * GB,
        concurrentViewersPeak: 150,
    });
    accessRollupModel.upsertPartAccessRollup({
        mediaId: media.id,
        partId: part.id,
        uniqueViewers24h: 150,
        watchMinutes24h: 2400,
        bytesServed24h: 35 * GB,
        cacheMissBytes24h: 30 * GB,
    });
    const storageStub = {
        providerPolicy: 'b2-default-r2-on-demand',
        canonicalProviderName: 'b2',
        hotProviderName: 'r2',
        hotProviderEnabled: false,
        r2AutoPromotionEnabled: true,
        r2RequireSiteHot: true,
        thresholds: config.storage.thresholds,
        parting: config.storage.parting,
    };
    const candidates = lifecyclePolicy.evaluatePartHotCandidates(storageStub, media.id, [part], accessRollupModel.listPartAccessRollupsByMediaId(media.id));
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].should_promote, true);
})();

console.log('media hot-tier storage policy tests OK');
