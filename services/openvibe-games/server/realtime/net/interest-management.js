'use strict';

const { distanceSq } = require('../engine/vector');

function visibleWithinAoi(origin, entities, radius, options = {}) {
    const maxDistanceSq = radius * radius;
    const zoneId = options.zone_id || null;
    return (entities || []).filter((entity) => {
        if (!entity) return false;
        if (zoneId && entity.zone_id && entity.zone_id !== zoneId) return false;
        return distanceSq(origin, entity) <= maxDistanceSq;
    });
}

function chunkIdFor(x, y, chunkSize) {
    return `${Math.floor(x / chunkSize)}:${Math.floor(y / chunkSize)}`;
}

function chunksAround(x, y, radius, chunkSize) {
    const minX = Math.floor((x - radius) / chunkSize);
    const maxX = Math.floor((x + radius) / chunkSize);
    const minY = Math.floor((y - radius) / chunkSize);
    const maxY = Math.floor((y + radius) / chunkSize);
    const chunks = [];
    for (let cx = minX; cx <= maxX; cx += 1) {
        for (let cy = minY; cy <= maxY; cy += 1) chunks.push(`${cx}:${cy}`);
    }
    return chunks;
}

module.exports = { visibleWithinAoi, chunkIdFor, chunksAround };
