'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const DEFAULT_SERVICE_DB_PATHS = {
    network: path.join(ROOT, 'services', 'openvibe-network', 'data', 'openvibe-network.db'),
    events: path.join(ROOT, 'services', 'openvibe-events', 'data', 'openvibe-events.db'),
    media: path.join(ROOT, 'services', 'openvibe-media', 'data', 'openvibe-media.db'),
    billing: path.join(ROOT, 'services', 'openvibe-billing', 'data', 'openvibe-billing.db'),
    restream: path.join(ROOT, 'services', 'openre-stream', 'data', 'openre-stream.db'),
    live: path.join(ROOT, 'services', 'openvibe-live', 'data', 'openvibe-live.db'),
    chat: path.join(ROOT, 'services', 'openvibe-chat', 'data', 'openvibe-chat.db'),
    community: path.join(ROOT, 'services', 'openvibe-community', 'data', 'openvibe-community.db'),
    ai: path.join(ROOT, 'services', 'openvibe-ai', 'data', 'openvibe-ai.db'),
};

function resolveServiceDbPaths(overrides) {
    const next = { ...DEFAULT_SERVICE_DB_PATHS };
    for (const [key, value] of Object.entries(overrides || {})) {
        if (value) {
            next[key] = path.resolve(value);
        }
    }
    return next;
}

module.exports = {
    ROOT,
    DEFAULT_SERVICE_DB_PATHS,
    resolveServiceDbPaths,
};
