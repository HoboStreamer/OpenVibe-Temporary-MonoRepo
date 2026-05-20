#!/usr/bin/env node
'use strict';

/**
 * Migrate local VODs to B2 storage.
 * 
 * Usage:
 *   node scripts/migrate-local-vods-to-b2.js [--dry-run] [--limit=N] [--concurrency=N]
 * 
 * Options:
 *   --dry-run       Show what would be done without uploading
 *   --limit=N       Process at most N VODs
 *   --concurrency=N Upload N files in parallel (default: 2)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const mediaConfig = require(path.join(ROOT, 'services', 'openvibe-media', 'server', 'config.js'));
const { buildStorage } = require(path.join(ROOT, 'services', 'openvibe-media', 'server', 'storage.js'));

const HOT_ROOT = path.join(ROOT, 'services', 'openvibe-media', 'data', 'storage', 'hot');
const DB_URL = process.env.OPENVIBE_DATABASE_URL || 'postgres://openvibe:LuZkHuM9s6bQrtA2YE8DOkSig9hRiW9d@127.0.0.1:5432/openvibe';

const args = process.argv.slice(2).reduce((acc, arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    acc[k] = v !== undefined ? v : true;
    return acc;
}, {});

const DRY_RUN = !!args['dry-run'];
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const CONCURRENCY = parseInt(args.concurrency || '2', 10);

function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

async function migrate() {
    const db = new Client({ connectionString: DB_URL });
    await db.connect();

    const storage = buildStorage(mediaConfig.storage);
    console.log(`Storage canonical provider: ${storage.canonicalProviderName}`);
    console.log(`B2 provider available: ${storage.providers.has('b2')}`);

    if (!storage.providers.has('b2')) {
        throw new Error('B2 provider not configured - check OPENVIBE_MEDIA_B2_* env vars');
    }

    // Get all local VODs
    const limitClause = LIMIT ? ` LIMIT ${LIMIT}` : '';
    const { rows: vods } = await db.query(
        `SELECT id, namespace, type, storage_key, storage_provider, size_bytes, mime_type, sha256, created_at
         FROM media_objects
         WHERE storage_provider = 'local' AND type = 'vod' AND deleted_at IS NULL
         ORDER BY created_at ASC${limitClause}`
    );

    console.log(`\nFound ${vods.length} local VODs to migrate${DRY_RUN ? ' (DRY RUN)' : ''}`);

    const report = {
        total: vods.length,
        uploaded: 0,
        skipped: 0,
        errors: [],
        missing_files: [],
    };

    const b2Provider = storage.providers.get('b2');

    async function processVod(vod) {
        const localPath = path.join(HOT_ROOT, vod.storage_key);

        if (!fs.existsSync(localPath)) {
            console.warn(`  MISSING: ${vod.id} -> ${localPath}`);
            report.missing_files.push({ id: vod.id, storage_key: vod.storage_key, path: localPath });
            return;
        }

        const stat = fs.statSync(localPath);
        const namespace = vod.namespace || 'live.vods';
        const extension = path.extname(localPath).replace(/^\./, '') || 'webm';

        if (DRY_RUN) {
            const b2Key = b2Provider.keyFor(namespace, vod.id, extension);
            console.log(`  [DRY-RUN] Would upload: ${vod.id} (${(stat.size / 1024 / 1024).toFixed(1)}MB) -> b2:${b2Key}`);
            report.uploaded++;
            return;
        }

        try {
            console.log(`  Uploading: ${vod.id} (${(stat.size / 1024 / 1024).toFixed(1)}MB)...`);
            const sha256 = await hashFile(localPath);

            const result = await b2Provider.writeFile(namespace, vod.id, localPath, {
                extension,
                mimeType: vod.mime_type || 'video/webm',
                metadata: { migrated_from: 'local', original_key: vod.storage_key },
            });

            const b2Key = result.storageKey || result.storage_key;
            const nowIso = new Date().toISOString();

            // Update media_objects
            await db.query(
                `UPDATE media_objects SET storage_provider = 'b2', storage_key = $1, sha256 = $2, size_bytes = $3, updated_at = $4 WHERE id = $5`,
                [b2Key, sha256, stat.size, nowIso, vod.id]
            );

            // Insert media_object_locations for B2
            await db.query(
                `INSERT INTO media_object_locations (media_id, provider_name, role, storage_key, bucket, endpoint, region, signed_url_required, checksum_sha256, size_bytes, status, metadata_json, created_at, updated_at)
                 VALUES ($1, 'b2', 'canonical', $2, $3, $4, $5, 1, $6, $7, 'active', '{}', $8, $8)
                 ON CONFLICT DO NOTHING`,
                [
                    vod.id, b2Key,
                    mediaConfig.storage.b2.bucket || 'openvibe',
                    mediaConfig.storage.b2.endpoint || 'https://s3.us-west-004.backblazeb2.com',
                    mediaConfig.storage.b2.region || 'us-west-004',
                    sha256, stat.size, nowIso,
                ]
            );

            // Mark old local location as deleted (if it exists)
            await db.query(
                `UPDATE media_object_locations SET status = 'deleted', updated_at = $1 WHERE media_id = $2 AND provider_name = 'local' AND status = 'active'`,
                [nowIso, vod.id]
            );

            console.log(`  ✓ Uploaded ${vod.id} -> b2:${b2Key}`);
            report.uploaded++;
        } catch (err) {
            console.error(`  ✗ Error uploading ${vod.id}: ${err.message}`);
            report.errors.push({ id: vod.id, error: err.message });
        }
    }

    // Process with limited concurrency
    for (let i = 0; i < vods.length; i += CONCURRENCY) {
        const batch = vods.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(processVod));
        console.log(`Progress: ${Math.min(i + CONCURRENCY, vods.length)}/${vods.length}`);
    }

    await db.end();

    console.log('\n=== Migration Report ===');
    console.log(`Total: ${report.total}`);
    console.log(`Uploaded: ${report.uploaded}`);
    console.log(`Missing files: ${report.missing_files.length}`);
    console.log(`Errors: ${report.errors.length}`);
    if (report.missing_files.length > 0) {
        console.log('\nMissing files:');
        report.missing_files.forEach(f => console.log(`  ${f.id}: ${f.path}`));
    }
    if (report.errors.length > 0) {
        console.log('\nErrors:');
        report.errors.forEach(e => console.log(`  ${e.id}: ${e.error}`));
    }

    return report;
}

migrate().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
