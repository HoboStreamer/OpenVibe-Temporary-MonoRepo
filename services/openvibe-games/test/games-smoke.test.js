'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-games-test-')), 'games.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_GAMES_CANVAS_TILE_COOLDOWN_SECONDS = '0';
process.env.OPENVIBE_GAMES_CANVAS_PLACEMENTS_PER_MINUTE = '60';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const policy = require('../server/policy');
const { STARTER_WORLD } = require('../server/realtime/data/starter-world');
const { WorldRoom } = require('../server/realtime/rooms/world-room');

const player = model.upsertPlayer({
    user_id: '42',
    display_name: 'Questor',
    coins: 120,
    mining_xp: 500,
    fishing_xp: 250,
    combat_xp: 1000,
});
assert.strictEqual(player.user_id, '42');
assert.ok(player.total_level >= 8);

const updated = model.upsertPlayer({ user_id: '42', coins: 180, zone: 'deepwoods' });
assert.strictEqual(updated.coins, 180);
assert.strictEqual(updated.zone, 'deepwoods');

model.addInventoryItem({ user_id: '42', item_id: 'log.oak', quantity: 12 });
assert.strictEqual(model.listInventory('42')[0].item_id, 'log.oak');
let bankResult = model.bankDeposit('42', 'log.oak', 5);
assert.strictEqual(bankResult.bank[0].quantity, 5);
assert.strictEqual(bankResult.inventory[0].quantity, 7);
bankResult = model.bankWithdraw('42', 'log.oak', 2);
assert.strictEqual(bankResult.bank[0].quantity, 3);
assert.strictEqual(bankResult.inventory[0].quantity, 9);

const structure = model.createStructure({ type: 'campfire', owner_id: '42', x: 12, y: 20, data: { warmth: 5 } });
assert.ok(String(structure.id).startsWith('structure_'));
assert.strictEqual(model.listStructures({ owner_id: '42' }).length, 1);

const plots = model.listFarmPlots('42');
assert.strictEqual(plots.length, 6);
const plot = model.upsertFarmPlot({ user_id: '42', plot_index: 0, seed_id: 'seed.turnip', stage: 'growing' });
assert.strictEqual(plot.seed_id, 'seed.turnip');

const achievement = model.unlockAchievement({ user_id: '42', achievement_id: 'first-camp', title: 'First Camp' });
assert.strictEqual(achievement.achievement_id, 'first-camp');
assert.strictEqual(model.listAchievements('42').length, 1);

const cosmetic = model.upsertCosmetic({ user_id: '42', slot: 'hat', item_id: 'wizard-hat', equipped: true, source: 'quest' });
assert.strictEqual(cosmetic.item_id, 'wizard-hat');
assert.strictEqual(model.listCosmetics('42')[0].equipped, true);

let quests = model.listDailyQuests('42');
assert.strictEqual(quests.length, 3);
model.incrementDailyQuestProgress('42', 'canvas-placements', 5);
model.incrementDailyQuestProgress('42', 'stockpile-items', 10);
const claimed = model.claimDailyQuest('42', 'canvas-placements');
assert.strictEqual(claimed.quest.quest_id, 'canvas-placements');
assert.ok(claimed.player.coins >= 205);

const canvasState = model.getCanvasState({ type: 'user', id: '42', username: 'Questor' }, '127.0.0.1');
assert.strictEqual(canvasState.board.width, 128);
const place = model.placeCanvasTile({ actor: { type: 'user', id: '42', username: 'Questor' }, ip_address: '127.0.0.1', x: 4, y: 7, color_index: 3 });
assert.strictEqual(place.tile.x, 4);
assert.strictEqual(place.tile.color_index, 3);
assert.strictEqual(model.listCanvasTiles().length, 1);

const region = model.createCanvasRegion({ label: 'Spawn', x1: 10, y1: 10, x2: 12, y2: 12, reason: 'spawn lock', created_by: 'admin:1' });
assert.ok(region.id >= 1);
assert.strictEqual(model.listCanvasRegions().length, 1);
model.removeCanvasRegion(region.id);
assert.strictEqual(model.listCanvasRegions().length, 0);

const ban = model.createCanvasBan({ user_id: '99', reason: 'griefing', created_by: 'admin:1' });
assert.ok(ban.id >= 1);
assert.strictEqual(model.listCanvasBans().length, 1);
model.removeCanvasBan(ban.id);
assert.strictEqual(model.listCanvasBans().length, 0);

model.recordLegacyMap({ source: 'hoboquest', kind: 'player', legacy_id: '42', new_id: '42' });
assert.strictEqual(model.lookupLegacy('hoboquest', 'player', '42').new_id, '42');

const reqOwner = { user: { sub: '42', role: 'user' } };
const reqOther = { user: { sub: '9', role: 'user' } };
const reqAdmin = { user: { sub: '1', role: 'admin' } };
const reqService = { serviceActor: 'openvibe-media' };
assert.strictEqual(policy.decidePlayerWrite({ req: reqOwner, userId: '42' }).allow, true);
assert.strictEqual(policy.decideInventoryRead({ req: reqOther, userId: '42' }).allow, false);
assert.strictEqual(policy.decideCanvasModeration({ req: reqAdmin }).allow, true);
assert.strictEqual(policy.decideCanvasModeration({ req: reqService }).allow, true);

const leaderboard = model.listLeaderboard('coins', 5);
assert.strictEqual(leaderboard[0].user_id, '42');

const shopper = model.upsertPlayer({
    user_id: 'shopper',
    display_name: 'Quartermaster Fan',
    coins: 100,
    zone: 'outpost',
    x: 4160,
    y: 4032,
});
assert.strictEqual(shopper.coins, 100);

const room = new WorldRoom({
    world: { id: 'world:test:2d-world', slug: STARTER_WORLD.slug, name: STARTER_WORLD.name },
    worldDefinition: STARTER_WORLD,
    publish: () => {},
    emitToSocket: () => {},
    tickRate: 20,
});

room.join({
    socketId: 'socket-shopper',
    userId: 'shopper',
    displayName: 'Quartermaster Fan',
    zoneId: 'outpost',
});

const roomPlayer = room.players.get('socket-shopper');
roomPlayer.x = 4160;
roomPlayer.y = 4032;
roomPlayer.zone_id = 'outpost';

const promptSnapshot = room.buildSnapshotForPlayer(roomPlayer, Date.now());
assert.ok(promptSnapshot.interaction.prompt);
assert.ok(promptSnapshot.interaction.prompt.label.includes('Browse tools and starter weapons'));

const interactNow = Date.now();
const interactResult = room.receiveInput('socket-shopper', {
    seq: 1,
    dt: 0.05,
    sent_at: interactNow,
    keys: {},
    aim: { x: 4168, y: 4028 },
    action: 'interact',
});
assert.strictEqual(interactResult.ok, true);
room.tick(0.05, interactNow + 50);

const openSnapshot = room.buildSnapshotForPlayer(roomPlayer, interactNow + 60);
assert.ok(openSnapshot.interaction.active);
assert.strictEqual(openSnapshot.interaction.active.type, 'shop');
assert.strictEqual(openSnapshot.interaction.active.npc_id.startsWith('npc_'), true);
assert.ok(openSnapshot.interaction.active.items.some((entry) => entry.item_id === 'stone_spear'));

const purchaseResult = room.handleShopPurchase(roomPlayer, {
    npc_id: openSnapshot.interaction.active.npc_id,
    item_id: 'stone_spear',
    quantity: 1,
});
assert.strictEqual(purchaseResult.ok, true);
assert.strictEqual(purchaseResult.remaining_coins, 72);
assert.strictEqual(roomPlayer.coins, 72);
assert.strictEqual(roomPlayer.equip_weapon, 'stone_spear');
assert.strictEqual(roomPlayer.held_item_id, 'stone_spear');
assert.ok(model.listInventory('shopper').some((entry) => entry.item_id === 'stone_spear' && entry.quantity >= 1));

const closeResult = room.closeInteraction(roomPlayer);
assert.strictEqual(closeResult.ok, true);
const closedSnapshot = room.buildSnapshotForPlayer(roomPlayer, interactNow + 120);
assert.strictEqual(closedSnapshot.interaction.active, null);
assert.ok(closedSnapshot.interaction.prompt);
assert.ok(closedSnapshot.interaction.prompt.label.startsWith('E · '));

console.log('openvibe-games smoke OK');
