'use strict';

// openvibe-media — REST API for upload init/complete + media CRUD + admin.
// All routes go through media policy.assert(...) and quotas.checkUpload(...).

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const model = require('./model');
const policy = require('./policy');
const quotas = require('./quotas');
const processing = require('./processing');
const storageModel = require('./storage-model');
const { resolvePlayback } = require('./playback-resolver');
const { validatePublicPlaybackSize } = require('./size-validator');
const namespaces = require('@openvibe/contracts/media-namespaces');
const { MEDIA_EVENT_TYPES } = require('@openvibe/contracts/media-events');
const { asyncRoute } = require('@openvibe/runtime');

function buildRouter({ storage, eventBus, internalKey, authClient }) {
    const r = express.Router();
    const upload = multer({ dest: path.join(require('os').tmpdir(), 'openvibe-media-uploads'), limits: { fileSize: 10 * 1024 * 1024 * 1024 } });
    const rawPartUpload = express.raw({ type: '*/*', limit: '512mb' });

    function actorMeta(req) {
        const a = policy.actorOfReq(req);
        return { actor_type: a.type, actor_id: a.id };
    }

    function chooseStorageProvider(input) {
        return storage.chooseWriteProvider(input || {});
    }

    function inferLocationRole(providerName) {
        if (providerName === storage.hotProviderName) return 'hot';
        if (providerName === storage.assetOriginProviderName) return 'asset-origin';
        return 'canonical';
    }

    function ensureLocation(media, writeResult, options) {
        const opts = options || {};
        return storageModel.recordLocation({
            mediaId: media.id,
            providerName: writeResult.provider || media.storage_provider,
            role: opts.role || inferLocationRole(writeResult.provider || media.storage_provider),
            storageKey: writeResult.storageKey || media.storage_key,
            publicUrl: writeResult.publicUrl || media.public_url,
            signedUrlRequired: media.visibility !== 'public',
            checksumSha256: writeResult.sha256 || media.sha256 || null,
            sizeBytes: writeResult.sizeBytes || media.size_bytes || 0,
            metadata: opts.metadata || {},
        });
    }

    function applyPlaybackSizeGuard(media) {
        const decision = validatePublicPlaybackSize(media, {
            publicPlaybackMaxBytes: storage.config && storage.config.publicPlaybackMaxBytes,
            targetPublicObjectBytes: storage.config && storage.config.targetPublicObjectBytes,
            warnPublicObjectBytes: storage.config && storage.config.warnPublicObjectBytes,
        });
        if (!decision.ok) {
            storageModel.recordSizeViolation({
                mediaId: media.id,
                violationType: decision.reason,
                detail: decision,
            });
        }
        return decision;
    }

    function scheduleProcessing(updated) {
        if (!updated) return;
        function safeEnqueue(mediaId, kind, payload) {
            try {
                const result = processing.enqueue(mediaId, kind, payload);
                if (result && typeof result.then === 'function') {
                    result.catch((error) => console.warn(`[openvibe-media] failed to enqueue ${kind} for ${mediaId}:`, error && error.message || error));
                }
            } catch (error) {
                console.warn(`[openvibe-media] failed to enqueue ${kind} for ${mediaId}:`, error && error.message || error);
            }
        }
        if (updated.type === 'image' || updated.type === 'thumbnail') {
            safeEnqueue(updated.id, 'image_thumbnail', {});
        } else if (updated.type === 'video' || updated.type === 'vod' || updated.type === 'clip') {
            safeEnqueue(updated.id, 'video_thumbnail', {});
            safeEnqueue(updated.id, updated.type === 'clip' ? 'clip_metadata' : 'vod_metadata', {});
        }
    }

    async function buildPlaybackPayload(media, options) {
        const locations = storageModel.listLocations(media.id);
        if (!locations.length && media.storage_key) {
            locations.push({
                provider_name: media.storage_provider,
                role: inferLocationRole(media.storage_provider),
                storage_key: media.storage_key,
                public_url: media.public_url,
                signed_url_required: media.visibility !== 'public',
            });
        }
        return resolvePlayback(media, locations, storage, options || {});
    }

    function validateUploadInitBody(body) {
        const b = body || {};
        const ns = String(b.namespace || '');
        if (!namespaces.getMediaNamespaceDef(ns) && !namespaces.isModMediaNamespace(ns)) {
            return { ok: false, status: 400, error: `unknown namespace: ${ns}` };
        }
        if (!namespaces.isMediaType(b.type)) return { ok: false, status: 400, error: `unknown media type: ${b.type}` };
        if (!namespaces.isMediaOwnerType(b.owner_type)) return { ok: false, status: 400, error: `unknown owner_type: ${b.owner_type}` };
        if (!b.owner_id) return { ok: false, status: 400, error: 'owner_id required' };
        return { ok: true, namespace: ns };
    }

    // ── upload init ──────────────────────────────────────────
    r.post('/media/upload/init', express.json({ limit: '64kb' }), (req, res) => {
        const b = req.body || {};
        const validation = validateUploadInitBody(b);
        if (!validation.ok) return res.status(validation.status).json({ error: validation.error });
        const ns = validation.namespace;

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
        const provider = chooseStorageProvider({
            namespace: ns,
            type: b.type,
            sizeBytes: b.size_bytes,
        });
        const created = model.create({
            owner_type: b.owner_type, owner_id: String(b.owner_id),
            namespace: ns, type: b.type,
            visibility: namespaces.isMediaVisibility(b.visibility) ? b.visibility : undefined,
            storage_tier: namespaces.isMediaTier(b.storage_tier) ? b.storage_tier : undefined,
            storage_provider: provider.name(),
            mime_type: b.mime_type || null,
            size_bytes: b.size_bytes || 0,
            metadata: b.metadata || {},
            actor_type: a.actor_type, actor_id: a.actor_id,
        });
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.UPLOAD_INITIALIZED, created, { actor_type: a.actor_type, actor_id: a.actor_id });

        res.status(201).json({
            media: created,
            upload: {
                method: (b.size_bytes || 0) > (storage.config && storage.config.directUploadMaxBytes || 256 * 1024 * 1024) ? 'MULTIPART' : 'PUT',
                url: `/api/v1/media/${encodeURIComponent(created.id)}/upload`,
                // The complete endpoint is called by the client/service after a
                // successful PUT to finalize size/sha and trigger processing.
                complete_url: `/api/v1/media/${encodeURIComponent(created.id)}/upload/complete`,
                multipart_init_url: `/api/v1/media/multipart/init`,
            },
        });
    });

    // ── multipart init ───────────────────────────────────────
    r.post('/media/multipart/init', express.json({ limit: '128kb' }), asyncRoute(async (req, res) => {
        const b = req.body || {};
        const validation = validateUploadInitBody(b);
        if (!validation.ok) return res.status(validation.status).json({ error: validation.error });
        const ns = validation.namespace;

        policy.assert(policy.decideUpload({ req, namespace: ns, ownerType: b.owner_type, ownerId: b.owner_id }),
            { ...actorMeta(req), action: 'multipart-init', resource: `media:${ns}:${b.owner_type}:${b.owner_id}` });

        const quotaDecision = quotas.checkUpload({
            ownerType: b.owner_type,
            ownerId: b.owner_id,
            namespace: ns,
            type: b.type,
            mimeType: b.mime_type,
            intendedSize: b.size_bytes,
        });
        if (!quotaDecision.allow) {
            return res.status(413).json({ error: 'quota exceeded', reason: quotaDecision.reason });
        }

        const a = actorMeta(req);
        const provider = chooseStorageProvider({
            namespace: ns,
            type: b.type,
            sizeBytes: b.size_bytes,
        });
        const created = model.create({
            owner_type: b.owner_type,
            owner_id: String(b.owner_id),
            namespace: ns,
            type: b.type,
            visibility: namespaces.isMediaVisibility(b.visibility) ? b.visibility : undefined,
            storage_tier: namespaces.isMediaTier(b.storage_tier) ? b.storage_tier : undefined,
            storage_provider: provider.name(),
            mime_type: b.mime_type || null,
            size_bytes: b.size_bytes || 0,
            status: 'uploading',
            metadata: Object.assign({}, b.metadata || {}, { upload_strategy: 'multipart' }),
            actor_type: a.actor_type,
            actor_id: a.actor_id,
        });

        const uploadPlan = await storage.createMultipartUpload({
            providerName: provider.name(),
            namespace: ns,
            mediaId: created.id,
            type: b.type,
            sizeBytes: b.size_bytes,
            mimeType: b.mime_type,
            extension: b.extension,
        });

        const session = storageModel.createUploadSession({
            id: uploadPlan.uploadId,
            mediaId: created.id,
            ownerType: b.owner_type,
            ownerId: String(b.owner_id),
            namespace: ns,
            providerName: provider.name(),
            storageKey: uploadPlan.storageKey,
            uploadMode: 'multipart',
            status: 'initialized',
            mimeType: b.mime_type || null,
            expectedSizeBytes: b.size_bytes || null,
            metadata: b.metadata || {},
            expiresAt: new Date(Date.now() + ((storage.config && storage.config.signedUrlTtlSeconds) || 900) * 1000).toISOString(),
        });

        const updated = model.update(created.id, {
            storage_key: uploadPlan.storageKey,
            status: 'uploading',
        });
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.UPLOAD_INITIALIZED, updated, { actor_type: a.actor_type, actor_id: a.actor_id, upload_mode: 'multipart' });

        res.status(201).json({
            media: updated,
            upload: {
                upload_id: session.id,
                provider: session.provider_name,
                storage_key: session.storage_key,
                sign_part_url: `/api/v1/media/multipart/${encodeURIComponent(session.id)}/sign-part`,
                complete_url: `/api/v1/media/multipart/${encodeURIComponent(session.id)}/complete`,
                abort_url: `/api/v1/media/multipart/${encodeURIComponent(session.id)}/abort`,
            },
        });
    }));

    r.post('/media/multipart/:uploadId/sign-part', express.json({ limit: '32kb' }), asyncRoute(async (req, res) => {
        const session = storageModel.getUploadSession(req.params.uploadId);
        if (!session) return res.status(404).json({ error: 'upload session not found' });
        const media = model.getById(session.media_id);
        if (!media) return res.status(404).json({ error: 'media not found' });
        if (session.status === 'completed' || session.status === 'aborted') {
            return res.status(409).json({ error: `upload is already ${session.status}` });
        }

        policy.assert(policy.decideUpload({ req, namespace: media.namespace, ownerType: media.owner_type, ownerId: media.owner_id }),
            { ...actorMeta(req), action: 'multipart-sign-part', resource: `media:${media.id}` });

        const body = req.body || {};
        const partNumber = Number(body.part_number);
        if (!Number.isInteger(partNumber) || partNumber < 1) {
            return res.status(400).json({ error: 'part_number must be a positive integer' });
        }

        const signed = await storage.signUploadPart({
            providerName: session.provider_name,
            uploadId: session.id,
            storageKey: session.storage_key,
            partNumber,
            mediaId: media.id,
        });

        const localUrl = signed.url || `/api/v1/media/multipart/${encodeURIComponent(session.id)}/parts/${partNumber}?token=${encodeURIComponent(signed.token || crypto.randomUUID())}`;
        storageModel.upsertUploadPart({
            uploadId: session.id,
            partNumber,
            etag: null,
            sizeBytes: 0,
            status: 'signed',
            token: signed.token || null,
            metadata: { remote_url: !!signed.url },
        });

        res.json({
            upload_id: session.id,
            part_number: partNumber,
            provider: session.provider_name,
            method: 'PUT',
            url: localUrl,
            headers: body.headers || {},
            expires_in_seconds: signed.expires_in_seconds || ((storage.config && storage.config.signedUrlTtlSeconds) || 900),
        });
    }));

    r.put('/media/multipart/:uploadId/parts/:partNumber', rawPartUpload, asyncRoute(async (req, res) => {
        const session = storageModel.getUploadSession(req.params.uploadId);
        if (!session) return res.status(404).json({ error: 'upload session not found' });
        if (session.provider_name !== 'local') return res.status(405).json({ error: 'direct part upload is only available for local provider' });

        const partNumber = Number(req.params.partNumber);
        const part = storageModel.getUploadPart(session.id, partNumber);
        if (!part) return res.status(404).json({ error: 'upload part not signed' });
        if (part.token && String(req.query.token || '') !== String(part.token)) {
            return res.status(403).json({ error: 'invalid upload token' });
        }
        if (!req.body || !req.body.length) return res.status(400).json({ error: 'request body required' });

        const result = await storage.writeMultipartPart({
            providerName: session.provider_name,
            uploadId: session.id,
            partNumber,
            buffer: req.body,
        });
        storageModel.upsertUploadPart({
            uploadId: session.id,
            partNumber,
            etag: result.etag,
            sizeBytes: result.sizeBytes,
            status: 'uploaded',
            token: part.token,
        });
        res.setHeader('ETag', result.etag);
        res.status(204).end();
    }));

    r.post('/media/multipart/:uploadId/complete', express.json({ limit: '128kb' }), asyncRoute(async (req, res) => {
        const session = storageModel.getUploadSession(req.params.uploadId);
        if (!session) return res.status(404).json({ error: 'upload session not found' });
        const media = model.getById(session.media_id);
        if (!media) return res.status(404).json({ error: 'media not found' });

        policy.assert(policy.decideUpload({ req, namespace: media.namespace, ownerType: media.owner_type, ownerId: media.owner_id }),
            { ...actorMeta(req), action: 'multipart-complete', resource: `media:${media.id}` });

        const uploadedParts = storageModel.listUploadParts(session.id)
            .filter((part) => part.status === 'uploaded' || part.etag);
        const providedParts = Array.isArray(req.body && req.body.parts) ? req.body.parts : [];
        const parts = uploadedParts.length ? uploadedParts : providedParts;
        if (!parts.length) return res.status(400).json({ error: 'no uploaded parts found' });

        const completed = await storage.completeMultipartUpload({
            providerName: session.provider_name,
            uploadId: session.id,
            storageKey: session.storage_key,
            mediaId: media.id,
            parts,
        });

        const updated = model.update(media.id, {
            status: 'processing',
            storage_provider: session.provider_name,
            storage_key: completed.storageKey || session.storage_key,
            public_url: completed.publicUrl || storage.publicUrlFor(media.id, { providerName: session.provider_name, storageKey: completed.storageKey || session.storage_key }),
            mime_type: session.mime_type || media.mime_type,
            size_bytes: completed.sizeBytes || media.size_bytes,
            sha256: completed.sha256 || media.sha256,
            metadata: Object.assign({}, media.metadata || {}, {
                upload_strategy: 'multipart',
                upload_id: session.id,
                etag: completed.etag || null,
            }, req.body && req.body.metadata || {}),
        });

        ensureLocation(updated, completed, {
            role: inferLocationRole(session.provider_name),
            metadata: { upload_id: session.id },
        });
        storageModel.updateUploadSession(session.id, {
            status: 'completed',
            metadata: Object.assign({}, session.metadata || {}, {
                completed_at: new Date().toISOString(),
                parts_count: parts.length,
            }),
        });

        const sizeDecision = applyPlaybackSizeGuard(updated);
        quotas.recomputeUsage(updated.owner_type, updated.owner_id, updated.namespace);
        scheduleProcessing(updated);
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.UPLOADED, updated);

        res.json({
            media: updated,
            playback: sizeDecision.ok ? await buildPlaybackPayload(updated, { preferHot: true }) : null,
            size_guard: sizeDecision,
        });
    }));

    r.post('/media/multipart/:uploadId/abort', express.json({ limit: '8kb' }), asyncRoute(async (req, res) => {
        const session = storageModel.getUploadSession(req.params.uploadId);
        if (!session) return res.status(404).json({ error: 'upload session not found' });
        const media = model.getById(session.media_id);
        if (!media) return res.status(404).json({ error: 'media not found' });

        policy.assert(policy.decideUpload({ req, namespace: media.namespace, ownerType: media.owner_type, ownerId: media.owner_id }),
            { ...actorMeta(req), action: 'multipart-abort', resource: `media:${media.id}` });

        await storage.abortMultipartUpload({
            providerName: session.provider_name,
            uploadId: session.id,
            storageKey: session.storage_key,
        });
        storageModel.updateUploadSession(session.id, { status: 'aborted' });
        res.json({ ok: true, upload_id: session.id });
    }));

    // ── upload bytes (local-dev path; S3 mode would use signed PUT) ──
    r.put('/media/:id/upload', upload.single('file'), asyncRoute(async (req, res) => {
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
        const wrote = await storage.moveTempFile(media.namespace, media.id, req.file.path, {
            extension,
            mimeType: req.file.mimetype || media.mime_type,
            providerName: media.storage_provider,
            type: media.type,
            sizeBytes: req.file.size,
        });
        const publicUrl = wrote.publicUrl || storage.publicUrlFor(media.id, { providerName: wrote.provider, storageKey: wrote.storageKey });
        const updated = model.update(media.id, {
            status: 'uploaded',
            storage_key: wrote.storageKey,
            storage_provider: wrote.provider || media.storage_provider,
            public_url: publicUrl,
            mime_type: req.file.mimetype || media.mime_type,
            size_bytes: wrote.sizeBytes,
            sha256: wrote.sha256,
        });
        ensureLocation(updated, wrote, { role: inferLocationRole(updated.storage_provider) });
        res.json({ media: updated });
    }));

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

        if (updated.storage_key) {
            ensureLocation(updated, {
                provider: updated.storage_provider,
                storageKey: updated.storage_key,
                publicUrl: updated.public_url,
                sha256: updated.sha256,
                sizeBytes: updated.size_bytes,
            });
        }

        // Schedule appropriate processing jobs.
        scheduleProcessing(updated);

        quotas.recomputeUsage(updated.owner_type, updated.owner_id, updated.namespace);
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.UPLOADED, updated);
        res.json({ media: updated });
    });

    // ── playback resolution ─────────────────────────────────
    r.get('/media/:id/playback', asyncRoute(async (req, res) => {
        const media = model.getById(req.params.id);
        if (!media) return res.status(404).json({ error: 'media not found' });
        try {
            policy.assert(policy.decideRead({ req, media }),
                { ...actorMeta(req), action: 'playback', resource: `media:${media.id}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }

        const sizeDecision = applyPlaybackSizeGuard(media);
        if (!sizeDecision.ok) {
            return res.status(413).json({ error: 'public playback disabled for oversized object', detail: sizeDecision });
        }

        const playback = await buildPlaybackPayload(media, {
            preferHot: req.query.prefer_hot !== 'false',
            fileName: req.query.filename,
            expiresInSeconds: req.query.expires_in_seconds,
        });
        if (!playback.ok) return res.status(404).json({ error: 'playback location not found' });
        if (String(req.query.redirect || '').toLowerCase() === 'true') {
            return res.redirect(302, playback.url);
        }
        res.json({ media, playback });
    }));

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

    r.post('/internal/processing/run', express.json({ limit: '64kb' }), asyncRoute(async (req, res) => {
        if (!req.serviceActor) {
            return res.status(403).json({ error: 'internal service actor required' });
        }
        const body = req.body || {};
        if (!body.media_id || !processing.JOB_KINDS.includes(body.kind)) {
            return res.status(400).json({ error: 'media_id and valid kind required' });
        }
        const result = await processing.runTrackedJob({
            local_job_id: body.local_job_id,
            media_id: body.media_id,
            kind: body.kind,
            payload: body.payload || {},
        }, {
            storage,
            publishMediaEvent: eventBus.publishMediaEvent,
        });
        res.json({ ok: true, result, media: model.getById(body.media_id) });
    }));

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
    r.get('/:id', asyncRoute(async (req, res) => {
        const media = model.getById(req.params.id);
        if (!media || !media.storage_key) return res.status(404).end();
        const decision = policy.decideRead({ req, media });
        if (!decision.allow) return res.status(403).end();
        const locations = storageModel.listLocations(media.id);
        if (!locations.length && media.storage_key) {
            locations.push({
                provider_name: media.storage_provider,
                role: inferLocationRole(media.storage_provider),
                storage_key: media.storage_key,
                public_url: media.public_url,
                signed_url_required: media.visibility !== 'public',
            });
        }
        const playback = await resolvePlayback(media, locations, storage, {});
        if (!playback.ok) return res.status(404).end();

        for (const [header, value] of Object.entries(playback.headers || {})) {
            if (value) res.setHeader(header, value);
        }

        if (playback.provider_name !== 'local') {
            return res.redirect(302, playback.url);
        }

        const stat = await storage.stat(playback.storage_key, { providerName: playback.provider_name });
        if (!stat) return res.status(404).end();
        res.setHeader('Content-Type', media.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);
        storage.readStream(playback.storage_key, { providerName: playback.provider_name }).pipe(res);
    }));
    return r;
}

function cleanup(file) {
    if (!file || !file.path) return;
    try { fs.unlinkSync(file.path); } catch { /* ignore */ }
}

module.exports = { buildRouter, buildFilesRouter };
