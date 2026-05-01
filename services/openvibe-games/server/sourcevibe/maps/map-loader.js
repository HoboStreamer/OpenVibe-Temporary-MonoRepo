'use strict';

const path = require('path');
const { loadPngMap } = require('./png-map-loader');
const { buildCollisionLayer } = require('./collision-layer-loader');

function loadMapFile(filePath) {
    const manifest = require(filePath);
    const loaded = manifest.kind === 'png_map' ? loadPngMap(manifest) : manifest;
    loaded.collisionLayer = buildCollisionLayer(loaded);
    return loaded;
}

function createMapLoader({ sourcevibeRoot }) {
    const files = [
        path.join(sourcevibeRoot, 'maps', 'flatgrass.json'),
        path.join(sourcevibeRoot, 'gamemodes', '2dworld', 'maps', '2dworld_outpost.json'),
    ];

    return {
        loadBuiltins() {
            return files.map((filePath) => loadMapFile(filePath));
        },
    };
}

module.exports = {
    createMapLoader,
    loadMapFile,
};
