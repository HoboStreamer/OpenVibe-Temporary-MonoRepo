'use strict';

function normalizeGamemodeDescriptor(descriptor = {}) {
    const manifest = Object.assign({}, descriptor.manifest || {}, {
        id: String(descriptor.id || descriptor.manifest && descriptor.manifest.id || '').trim().toLowerCase(),
    });
    if (!manifest.id) throw new Error('gamemode id required');
    return {
        id: manifest.id,
        manifest,
        dirPath: descriptor.dirPath || null,
        shared: descriptor.shared || {},
        server: descriptor.server || {},
        client: descriptor.client || {},
        inheritance: {
            base: manifest.base ? String(manifest.base).trim().toLowerCase() : null,
        },
        entities: Object.assign({}, descriptor.shared && descriptor.shared.entities || {}, descriptor.server && descriptor.server.entities || {}),
        hooks: Object.assign({}, descriptor.shared && descriptor.shared.hooks || {}, descriptor.server && descriptor.server.hooks || {}, descriptor.client && descriptor.client.hooks || {}),
        ui: Object.assign({}, descriptor.shared && descriptor.shared.ui || {}, descriptor.client && descriptor.client.ui || {}),
    };
}

class GamemodeRegistry {
    constructor() {
        this.gamemodes = new Map();
        this.activeId = null;
    }

    Register(descriptor) {
        const normalized = normalizeGamemodeDescriptor(descriptor);
        this.gamemodes.set(normalized.id, normalized);
        if (!this.activeId) this.activeId = normalized.id;
        return this.Get(normalized.id);
    }

    Get(id) {
        const entry = this.gamemodes.get(String(id || '').trim().toLowerCase());
        return entry ? Object.assign({}, entry) : null;
    }

    List() {
        return Array.from(this.gamemodes.values())
            .map((entry) => Object.assign({}, entry))
            .sort((a, b) => a.id.localeCompare(b.id));
    }

    Activate(id) {
        const key = String(id || '').trim().toLowerCase();
        if (!this.gamemodes.has(key)) throw new Error(`unknown gamemode: ${key}`);
        this.activeId = key;
        return this.Get(key);
    }

    Active() {
        return this.activeId ? this.Get(this.activeId) : null;
    }
}

module.exports = {
    GamemodeRegistry,
    normalizeGamemodeDescriptor,
};
