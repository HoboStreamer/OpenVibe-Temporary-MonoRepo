'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    createStorageManager,
    requiresSignedPlayback,
    resolveCachePolicy,
} = require('..');

(async function localStorageManagerSupportsMultipartAndDownloads() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-storage-'));
    const storage = createStorageManager({
        provider: 'local',
        canonicalProvider: 'local',
        hotProvider: 'local',
        assetOriginProvider: 'local',
        root,
        hotRoot: root,
        publicBaseUrl: 'http://media.example.test',
    });

    const upload = await storage.createMultipartUpload({
        namespace: 'live.vods',
        mediaId: 'med_test',
        type: 'vod',
        extension: 'mp4',
    });
    assert.strictEqual(upload.provider, 'local');

    await storage.writeMultipartPart({
        providerName: upload.provider,
        uploadId: upload.uploadId,
        partNumber: 1,
        buffer: Buffer.from('hello '),
    });
    await storage.writeMultipartPart({
        providerName: upload.provider,
        uploadId: upload.uploadId,
        partNumber: 2,
        buffer: Buffer.from('world'),
    });

    const completed = await storage.completeMultipartUpload({
        providerName: upload.provider,
        uploadId: upload.uploadId,
        storageKey: upload.storageKey,
        mediaId: 'med_test',
        parts: [
            { partNumber: 1, etag: 'local-1' },
            { partNumber: 2, etag: 'local-2' },
        ],
    });
    assert.strictEqual(completed.sizeBytes, 11);
    assert.ok(fs.existsSync(path.join(root, upload.storageKey)));

    const signed = await storage.signDownload({
        providerName: 'local',
        mediaId: 'med_test',
        storageKey: upload.storageKey,
        visibility: 'public',
    });
    assert.strictEqual(signed.url, 'http://media.example.test/files/med_test');
})();

(function cachePolicyHelpersStayHonest() {
    assert.strictEqual(requiresSignedPlayback({ visibility: 'private' }), true);
    assert.strictEqual(resolveCachePolicy({ visibility: 'public', isPlaylist: true }), 'public, max-age=3, s-maxage=3, stale-while-revalidate=15');
})();

console.log('openvibe-storage: OK');