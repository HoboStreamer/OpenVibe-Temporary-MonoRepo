'use strict';

module.exports = {
    buildPlayerState(actor = {}) {
        return {
            userId: actor.id || null,
            displayName: actor.display_name || actor.displayName || 'Player',
            role: actor.role || 'user',
        };
    },
    hooks: {
        GetServerDescription(engine) {
            return `${engine.summary().name} running ${engine.activeGamemode().manifest.name}`;
        },
    },
};
