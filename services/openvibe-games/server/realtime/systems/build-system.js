'use strict';

const { aabbIntersects } = require('../engine/collision');

function structureAabb(x, y, size = 48) {
    return { x: x - size / 2, y: y - size / 2, w: size, h: size };
}

function canPlaceStructure({ x, y, size = 48, bounds, structures = [], zone_id }) {
    if (!bounds || x < bounds.x || y < bounds.y || x > bounds.x + bounds.w || y > bounds.y + bounds.h) {
        return { ok: false, reason: 'out of bounds' };
    }
    if (zone_id !== 'wilderness' && zone_id !== 'farm_island') {
        return { ok: false, reason: 'building only allowed in wilderness or farm island' };
    }
    const next = structureAabb(x, y, size);
    for (const structure of structures) {
        if (structure.zone_id && structure.zone_id !== zone_id) continue;
        if (aabbIntersects(next, structureAabb(structure.x, structure.y, structure.size || 48))) {
            return { ok: false, reason: 'collides with existing structure' };
        }
    }
    return { ok: true };
}

module.exports = { structureAabb, canPlaceStructure };
