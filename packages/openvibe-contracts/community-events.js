'use strict';

// OpenVibe — community event-type catalog. Every community lifecycle event is
// published on the `community.events` topic by openvibe-community.

const COMMUNITY_EVENT_TYPES = Object.freeze({
    SPACE_CREATED:          'community.space.created',
    SPACE_UPDATED:          'community.space.updated',
    SPACE_ARCHIVED:         'community.space.archived',
    CATEGORY_CREATED:       'community.category.created',
    CATEGORY_UPDATED:       'community.category.updated',
    THREAD_CREATED:         'community.thread.created',
    THREAD_UPDATED:         'community.thread.updated',
    THREAD_LOCKED:          'community.thread.locked',
    THREAD_ARCHIVED:        'community.thread.archived',
    POST_CREATED:           'community.post.created',
    POST_UPDATED:           'community.post.updated',
    POST_DELETED:           'community.post.deleted',
    COMMENT_CREATED:        'community.comment.created',
    PASTE_CREATED:          'community.paste.created',
    PASTE_UPDATED:          'community.paste.updated',
    PASTE_DELETED:          'community.paste.deleted',
    DISCORD_RELAY_CREATED:  'community.discord.relay.created',
    DISCORD_RELAY_UPDATED:  'community.discord.relay.updated',
    DISCORD_MESSAGE_IMPORTED:'community.discord.message.imported',
    DISCORD_MESSAGE_RELAYED: 'community.discord.message.relayed',
    DISCORD_MESSAGE_UPDATED: 'community.discord.message.updated',
    DISCORD_MESSAGE_DELETED: 'community.discord.message.deleted',
    // Phase 16
    PASTE_VERSION_CREATED:   'community.paste.version_created',
    DISCORD_RELAY_AUDITED:   'community.discord.relay_audited',
    DISCORD_OUTBOUND_RELAYED:'community.discord.outbound_relayed',
});

const COMMUNITY_EVENT_TYPE_LIST = Object.freeze(Object.values(COMMUNITY_EVENT_TYPES));

function isCommunityEventType(t) {
    return typeof t === 'string' && COMMUNITY_EVENT_TYPE_LIST.includes(t);
}

const COMMUNITY_THREAD_TYPES = Object.freeze(['discussion', 'question', 'announcement', 'paste', 'discord_relay', 'system']);
const COMMUNITY_THREAD_STATUSES = Object.freeze(['open', 'locked', 'archived', 'deleted']);
const COMMUNITY_VISIBILITIES = Object.freeze(['public', 'unlisted', 'private', 'restricted']);
const COMMUNITY_BODY_FORMATS = Object.freeze(['markdown', 'plain', 'html_sanitized', 'code']);
const COMMUNITY_POST_SOURCE_TYPES = Object.freeze(['openvibe', 'discord', 'legacy_paste', 'legacy_comment', 'system']);
const COMMUNITY_RELAY_DIRECTIONS = Object.freeze(['discord_to_openvibe', 'openvibe_to_discord', 'bidirectional']);

function isCommunityThreadType(t)   { return COMMUNITY_THREAD_TYPES.includes(t); }
function isCommunityThreadStatus(s) { return COMMUNITY_THREAD_STATUSES.includes(s); }
function isCommunityVisibility(v)   { return COMMUNITY_VISIBILITIES.includes(v); }
function isCommunityBodyFormat(b)   { return COMMUNITY_BODY_FORMATS.includes(b); }
function isCommunityPostSource(s)   { return COMMUNITY_POST_SOURCE_TYPES.includes(s); }
function isCommunityRelayDirection(d){ return COMMUNITY_RELAY_DIRECTIONS.includes(d); }

function buildCommunityEventPayload(base, extra) {
    return Object.assign({}, base || {}, extra || {});
}

module.exports = {
    COMMUNITY_EVENT_TYPES,
    COMMUNITY_EVENT_TYPE_LIST,
    isCommunityEventType,
    COMMUNITY_THREAD_TYPES,
    COMMUNITY_THREAD_STATUSES,
    COMMUNITY_VISIBILITIES,
    COMMUNITY_BODY_FORMATS,
    COMMUNITY_POST_SOURCE_TYPES,
    COMMUNITY_RELAY_DIRECTIONS,
    isCommunityThreadType,
    isCommunityThreadStatus,
    isCommunityVisibility,
    isCommunityBodyFormat,
    isCommunityPostSource,
    isCommunityRelayDirection,
    buildCommunityEventPayload,
};
