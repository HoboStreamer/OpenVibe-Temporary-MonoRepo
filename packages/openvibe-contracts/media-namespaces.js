'use strict';

// OpenVibe — media namespace registry.
//
// Every media object lives in exactly one namespace owned by exactly one
// service. Writes require either the owner service, an admin, or — when
// `user_writable` is true — the owning user themself. Reads follow
// `read_scope` (`public` | `self` | `service` | `admin`). The `default_visibility`
// is applied when the upload init request omits visibility.
//
// Mod-owned namespaces follow the convention `mod.<modId>.<scope>` and are
// validated dynamically (see isModMediaNamespace below).

const MEDIA_NAMESPACES = Object.freeze({
    // openvibe-live (HoboStreamer source)
    'live.vods':              { owner: 'openvibe-live',      read_scope: 'public', user_writable: false, default_visibility: 'public',  default_storage_tier: 'warm' },
    'live.clips':             { owner: 'openvibe-live',      read_scope: 'public', user_writable: false, default_visibility: 'public',  default_storage_tier: 'warm' },
    'live.thumbnails':        { owner: 'openvibe-live',      read_scope: 'public', user_writable: false, default_visibility: 'public',  default_storage_tier: 'hot'  },
    'live.stream_snapshots':  { owner: 'openre-stream',      read_scope: 'public', user_writable: false, default_visibility: 'public',  default_storage_tier: 'hot'  },
    'live.media_requests':    { owner: 'openvibe-live',      read_scope: 'public', user_writable: true,  default_visibility: 'public',  default_storage_tier: 'warm' },

    // openvibe-community
    'community.pastes':       { owner: 'openvibe-community', read_scope: 'public', user_writable: true,  default_visibility: 'public',  default_storage_tier: 'warm' },
    'community.attachments':  { owner: 'openvibe-community', read_scope: 'public', user_writable: true,  default_visibility: 'public',  default_storage_tier: 'warm' },

    // openvibe-chat
    'chat.attachments':       { owner: 'openvibe-chat',      read_scope: 'public',     user_writable: true,  default_visibility: 'unlisted', default_storage_tier: 'hot'  },
    'chat.tts_audio':         { owner: 'openvibe-chat',      read_scope: 'public',     user_writable: false, default_visibility: 'unlisted', default_storage_tier: 'hot'  },

    // user-owned (writable by user themselves)
    'user.profile_images':    { owner: 'openvibe-network',   read_scope: 'public', user_writable: true,  default_visibility: 'public',  default_storage_tier: 'hot'  },

    // openvibe-tools (per-tool generated images, e.g. badges/thumbnails)
    'tools.images':           { owner: 'openvibe-tools',     read_scope: 'public', user_writable: false, default_visibility: 'public',  default_storage_tier: 'warm' },

    // openvibe-games
    'games.assets':           { owner: 'openvibe-games',     read_scope: 'public', user_writable: false, default_visibility: 'public',  default_storage_tier: 'warm' },

    // openvibe-wiki / blog
    'wiki.assets':            { owner: 'openvibe-wiki',      read_scope: 'public', user_writable: true,  default_visibility: 'public',  default_storage_tier: 'warm' },
    'blog.assets':            { owner: 'openvibe-blog',      read_scope: 'public', user_writable: false, default_visibility: 'public',  default_storage_tier: 'warm' },
});

function getMediaNamespaceDef(ns) {
    return MEDIA_NAMESPACES[ns] || null;
}

// Mod media namespaces follow `mod.<modId>.assets` (or any further suffix).
function isModMediaNamespace(ns) {
    return typeof ns === 'string' && /^mod\.[a-z0-9_-]+\.[a-z0-9_.-]+$/i.test(ns);
}

function parseModMediaNamespace(ns) {
    const m = /^mod\.([a-z0-9_-]+)\.[a-z0-9_.-]+$/i.exec(String(ns || ''));
    return m ? { modId: m[1] } : null;
}

const MEDIA_TYPES        = Object.freeze(['image', 'video', 'audio', 'file', 'vod', 'clip', 'thumbnail', 'attachment']);
const MEDIA_STATUSES     = Object.freeze(['initialized', 'uploading', 'uploaded', 'processing', 'ready', 'failed', 'archived', 'deleted']);
const MEDIA_VISIBILITIES = Object.freeze(['public', 'private', 'restricted', 'unlisted']);
const MEDIA_TIERS        = Object.freeze(['hot', 'warm', 'cold']);
const MEDIA_OWNER_TYPES  = Object.freeze(['user', 'service', 'mod', 'system']);

function isMediaType(t)       { return MEDIA_TYPES.includes(t); }
function isMediaStatus(s)     { return MEDIA_STATUSES.includes(s); }
function isMediaVisibility(v) { return MEDIA_VISIBILITIES.includes(v); }
function isMediaTier(t)       { return MEDIA_TIERS.includes(t); }
function isMediaOwnerType(t)  { return MEDIA_OWNER_TYPES.includes(t); }

module.exports = {
    MEDIA_NAMESPACES,
    getMediaNamespaceDef,
    isModMediaNamespace,
    parseModMediaNamespace,
    MEDIA_TYPES,
    MEDIA_STATUSES,
    MEDIA_VISIBILITIES,
    MEDIA_TIERS,
    MEDIA_OWNER_TYPES,
    isMediaType,
    isMediaStatus,
    isMediaVisibility,
    isMediaTier,
    isMediaOwnerType,
};
