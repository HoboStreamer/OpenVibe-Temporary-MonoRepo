'use strict';

const {
    roomAdmin,
    roomCanvas,
    roomChannel,
    roomChannelChat,
    roomChat,
    roomClip,
    roomDm,
    roomGame,
    roomGlobalChat,
    roomLiveStream,
    roomMedia,
    roomPublicSpace,
    roomPublicThread,
    roomStreamChat,
    roomUser,
} = require('./rooms');

const REALTIME_NAMESPACES = Object.freeze([
    '/realtime',
    '/chat',
    '/live',
    '/community',
    '/media',
    '/clips',
    '/billing',
    '/ai',
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

function buildRealtimeEnvelopePayload(envelope, extra) {
    const source = envelope || {};
    return Object.assign({
        event_id: source.event_id || null,
        trace_id: source.trace_id || null,
        topic: source.topic || null,
        event_type: source.event_type || null,
        source: source.source || null,
        actor_type: source.actor_type || null,
        actor_id: source.actor_id || null,
        timestamp: source.timestamp || null,
        payload: source.payload || {},
    }, extra || {});
}

function mapEnvelopeToRealtimeTargets(envelope) {
    const source = envelope || {};
    const payload = source.payload || {};
    const eventType = String(source.event_type || '').trim();
    const targets = [];

    if (!eventType || source.source === 'openvibe-realtime') return targets;

    const message = buildRealtimeEnvelopePayload(source);

    function add(namespace, room, extra) {
        if (!namespace || !room) return;
        targets.push({
            namespace,
            room,
            event: eventType,
            payload: extra ? buildRealtimeEnvelopePayload(source, extra) : message,
        });
    }

    function addUsers(namespace, ids) {
        for (const id of new Set((ids || []).filter(Boolean).map((value) => String(value)))) {
            add(namespace, roomUser(id));
        }
    }

    function isPublicVisibility(value) {
        return value == null || value === '' || value === 'public' || value === 'unlisted';
    }

    function chatRoomTarget() {
        if (payload.room_type === 'global') return roomGlobalChat();
        if (payload.room_type === 'stream') return roomStreamChat(payload.external_ref_id || payload.stream_id || payload.channel_id || payload.room_id);
        if (payload.room_type === 'channel') return roomChannelChat(payload.external_ref_id || payload.channel_id || payload.room_id);
        if (payload.room_type === 'dm' && payload.room_id && String(payload.room_id).includes(':')) return roomDm(payload.room_id);
        if (payload.room_id && (payload.room_type === 'community' || payload.room_type === 'system')) return roomChat(payload.room_id);
        return null;
    }

    if (eventType === 'user.module.updated') {
        addUsers('/realtime', [payload.user_id]);
    }

    if (eventType.startsWith('chat.')) {
        const chatRoom = chatRoomTarget();
        if (chatRoom && !chatRoom.startsWith('chat:room:')) add('/chat', chatRoom);
        if (eventType.startsWith('chat.dm.') || eventType.startsWith('chat.call.')) {
            addUsers('/chat', [
                payload.user_id,
                payload.target_user_id,
                payload.recipient_user_id,
                payload.sender_id,
                payload.caller_user_id,
                payload.callee_user_id,
            ]);
        }
        if (payload.room_id && payload.room_type === 'dm' && String(payload.room_id).includes(':')) {
            add('/chat', roomDm(payload.room_id));
        }
    }

    if (eventType.startsWith('stream.')) {
        if (payload.stream_id) add('/live', roomLiveStream(payload.stream_id));
        if (payload.channel_id || payload.channel_slug) add('/live', roomChannel(payload.channel_id || payload.channel_slug));
    }

    if (eventType.startsWith('media.')) {
        if (payload.media_id) add('/media', roomMedia(payload.media_id));
        if (payload.clip_id) add('/clips', roomClip(payload.clip_id));
    }

    if (eventType.startsWith('billing.') || eventType.startsWith('tips.') || eventType.startsWith('vip.')) {
        addUsers('/billing', [
            payload.user_id,
            payload.owner_id,
            payload.owner_user_id,
            payload.recipient_owner_id,
            payload.sender_actor_id,
            payload.subscriber_actor_id,
            payload.target_owner_id,
        ]);
        if (payload.target_context_type === 'stream' && payload.target_context_id) {
            add('/chat', roomStreamChat(payload.target_context_id));
            add('/live', roomLiveStream(payload.target_context_id));
        }
        if (payload.target_context_type === 'channel' && payload.target_context_id) {
            add('/chat', roomChannelChat(payload.target_context_id));
            add('/live', roomChannel(payload.target_context_id));
        }
        addUsers('/notifications', [payload.recipient_owner_id, payload.sender_actor_id, payload.subscriber_actor_id]);
    }

    if (eventType.startsWith('community.')) {
        const spaceId = payload.space_id || payload.community_id || payload.community_slug;
        const threadId = payload.thread_id;
        if (spaceId && isPublicVisibility(payload.visibility)) add('/community', roomPublicSpace(spaceId));
        if (threadId && isPublicVisibility(payload.visibility)) add('/community', roomPublicThread(threadId));
    }

    if (eventType.startsWith('ai.') || eventType.startsWith('seo.') || eventType.startsWith('content.') || eventType.startsWith('search.')) {
        addUsers('/ai', [
            payload.user_id,
            payload.requested_by_id,
            payload.actor_id,
            payload.owner_id,
            payload.target_type === 'user' ? payload.target_id : null,
        ]);
        addUsers('/notifications', [payload.requested_by_id, payload.user_id]);
    }

    if (eventType.startsWith('game.')) {
        addUsers('/games', [payload.user_id]);
        if (payload.game_id || payload.world_id) add('/games', roomGame(payload.game_id || payload.world_id));
        if (payload.canvas_id) add('/games', roomCanvas(payload.canvas_id));
    }

    if (eventType === 'admin.broadcast' || eventType.startsWith('admin.')) {
        add('/admin', roomAdmin());
    }

    const seen = new Set();
    return targets.filter((target) => {
        const key = `${target.namespace}:${target.room}:${target.event}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ── Canonical event name aliases ──────────────────────────────────────────────
// Maps legacy/non-canonical event_type values to their canonical dot-notation names.
// Canonical names use dots only (no underscores in multi-part segments).
const EVENT_ALIASES = Object.freeze({
    // stream aliases
    'stream.vod_attached':            'stream.vod.attached',
    'stream.ingest_connected':        'stream.ingest.connected',
    'stream.ingest_disconnected':     'stream.ingest.disconnected',
    'stream.mirrored_to_live':        'stream.mirrored.to.live',
    // community aliases
    'community.thread.created':       'thread.created',
    'community.post.created':         'comment.created',
    'community.paste.created':        'paste.created',
    'community.paste.updated':        'paste.updated',
    'community.space.created':        'space.created',
    // chat aliases
    'chat.message.created':           'chat.message.sent',
    'chat.message_created':           'chat.message.sent',
    // media aliases
    'media.upload_completed':         'media.upload.completed',
    'media.lifecycle_promoted':       'media.lifecycle.promoted',
    'media.lifecycle_demoted':        'media.lifecycle.demoted',
    'media.processing_completed':     'media.upload.completed',
    // vod / clip aliases
    'vod.attached':                   'stream.vod.attached',
    'clip.materialization_completed': 'clip.materialized',
    // discord aliases
    'discord.message_received':       'discord.message.received',
    'discord.message.created':        'discord.message.received',
});

/**
 * Normalize a raw event_type to its canonical dot-notation form.
 * Applies alias mapping first, then lowercases and cleans the name.
 * @param {string} eventType
 * @returns {string}
 */
function normalizeEventType(eventType) {
    if (!eventType) return 'unknown';
    const lower = String(eventType).toLowerCase().trim();
    // Apply alias if present
    if (EVENT_ALIASES[lower]) return EVENT_ALIASES[lower];
    // Clean up non-canonical separators: colons + underscores in last segment only
    // e.g. 'chat:message:created' → 'chat.message.created'
    return lower.replace(/:/g, '.').replace(/([a-z0-9])_([a-z0-9])/g, '$1.$2');
}

module.exports = {
    buildRealtimeEnvelopePayload,
    mapEnvelopeToRealtimeTargets,
    REALTIME_EVENT_TYPES,
    REALTIME_EVENT_TYPE_LIST,
    REALTIME_NAMESPACES,
    EVENT_ALIASES,
    normalizeEventType,
    isRealtimeEventType,
};
