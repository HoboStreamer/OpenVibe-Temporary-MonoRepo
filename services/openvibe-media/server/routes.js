'use strict';

// openvibe-media — REST API for upload init/complete + media CRUD + admin.
// All routes go through media policy.assert(...) and quotas.checkUpload(...).

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const model = require('./model');
const policy = require('./policy');
const quotas = require('./quotas');
const processing = require('./processing');
const namespaces = require('@openvibe/contracts/media-namespaces');
const { MEDIA_EVENT_TYPES } = require('@openvibe/contracts/media-events');

function buildRouter({ storage, eventBus, internalKey, authClient }) {
    const r = express.Router();
    const upload = multer({ dest: path.join(require('os').tmpdir(), 'openvibe-media-uploads'), limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

    function actorMeta(req) {
        const a = policy.actorOfReq(req);
        return { actor_type: a.type, actor_id: a.id };
    }

    // ── upload init ──────────────────────────────────────────
    r.post('/media/upload/init', express.json({ limit: '64kb' }), (req, res) => {
        const b = req.body || {};
        const ns = String(b.namespace || '');
        if (!namespaces.getMediaNamespaceDef(ns) && !namespaces.isModMediaNamespace(ns)) {
            return res.status(400).json({ error: `unknown namespace: ${ns}` });
        }
        if (!namespaces.isMediaType(b.type))           return res.status(400).json({ error: `unknown media type: ${b.type}` });
        if (!namespaces.isMediaOwnerType(b.owner_type)) return res.status(400).json({ error: `unknown owner_type: ${b.owner_type}` });
        if (!b.owner_id)                                return res.status(400).json({ error: 'owner_id required' });

        try {
            policy.assert(policy.decideUpload({ req, namespace: ns, ownerType: b.owner_type, ownerId: b.owner_id }),
                { ...actorMeta(req), action: 'upload', resource: `media:${ns}:${b.owner_type}:${b.owner_id}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }

        const quotaDecision = quotas.checkUpload({
            ownerType: b.owner_type, ownerId: b.owner_id, namespace: ns,
            type: b.type, mimeType: b.mime_type, intendedSize: b.size_bytes,
        });
        if (!quotaDecision.allow) {
            return res.status(413).json({ error: 'quota exceeded', reason: quotaDecision.reason });
        }

        const a = actorMeta(req);
        const created = model.create({
            owner_type: b.owner_type, owner_id: String(b.owner_id),
            namespace: ns, type: b.type,
            visibility: namespaces.isMediaVisibility(b.visibility) ? b.visibility : undefined,
            storage_tier: namespaces.isMediaTier(b.storage_tier) ? b.storage_tier : undefined,
            storage_provider: storage.name(),
            mime_type: b.mime_type || null,
            size_bytes: b.size_bytes || 0,
            metadata: b.metadata || {},
            actor_type: a.actor_type, actor_id: a.actor_id,
        });
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.UPLOAD_INITIALIZED, created, { actor_type: a.actor_type, actor_id: a.actor_id });

        res.status(201).json({
            media: created,
            upload: {
                method: 'PUT',
                url: `/api/v1/media/${encodeURIComponent(created.id)}/upload`,
                // The complete endpoint is called by the client/service after a
                // successful PUT to finalize size/sha and trigger processing.
                complete_url: `/api/v1/media/${encodeURIComponent(created.id)}/upload/complete`,
            },
        });
    });

    // ── upload bytes (local-dev path; S3 mode would use signed PUT) ──
    r.put('/media/:id/upload', upload.single('file'), (req, res) => {
        const media = model.getById(req.params.id);
        if (!media) return res.status(404).json({ error: 'media not found' });
        if (media.status !== 'initialized' && media.status !== 'uploading') {
            return res.status(409).json({ error: `media is in status '${media.status}', not initialized` });
        }
        try {
            policy.assert(policy.decideUpload({ req, namespace: media.namespace, ownerType: media.owner_type, ownerId: media.owner_id }),
                { ...actorMeta(req), action: 'upload-bytes', resource: `media:${media.id}` });
        } catch (err) {
            cleanup(req.file);
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }

        if (!req.file) return res.status(400).json({ error: 'no file uploaded (multipart field "file" required)' });

        let extension = null;
        if (req.file.originalname) {
            const m = /\.([a-z0-9]{1,8})$/i.exec(req.file.originalname);
            if (m) extension = m[1].toLowerCase();
        }
        const wrote = storage.moveTempFile(media.namespace, media.id, req.file.path, { extension });
        const publicUrl = storage.publicUrlFor(media.id);
        const updated = model.update(media.id, {
            status: 'uploaded',
            storage_key: wrote.storageKey,
            public_url: publicUrl,
            mime_type: req.file.mimetype || media.mime_type,
            size_bytes: wrote.sizeBytes,
            sha256: wrote.sha256,
        });
        res.json({ media: updated });
    });

    // ── upload complete ──────────────────────────────────────
    r.post('/media/:id/upload/complete', express.json({ limit: '64kb' }), (req, res) => {
        const media = model.getById(req.params.id);
        if (!media) return res.status(404).json({ error: 'media not found' });
        try {
            policy.assert(policy.decideUpload({ req, namespace: media.namespace, ownerType: media.owner_type, ownerId: media.owner_id }),
                { ...actorMeta(req), action: 'upload-complete', resource: `media:${media.id}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const b = req.body || {};
        const patch = { status: 'processing' };
        if (b.size_bytes != null) patch.size_bytes = b.size_bytes;
        if (b.mime_type)          patch.mime_type = b.mime_type;
        if (b.sha256)             patch.sha256 = b.sha256;
        if (b.metadata)           patch.metadata = b.metadata;
        const updated = model.update(media.id, patch);

        // Schedule appropriate processing jobs.
        if (updated.type === 'image' || updated.type === 'thumbnail') {
            processing.enqueue(updated.id, 'image_thumbnail', {});
        } else if (updated.type === 'video' || updated.type === 'vod' || updated.type === 'clip') {
            processing.enqueue(updated.id, 'video_thumbnail', {});
            processing.enqueue(updated.id, updated.type === 'clip' ? 'clip_metadata' : 'vod_metadata', {});
        }

        quotas.recomputeUsage(updated.owner_type, updated.owner_id, updated.namespace);
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.UPLOADED, updated);
        res.json({ media: updated });
    });

    // ── read ─────────────────────────────────────────────────
    r.get('/media/:id', (req, res) => {
        const media = model.getById(req.params.id);
        if (!media) return res.status(404).json({ error: 'media not found' });
        try {
            policy.assert(policy.decideRead({ req, media }),
                { ...actorMeta(req), action: 'read', resource: `media:${media.id}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        res.json({ media });
    });

    r.get('/media', (req, res) => {
        const items = model.list({
            namespace: req.query.namespace,
            ownerType: req.query.owner_type,
            ownerId:   req.query.owner_id,
            type:      req.query.type,
            status:    req.query.status,
            visibility: req.query.visibility,
            limit:     req.query.limit,
            sinceId:   req.query.since_id,
        });
        const visible = items.filter(m => policy.decideRead({ req, media: m }).allow);
        res.json({ items: visible });
    });

    // ── delete (soft) ────────────────────────────────────────
    r.delete('/media/:id', (req, res) => {
        const media = model.getById(req.params.id);
        if (!media) return res.status(404).json({ error: 'media not found' });
        try {
            policy.assert(policy.decideDelete({ req, media }),
                { ...actorMeta(req), action: 'delete', resource: `media:${media.id}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const updated = model.softDelete(media.id, policy.actorOfReq(req));
        quotas.recomputeUsage(updated.owner_type, updated.owner_id, updated.namespace);
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.DELETED, updated);
        res.json({ media: updated });
    });

    // ── archive / restore ────────────────────────────────────
    r.post('/media/:id/archive', express.json(), (req, res) => {
        const media = model.getById(req.params.id);
        if (!media) return res.status(404).json({ error: 'media not found' });
        try {
            policy.assert(policy.decideAdmin({ req }), { ...actorMeta(req), action: 'archive' });
        } catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const updated = model.archive(media.id, policy.actorOfReq(req));
        quotas.recomputeUsage(updated.owner_type, updated.owner_id, updated.namespace);
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.ARCHIVED, updated);
        res.json({ media: updated });
    });

    r.post('/media/:id/restore', express.json(), (req, res) => {
        const media = model.getById(req.params.id);
        if (!media) return res.status(404).json({ error: 'media not found' });
        try {
            policy.assert(policy.decideAdmin({ req }), { ...actorMeta(req), action: 'restore' });
        } catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const updated = model.restore(media.id, policy.actorOfReq(req));
        quotas.recomputeUsage(updated.owner_type, updated.owner_id, updated.namespace);
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.RESTORED, updated);
        res.json({ media: updated });
    });

    // ── quota inspection ─────────────────────────────────────
    r.get('/quota', (req, res) => {
        const ns = req.query.namespace;
        const ownerType = req.query.owner_type;
        const ownerId   = req.query.owner_id;
        if (!ns || !ownerType || !ownerId) return res.status(400).json({ error: 'namespace, owner_type, owner_id required' });
        res.json({
            quota: quotas.getQuota(ownerType, ownerId, ns),
            usage: quotas.getUsage(ownerType, ownerId, ns),
        });
    });

    r.put('/quota', express.json(), (req, res) => {
        try {
            policy.assert(policy.decideAdmin({ req }), { ...actorMeta(req), action: 'set-quota' });
        } catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const updated = quotas.setQuota(req.body || {});
        res.json({ quota: updated });
    });

    // ── admin/diagnostics ────────────────────────────────────
    r.get('/admin/jobs', (req, res) => {
        try {
            policy.assert(policy.decideAdmin({ req }), { ...actorMeta(req), action: 'admin-jobs' });
        } catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        res.json({ items: processing.listJobs({ state: req.query.state, limit: req.query.limit }) });
    });

    r.get('/admin/usage', (req, res) => {
        try {
            policy.assert(policy.decideAdmin({ req }), { ...actorMeta(req), action: 'admin-usage' });
        } catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const rows = require('./db').get().prepare(`SELECT * FROM media_usage ORDER BY total_bytes DESC LIMIT 200`).all();
        res.json({ items: rows });
    });

    // ── legacy id lookup (HoboStreamer migration helper) ─────
    r.get('/legacy/:source/:kind/:legacyId', (req, res) => {
        const row = model.lookupLegacy(req.params.source, req.params.kind, req.params.legacyId);
        if (!row) return res.status(404).json({ error: 'not mapped' });
        res.json({ media_id: row.media_id });
    });

    return r;
}

function buildFilesRouter({ storage }) {
    const r = express.Router();
    r.get('/:id', (req, res) => {
        const media = model.getById(req.params.id);
        if (!media || !media.storage_key) return res.status(404).end();
        const decision = policy.decideRead({ req, media });
        if (!decision.allow) return res.status(403).end();
        const stat = storage.stat(media.storage_key);
        if (!stat) return res.status(404).end();
        res.setHeader('Content-Type', media.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', media.visibility === 'public' ? 'public, max-age=300' : 'private, no-cache');
        storage.readStream(media.storage_key).pipe(res);
    });
    return r;
}

function cleanup(file) {
    if (!file || !file.path) return;
    try { fs.unlinkSync(file.path); } catch { /* ignore */ }
}

module.exports = { buildRouter, buildFilesRouter };
