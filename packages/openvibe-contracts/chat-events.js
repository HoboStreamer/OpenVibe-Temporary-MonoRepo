'use strict';

// OpenVibe — chat event-type catalog. Every chat lifecycle event is published
// on the `chat.events` topic by openvibe-chat.
//
// Payload shape (additive — consumers MUST tolerate unknown keys):
//   { room_id, message_id?, call_id?, room_type?, sender_type?, sender_id?,
//     external_ref_type?, external_ref_id?, queue_id?, queue_type?, ... }

const CHAT_EVENT_TYPES = Object.freeze({
    ROOM_CREATED:           'chat.room.created',
    ROOM_UPDATED:           'chat.room.updated',
    ROOM_ARCHIVED:          'chat.room.archived',
    PARTICIPANT_JOINED:     'chat.participant.joined',
    PARTICIPANT_LEFT:       'chat.participant.left',
    PARTICIPANT_MUTED:      'chat.participant.muted',
    MESSAGE_CREATED:        'chat.message.created',
    MESSAGE_EDITED:         'chat.message.edited',
    MESSAGE_DELETED:        'chat.message.deleted',
    MESSAGE_MODERATED:      'chat.message.moderated',
    DM_CREATED:             'chat.dm.created',
    DM_READ:                'chat.dm.read',
    CALL_STARTED:           'chat.call.started',
    CALL_RINGING:           'chat.call.ringing',
    CALL_ACCEPTED:          'chat.call.accepted',
    CALL_DECLINED:          'chat.call.declined',
    CALL_ENDED:             'chat.call.ended',
    TTS_SETTINGS_UPDATED:   'chat.tts.settings.updated',
    TTS_QUEUED:             'chat.tts.queued',
    TTS_STARTED:            'chat.tts.started',
    TTS_COMPLETED:          'chat.tts.completed',
    TTS_SKIPPED:            'chat.tts.skipped',
    AUDIO_QUEUED:           'chat.audio.queued',
    AUDIO_STARTED:          'chat.audio.started',
    AUDIO_COMPLETED:        'chat.audio.completed',
    AUDIO_FAILED:           'chat.audio.failed',
});

const CHAT_EVENT_TYPE_LIST = Object.freeze(Object.values(CHAT_EVENT_TYPES));

function isChatEventType(t) {
    return typeof t === 'string' && CHAT_EVENT_TYPE_LIST.includes(t);
}

const CHAT_ROOM_TYPES = Object.freeze(['global', 'stream', 'channel', 'community', 'dm', 'group_dm', 'call', 'system']);
const CHAT_MESSAGE_TYPES = Object.freeze(['text', 'system', 'tts', 'soundboard', 'media_request', 'call_invite', 'tip_alert', 'moderation']);
const CHAT_PARTICIPANT_ROLES = Object.freeze(['owner', 'mod', 'speaker', 'participant', 'viewer', 'blocked']);
const CHAT_CALL_TYPES = Object.freeze(['voice', 'video', 'screen', 'mixed']);
const CHAT_CALL_STATUSES = Object.freeze(['pending', 'ringing', 'active', 'ended', 'missed', 'declined', 'failed']);
const CHAT_AUDIO_QUEUE_TYPES = Object.freeze(['tts', 'soundboard', 'media_request', 'alert', 'system']);
const CHAT_AUDIO_QUEUE_STATUSES = Object.freeze(['queued', 'playing', 'played', 'skipped', 'failed', 'cancelled']);
const CHAT_AUDIO_SOURCE_TYPES = Object.freeze(['chat', 'tip', 'manual', 'soundboard', 'external_url', 'media']);

function isChatRoomType(t)        { return CHAT_ROOM_TYPES.includes(t); }
function isChatMessageType(t)     { return CHAT_MESSAGE_TYPES.includes(t); }
function isChatParticipantRole(r) { return CHAT_PARTICIPANT_ROLES.includes(r); }
function isChatCallType(t)        { return CHAT_CALL_TYPES.includes(t); }
function isChatCallStatus(s)      { return CHAT_CALL_STATUSES.includes(s); }
function isChatAudioQueueType(t)  { return CHAT_AUDIO_QUEUE_TYPES.includes(t); }
function isChatAudioStatus(s)     { return CHAT_AUDIO_QUEUE_STATUSES.includes(s); }

function buildChatEventPayload(base, extra) {
    return Object.assign({}, base || {}, extra || {});
}

module.exports = {
    CHAT_EVENT_TYPES,
    CHAT_EVENT_TYPE_LIST,
    isChatEventType,
    CHAT_ROOM_TYPES,
    CHAT_MESSAGE_TYPES,
    CHAT_PARTICIPANT_ROLES,
    CHAT_CALL_TYPES,
    CHAT_CALL_STATUSES,
    CHAT_AUDIO_QUEUE_TYPES,
    CHAT_AUDIO_QUEUE_STATUSES,
    CHAT_AUDIO_SOURCE_TYPES,
    isChatRoomType,
    isChatMessageType,
    isChatParticipantRole,
    isChatCallType,
    isChatCallStatus,
    isChatAudioQueueType,
    isChatAudioStatus,
    buildChatEventPayload,
};
