'use strict';

const { STARTER_WORLD } = require('../../realtime/catalog/starter-world');

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
        route: '/2d-world',
        statusRoute: '/2d-world/status',
        editorRoute: '/2d-world/editor',
        maxPlayers: 64,
        tags: ['official', 'flagship', '2dworld'],
        metadata: Object.assign({ description: 'Official flagship SourceVibe 2D World server.' }, world.metadata || {}),
    };
}

module.exports = {
    buildFeaturedServer,
    hooks: {
        ResolveDefaultMap() {
            return '2dworld_outpost';
        },
    },
};
