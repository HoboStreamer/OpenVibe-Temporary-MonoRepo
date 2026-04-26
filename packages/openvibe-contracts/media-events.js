'use strict';

// OpenVibe — media event-type catalog. Every media event is published on
// the `media.events` topic (see TOPICS.MEDIA) by the openvibe-media service.
// Consumers may subscribe with an `event_type` filter to narrow the fan-out.
//
// Payload shape (additive — consumers MUST tolerate unknown keys):
//   { media_id, namespace, owner_type, owner_id, type, status,
//     storage_tier, size_bytes, mime_type, sha256?, derivative_of?,
//     processing_job_id?, error?, ... }

const MEDIA_EVENT_TYPES = Object.freeze({
    UPLOAD_INITIALIZED:    'media.upload.initialized',
    UPLOADED:              'media.uploaded',
    PROCESSING_STARTED:    'media.processing.started',
    PROCESSING_COMPLETED:  'media.processing.completed',
    PROCESSING_FAILED:     'media.processing.failed',
    READY:                 'media.ready',
    DELETED:               'media.deleted',
    ARCHIVED:              'media.archived',
    RESTORED:              'media.restored',
    DERIVATIVE_CREATED:    'media.derivative.created',
});

const MEDIA_EVENT_TYPE_LIST = Object.freeze(Object.values(MEDIA_EVENT_TYPES));

function isMediaEventType(t) {
    return typeof t === 'string' && MEDIA_EVENT_TYPE_LIST.includes(t);
}

function buildMediaEventPayload(media, extra) {
    const m = media || {};
    return Object.assign({
        media_id:     m.id,
        namespace:    m.namespace,
        owner_type:   m.owner_type,
        owner_id:     m.owner_id,
        type:         m.type,
        status:       m.status,
        visibility:   m.visibility,
        storage_tier: m.storage_tier,
        mime_type:    m.mime_type || null,
        size_bytes:   m.size_bytes || 0,
        sha256:       m.sha256 || null,
    }, extra || {});
}

module.exports = {
    MEDIA_EVENT_TYPES,
    MEDIA_EVENT_TYPE_LIST,
    isMediaEventType,
    buildMediaEventPayload,
};
