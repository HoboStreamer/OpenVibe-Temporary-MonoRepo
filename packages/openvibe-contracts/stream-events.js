'use strict';

// OpenVibe — stream event-type catalog. Every stream lifecycle event is
// published on the `stream.events` topic by either openre-stream (ingest /
// restream lifecycle) or openvibe-live (mirror + page-state lifecycle).
//
// Payload shape (additive):
//   { stream_id, channel_id?, creator_id, source_service,
//     ingest_service?, protocol?, mirror_to_live?, vod_id?, ... }

const STREAM_EVENT_TYPES = Object.freeze({
    CREATED:                'stream.created',
    STARTED:                'stream.started',
    INGEST_CONNECTED:       'stream.ingest.connected',
    INGEST_DISCONNECTED:    'stream.ingest.disconnected',
    OUTPUT_STARTED:         'stream.output.started',
    OUTPUT_FAILED:          'stream.output.failed',
    OUTPUT_STOPPED:         'stream.output.stopped',
    MIRRORED_TO_LIVE:       'stream.mirrored_to_live',
    ENDED:                  'stream.ended',
    VOD_RECORDING_REQUESTED:'stream.vod.recording.requested',
    VOD_ATTACHED:           'stream.vod.attached',
});

const STREAM_EVENT_TYPE_LIST = Object.freeze(Object.values(STREAM_EVENT_TYPES));

function isStreamEventType(t) {
    return typeof t === 'string' && STREAM_EVENT_TYPE_LIST.includes(t);
}

const STREAM_PROTOCOLS = Object.freeze(['rtmp', 'whip', 'webrtc', 'jsmpeg']);
function isStreamProtocol(p) { return STREAM_PROTOCOLS.includes(p); }

function buildStreamEventPayload(stream, extra) {
    const s = stream || {};
    return Object.assign({
        stream_id:       s.id || s.stream_id,
        channel_id:      s.channel_id || null,
        creator_id:      s.creator_id || s.user_id || null,
        protocol:        s.protocol || null,
        source_service:  s.source_service || null,
        ingest_service:  s.ingest_service || null,
        mirror_to_live:  s.mirror_to_live === true,
    }, extra || {});
}

module.exports = {
    STREAM_EVENT_TYPES,
    STREAM_EVENT_TYPE_LIST,
    isStreamEventType,
    STREAM_PROTOCOLS,
    isStreamProtocol,
    buildStreamEventPayload,
};
