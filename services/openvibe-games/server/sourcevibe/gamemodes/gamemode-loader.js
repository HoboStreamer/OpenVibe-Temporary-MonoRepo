'use strict';

const path = require('path');

function safeRequire(filePath) {
    try {
        return require(filePath);
    } catch (error) {
        if (error && error.code === 'MODULE_NOT_FOUND' && error.message.includes(filePath)) return {};
        throw error;
    }
}

function loadGamemodeFromDirectory(dirPath) {
    const manifest = require(path.join(dirPath, 'manifest.json'));
    const shared = safeRequire(path.join(dirPath, 'shared.js'));
    const server = safeRequire(path.join(dirPath, 'server.js'));
    const client = safeRequire(path.join(dirPath, 'client.js'));
    return {
        id: manifest.id,
        manifest,
        dirPath,
        shared,
        server,
        client,
    };
}

function createGamemodeLoader({ sourcevibeRoot }) {
    const builtinDirs = [
        path.join(sourcevibeRoot, 'gamemodes', 'base'),
        path.join(sourcevibeRoot, 'gamemodes', '2dworld'),
    ];

    return {
        loadBuiltinGamemodes() {
            return builtinDirs.map((dirPath) => loadGamemodeFromDirectory(dirPath));
        },
        registerBuiltins({ gamemodeRegistry, entityRegistry }) {
            const loaded = this.loadBuiltinGamemodes();
            for (const descriptor of loaded) {
                const registered = gamemodeRegistry.Register(descriptor);
                const entities = Object.assign({}, registered.shared && registered.shared.entities || {}, registered.server && registered.server.entities || {}, registered.entities || {});
                for (const [className, definition] of Object.entries(entities)) entityRegistry.Register(className, definition);
            }
            return gamemodeRegistry.List();
        },
    };
}

module.exports = {
    createGamemodeLoader,
    loadGamemodeFromDirectory,
};
