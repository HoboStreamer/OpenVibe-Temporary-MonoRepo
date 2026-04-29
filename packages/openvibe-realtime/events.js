'use strict';

const REALTIME_NAMESPACES = Object.freeze([
    '/realtime',
    '/chat',
    '/live',
    '/media',
    '/clips',
    '/notifications',
    '/admin',
    '/games',
]);

const REALTIME_EVENT_TYPES = Object.freeze({
    CHAT_MESSAGE_CREATED: 'chat:message:created',
    CHAT_MESSAGE_UPDATED: 'chat:message:updated',
    CHAT_MESSAGE_DELETED: 'chat:message:deleted',
    CHAT_TYPING_STARTED: 'chat:typing:started',
    CHAT_TYPING_STOPPED: 'chat:typing:stopped',
    LIVE_STREAM_STARTED: 'live:stream:started',
    LIVE_STREAM_ENDED: 'live:stream:ended',
    LIVE_VIEWER_COUNT_UPDATED: 'live:viewer_count:updated',
    LIVE_DVR_READY: 'live:dvr:ready',
    LIVE_LATENCY_UPDATED: 'live:latency:updated',
    MEDIA_PROCESSING_STARTED: 'media:processing:started',
    MEDIA_PROCESSING_PROGRESS: 'media:processing:progress',
    MEDIA_READY: 'media:ready',
    MEDIA_FAILED: 'media:failed',
    CLIP_VIRTUAL_READY: 'clip:virtual:ready',
    CLIP_MATERIALIZATION_STARTED: 'clip:materialization:started',
    CLIP_MATERIALIZATION_PROGRESS: 'clip:materialization:progress',
    CLIP_MATERIALIZED_READY: 'clip:materialized:ready',
    CLIP_FAILED: 'clip:failed',
    AI_TRANSCRIPTION_PROGRESS: 'ai:transcription:progress',
    AI_TRANSCRIPTION_READY: 'ai:transcription:ready',
    AI_VISION_PROGRESS: 'ai:vision:progress',
    AI_CLIP_CANDIDATES_READY: 'ai:clip_candidates:ready',
    NOTIFICATION_CREATED: 'notification:created',
    ADMIN_BROADCAST: 'admin:broadcast',
    ADMIN_MODERATION_ACTION: 'admin:moderation:action',
    GAME_STATE_PATCH: 'game:state:patch',
    CANVAS_TILE_UPDATED: 'canvas:tile:updated',
});

const REALTIME_EVENT_TYPE_LIST = Object.freeze(Object.values(REALTIME_EVENT_TYPES));

function isRealtimeEventType(value) {
    return typeof value === 'string' && REALTIME_EVENT_TYPE_LIST.includes(value);
}

module.exports = {
    REALTIME_EVENT_TYPES,
    REALTIME_EVENT_TYPE_LIST,
    REALTIME_NAMESPACES,
    isRealtimeEventType,
};
