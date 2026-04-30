'use strict';

const { inferLocationRoleForStorage } = require('./playback');

async function materializeClipProject(deps, clip, actor, mode) {
    const {
        clipModel,
        model,
        storageModel,
        buildPlaybackPayload,
        storage,
        eventBus,
        mediaEventTypes,
    } = deps;

    const sourceMedia = clip && clip.source_media_id ? model.getById(clip.source_media_id) : null;
    if (!sourceMedia) {
        const failedExport = clipModel.createClipExport({
            clipId: clip.id,
            status: 'failed',
            error: 'source media unavailable',
        });
        const updatedClip = clipModel.updateClip(clip.id, {
            status: 'import_hold',
            metadata: {
                last_materialization_error: 'source media unavailable',
                materialization_mode: mode,
            },
        });
        return {
            ok: false,
            status: 409,
            clip: updatedClip,
            export: failedExport,
            error: 'source media unavailable',
        };
    }

    if (clip.playback_media_id) {
        const existingMedia = model.getById(clip.playback_media_id);
        if (existingMedia) {
            return {
                ok: true,
                created: false,
                clip,
                media: existingMedia,
                export: clipModel.getLatestClipExport(clip.id),
                playback: await buildPlaybackPayload(existingMedia, { preferHot: true }),
            };
        }
    }

    const createdMedia = model.create({
        owner_type: clip.owner_user_id ? 'user' : (actor.actor_type === 'service' ? 'service' : 'user'),
        owner_id: clip.owner_user_id || actor.actor_id || 'openvibe-workers',
        namespace: 'live.clips',
        type: 'clip',
        status: 'ready',
        visibility: sourceMedia.visibility,
        storage_tier: sourceMedia.storage_tier,
        storage_provider: sourceMedia.storage_provider,
        storage_key: sourceMedia.storage_key,
        public_url: sourceMedia.public_url,
        cdn_url: sourceMedia.cdn_url,
        size_bytes: sourceMedia.size_bytes,
        mime_type: sourceMedia.mime_type,
        sha256: sourceMedia.sha256,
        metadata: Object.assign({}, sourceMedia.metadata || {}, {
            clip_source_stream_id: clip.source_stream_id,
            clip_source_media_id: sourceMedia.id,
            clip_range: {
                start_ms: clip.start_ms,
                end_ms: clip.end_ms,
            },
            materialization_mode: mode,
            virtual_materialization: true,
        }),
        actor_type: actor.actor_type,
        actor_id: actor.actor_id,
    });

    const sourceLocations = storageModel.listLocations(sourceMedia.id);
    if (sourceLocations.length) {
        for (const location of sourceLocations) {
            storageModel.recordLocation({
                mediaId: createdMedia.id,
                providerName: location.provider_name,
                role: location.role,
                storageKey: location.storage_key,
                publicUrl: location.public_url,
                signedUrlRequired: location.signed_url_required,
                checksumSha256: location.checksum_sha256,
                sizeBytes: location.size_bytes,
                metadata: Object.assign({}, location.metadata || {}, {
                    derived_from_media_id: sourceMedia.id,
                    virtual_materialization: true,
                }),
            });
        }
    } else if (sourceMedia.storage_key) {
        storageModel.recordLocation({
            mediaId: createdMedia.id,
            providerName: sourceMedia.storage_provider,
            role: inferLocationRoleForStorage(storage, sourceMedia.storage_provider),
            storageKey: sourceMedia.storage_key,
            publicUrl: sourceMedia.public_url,
            signedUrlRequired: sourceMedia.visibility !== 'public',
            checksumSha256: sourceMedia.sha256,
            sizeBytes: sourceMedia.size_bytes,
            metadata: {
                derived_from_media_id: sourceMedia.id,
                virtual_materialization: true,
            },
        });
    }

    const exportRow = clipModel.createClipExport({
        clipId: clip.id,
        status: 'ready',
        mediaId: createdMedia.id,
    });
    const updatedClip = clipModel.updateClip(clip.id, {
        status: 'ready',
        playback_media_id: createdMedia.id,
        metadata: {
            materialization_mode: mode,
            materialized_at: new Date().toISOString(),
        },
    });
    const playback = await buildPlaybackPayload(createdMedia, { preferHot: true });
    if (eventBus && typeof eventBus.publishMediaEvent === 'function') {
        eventBus.publishMediaEvent(mediaEventTypes.READY, createdMedia, {
            actor_type: actor.actor_type,
            actor_id: actor.actor_id,
            clip_id: clip.id,
        });
    }
    return {
        ok: true,
        created: true,
        clip: updatedClip,
        media: createdMedia,
        export: exportRow,
        playback,
    };
}

module.exports = {
    materializeClipProject,
};
