'use strict';

const { LocalStorageProvider } = require('./providers/local-provider');
const { S3CompatibleStorageProvider } = require('./providers/s3-compatible-provider');
const {
    choosePlaybackProvider,
    chooseWriteProvider,
    normalizeProviderName,
} = require('./provider-selection');
const {
    buildDownloadHeaders,
    requiresSignedPlayback,
    resolveCachePolicy,
    resolveSurrogateControl,
} = require('./cache-policy');

class StorageManager {
    constructor(config) {
        const cfg = config || {};
        this.config = cfg;
        this.providers = new Map();
        this.canonicalProviderName = normalizeProviderName(cfg.canonicalProvider || cfg.provider || 'local');
        this.hotProviderName = normalizeProviderName(cfg.hotProvider || this.canonicalProviderName);
        this.assetOriginProviderName = normalizeProviderName(cfg.assetOriginProvider || cfg.provider || 'local');
        this.scratchMaxBytes = Math.max(0, Number(cfg.scratchMaxBytes || cfg.multipartThresholdBytes || 16 * 1024 * 1024));
        this.signedUrlTtlSeconds = Number(cfg.signedUrlTtlSeconds || 900);

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

    chooseWriteProvider(input) {
        const providerName = chooseWriteProvider({
            canonicalProvider: this.canonicalProviderName,
            hotProvider: this.hotProviderName,
            assetOriginProvider: this.assetOriginProviderName,
            scratchMaxBytes: this.scratchMaxBytes,
            namespace: input && input.namespace,
            type: input && input.type,
            sizeBytes: input && input.sizeBytes,
            providerName: input && input.providerName,
        });
        return this.resolveProvider(providerName);
    }

    choosePlaybackProvider(input) {
        const providerName = choosePlaybackProvider(Object.assign({}, input || {}, {
            canonicalProvider: this.canonicalProviderName,
        }));
        return this.resolveProvider(providerName);
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
            canonical_provider: this.canonicalProviderName,
            hot_provider: this.hotProviderName,
            asset_origin_provider: this.assetOriginProviderName,
            scratch_max_bytes: this.scratchMaxBytes,
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