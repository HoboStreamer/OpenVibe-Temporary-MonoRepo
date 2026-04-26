'use strict';

// OpenVibe — well-known capability ids. A capability is a versioned, owned,
// permissioned action that any service or mod may invoke through the platform
// rather than calling a sibling service's private endpoint directly.
//
// These constants are the seed list — services register the canonical record
// (with input/output schema and policy) at boot via the SDK.

const CAPABILITIES = Object.freeze({
    // chat
    CHAT_ROOM_CREATE:     'chat.room.create',
    CHAT_ROOM_JOIN:       'chat.room.join',
    CHAT_ROOM_LEAVE:      'chat.room.leave',
    CHAT_SEND_MESSAGE:    'chat.message.send',
    CHAT_EDIT_MESSAGE:    'chat.message.edit',
    CHAT_DELETE_MESSAGE:  'chat.message.delete',
    CHAT_DM_OPEN:         'chat.dm.open',
    CHAT_START_CALL:      'chat.call.start',
    CHAT_CALL_SIGNAL:     'chat.call.signal',
    CHAT_END_CALL:        'chat.call.end',
    CHAT_TTS_SETTINGS_UPDATE: 'chat.tts.settings.update',
    CHAT_ENQUEUE_TTS:     'chat.tts.enqueue',
    CHAT_TTS_SKIP:        'chat.tts.skip',
    CHAT_TTS_CLEAR:       'chat.tts.clear',
    CHAT_AUDIO_ENQUEUE:   'chat.audio.enqueue',
    CHAT_AUDIO_SKIP:      'chat.audio.skip',
    CHAT_AUDIO_CLEAR:     'chat.audio.clear',
    CHAT_OVERLAY_RENDER:  'chat.overlay.render',

    // tips / billing
    TIPS_CREATE_ALERT:    'tips.create_alert',
    BILLING_CHARGE_CREDITS:  'billing.charge_credits',
    BILLING_CREATE_SUBSCRIPTION: 'billing.create_subscription',

    // media
    MEDIA_UPLOAD_INIT:    'media.upload_init',
    MEDIA_ATTACH_TO_ENTITY: 'media.attach_to_entity',

    // community
    COMMUNITY_SPACE_CREATE:    'community.space.create',
    COMMUNITY_CATEGORY_CREATE: 'community.category.create',
    COMMUNITY_THREAD_CREATE:   'community.thread.create',
    COMMUNITY_THREAD_LOCK:     'community.thread.lock',
    COMMUNITY_CREATE_POST:     'community.post.create',
    COMMUNITY_DELETE_POST:     'community.post.delete',
    COMMUNITY_COMMENT_ATTACH:  'community.comment.attach',
    COMMUNITY_CREATE_PASTE:    'community.paste.create',
    COMMUNITY_UPDATE_PASTE:    'community.paste.update',
    COMMUNITY_DISCORD_RELAY_CONFIGURE: 'community.discord.relay.configure',
    COMMUNITY_DISCORD_MESSAGE_IMPORT:  'community.discord.message.import',

    // ai-driven content
    WIKI_GENERATE_SPACE:  'wiki.generate_space',
    BLOG_PUBLISH_POST:    'blog.publish_post',

    // games
    GAMES_CREATE_WORLD:   'games.create_world',
});

const CAPABILITY_LIST = Object.freeze(Object.values(CAPABILITIES));

function isKnownCapability(id) {
    return typeof id === 'string' && CAPABILITY_LIST.includes(id);
}

module.exports = { CAPABILITIES, CAPABILITY_LIST, isKnownCapability };
