'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { S3CompatibleStorageProvider } = require('../providers/s3-compatible-provider');

(async function s3CompatibleWriteFileUsesManagedUpload() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-s3-provider-'));
    const filePath = path.join(root, 'clip.webm');
    fs.writeFileSync(filePath, 'clip-data', 'utf8');

    const uploadCalls = [];
    class FakeUpload {
        constructor(options) {
            uploadCalls.push({ type: 'constructor', options });
            this.options = options;
        }

        async done() {
            uploadCalls.push({ type: 'done' });
            return { ETag: '"etag-123"' };
        }
    }

    const client = {
        async send(command) {
            throw new Error(`unexpected direct send for ${command && command.constructor && command.constructor.name || 'unknown-command'}`);
        },
    };

    const provider = new S3CompatibleStorageProvider({
        providerName: 'b2',
        bucket: 'ov-media',
        region: 'us-west-004',
        endpoint: 'https://b2.example.test',
        publicBaseUrl: 'https://cdn.example.test',
        forcePathStyle: true,
        client,
        uploadFactory: FakeUpload,
    });

    const result = await provider.writeFile('live.clips', 'media:test:1', filePath, {
        extension: 'webm',
        mimeType: 'video/webm',
        now: '2026-05-01T00:00:00Z',
        metadata: {
            Media_ID: 'media:test:1',
            Legacy_Table: 'clips',
        },
    });

    const constructorCall = uploadCalls.find((entry) => entry.type === 'constructor');
    assert.ok(constructorCall, 'expected Upload helper to be constructed');
    assert.strictEqual(constructorCall.options.client, client);
    assert.strictEqual(constructorCall.options.params.Bucket, 'ov-media');
    assert.strictEqual(constructorCall.options.params.Key, 'live.clips/objects/2026/05/01/media-test-1.webm');
    assert.strictEqual(constructorCall.options.params.ContentLength, Buffer.byteLength('clip-data'));
    assert.strictEqual(constructorCall.options.params.ContentType, 'video/webm');
    assert.deepStrictEqual(constructorCall.options.params.Metadata, {
        media_id: 'media:test:1',
        legacy_table: 'clips',
    });
    assert.strictEqual(typeof constructorCall.options.params.Body.pipe, 'function');
    assert.strictEqual(constructorCall.options.leavePartsOnError, false);
    assert.ok(constructorCall.options.partSize >= 5 * 1024 * 1024);
    assert.strictEqual(constructorCall.options.queueSize, 4);
    assert.ok(uploadCalls.some((entry) => entry.type === 'done'), 'expected Upload helper to execute');

    assert.strictEqual(result.provider, 'b2');
    assert.strictEqual(result.storageKey, 'live.clips/objects/2026/05/01/media-test-1.webm');
    assert.strictEqual(result.sizeBytes, Buffer.byteLength('clip-data'));
    assert.strictEqual(result.etag, '"etag-123"');
    assert.strictEqual(result.publicUrl, 'https://cdn.example.test/live.clips/objects/2026/05/01/media-test-1.webm');
    assert.match(result.sha256, /^[a-f0-9]{64}$/);

    fs.rmSync(root, { recursive: true, force: true });
})();

console.log('openvibe-storage s3 provider tests OK');