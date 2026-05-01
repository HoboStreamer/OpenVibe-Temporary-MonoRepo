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

    WORLD_CREATED:             'game.world.created',
    WORLD_UPDATED:             'game.world.updated',
    WORLD_SEEDED:              'game.world.seeded',
    WORLD_SNAPSHOT_CREATED:    'game.world.snapshot.created',
    WORLD_CHUNK_LOADED:        'game.world.chunk.loaded',
    WORLD_CHUNK_UNLOADED:      'game.world.chunk.unloaded',

    SESSION_STARTED:           'game.session.started',
    SESSION_ENDED:             'game.session.ended',
    PLAYER_JOINED:             'game.player.joined',
    PLAYER_LEFT:               'game.player.left',
    PLAYER_SPAWNED:            'game.player.spawned',
    PLAYER_RESPAWNED:          'game.player.respawned',
    PLAYER_MOVED:              'game.player.moved',
    PLAYER_DIED:               'game.player.died',
    PLAYER_LEVEL_UP:           'game.player.level_up',
    PLAYER_SKILL_XP_ADDED:     'game.player.skill_xp_added',

    ITEM_PICKED_UP:            'game.item.picked_up',
    ITEM_DROPPED:              'game.item.dropped',
    ITEM_EQUIPPED:             'game.item.equipped',
    ITEM_UNEQUIPPED:           'game.item.unequipped',
    ITEM_CRAFTED:              'game.item.crafted',
    ITEM_BROKEN:               'game.item.broken',

    RESOURCE_SPAWNED:          'game.resource.spawned',
    RESOURCE_GATHERED:         'game.resource.gathered',
    RESOURCE_DEPLETED:         'game.resource.depleted',
    RESOURCE_RESPAWNED:        'game.resource.respawned',

    COMBAT_STARTED:            'game.combat.started',
    COMBAT_HIT:                'game.combat.hit',
    COMBAT_MISSED:             'game.combat.missed',
    COMBAT_PROJECTILE_SPAWNED: 'game.combat.projectile.spawned',
    COMBAT_PROJECTILE_HIT:     'game.combat.projectile.hit',
    COMBAT_KILL:               'game.combat.kill',
    COMBAT_LOOT_GENERATED:     'game.combat.loot.generated',

    NPC_SPAWNED:               'game.npc.spawned',
    NPC_DIED:                  'game.npc.died',
    NPC_AGGRO:                 'game.npc.aggro',
    NPC_DROP_GENERATED:        'game.npc.drop.generated',
    BOSS_SPAWNED:              'game.boss.spawned',
    BOSS_DEFEATED:             'game.boss.defeated',

    STRUCTURE_PLACED:          'game.structure.placed',
    STRUCTURE_DAMAGED:         'game.structure.damaged',
    STRUCTURE_REPAIRED:        'game.structure.repaired',
    STRUCTURE_DESTROYED:       'game.structure.destroyed',
    STRUCTURE_DOOR_OPENED:     'game.structure.door_opened',
    STRUCTURE_DOOR_CLOSED:     'game.structure.door_closed',
    STRUCTURE_CLAIM_UPDATED:   'game.structure.claim.updated',

    FARM_SEED_PLANTED:         'game.farm.seed_planted',
    FARM_WATERED:              'game.farm.watered',
    FARM_HARVESTED:            'game.farm.harvested',

    TRAVEL_STARTED:            'game.travel.started',
    TRAVEL_COMPLETED:          'game.travel.completed',
    TRAVEL_BUS_USED:           'game.travel.bus_used',
    TRAVEL_BOAT_USED:          'game.travel.boat_used',
    MINIGAME_STARTED:          'game.minigame.started',
    MINIGAME_COMPLETED:        'game.minigame.completed',

    MOD_REGISTERED:            'game.mod.registered',
    MOD_UPDATED:               'game.mod.updated',
    MOD_ENABLED:               'game.mod.enabled',
    MOD_DISABLED:              'game.mod.disabled',
    MOD_ASSET_UPLOADED:        'game.mod.asset_uploaded',
    MOD_WORLD_PUBLISHED:       'game.mod.world_published',
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
