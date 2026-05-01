'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { sha256Buffer, sha256FileAsync, verifyChecksum } = require('../checksum');
const { buildObjectKey } = require('../object-keys');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function partFileName(partNumber) {
    return `part-${String(Number(partNumber) || 0).padStart(5, '0')}`;
}

class LocalStorageProvider {
    constructor(options) {
        const opts = options || {};
        this.providerName = String(opts.providerName || 'local');
        this.root = path.resolve(String(opts.root || path.resolve(process.cwd(), 'data/storage/hot')));
        this.publicBaseUrl = String(opts.publicBaseUrl || '').replace(/\/$/, '');
        this.multipartRoot = path.resolve(String(opts.multipartRoot || path.join(this.root, '_multipart')));
        ensureDir(this.root);
        ensureDir(this.multipartRoot);
    }

    name() {
        return this.providerName;
    }

    capabilities() {
        return {
            direct_streaming: true,
            multipart: true,
            signed_download: false,
            signed_upload: false,
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

    pathFor(storageKey) {
        return path.join(this.root, String(storageKey || '').replace(/\\+/g, '/'));
    }

    publicUrlFor(mediaId, options) {
        const opts = options || {};
        if (!this.publicBaseUrl) return `/files/${encodeURIComponent(String(mediaId || opts.mediaId || 'unknown'))}`;
        return `${this.publicBaseUrl}/files/${encodeURIComponent(String(mediaId || opts.mediaId || 'unknown'))}`;
    }

    describePlan() {
        return {
            provider: this.name(),
            mode: 'local',
            root: this.root,
            multipart_root: this.multipartRoot,
            public_base_url: this.publicBaseUrl || null,
            capabilities: this.capabilities(),
        };
    }

    async healthCheck() {
        ensureDir(this.root);
        ensureDir(this.multipartRoot);
        return {
            ok: true,
            configured: true,
            provider: this.name(),
            checked_at: new Date().toISOString(),
            root: this.root,
        };
    }

    async writeBuffer(namespace, mediaId, buffer, options) {
        const opts = options || {};
        const storageKey = opts.storageKey || this.keyFor(namespace, mediaId, opts.extension, opts);
        const fullPath = this.pathFor(storageKey);
        ensureDir(path.dirname(fullPath));
        fs.writeFileSync(fullPath, buffer);
        return {
            provider: this.name(),
            storageKey,
            sizeBytes: Buffer.byteLength(buffer || Buffer.alloc(0)),
            sha256: sha256Buffer(buffer),
            publicUrl: this.publicUrlFor(mediaId, { storageKey }),
        };
    }

    async writeFile(namespace, mediaId, filePath, options) {
        const opts = options || {};
        const storageKey = opts.storageKey || this.keyFor(namespace, mediaId, opts.extension, opts);
        const fullPath = this.pathFor(storageKey);
        ensureDir(path.dirname(fullPath));
        fs.copyFileSync(filePath, fullPath);
        const stat = fs.statSync(fullPath);
        const sha256 = await sha256FileAsync(fullPath);
        return {
            provider: this.name(),
            storageKey,
            sizeBytes: stat.size,
            sha256,
            etag: `local-${sha256.slice(0, 16)}`,
            publicUrl: this.publicUrlFor(mediaId, { mediaId, storageKey }),
        };
    }

    async moveTempFile(namespace, mediaId, srcPath, options) {
        const result = await this.writeFile(namespace, mediaId, srcPath, options);
        try { fs.unlinkSync(srcPath); } catch { /* ignore */ }
        return result;
    }

    async openReadStream(storageKey) {
        const fullPath = this.pathFor(storageKey);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Storage key not found: ${storageKey}`);
        }
        const stat = fs.statSync(fullPath);
        return {
            provider: this.name(),
            storageKey,
            sizeBytes: stat.size,
            stream: fs.createReadStream(fullPath),
        };
    }

    readStream(storageKey) {
        return fs.createReadStream(this.pathFor(storageKey));
    }

    async stat(storageKey) {
        try {
            const stat = fs.statSync(this.pathFor(storageKey));
            return { size: stat.size, mtime: stat.mtime.toISOString() };
        } catch {
            return null;
        }
    }

    async softDelete(storageKey) {
        try {
            const fullPath = this.pathFor(storageKey);
            if (!fs.existsSync(fullPath)) return false;
            fs.renameSync(fullPath, `${fullPath}.deleted-${Date.now()}`);
            return true;
        } catch {
            return false;
        }
    }

    async deleteObject(storageKey) {
        try {
            const fullPath = this.pathFor(storageKey);
            if (!fs.existsSync(fullPath)) return false;
            fs.rmSync(fullPath, { force: true });
            return true;
        } catch {
            return false;
        }
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
        const sha256 = source.expectedSha256 ? await sha256FileAsync(this.pathFor(storageKey)) : null;
        const sizeMatches = source.expectedSizeBytes == null || Number(source.expectedSizeBytes) === Number(stat.size);
        const checksumMatches = !source.expectedSha256 || verifyChecksum(source.expectedSha256, sha256);
        return {
            ok: sizeMatches && checksumMatches,
            provider: this.name(),
            storageKey,
            sizeBytes: Number(stat.size || 0),
            sha256,
            expectedSizeBytes: source.expectedSizeBytes == null ? null : Number(source.expectedSizeBytes),
            expectedSha256: source.expectedSha256 || null,
            reason: sizeMatches && checksumMatches ? 'verified' : checksumMatches ? 'size_mismatch' : 'checksum_mismatch',
        };
    }

    async createMultipartUpload(input) {
        const source = input || {};
        const uploadId = source.uploadId || `upl_${crypto.randomUUID()}`;
        const storageKey = source.storageKey || this.keyFor(source.namespace, source.mediaId, source.extension, source);
        const dir = path.join(this.multipartRoot, uploadId);
        ensureDir(dir);
        return {
            uploadId,
            storageKey,
            provider: this.name(),
            local_dir: dir,
        };
    }

    async signUploadPart(input) {
        const source = input || {};
        return {
            uploadId: String(source.uploadId),
            partNumber: Number(source.partNumber),
            token: crypto.randomBytes(24).toString('hex'),
            expires_in_seconds: Number(source.expiresInSeconds || 900),
        };
    }

    async writeMultipartPart(input) {
        const source = input || {};
        const dir = path.join(this.multipartRoot, String(source.uploadId));
        ensureDir(dir);
        const targetPath = path.join(dir, partFileName(source.partNumber));
        const buffer = source.buffer != null ? source.buffer : fs.readFileSync(source.sourcePath);
        fs.writeFileSync(targetPath, buffer);
        return {
            provider: this.name(),
            uploadId: String(source.uploadId),
            partNumber: Number(source.partNumber),
            etag: `local-${Number(source.partNumber)}-${Buffer.byteLength(buffer)}`,
            sizeBytes: Buffer.byteLength(buffer),
        };
    }

    async completeMultipartUpload(input) {
        const source = input || {};
        const dir = path.join(this.multipartRoot, String(source.uploadId));
        const parts = Array.isArray(source.parts) ? source.parts.slice().sort((left, right) => Number(left.partNumber) - Number(right.partNumber)) : [];
        const buffers = parts.map((part) => fs.readFileSync(path.join(dir, partFileName(part.partNumber))));
        const combined = Buffer.concat(buffers);
        const storageKey = String(source.storageKey);
        const fullPath = this.pathFor(storageKey);
        ensureDir(path.dirname(fullPath));
        fs.writeFileSync(fullPath, combined);
        fs.rmSync(dir, { recursive: true, force: true });
        const sha256 = sha256Buffer(combined);
        return {
            provider: this.name(),
            storageKey,
            sizeBytes: combined.length,
            sha256,
            etag: `local-${sha256.slice(0, 16)}`,
            publicUrl: this.publicUrlFor(source.mediaId, { storageKey }),
        };
    }

    async abortMultipartUpload(input) {
        const dir = path.join(this.multipartRoot, String(input && input.uploadId || ''));
        fs.rmSync(dir, { recursive: true, force: true });
        return { aborted: true, uploadId: input && input.uploadId || null, provider: this.name() };
    }

    async signDownload(input) {
        const source = input || {};
        return {
            provider: this.name(),
            url: this.publicUrlFor(source.mediaId, { storageKey: source.storageKey }),
            expires_at: null,
        };
    }
}

module.exports = {
    LocalStorageProvider,
};