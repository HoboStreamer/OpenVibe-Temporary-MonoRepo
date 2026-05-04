'use strict';

// OpenVibe — canonical event-type catalog. The full catalog is open-ended;
// this file contains the well-known events emitted and consumed across the
// OpenVibe ecosystem. Follow the naming pattern:
//   <topic>.<resource>.<verb>
// For example: stream.events -> stream.vod.attached

const EVENT_TYPES = Object.freeze({
    // auth.events
    AUTH_TOKEN_ISSUED:            'auth.token.issued',
    AUTH_TOKEN_REVOKED:           'auth.token.revoked',
    AUTH_SESSION_INVALIDATED:     'auth.session.invalidated',

    // user.events
    USER_MODULE_UPDATED:          'user.module.updated',
    USER_PROFILE_UPDATED:         'user.profile.updated',

    // service.events
    SERVICE_REGISTERED:           'service.registered',
    SERVICE_HEARTBEAT:            'service.heartbeat',
    SERVICE_DEREGISTERED:         'service.deregistered',
    CAPABILITY_REGISTERED:        'service.capability.registered',
    CONTRACT_REGISTERED:          'service.contract.registered',

    // system.events
    POLICY_DENIED:                'system.policy.denied',
    AUDIT_RECORDED:               'system.audit.recorded',

    // stream.events (published by openre-stream + openvibe-live)
    STREAM_CREATED:               'stream.created',
    STREAM_STARTED:               'stream.started',
    STREAM_ENDED:                 'stream.ended',
    STREAM_INGEST_CONNECTED:      'stream.ingest.connected',
    STREAM_INGEST_DISCONNECTED:   'stream.ingest.disconnected',
    STREAM_OUTPUT_STARTED:        'stream.output.started',
    STREAM_OUTPUT_STOPPED:        'stream.output.stopped',
    STREAM_OUTPUT_FAILED:         'stream.output.failed',
    STREAM_MIRRORED_TO_LIVE:      'stream.mirrored_to_live',
    STREAM_VOD_ATTACHED:          'stream.vod.attached',
    STREAM_VOD_RECORDING_REQUESTED: 'stream.vod.recording.requested',

    // media.events (published by openvibe-media)
    MEDIA_UPLOAD_INITIALIZED:     'media.upload.initialized',
    MEDIA_UPLOADED:               'media.uploaded',
    MEDIA_PROCESSING_STARTED:     'media.processing.started',
    MEDIA_PROCESSING_COMPLETED:   'media.processing.completed',
    MEDIA_PROCESSING_FAILED:      'media.processing.failed',
    MEDIA_READY:                  'media.ready',
    MEDIA_DELETED:                'media.deleted',
    MEDIA_ARCHIVED:               'media.archived',
    MEDIA_RESTORED:               'media.restored',
    MEDIA_DERIVATIVE_CREATED:     'media.derivative.created',
    // lifecycle aliases used in earlier versions
    MEDIA_LIFECYCLE_PROMOTED:     'media.lifecycle.promoted',
    MEDIA_LIFECYCLE_DEMOTED:      'media.lifecycle.demoted',
    MEDIA_LIFECYCLE_ARCHIVED:     'media.lifecycle.archived',
    MEDIA_LIFECYCLE_RESTORED:     'media.lifecycle.restored',
    // vod/clip events
    VOD_CREATED:                  'vod.created',
    VOD_FINALIZED:                'vod.finalized',
    CLIP_CREATED:                 'clip.created',
    CLIP_MATERIALIZED:            'clip.materialized',

    // chat.events (published by openvibe-chat)
    CHAT_MESSAGE_SENT:            'chat.message.sent',
    CHAT_ROOM_JOINED:             'chat.room.joined',
    CHAT_ROOM_LEFT:               'chat.room.left',
    CHAT_USER_BANNED:             'chat.user.banned',
    CHAT_USER_UNBANNED:           'chat.user.unbanned',
    CHAT_MESSAGE_DELETED:         'chat.message.deleted',
    CHAT_SLOW_MODE_CHANGED:       'chat.slow_mode.changed',
    CHAT_EMOTE_ADDED:             'chat.emote.added',
    CHAT_EMOTE_REMOVED:           'chat.emote.removed',

    // community.events (published by openvibe-community)
    THREAD_CREATED:               'thread.created',
    THREAD_UPDATED:               'thread.updated',
    THREAD_VOTED:                 'thread.voted',
    THREAD_LOCKED:                'thread.locked',
    COMMENT_CREATED:              'comment.created',
    COMMENT_DELETED:              'comment.deleted',
    PASTE_CREATED:                'paste.created',
    PASTE_UPDATED:                'paste.updated',
    PASTE_DELETED:                'paste.deleted',
    DISCORD_MESSAGE_RECEIVED:     'discord.message.received',

    // billing events (published by openvibe-billing)
    BILLING_TIP_SENT:             'billing.tip.sent',
    VIP_SUBSCRIPTION_CREATED:     'vip.subscription.created',

    // ai events (published by openvibe-ai)
    AI_TRANSCRIPTION_READY:       'ai.transcription.ready',
    AI_SUMMARY_READY:             'ai.summary.ready',
});

const EVENT_TYPE_LIST = Object.freeze(Object.values(EVENT_TYPES));

function isKnownEventType(t) {
    return typeof t === 'string' && EVENT_TYPE_LIST.includes(t);
}

// Canonical alias map: non-canonical (legacy/variant) event names → canonical name.
// Import this in packages/openvibe-realtime and packages/openvibe-sdk instead of
// defining the map inline to keep a single source of truth.
const EVENT_ALIASES = Object.freeze({
    // stream aliases
    'stream.vod_attached':            EVENT_TYPES.STREAM_VOD_ATTACHED,
    'stream.ingest_connected':        EVENT_TYPES.STREAM_INGEST_CONNECTED,
    'stream.ingest_disconnected':     EVENT_TYPES.STREAM_INGEST_DISCONNECTED,
    // media aliases
    'media.upload_completed':         EVENT_TYPES.MEDIA_PROCESSING_COMPLETED,
    'media.upload.completed':         EVENT_TYPES.MEDIA_PROCESSING_COMPLETED,
    // chat aliases
    'chat.message.created':           EVENT_TYPES.CHAT_MESSAGE_SENT,
    'chat.message_created':           EVENT_TYPES.CHAT_MESSAGE_SENT,
    'chat.msg':                       EVENT_TYPES.CHAT_MESSAGE_SENT,
    // community aliases
    'community.thread.created':       EVENT_TYPES.THREAD_CREATED,
    'community.post.created':         EVENT_TYPES.COMMENT_CREATED,
    'community.paste.created':        EVENT_TYPES.PASTE_CREATED,
    // discord aliases
    'discord.message_created':        EVENT_TYPES.DISCORD_MESSAGE_RECEIVED,
    'discord.message.created':        EVENT_TYPES.DISCORD_MESSAGE_RECEIVED,
    // billing aliases
    'tips.tip.posted':                EVENT_TYPES.BILLING_TIP_SENT,
    'tips.tip.created':               EVENT_TYPES.BILLING_TIP_SENT,
});

module.exports = { EVENT_TYPES, EVENT_TYPE_LIST, isKnownEventType, EVENT_ALIASES };
