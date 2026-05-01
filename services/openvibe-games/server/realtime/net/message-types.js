'use strict';

const CLIENT_MESSAGE_TYPES = Object.freeze({
    WORLD_JOIN: 'world:join',
    INPUT: 'input',
    CHAT_SEND: 'chat:send',
    CRAFT: 'craft',
    BUILD: 'build',
    TRAVEL: 'travel',
    PICKUP: 'pickup',
    RESPAWN: 'respawn',
    EDITOR_JOIN: 'editor:join',
    EDITOR_SAVE: 'editor:save',
});

const SERVER_MESSAGE_TYPES = Object.freeze({
    WORLD_JOINED: 'world:joined',
    SNAPSHOT: 'snapshot',
    CHAT_MESSAGE: 'chat:message',
    EVENT_FEED: 'event:feed',
    STATUS: 'status',
    ERROR: 'error',
    EDITOR_SNAPSHOT: 'editor:snapshot',
    EDITOR_SAVED: 'editor:saved',
});

module.exports = { CLIENT_MESSAGE_TYPES, SERVER_MESSAGE_TYPES };
