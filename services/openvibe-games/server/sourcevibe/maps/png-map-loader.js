'use strict';

function loadPngMap(manifest = {}) {
    return Object.assign({
        kind: 'png_map',
        layers: {},
        collision: { solids: [] },
    }, manifest);
}

module.exports = {
    loadPngMap,
};
