'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { findExistingPath, forEachNdjson, writeJson } = require('./common');
const { ROOT } = require('./service-paths');

const mediaConfig = require(path.join(ROOT, 'services', 'openvibe-media', 'server', 'config.js'));
const mediaDbModule = require(path.join(ROOT, 'services', 'openvibe-media', 'server', 'db.js'));
const { buildStorage } = require(path.join(ROOT, 'services', 'openvibe-media', 'server', 'storage.js'));
const storageModel = require(path.join(ROOT, 'services', 'openvibe-media', 'server', 'storage-model.js'));

function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

function extensionFor(filePath) {
    const ext = path.extname(String(filePath || '')).replace(/^\./, '').toLowerCase();
    return ext || null;
}

function cloneStorageConfig(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

function buildBackfillStorageConfig(options) {
    const source = options || {};
    const cfg = cloneStorageConfig(source.storageConfig || mediaConfig.storage || {});
    const hotRoot = source.hotRoot ? path.resolve(source.hotRoot) : null;
    const multipartRoot = source.multipartRoot ? path.resolve(source.multipartRoot) : null;

    if (hotRoot) {
        cfg.root = hotRoot;
        cfg.hotRoot = hotRoot;
        cfg.local = Object.assign({}, cfg.local || {}, { root: hotRoot });
    }
    if (multipartRoot) {
        cfg.multipartRoot = multipartRoot;
        cfg.local = Object.assign({}, cfg.local || {}, { multipartRoot });
    }
    if (source.publicBaseUrl !== undefined) {
        cfg.publicBaseUrl = source.publicBaseUrl;
        cfg.local = Object.assign({}, cfg.local || {}, { publicBaseUrl: source.publicBaseUrl });
    }

    return cfg;
}

function providerDetails(storage, providerName) {
    const cfg = storage && storage.config || {};
    const normalized = String(providerName || '').trim().toLowerCase();
    switch (normalized) {
    case 'b2':
        return Object.assign({ providerName: 'b2' }, cfg.b2 || {});
    case 'r2':
        return Object.assign({ providerName: 'r2' }, cfg.r2 || {});
    case 's3':
        return Object.assign({ providerName: 's3' }, cfg.s3 || {});
    case 'local':
        return {
            providerName: 'local',
            root: cfg.hotRoot || cfg.root || null,
            publicBaseUrl: cfg.publicBaseUrl || cfg.local && cfg.local.publicBaseUrl || null,
        };
    default:
        return { providerName: normalized || null };
    }
}

async function writeIntoStorage(storage, media, sourcePath, options) {
    const source = options || {};
    const stat = fs.statSync(sourcePath);
    const namespace = source.namespace || media.namespace || 'legacy.media';
    const selection = typeof storage.chooseWriteTarget === 'function'
        ? storage.chooseWriteTarget({
            namespace,
            type: media.type || source.type || null,
            sizeBytes: stat.size,
            providerName: source.providerName || undefined,
            operation: 'migration-backfill',
        })
        : {
            providerName: source.providerName || storage.name(),
            role: 'canonical',
            provider: storage.resolveProvider(source.providerName || storage.name()),
        };
    const provider = selection.provider || storage.resolveProvider(selection.providerName);
    if (!provider || typeof provider.writeFile !== 'function') {
        throw new Error(`Storage provider ${selection.providerName || provider && provider.name && provider.name() || 'unknown'} cannot accept backfilled objects`);
    }

    const result = await provider.writeFile(namespace, media.id, sourcePath, {
        extension: extensionFor(sourcePath),
        mimeType: media.mime_type || source.mimeType || null,
        metadata: source.metadata || {},
    });
    return Object.assign({}, result, {
        namespace,
        role: selection.role || 'canonical',
        providerName: result.provider || selection.providerName,
        providerDetails: providerDetails(storage, result.provider || selection.providerName),
    });
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
        multipartRoot,
        publicBaseUrl,
        providerName,
        storageConfig,
        dryRun,
        prune,
        logger,
        // strict=true means missing legacy media files cause the run to throw.
        // Default is non-fatal: missing files are recorded in the report and
        // the operator decides whether to re-fetch and rerun.
        strict = false,
    } = options;

    const resolvedBundleDir = path.resolve(bundleDir);
    const resolvedLegacyRoot = path.resolve(legacyRoot);
    const resolvedDbPath = path.resolve(mediaDbPath);
    const storage = buildStorage(buildBackfillStorageConfig({
        storageConfig,
        hotRoot,
        multipartRoot,
        publicBaseUrl,
    }));
    const db = mediaDbModule.init(resolvedDbPath);
    const requestedProviderName = providerName || 'local';

    const report = {
        generated_at: new Date().toISOString(),
        bundle_dir: resolvedBundleDir,
        legacy_root: resolvedLegacyRoot,
        media_db_path: resolvedDbPath,
        hot_root: hotRoot ? path.resolve(hotRoot) : null,
        requested_provider_name: requestedProviderName,
        canonical_provider_name: storage.canonicalProviderName || storage.name(),
        provider_policy: storage.providerPolicy || null,
        dry_run: !!dryRun,
        prune_requested: !!prune,
        copied_records: 0,
        copied_bytes: 0,
        verified_records: 0,
        pruned_records: 0,
        pruned_bytes: 0,
        missing_files: [],
        skipped_records: [],
        verification_failures: [],
        prune_failures: [],
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

            const current = db.prepare(`
                SELECT id, namespace, type, status, visibility, storage_tier, storage_provider, storage_key, mime_type
                FROM media_objects
                WHERE id = ?
            `).get(String(row.id));
            if (!current) {
                report.skipped_records.push({ media_id: row.id, reason: 'missing-media-object', legacy_table: row.legacy_table || null });
                return;
            }

            const media = {
                id: String(row.id),
                namespace: row.namespace || current.namespace || 'legacy.media',
                type: row.media_type || row.type || current.type || null,
                visibility: row.visibility || current.visibility || 'public',
                mime_type: row.mime_type || current.mime_type || null,
            };
            const copied = await writeIntoStorage(storage, media, resolved.resolvedPath, {
                namespace: media.namespace,
                type: media.type,
                providerName: requestedProviderName,
                metadata: {
                    media_id: media.id,
                    migration_source: 'hobo',
                    legacy_table: row.legacy_table || null,
                    legacy_path: candidatePath,
                },
            });
            const verification = await storage.verifyObjectOnProvider({
                providerName: copied.providerName,
                storageKey: copied.storageKey,
                expectedSizeBytes: copied.sizeBytes,
                expectedSha256: copied.sha256,
            });
            if (!verification.ok) {
                const detail = {
                    media_id: row.id,
                    source_path: candidatePath,
                    resolved_path: resolved.resolvedPath,
                    provider_name: copied.providerName,
                    storage_key: copied.storageKey,
                    reason: verification.reason || 'verification-failed',
                    expected_size_bytes: copied.sizeBytes,
                    actual_size_bytes: verification.sizeBytes == null ? null : Number(verification.sizeBytes),
                    expected_sha256: copied.sha256 || null,
                    actual_sha256: verification.sha256 || null,
                };
                report.verification_failures.push(detail);
                if (strict) {
                    throw new Error(`Media backfill verification failed for ${row.id}: ${detail.reason}`);
                }
                if (logger) {
                    logger.warn(`[media-backfill] verification failed for ${row.id}: ${detail.reason}`);
                }
                return;
            }

            const verifiedSizeBytes = verification.sizeBytes == null ? copied.sizeBytes : Number(verification.sizeBytes);
            const verifiedSha256 = verification.sha256 || copied.sha256 || null;
            report.verified_records += 1;
            const requiresSignedPlayback = media.visibility !== 'public' || !copied.publicUrl;
            const nextStorageTier = current.storage_tier || (copied.role === 'hot' ? 'hot' : 'warm');

            db.prepare(`
                UPDATE media_objects
                SET status = 'ready',
                    storage_tier = ?,
                    storage_provider = ?,
                    storage_key = ?,
                    public_url = ?,
                    size_bytes = ?,
                    sha256 = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(nextStorageTier, copied.providerName, copied.storageKey, copied.publicUrl || null, verifiedSizeBytes, verifiedSha256, String(row.id));

            storageModel.recordLocation({
                mediaId: media.id,
                providerName: copied.providerName,
                role: copied.role || 'canonical',
                storageKey: copied.storageKey,
                bucket: copied.providerDetails.bucket || null,
                endpoint: copied.providerDetails.endpoint || null,
                region: copied.providerDetails.region || null,
                publicUrl: copied.publicUrl || null,
                signedUrlRequired: requiresSignedPlayback,
                checksumSha256: verifiedSha256,
                sizeBytes: verifiedSizeBytes || 0,
                status: 'active',
                metadata: {
                    migration_source: 'hobo',
                    legacy_table: row.legacy_table || null,
                    source_path: candidatePath,
                    resolved_path: resolved.resolvedPath,
                    verification: {
                        provider_name: copied.providerName,
                        reason: verification.reason || 'verified',
                        size_bytes: verifiedSizeBytes,
                        sha256: verifiedSha256,
                    },
                },
            });

            let prunedSource = false;
            if (prune) {
                try {
                    const providerPath = storage.pathFor(copied.storageKey, { providerName: copied.providerName });
                    const sourcePath = path.resolve(resolved.resolvedPath);
                    if (providerPath && path.resolve(providerPath) === sourcePath) {
                        throw new Error('refusing to prune source because provider target path matches the legacy source path');
                    }
                    fs.unlinkSync(sourcePath);
                    report.pruned_records += 1;
                    report.pruned_bytes += verifiedSizeBytes;
                    prunedSource = true;
                } catch (error) {
                    const detail = {
                        media_id: row.id,
                        source_path: candidatePath,
                        resolved_path: resolved.resolvedPath,
                        provider_name: copied.providerName,
                        storage_key: copied.storageKey,
                        error: error.message,
                    };
                    report.prune_failures.push(detail);
                    if (strict) {
                        throw new Error(`Media source prune failed for ${row.id}: ${error.message}`);
                    }
                    if (logger) {
                        logger.warn(`[media-backfill] prune failed for ${row.id}: ${error.message}`);
                    }
                }
            }

            recordLifecycle(db, row.id, current && current.status, 'ready', {
                source_path: candidatePath,
                resolved_path: resolved.resolvedPath,
                storage_key: copied.storageKey,
                storage_provider: copied.providerName,
                role: copied.role || 'canonical',
                verification: {
                    reason: verification.reason || 'verified',
                    size_bytes: verifiedSizeBytes,
                    sha256: verifiedSha256,
                },
                source_pruned: prunedSource,
            });
            report.copied_records += 1;
            report.copied_bytes += verifiedSizeBytes;
        });

        if (!dryRun && report.missing_files.length > 0) {
            const missingCount = report.missing_files.length;
            const message = `Media backfill incomplete: ${missingCount} missing files detected. Re-fetch legacy media artifacts and ensure the source artifact bundle contains the full media store.`;
            if (strict) {
                throw new Error(message);
            } else if (logger) {
                logger.warn(`[media-backfill] ${message} (continuing because --strict was not set)`);
            }
        }
        report.strict_mode = !!strict;

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
