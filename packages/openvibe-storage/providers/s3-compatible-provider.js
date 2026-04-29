'use strict';

const fs = require('fs');

const {
    AbortMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadBucketCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    UploadPartCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { sha256Buffer } = require('../checksum');
const { buildObjectKey } = require('../object-keys');

function buildCredentials(options) {
    const opts = options || {};
    if (!opts.accessKeyId || !opts.secretAccessKey) return undefined;
    return {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
    };
}

function buildS3Client(options) {
    const opts = options || {};
    return new S3Client({
        region: opts.region || 'auto',
        endpoint: opts.endpoint || undefined,
        forcePathStyle: !!opts.forcePathStyle,
        credentials: buildCredentials(opts),
    });
}

function buildContentDisposition(fileName) {
    if (!fileName) return undefined;
    const safe = String(fileName).replace(/[\r\n"]/g, '_');
    return `inline; filename="${safe}"`;
}

class S3CompatibleStorageProvider {
    constructor(options) {
        const opts = options || {};
        this.providerName = String(opts.providerName || 's3');
        this.bucket = String(opts.bucket || '');
        this.region = String(opts.region || 'auto');
        this.endpoint = opts.endpoint || null;
        this.publicBaseUrl = String(opts.publicBaseUrl || '').replace(/\/$/, '');
        this.forcePathStyle = !!opts.forcePathStyle;
        this.client = buildS3Client(opts);
    }

    name() {
        return this.providerName;
    }

    capabilities() {
        return {
            direct_streaming: false,
            multipart: true,
            signed_download: true,
            signed_upload: true,
        };
    }

    keyFor(namespace, mediaId, extension, extra) {
        return buildObjectKey({
            namespace,
            mediaId,
            extension,
            mimeType: extra && extra.mimeType,
            variant: extra && extra.variant,
            category: extra && extra.category,
            now: extra && extra.now,
        });
    }

    publicUrlFor(_mediaId, options) {
        const storageKey = options && options.storageKey;
        if (!this.publicBaseUrl || !storageKey) return null;
        return `${this.publicBaseUrl}/${String(storageKey).split('/').map(encodeURIComponent).join('/')}`;
    }

    describePlan() {
        return {
            provider: this.name(),
            mode: 's3-compatible',
            bucket: this.bucket || null,
            region: this.region || null,
            endpoint: this.endpoint || null,
            public_base_url: this.publicBaseUrl || null,
            force_path_style: this.forcePathStyle,
            capabilities: this.capabilities(),
        };
    }

    async healthCheck(input) {
        const source = input || {};
        if (!this.bucket) {
            return {
                ok: false,
                configured: false,
                provider: this.name(),
                error: 'bucket not configured',
                checked_at: new Date().toISOString(),
            };
        }
        if (String(source.mode || 'headOnly').toLowerCase() === 'headonly') {
            return {
                ok: true,
                configured: true,
                provider: this.name(),
                checked_at: new Date().toISOString(),
            };
        }
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        return {
            ok: true,
            configured: true,
            provider: this.name(),
            checked_at: new Date().toISOString(),
        };
    }

    async writeBuffer(namespace, mediaId, buffer, options) {
        const opts = options || {};
        const storageKey = opts.storageKey || this.keyFor(namespace, mediaId, opts.extension, opts);
        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
            Body: buffer,
            ContentType: opts.mimeType || undefined,
        }));
        return {
            provider: this.name(),
            storageKey,
            sizeBytes: Buffer.byteLength(buffer || Buffer.alloc(0)),
            sha256: sha256Buffer(buffer),
            publicUrl: this.publicUrlFor(mediaId, { storageKey }),
        };
    }

    async moveTempFile(namespace, mediaId, srcPath, options) {
        const buffer = fs.readFileSync(srcPath);
        const result = await this.writeBuffer(namespace, mediaId, buffer, options);
        try { fs.unlinkSync(srcPath); } catch { /* ignore */ }
        return result;
    }

    readStream() {
        throw new Error('S3-compatible provider does not expose a local readStream; use signDownload() instead');
    }

    async stat(storageKey) {
        try {
            const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }));
            return {
                size: Number(head.ContentLength || 0),
                etag: head.ETag || null,
                last_modified: head.LastModified ? new Date(head.LastModified).toISOString() : null,
            };
        } catch {
            return null;
        }
    }

    async softDelete(storageKey) {
        if (!storageKey) return false;
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
        return true;
    }

    async createMultipartUpload(input) {
        const source = input || {};
        const storageKey = source.storageKey || this.keyFor(source.namespace, source.mediaId, source.extension, source);
        const response = await this.client.send(new CreateMultipartUploadCommand({
            Bucket: this.bucket,
            Key: storageKey,
            ContentType: source.mimeType || undefined,
        }));
        return {
            uploadId: response.UploadId,
            storageKey,
            provider: this.name(),
        };
    }

    async signUploadPart(input) {
        const source = input || {};
        const expiresInSeconds = Number(source.expiresInSeconds || 900);
        const url = await getSignedUrl(this.client, new UploadPartCommand({
            Bucket: this.bucket,
            Key: source.storageKey,
            UploadId: source.uploadId,
            PartNumber: Number(source.partNumber),
        }), { expiresIn: expiresInSeconds });
        return {
            uploadId: source.uploadId,
            partNumber: Number(source.partNumber),
            expires_in_seconds: expiresInSeconds,
            url,
        };
    }

    async completeMultipartUpload(input) {
        const source = input || {};
        const parts = Array.isArray(source.parts) ? source.parts.map((part) => ({
            ETag: part.etag || part.ETag,
            PartNumber: Number(part.partNumber || part.PartNumber),
        })) : [];
        const response = await this.client.send(new CompleteMultipartUploadCommand({
            Bucket: this.bucket,
            Key: source.storageKey,
            UploadId: source.uploadId,
            MultipartUpload: { Parts: parts },
        }));
        return {
            provider: this.name(),
            storageKey: source.storageKey,
            etag: response.ETag || null,
            publicUrl: this.publicUrlFor(source.mediaId, { storageKey: source.storageKey }),
        };
    }

    async abortMultipartUpload(input) {
        const source = input || {};
        await this.client.send(new AbortMultipartUploadCommand({
            Bucket: this.bucket,
            Key: source.storageKey,
            UploadId: source.uploadId,
        }));
        return { aborted: true, uploadId: source.uploadId, provider: this.name() };
    }

    async signDownload(input) {
        const source = input || {};
        if (this.publicBaseUrl && source.visibility === 'public') {
            return {
                provider: this.name(),
                url: this.publicUrlFor(source.mediaId, { storageKey: source.storageKey }),
                expires_at: null,
            };
        }
        const expiresInSeconds = Number(source.expiresInSeconds || 900);
        const url = await getSignedUrl(this.client, new GetObjectCommand({
            Bucket: this.bucket,
            Key: source.storageKey,
            ResponseContentType: source.contentType || undefined,
            ResponseContentDisposition: buildContentDisposition(source.fileName),
        }), { expiresIn: expiresInSeconds });
        return {
            provider: this.name(),
            url,
            expires_at: new Date(Date.now() + (expiresInSeconds * 1000)).toISOString(),
        };
    }
}

module.exports = {
    S3CompatibleStorageProvider,
};