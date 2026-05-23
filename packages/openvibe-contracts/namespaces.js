'use strict';

// OpenVibe — user-module namespace registry.
//
// Each user has many namespaced modules. A namespace is owned by exactly one
// service. Writes to a namespace are permitted only to that owner service or
// to the user themself (with `user_writable` set). Reads follow `read_scope`.
//
//   read_scope: 'public'  -> any authenticated request
//                'self'    -> owning user only
//                'service' -> owner service + admin
//                'admin'   -> admin role only

const NAMESPACES = Object.freeze({
    // openvibe-network
    'identity.profile':                { owner: 'openvibe-network', read_scope: 'public', user_writable: true  },
    'identity.linked_accounts':        { owner: 'openvibe-network', read_scope: 'self',   user_writable: false },
    'openvibe.theme':                  { owner: 'openvibe-network', read_scope: 'self',   user_writable: true  },
    'control.notification_preferences':{ owner: 'openvibe-network', read_scope: 'self',   user_writable: true  },
    'control.launcher':                { owner: 'openvibe-network', read_scope: 'self',   user_writable: true  },
    'openvibe.favorites':              { owner: 'openvibe-network', read_scope: 'self',   user_writable: true  },

    // openvibe-live (HoboStreamer in the meantime)
    'live.profile':       { owner: 'openvibe-live',      read_scope: 'public',  user_writable: true  },
    'live.stats':         { owner: 'openvibe-live',      read_scope: 'public',  user_writable: false },
    'live.followers':     { owner: 'openvibe-live',      read_scope: 'public',  user_writable: false },

    // openvibe-chat
    'chat.preferences':   { owner: 'openvibe-chat',      read_scope: 'self',    user_writable: true  },

    // openvibe-community
    'community.profile':    { owner: 'openvibe-community', read_scope: 'public', user_writable: true  },
    'community.reputation': { owner: 'openvibe-community', read_scope: 'public', user_writable: false },

    // openvibe-billing
    'billing.wallet_snapshot': { owner: 'openvibe-billing', read_scope: 'self',  user_writable: false },

    // openvibe-games
    'games.progress':     { owner: 'openvibe-games',     read_scope: 'self',    user_writable: false },
    'games.inventory':    { owner: 'openvibe-games',     read_scope: 'self',    user_writable: false },

    // openvibe-tools (utility services usage stats)
    'tools.usage':        { owner: 'openvibe-tools',     read_scope: 'self',    user_writable: false },

    // openvibe-wiki
    'wiki.projects':      { owner: 'openvibe-wiki',      read_scope: 'public',  user_writable: true  },
});

function getNamespaceDef(ns) {
    return NAMESPACES[ns] || null;
}

// Mod-owned namespaces are validated dynamically because they aren't known at
// kernel build time. Convention: 'mod.<modId>.<scope>'.
function isModNamespace(ns) {
    return typeof ns === 'string' && /^mod\.[a-z0-9_-]+\./i.test(ns);
}

function parseModNamespace(ns) {
    const m = /^mod\.([a-z0-9_-]+)\.[a-z0-9_.-]+$/i.exec(String(ns || ''));
    return m ? { modId: m[1] } : null;
}

module.exports = { NAMESPACES, getNamespaceDef, isModNamespace, parseModNamespace };
