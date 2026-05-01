'use strict';

const worldStore = require('../../realtime/world-store');

class WorldStateStore {
    list(options = {}) {
        return worldStore.listWorlds(options);
    }

    get(idOrSlug) {
        return worldStore.getWorld(idOrSlug);
    }

    upsert(payload) {
        return worldStore.upsertWorld(payload);
    }

    recordSnapshot(worldId, payload) {
        return worldStore.recordSnapshot(worldId, payload);
    }

    latestSnapshot(worldId) {
        return worldStore.latestSnapshot(worldId);
    }
}

module.exports = {
    WorldStateStore,
};
