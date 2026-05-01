'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');

const { LocalStorageProvider } = require('./providers/local-provider');
const { S3CompatibleStorageProvider } = require('./providers/s3-compatible-provider');
const {
    choosePlaybackPlan,
    choosePlaybackProvider,
    chooseWritePlan,
    chooseWriteProvider,
    normalizeProviderName,
} = require('./provider-selection');
const {
    buildDownloadHeaders,
    requiresSignedPlayback,
    resolveCachePolicy,
    resolveSurrogateControl,
} = require('./cache-policy');
const { verifyChecksum } = require('./checksum');

class StorageManager {
    constructor(config) {
        const cfg = config || {};
        this.config = cfg;
        this.providers = new Map();
        this.canonicalProviderName = normalizeProviderName(cfg.canonicalProvider || cfg.provider || 'local');
        this.defaultPlaybackProviderName = normalizeProviderName(cfg.defaultPlaybackProvider || this.canonicalProviderName);
        this.hotProviderName = normalizeProviderName(cfg.hotProvider || this.canonicalProviderName);
        this.assetOriginProviderName = normalizeProviderName(cfg.assetOriginProvider || cfg.provider || 'local');
        this.providerPolicy = String(cfg.providerPolicy || (this.canonicalProviderName === 'b2' && this.hotProviderName === 'r2'
            ? 'b2-default-r2-on-demand'
            : 'legacy-auto-hot')).trim().toLowerCase();
        this.hotProviderEnabled = cfg.hotProviderEnabled == null
            ? this.providerPolicy !== 'b2-default-r2-on-demand'
            : !!cfg.hotProviderEnabled;
        this.r2AutoPromotionEnabled = cfg.r2AutoPromotionEnabled == null
            ? this.providerPolicy === 'b2-default-r2-on-demand'
            : !!cfg.r2AutoPromotionEnabled;
        this.r2RequireSiteHot = cfg.r2RequireSiteHot == null ? true : !!cfg.r2RequireSiteHot;
        this.scratchMaxBytes = Math.max(0, Number(cfg.scratchMaxBytes || cfg.multipartThresholdBytes || 16 * 1024 * 1024));
        this.signedUrlTtlSeconds = Number(cfg.signedUrlTtlSeconds || 900);
        this.thresholds = Object.assign({}, cfg.thresholds || {});
        this.parting = Object.assign({}, cfg.parting || {});

        const localProvider = new LocalStorageProvider({
            providerName: 'local',
            root: cfg.hotRoot || cfg.root,
            multipartRoot: cfg.multipartRoot,
            publicBaseUrl: cfg.publicBaseUrl,
        });
        this.providers.set('local', localProvider);

        if (cfg.s3 && cfg.s3.bucket) {
            this.providers.set('s3', new S3CompatibleStorageProvider(Object.assign({}, cfg.s3, { providerName: 's3' })));
        }
        if (cfg.b2 && cfg.b2.bucket) {
            this.providers.set('b2', new S3CompatibleStorageProvider(Object.assign({}, cfg.b2, {
                providerName: 'b2',
                forcePathStyle: cfg.b2.forcePathStyle !== false,
            })));
        }
        if (cfg.r2 && cfg.r2.bucket) {
            this.providers.set('r2', new S3CompatibleStorageProvider(Object.assign({}, cfg.r2, {
                providerName: 'r2',
                forcePathStyle: !!cfg.r2.forcePathStyle,
            })));
        }
    }

    resolveProvider(providerName) {
        const normalized = normalizeProviderName(providerName || this.canonicalProviderName);
        return this.providers.get(normalized) || this.providers.get(this.canonicalProviderName) || this.providers.get('local');
    }

    providerNames() {
        return Array.from(this.providers.keys()).sort();
    }

    name() {
        return this.canonicalProviderName;
    }

    chooseWriteTarget(input) {
        const selection = chooseWritePlan({
            canonicalProvider: this.canonicalProviderName,
            defaultPlaybackProvider: this.defaultPlaybackProviderName,
            hotProvider: this.hotProviderName,
            assetOriginProvider: this.assetOriginProviderName,
            providerPolicy: this.providerPolicy,
            hotProviderEnabled: this.hotProviderEnabled,
            r2AutoPromotionEnabled: this.r2AutoPromotionEnabled,
            scratchMaxBytes: this.scratchMaxBytes,
            namespace: input && input.namespace,
            type: input && input.type,
            sizeBytes: input && input.sizeBytes,
            providerName: input && input.providerName,
            role: input && input.role,
            forceHotProvider: input && input.forceHotProvider,
            promotionCopy: input && input.promotionCopy,
            operation: input && input.operation,
            writeMode: input && input.writeMode,
            hotLiveMode: input && input.hotLiveMode,
        });
        return Object.assign({}, selection, {
            provider: this.resolveProvider(selection.providerName),
        });
    }

    chooseWriteProvider(input) {
        return this.chooseWriteTarget(input).provider;
    }

    choosePlaybackSelection(input) {
        const selection = choosePlaybackPlan(Object.assign({}, input || {}, {
            canonicalProvider: this.canonicalProviderName,
            defaultPlaybackProvider: this.defaultPlaybackProviderName,
            hotProvider: this.hotProviderName,
            providerPolicy: this.providerPolicy,
        }));
        return Object.assign({}, selection, {
            provider: this.resolveProvider(selection.providerName),
        });
    }

    choosePlaybackProvider(input) {
        return this.choosePlaybackSelection(input).provider;
    }

    keyFor(namespace, mediaId, extension, options) {
        const provider = this.resolveProvider(options && options.providerName);
        if (!provider || typeof provider.keyFor !== 'function') {
            throw new Error(`Provider ${provider && provider.name ? provider.name() : 'unknown'} does not implement keyFor()`);
        }
        return provider.keyFor(namespace, mediaId, extension, options);
    }

    async writeBuffer(namespace, mediaId, buffer, options) {
        const provider = this.chooseWriteProvider(Object.assign({}, options || {}, {
            namespace,
            sizeBytes: Buffer.byteLength(buffer || Buffer.alloc(0)),
        }));
        return provider.writeBuffer(namespace, mediaId, buffer, options);
    }

    async moveTempFile(namespace, mediaId, srcPath, options) {
        const provider = this.chooseWriteProvider(Object.assign({}, options || {}, { namespace }));
        return provider.moveTempFile(namespace, mediaId, srcPath, options);
    }

    async createMultipartUpload(input) {
        const source = input || {};
        const provider = this.chooseWriteProvider(source);
        const upload = await provider.createMultipartUpload(source);
        return Object.assign({}, upload, { provider: provider.name() });
    }

    async copyObjectBetweenProviders(input) {
        const source = input || {};
        const sourceProvider = this.resolveProvider(source.sourceProviderName);
        const targetProvider = this.resolveProvider(source.targetProviderName);
        if (!sourceProvider || typeof sourceProvider.openReadStream !== 'function') {
            throw new Error(`Provider ${sourceProvider && sourceProvider.name ? sourceProvider.name() : source.sourceProviderName || 'unknown'} cannot stream objects for copy`);
        }
        if (!targetProvider || typeof targetProvider.writeFile !== 'function') {
            throw new Error(`Provider ${targetProvider && targetProvider.name ? targetProvider.name() : source.targetProviderName || 'unknown'} cannot accept copied objects`);
        }

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-storage-copy-'));
        const tempPath = path.join(tempDir, 'copy.bin');
        try {
            const opened = await sourceProvider.openReadStream(source.sourceStorageKey, source);
            await pipeline(opened.stream, fs.createWriteStream(tempPath));

            const writeResult = await targetProvider.writeFile('provider-copy', source.mediaId || 'copied-object', tempPath, {
                storageKey: source.targetStorageKey,
                mimeType: source.contentType || opened.contentType || null,
                metadata: source.metadata || {},
            });

            const verification = await this.verifyObjectOnProvider({
                providerName: targetProvider.name(),
                storageKey: writeResult.storageKey || source.targetStorageKey,
                expectedSizeBytes: source.expectedSizeBytes != null
                    ? Number(source.expectedSizeBytes)
                    : writeResult.sizeBytes != null
                        ? Number(writeResult.sizeBytes)
                        : opened.sizeBytes != null
                            ? Number(opened.sizeBytes)
                            : null,
                expectedSha256: source.expectedSha256 || writeResult.sha256 || opened.sha256 || null,
            });

            return {
                provider: targetProvider.name(),
                storageKey: writeResult.storageKey || source.targetStorageKey,
                sizeBytes: verification.sizeBytes != null ? verification.sizeBytes : writeResult.sizeBytes || opened.sizeBytes || 0,
                etag: verification.etag || writeResult.etag || opened.etag || null,
                publicUrl: writeResult.publicUrl || targetProvider.publicUrlFor(source.mediaId || 'copied-object', {
                    mediaId: source.mediaId || 'copied-object',
                    storageKey: writeResult.storageKey || source.targetStorageKey,
                }),
                sha256: verification.sha256 || writeResult.sha256 || opened.sha256 || null,
                verified: verification.ok !== false,
            };
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }

    async deleteObjectFromProvider(input) {
        const source = input || {};
        const provider = this.resolveProvider(source.providerName);
        if (provider && typeof provider.deleteObject === 'function') {
            return provider.deleteObject(source.storageKey, source);
        }
        if (provider && typeof provider.softDelete === 'function') {
            return provider.softDelete(source.storageKey, source);
        }
        throw new Error(`Provider ${provider && provider.name ? provider.name() : source.providerName || 'unknown'} cannot delete objects`);
    }

    async verifyObjectOnProvider(input) {
        const source = input || {};
        const provider = this.resolveProvider(source.providerName);
        if (provider && typeof provider.verifyObject === 'function') {
            return provider.verifyObject(source.storageKey, source);
        }

        const stat = await this.stat(source.storageKey, { providerName: source.providerName });
        if (!stat) {
            return {
                ok: false,
                provider: provider && provider.name ? provider.name() : normalizeProviderName(source.providerName),
                storageKey: source.storageKey,
                reason: 'missing',
            };
        }
        const sizeMatches = source.expectedSizeBytes == null || Number(source.expectedSizeBytes) === Number(stat.size);
        return {
            ok: sizeMatches,
            provider: provider && provider.name ? provider.name() : normalizeProviderName(source.providerName),
            storageKey: source.storageKey,
            sizeBytes: Number(stat.size || 0),
            etag: stat.etag || null,
            reason: sizeMatches ? 'verified' : 'size_mismatch',
            expectedSizeBytes: source.expectedSizeBytes == null ? null : Number(source.expectedSizeBytes),
            expectedSha256: source.expectedSha256 || null,
            checksumVerified: source.expectedSha256 ? verifyChecksum(source.expectedSha256, stat.sha256) : false,
        };
    }

    async signUploadPart(input) {
        const provider = this.resolveProvider(input && input.providerName);
        return provider.signUploadPart(Object.assign({}, input || {}, {
            expiresInSeconds: input && input.expiresInSeconds || this.signedUrlTtlSeconds,
        }));
    }

    async writeMultipartPart(input) {
        const provider = this.resolveProvider(input && input.providerName);
        if (!provider.writeMultipartPart) throw new Error(`Provider ${provider.name()} does not support local multipart part writes`);
        return provider.writeMultipartPart(input);
    }

    async completeMultipartUpload(input) {
        const provider = this.resolveProvider(input && input.providerName);
        return provider.completeMultipartUpload(input);
    }

    async abortMultipartUpload(input) {
        const provider = this.resolveProvider(input && input.providerName);
        return provider.abortMultipartUpload(input);
    }

    async signDownload(input) {
        const provider = this.resolveProvider(input && input.providerName);
        return provider.signDownload(Object.assign({}, input || {}, {
            expiresInSeconds: input && input.expiresInSeconds || this.signedUrlTtlSeconds,
        }));
    }

    publicUrlFor(mediaId, options) {
        const provider = this.resolveProvider(options && options.providerName);
        return provider.publicUrlFor(mediaId, options);
    }

    pathFor(storageKey, options) {
        const provider = this.resolveProvider(options && options.providerName);
        if (!provider.pathFor) return null;
        return provider.pathFor(storageKey);
    }

    readStream(storageKey, options) {
        const provider = this.resolveProvider(options && options.providerName);
        return provider.readStream(storageKey, options);
    }

    async stat(storageKey, options) {
        const provider = this.resolveProvider(options && options.providerName);
        return provider.stat(storageKey, options);
    }

    async softDelete(storageKey, options) {
        const provider = this.resolveProvider(options && options.providerName);
        return provider.softDelete(storageKey, options);
    }

    async healthCheck(input) {
        const checks = await Promise.all(this.providerNames().map(async (providerName) => {
            const provider = this.resolveProvider(providerName);
            try {
                const result = await provider.healthCheck(input || { mode: 'headOnly' });
                return Object.assign({ provider: provider.name() }, result);
            } catch (error) {
                return {
                    provider: provider.name(),
                    ok: false,
                    configured: true,
                    checked_at: new Date().toISOString(),
                    error: error.message,
                };
            }
        }));
        return {
            ok: checks.every((check) => check.ok),
            checks,
        };
    }

    describePlan() {
        return {
            provider_policy: this.providerPolicy,
            canonical_provider: this.canonicalProviderName,
            default_playback_provider: this.defaultPlaybackProviderName,
            hot_provider: this.hotProviderName,
            hot_provider_enabled: this.hotProviderEnabled,
            r2_auto_promotion_enabled: this.r2AutoPromotionEnabled,
            r2_require_site_hot: this.r2RequireSiteHot,
            asset_origin_provider: this.assetOriginProviderName,
            scratch_max_bytes: this.scratchMaxBytes,
            thresholds: this.thresholds,
            parting: this.parting,
            provider_names: this.providerNames(),
            providers: this.providerNames().map((providerName) => this.resolveProvider(providerName).describePlan()),
        };
    }
}

function createStorageManager(config) {
    return new StorageManager(config);
}

module.exports = {
    StorageManager,
    LocalStorageProvider,
    S3CompatibleStorageProvider,
    buildDownloadHeaders,
    choosePlaybackProvider,
    chooseWriteProvider,
    createStorageManager,
    normalizeProviderName,
    requiresSignedPlayback,
    resolveCachePolicy,
    resolveSurrogateControl,
    ...require('./checksum'),
    ...require('./object-keys'),
};