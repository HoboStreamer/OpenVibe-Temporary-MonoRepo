'use strict';

function canTravel(worldDefinition, fromZone, toZone) {
    return !!((worldDefinition && worldDefinition.travel) || []).find((link) => link.from === fromZone && link.to === toZone);
}

function spawnForZone(worldDefinition, zoneId) {
    const zone = ((worldDefinition && worldDefinition.zones) || []).find((entry) => entry.zone_id === zoneId);
    return zone && zone.spawn ? zone.spawn : { x: 4096, y: 4096 };
}

module.exports = { canTravel, spawnForZone };
