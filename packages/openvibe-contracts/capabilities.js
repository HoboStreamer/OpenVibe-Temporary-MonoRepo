'use strict';

// OpenVibe — well-known capability ids. A capability is a versioned, owned,
// permissioned action that any service or mod may invoke through the platform
// rather than calling a sibling service's private endpoint directly.
//
// These constants are the seed list — services register the canonical record
// (with input/output schema and policy) at boot via the SDK.

const CAPABILITIES = Object.freeze({
    // chat
    CHAT_SEND_MESSAGE:    'chat.send_message',
    CHAT_START_CALL:      'chat.start_call',
    CHAT_ENQUEUE_TTS:     'chat.enqueue_tts',

    // tips / billing
    TIPS_CREATE_ALERT:    'tips.create_alert',
    BILLING_CHARGE_CREDITS:  'billing.charge_credits',
    BILLING_CREATE_SUBSCRIPTION: 'billing.create_subscription',

    // media
    MEDIA_UPLOAD_INIT:    'media.upload_init',
    MEDIA_ATTACH_TO_ENTITY: 'media.attach_to_entity',

    // community
    COMMUNITY_CREATE_POST:  'community.create_post',
    COMMUNITY_CREATE_PASTE: 'community.create_paste',

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
