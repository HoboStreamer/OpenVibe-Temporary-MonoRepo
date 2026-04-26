'use strict';

// openvibe-media — local filesystem storage provider.
//
// Default for development. Files land under STORAGE_ROOT/<namespace>/<media_id>.<ext>.
// Public URLs are served back through openvibe-media's /files/:mediaId endpoint
// so that visibility/permission checks happen on every read.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class LocalStorageProvider {
    constructor(opts) {
        this.root = opts.root;
        this.publicBaseUrl = (opts.publicBaseUrl || '').replace(/\/$/, '');
        if (!fs.existsSync(this.root)) fs.mkdirSync(this.root, { recursive: true });
    }

    name() { return 'local'; }

    keyFor(namespace, mediaId, extHint) {
        const safeNs = String(namespace || 'unknown').replace(/[^a-z0-9._-]+/gi, '_');
        const ext = extHint ? `.${String(extHint).replace(/[^a-z0-9]+/gi, '').slice(0, 8)}` : '';
        return path.posix.join(safeNs, `${mediaId}${ext}`);
    }

    pathFor(storageKey) {
        return path.join(this.root, storageKey.replace(/\\+/g, '/'));
    }

    publicUrlFor(mediaId) {
        if (!this.publicBaseUrl) return null;
        return `${this.publicBaseUrl}/files/${encodeURIComponent(mediaId)}`;
    }

    /**
     * Persist a buffer to the storage root and return { storageKey, sizeBytes, sha256 }.
     */
    writeBuffer(namespace, mediaId, buffer, opts) {
        const storageKey = this.keyFor(namespace, mediaId, opts && opts.extension);
        const fullPath = this.pathFor(storageKey);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, buffer);
        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        return { storageKey, sizeBytes: buffer.length, sha256 };
    }

    moveTempFile(namespace, mediaId, srcPath, opts) {
        const storageKey = this.keyFor(namespace, mediaId, opts && opts.extension);
        const fullPath = this.pathFor(storageKey);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        const buf = fs.readFileSync(srcPath);
        fs.writeFileSync(fullPath, buf);
        try { fs.unlinkSync(srcPath); } catch { /* ignore */ }
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        return { storageKey, sizeBytes: buf.length, sha256 };
    }

    readStream(storageKey) {
        return fs.createReadStream(this.pathFor(storageKey));
    }

    stat(storageKey) {
        try { return fs.statSync(this.pathFor(storageKey)); }
        catch { return null; }
    }

    /**
     * Soft-delete: rename to .deleted-<ts>. Real removal is reserved for the
     * lifecycle/cleanup job and is gated by media policy.
     */
    softDelete(storageKey) {
        try {
            const p = this.pathFor(storageKey);
            if (!fs.existsSync(p)) return false;
            fs.renameSync(p, `${p}.deleted-${Date.now()}`);
            return true;
        } catch { return false; }
    }
}

class S3SeamProvider {
    // Configuration-only seam: records storage_provider='s3' so URLs can be
    // resolved through a CDN later, but actual byte transfer still goes to
    // the local filesystem until an SDK is wired in. Concrete S3 calls are
    // intentionally not made here.
    constructor(opts) {
        this.local = new LocalStorageProvider({ root: opts.root, publicBaseUrl: opts.publicBaseUrl });
        this.bucket = opts.s3 && opts.s3.bucket;
        this.region = opts.s3 && opts.s3.region;
        this.cdnBase = opts.s3 && opts.s3.publicBaseUrl ? opts.s3.publicBaseUrl.replace(/\/$/, '') : null;
        if (!this.bucket) console.warn('[Storage] s3 provider configured without bucket — falling back to local URLs');
    }

    name() { return 's3'; }
    keyFor(ns, id, hint)   { return this.local.keyFor(ns, id, hint); }
    pathFor(k)              { return this.local.pathFor(k); }
    publicUrlFor(mediaId)   { return this.cdnBase ? `${this.cdnBase}/${encodeURIComponent(mediaId)}` : this.local.publicUrlFor(mediaId); }
    writeBuffer(...a)       { return this.local.writeBuffer(...a); }
    moveTempFile(...a)      { return this.local.moveTempFile(...a); }
    readStream(k)           { return this.local.readStream(k); }
    stat(k)                 { return this.local.stat(k); }
    softDelete(k)           { return this.local.softDelete(k); }
}

function buildStorage(cfg) {
    const provider = (cfg.provider || 'local').toLowerCase();
    if (provider === 's3') return new S3SeamProvider(cfg);
    return new LocalStorageProvider({ root: cfg.root, publicBaseUrl: cfg.publicBaseUrl });
}

module.exports = { LocalStorageProvider, S3SeamProvider, buildStorage };
