'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createStorageManager } = require('..');
const { chooseWritePlan } = require('../provider-selection');

(function b2DefaultR2OnDemandDefaultsToCanonicalB2() {
    const plan = chooseWritePlan({
        providerPolicy: 'b2-default-r2-on-demand',
        canonicalProvider: 'b2',
        defaultPlaybackProvider: 'b2',
        hotProvider: 'r2',
        assetOriginProvider: 'local',
        hotProviderEnabled: false,
        namespace: 'live.vods',
        type: 'vod',
        sizeBytes: 64 * 1024 * 1024,
    });
    assert.strictEqual(plan.providerName, 'b2');
    assert.strictEqual(plan.role, 'canonical');
})();

(function liveSegmentsDoNotAutoWriteToR2() {
    const plan = chooseWritePlan({
        providerPolicy: 'b2-default-r2-on-demand',
        canonicalProvider: 'b2',
        defaultPlaybackProvider: 'b2',
        hotProvider: 'r2',
        assetOriginProvider: 'local',
        hotProviderEnabled: false,
        namespace: 'live.vods',
        type: 'segment',
        sizeBytes: 8 * 1024 * 1024,
    });
    assert.strictEqual(plan.providerName, 'b2');
    assert.strictEqual(plan.reason, 'canonical-default');
})();

(function smallAssetsStillPreferLocalAssetOrigin() {
    const plan = chooseWritePlan({
        providerPolicy: 'b2-default-r2-on-demand',
        canonicalProvider: 'b2',
        defaultPlaybackProvider: 'b2',
        hotProvider: 'r2',
        assetOriginProvider: 'local',
        hotProviderEnabled: false,
        scratchMaxBytes: 16 * 1024 * 1024,
        namespace: 'live.thumbnails',
        type: 'thumbnail',
        sizeBytes: 512 * 1024,
    });
    assert.strictEqual(plan.providerName, 'local');
    assert.strictEqual(plan.role, 'asset-origin');
})();

(function explicitR2OverrideStillWorks() {
    const plan = chooseWritePlan({
        providerPolicy: 'b2-default-r2-on-demand',
        canonicalProvider: 'b2',
        defaultPlaybackProvider: 'b2',
        hotProvider: 'r2',
        assetOriginProvider: 'local',
        providerName: 'r2',
    });
    assert.strictEqual(plan.providerName, 'r2');
    assert.strictEqual(plan.role, 'hot');
})();

(async function storageManagerSupportsProviderPolicyAndLocalCopy() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-storage-policy-'));
    const multipartRoot = path.join(root, 'multipart');
    const storage = createStorageManager({
        provider: 'local',
        providerPolicy: 'b2-default-r2-on-demand',
        canonicalProvider: 'b2',
        defaultPlaybackProvider: 'b2',
        hotProvider: 'r2',
        assetOriginProvider: 'local',
        hotProviderEnabled: false,
        r2AutoPromotionEnabled: true,
        r2RequireSiteHot: true,
        root,
        hotRoot: root,
        multipartRoot,
        publicBaseUrl: 'http://media.example.test',
        b2: {
            bucket: 'b2-bucket',
            region: 'us-west-004',
            endpoint: 'https://b2.example.test',
            publicBaseUrl: 'https://b2.example.test/public',
            forcePathStyle: true,
        },
        r2: {
            bucket: 'r2-bucket',
            region: 'auto',
            endpoint: 'https://r2.example.test',
            publicBaseUrl: 'https://r2.example.test/public',
            forcePathStyle: false,
        },
    });

    assert.strictEqual(storage.chooseWriteProvider({ namespace: 'live.vods', type: 'vod', sizeBytes: 1024 }).name(), 'b2');
    assert.strictEqual(storage.chooseWriteProvider({ namespace: 'live.vods', type: 'segment', sizeBytes: 1024 }).name(), 'b2');

    const written = await storage.writeBuffer('community.attachments', 'med_copy_source', Buffer.from('copy me'), {
        providerName: 'local',
        type: 'attachment',
    });
    const copied = await storage.copyObjectBetweenProviders({
        sourceProviderName: 'local',
        targetProviderName: 'local',
        sourceStorageKey: written.storageKey,
        targetStorageKey: 'copies/med_copy_target.txt',
        mediaId: 'med_copy_target',
        expectedSizeBytes: written.sizeBytes,
        expectedSha256: written.sha256,
    });
    assert.strictEqual(copied.provider, 'local');
    assert.strictEqual(copied.verified, true);

    const verified = await storage.verifyObjectOnProvider({
        providerName: 'local',
        storageKey: copied.storageKey,
        expectedSizeBytes: written.sizeBytes,
        expectedSha256: written.sha256,
    });
    assert.strictEqual(verified.ok, true);
})();

console.log('openvibe-storage provider policy tests OK');
