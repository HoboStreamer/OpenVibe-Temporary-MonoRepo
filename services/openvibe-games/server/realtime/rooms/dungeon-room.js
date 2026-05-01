'use strict';

const { WorldRoom } = require('./world-room');

class DungeonRoom extends WorldRoom {
    constructor(options) {
        super(options);
        this.kind = 'dungeon';
    }
}

module.exports = { DungeonRoom };
