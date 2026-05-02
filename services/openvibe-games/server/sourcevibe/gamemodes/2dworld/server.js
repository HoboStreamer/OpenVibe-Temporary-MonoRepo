'use strict';

const { STARTER_WORLD } = require('../../../realtime/catalog/starter-world');
const { WorldRoom } = require('../../../realtime/rooms/world-room');

function buildFeaturedServer({ realtime }) {
    const world = realtime && realtime.rootWorld ? realtime.rootWorld : {
        id: STARTER_WORLD.slug,
        slug: STARTER_WORLD.slug,
        name: STARTER_WORLD.name,
        metadata: {},
    };
    return {
        id: world.id,
        slug: world.slug,
        name: world.name,
        map: '2dworld_outpost',
        gamemode: '2dworld',
        route: '/2d-world?server=2d-world&gamemode=2dworld&launch=play',
        statusRoute: '/sourcevibe?gamemode=2dworld&view=diagnostics&panel=status',
        editorRoute: '/sourcevibe?gamemode=2dworld&view=editor',
        maxPlayers: 64,
        tags: ['official', 'flagship', '2dworld'],
        metadata: Object.assign({ description: 'Official flagship SourceVibe 2D World server.' }, world.metadata || {}),
    };
}

module.exports = {
    createRoom(options = {}) {
        return new WorldRoom({
            world: options.world,
            worldDefinition: options.worldDefinition || STARTER_WORLD,
            catalog: options.catalog,
            publish: options.publish,
            emitToSocket: options.emitToSocket,
            tickRate: options.tickRate,
        });
    },
    buildFeaturedServer,
    hooks: {
        ResolveDefaultMap() {
            return '2dworld_outpost';
        },
    },
};
