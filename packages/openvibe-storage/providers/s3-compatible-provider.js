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
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { sha256Buffer, sha256FileAsync, sha256ReadableStream, verifyChecksum } = require('../checksum');
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

function sanitizeMetadata(input) {
    const source = input || {};
    return Object.entries(source).reduce((acc, [key, value]) => {
        if (value == null) return acc;
        acc[String(key).toLowerCase()] = String(value);
        return acc;
    }, {});
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
        this.client = opts.client || buildS3Client(opts);
        this.uploadFactory = opts.uploadFactory || Upload;
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
        const response = await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
            Body: buffer,
            ContentType: opts.mimeType || undefined,
            Metadata: sanitizeMetadata(opts.metadata),
        }));
        return {
            provider: this.name(),
            storageKey,
            sizeBytes: Buffer.byteLength(buffer || Buffer.alloc(0)),
            sha256: sha256Buffer(buffer),
            etag: response.ETag || null,
            publicUrl: this.publicUrlFor(mediaId, { storageKey }),
        };
    }

    async writeFile(namespace, mediaId, filePath, options) {
        const opts = options || {};
        const storageKey = opts.storageKey || this.keyFor(namespace, mediaId, opts.extension, opts);
        const stat = fs.statSync(filePath);
        const body = fs.createReadStream(filePath);
        const minMultipartPartSize = 5 * 1024 * 1024;
        const requestedPartSize = Number(opts.partSize || opts.multipartPartSize || 0);
        const partSize = Number.isFinite(requestedPartSize) && requestedPartSize >= minMultipartPartSize
            ? requestedPartSize
            : Math.max(minMultipartPartSize, Math.min(stat.size || minMultipartPartSize, 64 * 1024 * 1024));
        const requestedQueueSize = Number(opts.queueSize || opts.multipartQueueSize || 4);
        const queueSize = Number.isFinite(requestedQueueSize) && requestedQueueSize > 0
            ? Math.trunc(requestedQueueSize)
            : 4;
        const uploader = new this.uploadFactory({
            client: this.client,
            params: {
                Bucket: this.bucket,
                Key: storageKey,
                Body: body,
                ContentLength: stat.size,
                ContentType: opts.mimeType || undefined,
                Metadata: sanitizeMetadata(opts.metadata),
            },
            partSize,
            queueSize,
            leavePartsOnError: false,
        });
        const response = await uploader.done();
        const sha256 = await sha256FileAsync(filePath);
        return {
            provider: this.name(),
            storageKey,
            sizeBytes: stat.size,
            sha256,
            etag: response.ETag || null,
            publicUrl: this.publicUrlFor(mediaId, { storageKey }),
        };
    }

    async moveTempFile(namespace, mediaId, srcPath, options) {
        const result = await this.writeFile(namespace, mediaId, srcPath, options);
        try { fs.unlinkSync(srcPath); } catch { /* ignore */ }
        return result;
    }

    async openReadStream(storageKey) {
        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
        }));
        return {
            provider: this.name(),
            storageKey,
            sizeBytes: response.ContentLength != null ? Number(response.ContentLength) : 0,
            etag: response.ETag || null,
            contentType: response.ContentType || null,
            stream: response.Body,
        };
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

    async deleteObject(storageKey) {
        return this.softDelete(storageKey);
    }

    async verifyObject(storageKey, options) {
        const source = options || {};
        const stat = await this.stat(storageKey);
        if (!stat) {
            return {
                ok: false,
                provider: this.name(),
                storageKey,
                reason: 'missing',
            };
        }
        let sha256 = null;
        if (source.expectedSha256) {
            const opened = await this.openReadStream(storageKey);
            sha256 = await sha256ReadableStream(opened.stream);
        }
        const sizeMatches = source.expectedSizeBytes == null || Number(source.expectedSizeBytes) === Number(stat.size);
        const checksumMatches = !source.expectedSha256 || verifyChecksum(source.expectedSha256, sha256);
        return {
            ok: sizeMatches && checksumMatches,
            provider: this.name(),
            storageKey,
            sizeBytes: Number(stat.size || 0),
            etag: stat.etag || null,
            sha256,
            expectedSizeBytes: source.expectedSizeBytes == null ? null : Number(source.expectedSizeBytes),
            expectedSha256: source.expectedSha256 || null,
            reason: sizeMatches && checksumMatches ? 'verified' : checksumMatches ? 'size_mismatch' : 'checksum_mismatch',
        };
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