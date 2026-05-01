'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

process.env.NODE_ENV = 'development';
process.env.OPENVIBE_ENV = 'development';
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_OPENVIBE_MEDIA_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_MEDIA_DATABASE_URL = '';

const { ensureDir, writeJson } = require('../lib/common');
const { backfillMedia } = require('../lib/media-backfill');
const { ROOT } = require('../lib/service-paths');

const mediaDbModule = require(path.join(ROOT, 'services', 'openvibe-media', 'server', 'db.js'));

function writeNdjson(filePath, rows) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-media-backfill-test-'));
    const bundleDir = path.join(root, 'openvibe-target');
    const legacyRoot = path.join(root, 'production-source', 'hobostreamer');
    const mediaDbPath = path.join(root, 'db', 'openvibe-media.db');
    const hotRoot = path.join(root, 'hot-storage');
    const sourceFile = path.join(legacyRoot, 'data', 'vods', 'vod1.mp4');
    const absoluteSourceFile = path.join(legacyRoot, 'data', 'vods', 'vod2.mp4');

    ensureDir(path.dirname(sourceFile));
    fs.writeFileSync(sourceFile, 'not-a-real-video-but-good-enough-for-a-test', 'utf8');
    fs.writeFileSync(absoluteSourceFile, 'absolute-path-test-file', 'utf8');

    writeNdjson(path.join(bundleDir, 'media', 'objects.ndjson'), [
        {
            id: 'media:hobostreamer-vod:51',
            namespace: 'live.vods',
            legacy_table: 'vods',
            file_path: './data/vods/vod1.mp4',
        },
        {
            id: 'media:hobostreamer-vod:52',
            namespace: 'live.vods',
            legacy_table: 'vods',
            file_path: '/opt/hobostreamer/data/vods/vod2.mp4',
        },
    ]);
    writeJson(path.join(bundleDir, 'audit', 'import-report.json'), {
        exclusions: [
            { entity: 'users.hobo_bucks_balance', reason: 'excluded' },
            { entity: 'transactions', reason: 'excluded' },
        ],
        datasets: { 'media/objects': {} },
    });

    const db = mediaDbModule.init(mediaDbPath);
    db.prepare(`
        INSERT INTO media_objects (
            id, owner_type, owner_id, namespace, type, status, visibility,
            storage_tier, storage_provider, size_bytes, metadata_json
        ) VALUES (?, 'user', 'user:hobotools:1', ?, 'vod', 'initialized', 'public', 'hot', 'local', 0, '{}')
    `).run('media:hobostreamer-vod:51', 'live.vods');
    db.prepare(`
        INSERT INTO media_objects (
            id, owner_type, owner_id, namespace, type, status, visibility,
            storage_tier, storage_provider, size_bytes, metadata_json
        ) VALUES (?, 'user', 'user:hobotools:1', ?, 'vod', 'initialized', 'public', 'hot', 'local', 0, '{}')
    `).run('media:hobostreamer-vod:52', 'live.vods');
    db.close();

    const report = await backfillMedia({
        bundleDir,
        legacyRoot,
        mediaDbPath,
        hotRoot,
        publicBaseUrl: 'http://127.0.0.1:4500',
        providerName: 'local',
        storageConfig: {
            provider: 'local',
            providerPolicy: 'legacy-auto-hot',
            canonicalProvider: 'local',
            defaultPlaybackProvider: 'local',
            hotProvider: 'local',
            assetOriginProvider: 'local',
            root: hotRoot,
            hotRoot,
            multipartRoot: path.join(root, 'multipart'),
            publicBaseUrl: 'http://127.0.0.1:4500',
            local: {
                root: hotRoot,
                multipartRoot: path.join(root, 'multipart'),
                publicBaseUrl: 'http://127.0.0.1:4500',
            },
        },
        prune: true,
        dryRun: false,
        logger: { info() {}, warn() {}, error() {} },
    });

    assert.strictEqual(report.copied_records, 2, 'expected two copied media files');
    assert.strictEqual(report.verified_records, 2, 'expected both copied media files to be verified on the target provider');
    assert.strictEqual(report.pruned_records, 2, 'expected both verified legacy source files to be pruned');
    assert.strictEqual(report.verification_failures.length, 0, 'expected no verification failures');
    assert.strictEqual(report.prune_failures.length, 0, 'expected no prune failures');
    assert.strictEqual(report.missing_files.length, 0, 'expected no missing media files');
    assert.ok(fs.existsSync(path.join(bundleDir, 'audit', 'media-backfill-report.json')));
    assert.strictEqual(fs.existsSync(sourceFile), false, 'expected relative legacy source file to be pruned after verification');
    assert.strictEqual(fs.existsSync(absoluteSourceFile), false, 'expected absolute legacy source file to be pruned after verification');

    const verifyDb = new Database(mediaDbPath, { readonly: true });
    try {
        for (const mediaId of ['media:hobostreamer-vod:51', 'media:hobostreamer-vod:52']) {
            const row = verifyDb.prepare('SELECT status, storage_key, sha256, storage_provider FROM media_objects WHERE id = ?').get(mediaId);
            assert.strictEqual(row.status, 'ready');
            assert.strictEqual(row.storage_provider, 'local');
            assert.ok(row.storage_key, 'expected storage key to be recorded');
            assert.ok(row.sha256, 'expected sha256 to be recorded');
            assert.ok(fs.existsSync(path.join(hotRoot, row.storage_key)), 'expected copied media file in hot storage');
            const location = verifyDb.prepare('SELECT provider_name, role, status FROM media_object_locations WHERE media_id = ?').get(mediaId);
            assert.strictEqual(location.provider_name, 'local');
            assert.strictEqual(location.role, 'canonical');
            assert.strictEqual(location.status, 'active');
        }
    } finally {
        verifyDb.close();
    }

    console.log('media backfill test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
