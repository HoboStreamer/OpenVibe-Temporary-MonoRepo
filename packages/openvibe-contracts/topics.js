'use strict';

// OpenVibe — well-known event topics. Each topic is owned by exactly one
// kernel concern and is the canonical fan-out point for that concern.
//
// Adding a new topic? Also add a contract for its envelope schema in
// services/openvibe-network so consumers can introspect it.

const TOPICS = Object.freeze({
    AUTH:      'auth.events',
    USER:      'user.events',
    SERVICE:   'service.events',
    STREAM:    'stream.events',
    CHAT:      'chat.events',
    COMMUNITY: 'community.events',
    MEDIA:     'media.events',
    BILLING:   'billing.events',
    AI:        'ai.events',
    SEO:       'seo.events',
    CONTENT:   'content.events',
    SEARCH:    'search.events',
    GAME:      'game.events',
    MOD:       'mod.events',
    SYSTEM:    'system.events',
});

const TOPIC_LIST = Object.freeze(Object.values(TOPICS));

function isKnownTopic(topic) {
    return typeof topic === 'string' && TOPIC_LIST.includes(topic);
}

module.exports = { TOPICS, TOPIC_LIST, isKnownTopic };
