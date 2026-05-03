'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-media-multipart-test-')), 'media.db');
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_MEDIA_HOT_ROOT = path.join(path.dirname(process.env.DB_PATH), 'storage');
process.env.OPENVIBE_MEDIA_MULTIPART_ROOT = path.join(path.dirname(process.env.DB_PATH), 'multipart');
process.env.PUBLIC_BASE_URL = 'http://media.test';
process.env.OPENVIBE_MEDIA_PROVIDER = 'local';
process.env.OPENVIBE_MEDIA_CANONICAL_PROVIDER = 'local';
process.env.OPENVIBE_MEDIA_HOT_PROVIDER = 'local';
process.env.OPENVIBE_MEDIA_ASSET_ORIGIN_PROVIDER = 'local';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const storageModel = require('../server/storage-model');
const { buildStorage } = require('../server/storage');
const { resolvePlayback } = require('../server/playback-resolver');
const { validatePublicPlaybackSize } = require('../server/size-validator');

(async function multipartStateAndPlaybackResolveLocally() {
    const storage = buildStorage(config.storage);
    const media = model.create({
        owner_type: 'user',
        owner_id: '42',
        namespace: 'live.vods',
        type: 'vod',
        status: 'uploading',
        visibility: 'public',
        storage_provider: 'local',
        size_bytes: 1024,
    });

    const session = storageModel.createUploadSession({
        mediaId: media.id,
        ownerType: media.owner_type,
        ownerId: media.owner_id,
        namespace: media.namespace,
        providerName: 'local',
        storageKey: `live/vods/${media.id}.mp4`,
        mimeType: 'video/mp4',
        expectedSizeBytes: 1024,
    });
    assert.ok(session.id.startsWith('upl_'));

    const upload = await storage.createMultipartUpload({
        providerName: 'local',
        namespace: media.namespace,
        mediaId: media.id,
        type: media.type,
        extension: 'webm',
    });
    await storage.writeMultipartPart({ providerName: 'local', uploadId: upload.uploadId, partNumber: 1, buffer: Buffer.from('open') });
    await storage.writeMultipartPart({ providerName: 'local', uploadId: upload.uploadId, partNumber: 2, buffer: Buffer.from('vibe') });
    const completed = await storage.completeMultipartUpload({
        providerName: 'local',
        uploadId: upload.uploadId,
        storageKey: upload.storageKey,
        mediaId: media.id,
        parts: [
            { partNumber: 1, etag: 'local-1' },
            { partNumber: 2, etag: 'local-2' },
        ],
    });

    const updated = model.update(media.id, {
        status: 'ready',
        storage_key: completed.storageKey,
        public_url: completed.publicUrl,
        size_bytes: completed.sizeBytes,
        sha256: completed.sha256,
    });
    storageModel.recordLocation({
        mediaId: media.id,
        providerName: 'local',
        role: 'canonical',
        storageKey: completed.storageKey,
        publicUrl: completed.publicUrl,
        checksumSha256: completed.sha256,
        sizeBytes: completed.sizeBytes,
    });

    const playback = await resolvePlayback(updated, storageModel.listLocations(updated.id), storage, {});
    assert.strictEqual(playback.ok, true);
    assert.strictEqual(playback.url, `http://media.test/files/${encodeURIComponent(updated.id)}`);
    assert.strictEqual(playback.content_type, 'video/webm');
    assert.strictEqual(playback.headers['Content-Type'], 'video/webm');
})();

(function publicPlaybackSizeGuardFlagsOversizedObjects() {
    const decision = validatePublicPlaybackSize({ visibility: 'public', size_bytes: 1024 * 1024 * 1024 }, { publicPlaybackMaxBytes: 128 * 1024 * 1024 });
    assert.strictEqual(decision.ok, false);
    assert.strictEqual(decision.reason, 'public_media_too_large');
})();

console.log('media multipart+playback tests OK');