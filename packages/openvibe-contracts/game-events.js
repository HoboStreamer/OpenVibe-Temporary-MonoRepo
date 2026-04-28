'use strict';

// OpenVibe — game event-type catalog. Every gameplay and canvas lifecycle
// event emitted by openvibe-games is published on `game.events`.

const GAME_EVENT_TYPES = Object.freeze({
    PLAYER_UPSERTED:       'game.player.upserted',
    INVENTORY_UPDATED:     'game.inventory.updated',
    BANK_UPDATED:          'game.bank.updated',
    STRUCTURE_CREATED:     'game.structure.created',
    FARM_UPDATED:          'game.farm.updated',
    ACHIEVEMENT_UNLOCKED:  'game.achievement.unlocked',
    COSMETIC_UPDATED:      'game.cosmetic.updated',
    DAILY_QUEST_CLAIMED:   'game.daily_quest.claimed',
    CANVAS_TILE_PLACED:    'game.canvas.tile.placed',
    CANVAS_REGION_CREATED: 'game.canvas.region.created',
    CANVAS_REGION_REMOVED: 'game.canvas.region.removed',
    CANVAS_BAN_CREATED:    'game.canvas.ban.created',
    CANVAS_BAN_REMOVED:    'game.canvas.ban.removed',
});

const GAME_EVENT_TYPE_LIST = Object.freeze(Object.values(GAME_EVENT_TYPES));

function isGameEventType(type) {
    return typeof type === 'string' && GAME_EVENT_TYPE_LIST.includes(type);
}

function buildGameEventPayload(base, extra) {
    return Object.assign({}, base || {}, extra || {});
}

module.exports = {
    GAME_EVENT_TYPES,
    GAME_EVENT_TYPE_LIST,
    isGameEventType,
    buildGameEventPayload,
};
