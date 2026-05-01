'use strict';

const model = require('../../model');

function mergeSourceVibeMetadata(player, patch = {}) {
    const metadata = Object.assign({}, player && player.metadata || {});
    metadata.sourcevibe = Object.assign({}, metadata.sourcevibe || {}, patch);
    return metadata;
}

class PlayerStateStore {
    ensure(userId, displayName) {
        return model.ensurePlayer(String(userId), displayName);
    }

    get(userId) {
        return model.getPlayer(String(userId));
    }

    setHotbar(userId, hotbar) {
        const player = this.ensure(userId);
        return model.upsertPlayer({
            user_id: String(userId),
            metadata: mergeSourceVibeMetadata(player, { hotbar: Array.isArray(hotbar) ? hotbar : [] }),
        });
    }

    setInventoryLayout(userId, layout) {
        const player = this.ensure(userId);
        return model.upsertPlayer({
            user_id: String(userId),
            metadata: mergeSourceVibeMetadata(player, { inventoryLayout: layout || null }),
        });
    }
}

module.exports = {
    PlayerStateStore,
};
