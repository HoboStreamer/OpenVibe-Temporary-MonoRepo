'use strict';

const CHANNELS = Object.freeze({
    RELIABLE: 'reliable',
    UNRELIABLE: 'unreliable',
    SNAPSHOT: 'snapshot',
    COMMAND: 'command',
    EVENT: 'event',
});

module.exports = {
    CHANNELS,
};
