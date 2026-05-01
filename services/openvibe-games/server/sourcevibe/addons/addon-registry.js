'use strict';

const modRegistry = require('../../mods/registry');
const { createAddonLoader } = require('./addon-loader');

class AddonRegistry {
    constructor() {
        this.loader = createAddonLoader();
    }

    list() {
        return this.loader.list();
    }

    listEnabled(worldId) {
        return this.loader.listEnabled(worldId);
    }

    get(id) {
        return this.loader.get(id);
    }

    register({ manifest, ownerId }) {
        const mod = modRegistry.registerMod({ manifest, owner_id: ownerId || null });
        return this.loader.get(mod.id);
    }

    enable(worldId, addonId) {
        modRegistry.setEnabled(addonId, worldId, true);
        return this.listEnabled(worldId);
    }

    disable(worldId, addonId) {
        modRegistry.setEnabled(addonId, worldId, false);
        return this.listEnabled(worldId);
    }

    trust(addonId, trustLevel) {
        const mod = modRegistry.setTrustLevel(addonId, trustLevel);
        return this.loader.get(mod.id);
    }

    uploadAsset(payload) {
        return modRegistry.uploadAsset(payload);
    }

    summary(worldId) {
        const all = this.list();
        const enabled = worldId ? this.listEnabled(worldId) : [];
        return {
            total: all.length,
            enabled: enabled.length,
            trusted: all.filter((entry) => entry.trust_level === 'trusted').length,
            blocked: all.filter((entry) => entry.trust_level === 'blocked').length,
        };
    }
}

module.exports = {
    AddonRegistry,
};
