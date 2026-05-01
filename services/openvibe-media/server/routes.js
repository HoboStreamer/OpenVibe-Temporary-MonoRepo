'use strict';

// openvibe-media — REST API for upload init/complete + media CRUD + admin.
// All routes go through media policy.assert(...) and quotas.checkUpload(...).

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const db = require('./db');
const accessRollupModel = require('./access-rollup-model');
const clipModel = require('./clip-model');
const lifecyclePolicy = require('./lifecycle-policy');
const model = require('./model');
const policy = require('./policy');
const promotionModel = require('./promotion-model');
const promotionWorker = require('./promotion-worker');
const quotas = require('./quotas');
const processing = require('./processing');
const storageModel = require('./storage-model');
const vodModel = require('./vod-model');
const { materializeClipProject: sharedMaterializeClipProject } = require('./clip-materializer');
const { reconcileLifecycle: sharedReconcileLifecycle } = require('./lifecycle-reconciler');
const { createPlaybackPayloadBuilder, inferLocationRoleForStorage } = require('./playback');
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

    function serviceActorMeta(req) {
        const serviceId = typeof req.serviceActor === 'string'
            ? req.serviceActor
            : req.serviceActor && req.serviceActor.id || null;
        return {
            actor_type: 'service',
            actor_id: serviceId || 'openvibe-workers',
        };
    }

    function chooseStorageTarget(input) {
        if (typeof storage.chooseWriteTarget === 'function') {
            return storage.chooseWriteTarget(input || {});
        }
        const provider = storage.chooseWriteProvider(input || {});
        return {
            provider,
            providerName: provider.name(),
            role: inferLocationRoleForStorage(storage, provider.name()),
            reason: 'legacy-provider-selection',
            providerPolicy: storage.providerPolicy || null,
        };
    }

    function ensureLocation(media, writeResult, options) {
        const opts = options || {};
        return storageModel.recordLocation({
            mediaId: media.id,
            providerName: writeResult.provider || media.storage_provider,
            role: opts.role
                || media.metadata && media.metadata.storage_target && media.metadata.storage_target.role
                || inferLocationRoleForStorage(storage, writeResult.provider || media.storage_provider),
            storageKey: writeResult.storageKey || media.storage_key,
            publicUrl: writeResult.publicUrl || media.public_url,
            signedUrlRequired: media.visibility !== 'public',
            checksumSha256: writeResult.sha256 || media.sha256 || null,
            sizeBytes: writeResult.sizeBytes || media.size_bytes || 0,
            metadata: opts.metadata || {},
        });
    }

    function applyPlaybackSizeGuard(media) {
        const recording = vodModel.getRecordingByMediaId(media.id);
        const context = {
            locations: storageModel.listLocations(media.id, { status: 'active' }),
            segments: recording ? vodModel.listSegmentsByRecordingId(recording.id) : [],
            parts: recording ? vodModel.listPartsByRecordingId(recording.id) : [],
            partialSegments: recording ? vodModel.listPartialSegmentsByRecordingId(recording.id) : [],
            clipExports: clipModel.listClipExportsByMediaId ? clipModel.listClipExportsByMediaId(media.id) : [],
        };
        const decision = validatePublicPlaybackSize(media, {
            publicPlaybackMaxBytes: storage.config && storage.config.publicPlaybackMaxBytes,
            targetPublicObjectBytes: storage.config && storage.config.targetPublicObjectBytes,
            warnPublicObjectBytes: storage.config && storage.config.warnPublicObjectBytes,
            locations: context.locations,
            segments: context.segments,
            parts: context.parts,
            partialSegments: context.partialSegments,
            clipExports: context.clipExports,
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

    const buildPlaybackPayload = createPlaybackPayloadBuilder({ storage, storageModel, resolvePlayback });

    function safeJson(value, fallbackValue) {
        try {
            return JSON.parse(value || 'null') || fallbackValue;
        } catch {
            return fallbackValue;
        }
    }

    function computeDurationMs(media) {
        const metadataDuration = Number(media && media.metadata && media.metadata.duration_seconds);
        if (Number.isFinite(metadataDuration) && metadataDuration > 0) {
            return Math.round(metadataDuration * 1000);
        }
        const sizeBased = Number(media && media.size_bytes || 0);
        return Math.max(30000, Math.min(30 * 60 * 1000, sizeBased || 120000));
    }

    function listTranscriptSegments(mediaId) {
        return db.get().prepare(`
            SELECT * FROM transcript_segments WHERE media_id = ? ORDER BY start_ms ASC
        `).all(String(mediaId)).map((row) => ({
            id: row.id,
            media_id: row.media_id,
            start_ms: row.start_ms,
            end_ms: row.end_ms,
            text: row.text,
            confidence: row.confidence,
            speaker_label: row.speaker_label,
            created_at: row.created_at,
        }));
    }

    function listSceneMarkers(mediaId) {
        return db.get().prepare(`
            SELECT * FROM scene_markers WHERE media_id = ? ORDER BY start_ms ASC
        `).all(String(mediaId)).map((row) => ({
            id: row.id,
            media_id: row.media_id,
            start_ms: row.start_ms,
            end_ms: row.end_ms,
            score: row.score,
            source: row.source,
            metadata: safeJson(row.metadata_json, {}),
            created_at: row.created_at,
        }));
    }

    function listClipCandidates(mediaId) {
        return db.get().prepare(`
            SELECT * FROM analysis_candidates WHERE media_id = ? ORDER BY score DESC, start_ms ASC
        `).all(String(mediaId)).map((row) => ({
            id: row.id,
            media_id: row.media_id,
            candidate_type: row.candidate_type,
            start_ms: row.start_ms,
            end_ms: row.end_ms,
            score: row.score,
            rationale: safeJson(row.rationale_json, {}),
            status: row.status,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }));
    }

    function getClipCandidate(mediaId, candidateId) {
        const row = db.get().prepare(`
            SELECT * FROM analysis_candidates WHERE media_id = ? AND id = ?
        `).get(String(mediaId), Number(candidateId));
        if (!row) return null;
        return {
            id: row.id,
            media_id: row.media_id,
            candidate_type: row.candidate_type,
            start_ms: row.start_ms,
            end_ms: row.end_ms,
            score: row.score,
            rationale: safeJson(row.rationale_json, {}),
            status: row.status,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }

    function replaceTranscriptSegments(mediaId, items) {
        db.get().prepare(`DELETE FROM transcript_segments WHERE media_id = ?`).run(String(mediaId));
        const insert = db.get().prepare(`
            INSERT INTO transcript_segments (media_id, start_ms, end_ms, text, confidence, speaker_label)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const item of items || []) {
            insert.run(
                String(mediaId),
                Number(item.start_ms || 0),
                Number(item.end_ms || 0),
                String(item.text || ''),
                item.confidence == null ? null : Number(item.confidence),
                item.speaker_label || null,
            );
        }
        return listTranscriptSegments(mediaId);
    }

    function replaceSceneMarkers(mediaId, items) {
        db.get().prepare(`DELETE FROM scene_markers WHERE media_id = ?`).run(String(mediaId));
        const insert = db.get().prepare(`
            INSERT INTO scene_markers (media_id, start_ms, end_ms, score, source, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const item of items || []) {
            insert.run(
                String(mediaId),
                Number(item.start_ms || 0),
                Number(item.end_ms || 0),
                Number(item.score || 0),
                item.source || 'local-stub',
                JSON.stringify(item.metadata || {}),
            );
        }
        return listSceneMarkers(mediaId);
    }

    function replaceClipCandidates(mediaId, items) {
        db.get().prepare(`DELETE FROM analysis_candidates WHERE media_id = ?`).run(String(mediaId));
        const insert = db.get().prepare(`
            INSERT INTO analysis_candidates (media_id, candidate_type, start_ms, end_ms, score, rationale_json, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of items || []) {
            insert.run(
                String(mediaId),
                item.candidate_type || 'clip',
                Number(item.start_ms || 0),
                Number(item.end_ms || 0),
                Number(item.score || 0),
                JSON.stringify(item.rationale || {}),
                item.status || 'ready',
            );
        }
        return listClipCandidates(mediaId);
    }

    function buildChapters(mediaId) {
        return listSceneMarkers(mediaId).map((marker, index) => ({
            id: marker.id,
            title: marker.metadata && marker.metadata.label || `Chapter ${index + 1}`,
            start_ms: marker.start_ms,
            end_ms: marker.end_ms,
            score: marker.score,
            source: marker.source,
        }));
    }

    function buildLocalAnalysis(media) {
        const durationMs = computeDurationMs(media);
        const chunk = Math.max(15000, Math.round(durationMs / 3));
        const transcriptSegments = [
            {
                start_ms: 0,
                end_ms: Math.min(durationMs, chunk),
                text: `[local-stub] ${media.id} is staged for transcript review.`,
                confidence: 0.21,
                speaker_label: 'system',
            },
            {
                start_ms: Math.min(durationMs, chunk),
                end_ms: Math.min(durationMs, chunk * 2),
                text: `[local-stub] ${media.namespace} keeps analysis deterministic until paid providers are explicitly enabled.`,
                confidence: 0.28,
                speaker_label: 'system',
            },
            {
                start_ms: Math.min(durationMs, chunk * 2),
                end_ms: durationMs,
                text: '[local-stub] Clip candidates are derived from scene windows and operator-visible heuristics.',
                confidence: 0.24,
                speaker_label: 'system',
            },
        ].filter((segment) => segment.start_ms < segment.end_ms);

        const sceneMarkers = [
            {
                start_ms: 0,
                end_ms: Math.min(durationMs, chunk),
                score: 0.36,
                source: 'local-stub',
                metadata: { label: 'Opening context' },
            },
            {
                start_ms: Math.min(durationMs, chunk),
                end_ms: Math.min(durationMs, chunk * 2),
                score: 0.51,
                source: 'local-stub',
                metadata: { label: 'Primary activity' },
            },
            {
                start_ms: Math.min(durationMs, chunk * 2),
                end_ms: durationMs,
                score: 0.43,
                source: 'local-stub',
                metadata: { label: 'Closing window' },
            },
        ].filter((marker) => marker.start_ms < marker.end_ms);

        const clipCandidates = sceneMarkers.map((marker, index) => ({
            candidate_type: 'clip',
            start_ms: marker.start_ms,
            end_ms: marker.end_ms,
            score: Math.min(0.99, Number(marker.score || 0) + 0.2),
            rationale: {
                source: 'local-stub',
                label: marker.metadata && marker.metadata.label || `Candidate ${index + 1}`,
            },
            status: 'ready',
        }));

        return {
            mode: 'local-stub',
            duration_ms: durationMs,
            transcriptSegments,
            sceneMarkers,
            clipCandidates,
        };
    }

    async function materializeClipProject(clip, actor, mode) {
        return sharedMaterializeClipProject({
            clipModel,
            model,
            storageModel,
            buildPlaybackPayload,
            storage,
            eventBus,
            mediaEventTypes: MEDIA_EVENT_TYPES,
        }, clip, actor, mode);
    }

    async function reconcileLifecycle(body) {
        return sharedReconcileLifecycle({
            database: db.get(),
            lifecyclePolicy,
            quotas,
            storage,
            processing,
            storageModel,
        }, body);
    }

    function assertAdminAction(req, action) {
        policy.assert(policy.decideAdmin({ req }), { ...actorMeta(req), action });
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
        const target = chooseStorageTarget({
            namespace: ns,
            type: b.type,
            sizeBytes: b.size_bytes,
        });
        const provider = target.provider;
        const created = model.create({
            owner_type: b.owner_type, owner_id: String(b.owner_id),
            namespace: ns, type: b.type,
            visibility: namespaces.isMediaVisibility(b.visibility) ? b.visibility : undefined,
            storage_tier: namespaces.isMediaTier(b.storage_tier) ? b.storage_tier : undefined,
            storage_provider: provider.name(),
            mime_type: b.mime_type || null,
            size_bytes: b.size_bytes || 0,
            metadata: Object.assign({}, b.metadata || {}, {
                storage_target: {
                    requested_provider: target.providerName,
                    resolved_provider: provider.name(),
                    role: target.role,
                    reason: target.reason,
                    provider_policy: target.providerPolicy || storage.providerPolicy || null,
                },
            }),
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
        const target = chooseStorageTarget({
            namespace: ns,
            type: b.type,
            sizeBytes: b.size_bytes,
        });
        const provider = target.provider;
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
            metadata: Object.assign({}, b.metadata || {}, {
                upload_strategy: 'multipart',
                storage_target: {
                    requested_provider: target.providerName,
                    resolved_provider: provider.name(),
                    role: target.role,
                    reason: target.reason,
                    provider_policy: target.providerPolicy || storage.providerPolicy || null,
                },
            }),
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
            role: inferLocationRoleForStorage(storage, session.provider_name),
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
        ensureLocation(updated, wrote, { role: inferLocationRoleForStorage(storage, updated.storage_provider) });
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

    r.get('/streams/:streamId/playback', asyncRoute(async (req, res) => {
        const recording = vodModel.getLatestRecordingByStreamId(req.params.streamId);
        if (!recording) return res.status(404).json({ error: 'stream recording not found' });

        const media = recording.media_id ? model.getById(recording.media_id) : null;
        let playback = null;
        let size_guard = null;
        if (media) {
            size_guard = applyPlaybackSizeGuard(media);
            if (size_guard.ok) {
                playback = await buildPlaybackPayload(media, { preferHot: true });
            }
        }

        res.json({
            stream_id: req.params.streamId,
            recording,
            playback,
            size_guard,
            ready: !!(playback && playback.ok),
        });
    }));

    r.get('/streams/:streamId/timeline', asyncRoute(async (req, res) => {
        const recording = vodModel.getLatestRecordingByStreamId(req.params.streamId);
        if (!recording) return res.status(404).json({ error: 'stream recording not found' });
        res.json({
            stream_id: req.params.streamId,
            timeline: vodModel.buildTimeline(req.params.streamId),
            recording,
        });
    }));

    r.get('/streams/:streamId/segments', asyncRoute(async (req, res) => {
        const recording = vodModel.getLatestRecordingByStreamId(req.params.streamId);
        if (!recording) return res.status(404).json({ error: 'stream recording not found' });
        res.json({
            stream_id: req.params.streamId,
            recording,
            items: vodModel.listSegmentsByRecordingId(recording.id),
            parts: vodModel.listPartsByRecordingId(recording.id),
            partial_segments: vodModel.listPartialSegmentsByRecordingId(recording.id),
        });
    }));

    r.get('/streams/:streamId/preview-sprites', asyncRoute(async (req, res) => {
        const recording = vodModel.getLatestRecordingByStreamId(req.params.streamId);
        if (!recording) return res.status(404).json({ error: 'stream recording not found' });
        res.json({
            stream_id: req.params.streamId,
            recording,
            items: vodModel.listPreviewSprites(req.params.streamId),
        });
    }));

    r.post('/streams/:streamId/clips', express.json({ limit: '32kb' }), asyncRoute(async (req, res) => {
        const recording = vodModel.getLatestRecordingByStreamId(req.params.streamId);
        if (!recording) return res.status(404).json({ error: 'stream recording not found' });
        const segments = vodModel.listSegmentsByRecordingId(recording.id);
        if (!segments.length) {
            return res.status(409).json({ error: 'stream segments not ready', stream_id: req.params.streamId });
        }

        const actor = actorMeta(req);
        if (actor.actor_type === 'anonymous') {
            return res.status(401).json({ error: 'authentication required' });
        }

        const body = req.body || {};
        const timeline = vodModel.buildTimeline(req.params.streamId);
        const startMs = Math.max(0, Number(body.start_ms || 0));
        const endMs = Math.max(startMs + 1000, Number(body.end_ms || Math.min(timeline.duration_ms || 30000, startMs + 30000)));
        const requestedClip = clipModel.createClip({
            sourceStreamId: req.params.streamId,
            sourceMediaId: recording.media_id,
            ownerUserId: actor.actor_type === 'user' ? actor.actor_id : (body.owner_user_id || null),
            title: body.title || `Clip from ${req.params.streamId}`,
            status: 'requested',
            startMs,
            endMs,
            metadata: {
                source_recording_id: recording.id,
                created_by_actor_type: actor.actor_type,
                created_by_actor_id: actor.actor_id,
            },
        });
        const clip = clipModel.updateClip(requestedClip.id, {
            status: 'virtual_ready',
            metadata: {
                clip_workflow_status: 'virtual_ready',
                virtualized_at: new Date().toISOString(),
            },
        });
        if (recording.media_id) {
            promotionModel.createRetentionHold({
                mediaId: recording.media_id,
                holdType: 'virtual-clip-dependency',
                reason: 'Virtual clip depends on parent media segments',
                referenceId: clip.id,
            });
        }
        eventBus.publishMediaEvent('clip:virtual:ready', model.getById(recording.media_id) || { id: recording.media_id }, {
            actor_type: actor.actor_type,
            actor_id: actor.actor_id,
            clip_id: clip.id,
            stream_id: req.params.streamId,
        });
        res.status(201).json({ clip, timeline });
    }));

    r.get('/clips/:clipId', asyncRoute(async (req, res) => {
        const clip = clipModel.getClipById(req.params.clipId);
        if (!clip) return res.status(404).json({ error: 'clip not found' });
        res.json({ clip, exports: clipModel.listClipExports(clip.id) });
    }));

    r.patch('/clips/:clipId', express.json({ limit: '32kb' }), asyncRoute(async (req, res) => {
        const clip = clipModel.getClipById(req.params.clipId);
        if (!clip) return res.status(404).json({ error: 'clip not found' });
        const body = req.body || {};
        const updated = clipModel.updateClip(clip.id, {
            title: body.title != null ? String(body.title) : clip.title,
            status: body.status != null ? String(body.status) : clip.status,
            start_ms: body.start_ms != null ? Number(body.start_ms) : clip.start_ms,
            end_ms: body.end_ms != null ? Number(body.end_ms) : clip.end_ms,
            metadata: body.metadata || {},
        });
        res.json({ clip: updated });
    }));

    r.post('/clips/:clipId/materialize', express.json({ limit: '16kb' }), asyncRoute(async (req, res) => {
        const clip = clipModel.getClipById(req.params.clipId);
        if (!clip) return res.status(404).json({ error: 'clip not found' });
        const actor = actorMeta(req);
        if (actor.actor_type === 'anonymous') {
            return res.status(401).json({ error: 'authentication required' });
        }
        const result = await materializeClipProject(clip, actor, String(req.body && req.body.mode || 'virtual-copy'));
        if (!result.ok) {
            return res.status(result.status || 409).json(result);
        }
        res.status(result.created ? 201 : 200).json(result);
    }));

    r.post('/clips/:clipId/frame-perfect-render', express.json({ limit: '16kb' }), asyncRoute(async (req, res) => {
        const clip = clipModel.getClipById(req.params.clipId);
        if (!clip) return res.status(404).json({ error: 'clip not found' });
        const actor = actorMeta(req);
        if (actor.actor_type === 'anonymous') {
            return res.status(401).json({ error: 'authentication required' });
        }
        const result = await materializeClipProject(clip, actor, 'frame-perfect');
        if (!result.ok) {
            return res.status(result.status || 409).json(result);
        }
        res.status(result.created ? 201 : 200).json(result);
    }));

    r.delete('/clips/:clipId', asyncRoute(async (req, res) => {
        const clip = clipModel.getClipById(req.params.clipId);
        if (!clip) return res.status(404).json({ error: 'clip not found' });
        const actor = actorMeta(req);
        if (actor.actor_type === 'anonymous') {
            return res.status(401).json({ error: 'authentication required' });
        }
        const deleted = clipModel.deleteClip(clip.id);
        const released = promotionModel.releaseRetentionHoldsByReference(clip.id, 'virtual-clip-dependency');
        res.json({ clip: deleted, released_holds: released.length });
    }));

    r.get('/clips/:clipId/playback', asyncRoute(async (req, res) => {
        const clip = clipModel.getClipById(req.params.clipId);
        if (!clip) return res.status(404).json({ error: 'clip not found' });

        const playbackMedia = clip.playback_media_id ? model.getById(clip.playback_media_id) : null;
        if (playbackMedia) {
            const playback = await buildPlaybackPayload(playbackMedia, { preferHot: true });
            return res.json({ clip, media: playbackMedia, playback });
        }

        const sourceMedia = clip.source_media_id ? model.getById(clip.source_media_id) : null;
        if (!sourceMedia) {
            return res.status(409).json({ error: 'source media unavailable', clip });
        }

        const playback = await buildPlaybackPayload(sourceMedia, { preferHot: true });
        res.json({
            clip,
            media: sourceMedia,
            playback: Object.assign({}, playback, {
                virtual: true,
                clip_start_ms: clip.start_ms,
                clip_end_ms: clip.end_ms,
            }),
        });
    }));

    r.post('/media/:mediaId/analyze', express.json({ limit: '64kb' }), asyncRoute(async (req, res) => {
        const media = model.getById(req.params.mediaId);
        if (!media) return res.status(404).json({ error: 'media not found' });

        const actor = actorMeta(req);
        if (actor.actor_type === 'anonymous') {
            return res.status(401).json({ error: 'authentication required' });
        }

        const analysis = buildLocalAnalysis(media);
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.PROCESSING_STARTED, media, {
            actor_type: actor.actor_type,
            actor_id: actor.actor_id,
            phase: 'analysis',
        });
        const transcript_segments = replaceTranscriptSegments(media.id, analysis.transcriptSegments);
        const scene_markers = replaceSceneMarkers(media.id, analysis.sceneMarkers);
        const clip_candidates = replaceClipCandidates(media.id, analysis.clipCandidates);
        const updatedMedia = model.update(media.id, {
            metadata: {
                analysis_mode: analysis.mode,
                analysis_updated_at: new Date().toISOString(),
                transcript_segment_count: transcript_segments.length,
                clip_candidate_count: clip_candidates.length,
            },
        });
        eventBus.publishMediaEvent('ai.transcription.ready', updatedMedia, {
            actor_type: actor.actor_type,
            actor_id: actor.actor_id,
            transcript_segment_count: transcript_segments.length,
        });
        eventBus.publishMediaEvent('ai.clip_candidates.ready', updatedMedia, {
            actor_type: actor.actor_type,
            actor_id: actor.actor_id,
            clip_candidate_count: clip_candidates.length,
        });
        eventBus.publishMediaEvent(MEDIA_EVENT_TYPES.PROCESSING_COMPLETED, updatedMedia, {
            actor_type: actor.actor_type,
            actor_id: actor.actor_id,
            phase: 'analysis',
        });
        res.json({
            ok: true,
            mode: analysis.mode,
            media: updatedMedia,
            transcript_segments,
            scene_markers,
            chapters: buildChapters(media.id),
            clip_candidates,
        });
    }));

    r.get('/media/:mediaId/transcript', asyncRoute(async (req, res) => {
        const media = model.getById(req.params.mediaId);
        if (!media) return res.status(404).json({ error: 'media not found' });
        res.json({ media_id: media.id, items: listTranscriptSegments(media.id) });
    }));

    r.get('/media/:mediaId/chapters', asyncRoute(async (req, res) => {
        const media = model.getById(req.params.mediaId);
        if (!media) return res.status(404).json({ error: 'media not found' });
        res.json({ media_id: media.id, items: buildChapters(media.id) });
    }));

    r.get('/media/:mediaId/clip-candidates', asyncRoute(async (req, res) => {
        const media = model.getById(req.params.mediaId);
        if (!media) return res.status(404).json({ error: 'media not found' });
        res.json({ media_id: media.id, items: listClipCandidates(media.id) });
    }));

    r.get('/streams/:streamId/transcript', asyncRoute(async (req, res) => {
        const recording = vodModel.getLatestRecordingByStreamId(req.params.streamId);
        if (!recording || !recording.media_id) {
            return res.status(404).json({ error: 'stream transcript not found' });
        }
        res.json({
            stream_id: req.params.streamId,
            media_id: recording.media_id,
            items: listTranscriptSegments(recording.media_id),
        });
    }));

    r.post('/media/:mediaId/clip-candidates/:candidateId/create-clip', express.json({ limit: '32kb' }), asyncRoute(async (req, res) => {
        const media = model.getById(req.params.mediaId);
        if (!media) return res.status(404).json({ error: 'media not found' });
        const candidate = getClipCandidate(media.id, req.params.candidateId);
        if (!candidate) return res.status(404).json({ error: 'clip candidate not found' });

        const actor = actorMeta(req);
        if (actor.actor_type === 'anonymous') {
            return res.status(401).json({ error: 'authentication required' });
        }

        const recording = vodModel.getRecordingByMediaId(media.id);
        if (!recording) {
            return res.status(409).json({ error: 'stream recording not found for media', media_id: media.id });
        }

        const body = req.body || {};
        const requestedClip = clipModel.createClip({
            sourceStreamId: recording.stream_id,
            sourceMediaId: media.id,
            ownerUserId: actor.actor_type === 'user' ? actor.actor_id : (body.owner_user_id || null),
            title: body.title || candidate.rationale && candidate.rationale.label || `Clip candidate ${candidate.id}`,
            status: 'requested',
            startMs: candidate.start_ms,
            endMs: candidate.end_ms,
            metadata: {
                candidate_id: candidate.id,
                candidate_score: candidate.score,
                candidate_rationale: candidate.rationale,
            },
        });
        const clip = clipModel.updateClip(requestedClip.id, {
            status: 'virtual_ready',
            metadata: {
                clip_workflow_status: 'virtual_ready',
                virtualized_at: new Date().toISOString(),
            },
        });
        promotionModel.createRetentionHold({
            mediaId: media.id,
            holdType: 'virtual-clip-dependency',
            reason: 'Virtual clip depends on analyzed parent media',
            referenceId: clip.id,
        });
        eventBus.publishMediaEvent('clip:virtual:ready', media, {
            actor_type: actor.actor_type,
            actor_id: actor.actor_id,
            clip_id: clip.id,
            candidate_id: candidate.id,
        });
        res.status(201).json({ clip, candidate });
    }));

    r.get('/media/:id/locations', (req, res) => {
        const media = model.getById(req.params.id);
        if (!media) return res.status(404).json({ error: 'media not found' });
        try {
            policy.assert(policy.decideRead({ req, media }),
                { ...actorMeta(req), action: 'read-locations', resource: `media:${media.id}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        res.json({
            media,
            locations: storageModel.listLocations(media.id),
        });
    });

    r.get('/media/:id/promotion-status', (req, res) => {
        const media = model.getById(req.params.id);
        if (!media) return res.status(404).json({ error: 'media not found' });
        try {
            policy.assert(policy.decideRead({ req, media }),
                { ...actorMeta(req), action: 'read-promotion-status', resource: `media:${media.id}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        res.json(lifecyclePolicy.getPromotionStatus(storage, media.id));
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

    r.get('/admin/media/storage-plan', (req, res) => {
        try {
            assertAdminAction(req, 'admin-media-storage-plan');
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        res.json({
            plan: storage.describePlan(),
            hot_tier_status: lifecyclePolicy.getHotTierStatus(storage),
        });
    });

    r.get('/admin/media/hot-tier/status', (req, res) => {
        try {
            assertAdminAction(req, 'admin-media-hot-tier-status');
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        res.json(lifecyclePolicy.getHotTierStatus(storage));
    });

    r.get('/admin/media/hot-tier/candidates', asyncRoute(async (req, res) => {
        try {
            assertAdminAction(req, 'admin-media-hot-tier-candidates');
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        res.json({
            items: await lifecyclePolicy.listHotTierCandidates(storage, { limit: req.query.limit }),
        });
    }));

    r.post('/admin/media/lifecycle/reconcile', express.json({ limit: '64kb' }), asyncRoute(async (req, res) => {
        try {
            assertAdminAction(req, 'admin-media-lifecycle-reconcile');
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        res.json(await reconcileLifecycle(Object.assign({}, req.body || {}, { reconcile_storage: true })));
    }));

    r.post('/admin/media/:id/promote-r2', express.json({ limit: '16kb' }), asyncRoute(async (req, res) => {
        try {
            assertAdminAction(req, 'admin-media-promote-r2');
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const result = await promotionWorker.reconcileSingleMedia(storage, req.params.id, {
            forcePromote: true,
            adminForce: true,
            actorType: actorMeta(req).actor_type,
            actorId: actorMeta(req).actor_id,
        });
        if (!result.ok) return res.status(result.status || 409).json(result);
        res.json(result);
    }));

    r.post('/admin/media/:id/demote-r2', express.json({ limit: '16kb' }), asyncRoute(async (req, res) => {
        try {
            assertAdminAction(req, 'admin-media-demote-r2');
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const result = await promotionWorker.reconcileSingleMedia(storage, req.params.id, {
            forceDemote: true,
            adminForce: 'demote',
            actorType: actorMeta(req).actor_type,
            actorId: actorMeta(req).actor_id,
        });
        if (!result.ok) return res.status(result.status || 409).json(result);
        res.json(result);
    }));

    r.post('/admin/media/:id/reconcile-storage', express.json({ limit: '16kb' }), asyncRoute(async (req, res) => {
        try {
            assertAdminAction(req, 'admin-media-reconcile-storage');
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const result = await promotionWorker.reconcileSingleMedia(storage, req.params.id, {
            dryRun: req.body && req.body.dry_run === true,
            adminForce: req.body && req.body.admin_force === true ? true : req.body && req.body.admin_force === 'demote' ? 'demote' : false,
            actorType: actorMeta(req).actor_type,
            actorId: actorMeta(req).actor_id,
        });
        if (!result.ok) return res.status(result.status || 409).json(result);
        res.json(result);
    }));

    r.get('/admin/media/size-violations', (req, res) => {
        try {
            assertAdminAction(req, 'admin-media-size-violations');
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        res.json({
            items: storageModel.listSizeViolations({ mediaId: req.query.media_id, violationType: req.query.violation_type, limit: req.query.limit }),
        });
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

    r.post('/internal/clips/materialize', express.json({ limit: '32kb' }), asyncRoute(async (req, res) => {
        if (!req.serviceActor) {
            return res.status(403).json({ error: 'internal service actor required' });
        }
        const body = req.body || {};
        const clipId = body.clip_id || body.clipId;
        if (!clipId) {
            return res.status(400).json({ error: 'clip_id required' });
        }
        const clip = clipModel.getClipById(String(clipId));
        if (!clip) {
            return res.status(404).json({ error: 'clip not found' });
        }
        const result = await materializeClipProject(clip, serviceActorMeta(req), String(body.mode || 'worker-materialize'));
        if (!result.ok) {
            return res.status(result.status || 409).json(result);
        }
        res.status(result.created ? 201 : 200).json(result);
    }));

    r.post('/internal/lifecycle/reconcile', express.json({ limit: '64kb' }), asyncRoute(async (req, res) => {
        if (!req.serviceActor) {
            return res.status(403).json({ error: 'internal service actor required' });
        }
        res.json(Object.assign({ requested_by_service: serviceActorMeta(req).actor_id }, await reconcileLifecycle(req.body || {})));
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
                role: media.metadata && media.metadata.storage_target && media.metadata.storage_target.role
                    || inferLocationRoleForStorage(storage, media.storage_provider),
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
