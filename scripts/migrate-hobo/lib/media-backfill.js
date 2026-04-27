'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { findExistingPath, forEachNdjson, writeJson } = require('./common');
const { ROOT } = require('./service-paths');

const mediaDbModule = require(path.join(ROOT, 'services', 'openvibe-media', 'server', 'db.js'));
const { buildStorage } = require(path.join(ROOT, 'services', 'openvibe-media', 'server', 'storage.js'));

function hashFile(filePath) {
    const hash = crypto.createHash('sha256');
    const input = fs.readFileSync(filePath);
    hash.update(input);
    return hash.digest('hex');
}

function extensionFor(filePath) {
    const ext = path.extname(String(filePath || '')).replace(/^\./, '').toLowerCase();
    return ext || null;
}

function copyIntoHotStorage(storage, namespace, mediaId, sourcePath) {
    const storageKey = storage.keyFor(namespace, mediaId, extensionFor(sourcePath));
    const destinationPath = storage.pathFor(storageKey);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
    const stat = fs.statSync(destinationPath);
    return {
        storageKey,
        destinationPath,
        sizeBytes: stat.size,
        sha256: hashFile(destinationPath),
        publicUrl: storage.publicUrlFor(mediaId),
    };
}

function recordLifecycle(db, mediaId, fromStatus, toStatus, detail) {
    db.prepare(`
        INSERT INTO media_lifecycle_audit (
            media_id, from_status, to_status, from_tier, to_tier,
            actor_type, actor_id, detail_json, recorded_at
        ) VALUES (?, ?, ?, ?, ?, 'service', 'migration-backfill', ?, CURRENT_TIMESTAMP)
    `).run(mediaId, fromStatus || null, toStatus || null, 'hot', 'hot', JSON.stringify(detail || {}));
}

function inventoryLegacyMediaDirs(legacyRoot) {
    const dirs = [
        'data/vods',
        'data/clips',
        'data/thumbnails',
        'data/avatars',
        'data/emotes',
        'data/pastes',
        'data/media',
    ];

    return dirs.map((relativeDir) => {
        const dirPath = path.join(legacyRoot, relativeDir);
        const entry = {
            relative_path: relativeDir,
            full_path: dirPath,
            exists: false,
            file_count: 0,
            total_bytes: 0,
        };

        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
            return entry;
        }

        entry.exists = true;
        const stack = [dirPath];
        while (stack.length) {
            const current = stack.pop();
            for (const child of fs.readdirSync(current, { withFileTypes: true })) {
                const childPath = path.join(current, child.name);
                if (child.isDirectory()) {
                    stack.push(childPath);
                    continue;
                }
                if (!child.isFile()) continue;
                const stat = fs.statSync(childPath);
                entry.file_count += 1;
                entry.total_bytes += stat.size;
            }
        }

        return entry;
    });
}

async function backfillMedia(options) {
    const {
        bundleDir,
        legacyRoot,
        mediaDbPath,
        hotRoot,
        publicBaseUrl,
        dryRun,
        logger,
    } = options;

    const resolvedBundleDir = path.resolve(bundleDir);
    const resolvedLegacyRoot = path.resolve(legacyRoot);
    const resolvedDbPath = path.resolve(mediaDbPath);
    const storage = buildStorage({
        provider: 'local',
        root: path.resolve(hotRoot),
        publicBaseUrl,
        coldProvider: 'none',
    });
    const db = mediaDbModule.init(resolvedDbPath);

    const report = {
        generated_at: new Date().toISOString(),
        bundle_dir: resolvedBundleDir,
        legacy_root: resolvedLegacyRoot,
        media_db_path: resolvedDbPath,
        hot_root: path.resolve(hotRoot),
        dry_run: !!dryRun,
        copied_records: 0,
        copied_bytes: 0,
        missing_files: [],
        skipped_records: [],
        legacy_media_inventory: inventoryLegacyMediaDirs(resolvedLegacyRoot),
    };

    const mediaFile = path.join(resolvedBundleDir, 'media', 'objects.ndjson');

    try {
        await forEachNdjson(mediaFile, async (row) => {
            const candidatePath = row.file_path || null;
            if (!candidatePath) {
                report.skipped_records.push({ media_id: row.id, reason: 'no-file-path', legacy_table: row.legacy_table || null });
                return;
            }

            const resolved = findExistingPath(resolvedLegacyRoot, candidatePath);
            if (!resolved.exists || !resolved.resolvedPath) {
                report.missing_files.push({
                    media_id: row.id,
                    legacy_table: row.legacy_table || null,
                    source_path: candidatePath,
                    resolved_path: resolved.resolvedPath,
                });
                return;
            }

            if (dryRun) {
                const stat = fs.statSync(resolved.resolvedPath);
                report.copied_records += 1;
                report.copied_bytes += stat.size;
                return;
            }

            const current = db.prepare('SELECT id, status, storage_key FROM media_objects WHERE id = ?').get(String(row.id));
            const copied = copyIntoHotStorage(storage, row.namespace || 'legacy.media', row.id, resolved.resolvedPath);
            db.prepare(`
                UPDATE media_objects
                SET status = 'ready',
                    storage_tier = 'hot',
                    storage_provider = ?,
                    storage_key = ?,
                    public_url = ?,
                    size_bytes = ?,
                    sha256 = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(storage.name(), copied.storageKey, copied.publicUrl, copied.sizeBytes, copied.sha256, String(row.id));
            recordLifecycle(db, row.id, current && current.status, 'ready', {
                source_path: candidatePath,
                resolved_path: resolved.resolvedPath,
                storage_key: copied.storageKey,
            });
            report.copied_records += 1;
            report.copied_bytes += copied.sizeBytes;
        });

        if (!dryRun && report.missing_files.length > 0) {
            const missingCount = report.missing_files.length;
            throw new Error(`Media backfill incomplete: ${missingCount} missing files detected. Re-fetch legacy media artifacts and ensure the source artifact bundle contains the full media store.`);
        }

        const reportPath = path.join(resolvedBundleDir, 'audit', 'media-backfill-report.json');
        writeJson(reportPath, report);
        if (logger) {
            logger.info(`Media backfill report written to ${reportPath}`);
        }
        return report;
    } finally {
        try {
            db.close();
        } catch {
            // ignore
        }
    }
}

module.exports = {
    backfillMedia,
};
