'use strict';

function buildCollisionLayer(map = {}) {
    const solids = Array.isArray(map.collision && map.collision.solids) ? map.collision.solids.slice() : [];
    return {
        solids,
        isSolid(x, y) {
            return solids.some((entry) => (
                Number(x) >= Number(entry.x) &&
                Number(x) <= Number(entry.x) + Number(entry.width) &&
                Number(y) >= Number(entry.y) &&
                Number(y) <= Number(entry.y) + Number(entry.height)
            ));
        },
    };
}

module.exports = {
    buildCollisionLayer,
};
