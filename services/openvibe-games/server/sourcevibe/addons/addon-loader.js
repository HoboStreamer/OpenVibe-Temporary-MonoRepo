'use strict';

const modRegistry = require('../../mods/registry');
const { listScriptRealms } = require('../../mods/manifest-schema');

function toAddonDescriptor(mod) {
    const manifest = mod && mod.manifest || {};
    return {
        id: mod && mod.slug || manifest.id,
        slug: mod && mod.slug || manifest.id,
        name: mod && mod.name || manifest.name || manifest.id,
        version: mod && mod.version || manifest.version || '0.0.0',
        engine_version: manifest.engine_version || 'sourcevibe-1',
        kind: manifest.kind || 'addon',
        description: manifest.description || '',
        trust_level: mod && mod.trust_level || 'untrusted',
        status: mod && mod.status || 'registered',
        enabled: !!(mod && mod.enabled),
        realms: listScriptRealms(manifest),
        assets: Array.isArray(mod && mod.assets) ? mod.assets : [],
        manifest,
    };
}

function createAddonLoader() {
    return {
        list() {
            return modRegistry.listMods().map((mod) => toAddonDescriptor(mod));
        },
        listEnabled(worldId) {
            return modRegistry.listEnabledMods(worldId, { includeAssets: true }).map((mod) => toAddonDescriptor(mod));
        },
        get(id) {
            const mod = modRegistry.getMod(id);
            return mod ? toAddonDescriptor(mod) : null;
        },
    };
}

module.exports = {
    createAddonLoader,
    toAddonDescriptor,
};
