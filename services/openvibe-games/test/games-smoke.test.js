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
const modRegistry = require('../server/mods/registry');
const policy = require('../server/policy');
const { buildCatalog } = require('../server/realtime');
const { STARTER_WORLD } = require('../server/realtime/catalog/starter-world');
const { WorldRoom } = require('../server/realtime/rooms/world-room');

assert.ok(STARTER_WORLD.bounds.w > 8192);
assert.ok(STARTER_WORLD.zones.some((zone) => zone.zone_id === 'ember_basin'));
assert.ok(Array.isArray(STARTER_WORLD.terrain_patches) && STARTER_WORLD.terrain_patches.length >= 10);
assert.ok(STARTER_WORLD.resources.length > 40);
assert.ok(STARTER_WORLD.travel.some((link) => link.from === 'pine_watch' && link.to === 'outpost'));
assert.strictEqual(STARTER_WORLD.style_id, '2dworld_classic');
assert.ok(STARTER_WORLD.presentation && STARTER_WORLD.presentation.sprite_layers && STARTER_WORLD.presentation.sprite_layers.background.length >= 1);
assert.ok(Array.isArray(STARTER_WORLD.editor_palette) && STARTER_WORLD.editor_palette.length >= 8);

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

const mismatchEquipResult = room.handleInventoryEquip(roomPlayer, {
    item_id: 'stone_spear',
    slot: 'axe',
});
assert.strictEqual(mismatchEquipResult.ok, false);

const clearEquipResult = room.handleInventoryEquip(roomPlayer, {
    slot: 'weapon',
    clear: true,
});
assert.strictEqual(clearEquipResult.ok, true);
assert.strictEqual(clearEquipResult.slot, 'weapon');
assert.strictEqual(roomPlayer.equip_weapon, '');
assert.strictEqual(roomPlayer.held_item_id, room._defaultHeldItem(roomPlayer));

const reEquipResult = room.handleInventoryEquip(roomPlayer, {
    item_id: 'stone_spear',
    slot: 'weapon',
});
assert.strictEqual(reEquipResult.ok, true);
assert.strictEqual(reEquipResult.slot, 'weapon');
assert.strictEqual(roomPlayer.equip_weapon, 'stone_spear');
assert.strictEqual(roomPlayer.held_item_id, 'stone_spear');

const hotbarAssignResult = room.handleHotbarUpdate(roomPlayer, {
    slot: 1,
    item_id: 'stone_spear',
});
assert.strictEqual(hotbarAssignResult.ok, true);
assert.strictEqual(hotbarAssignResult.hotbar[0].item_id, 'stone_spear');

const coinsHotbarResult = room.handleHotbarUpdate(roomPlayer, {
    slot: 2,
    item_id: 'coins',
    select: false,
});
assert.strictEqual(coinsHotbarResult.ok, true);
assert.strictEqual(coinsHotbarResult.hotbar[1].item_id, 'coins');

const hotbarSnapshot = room.buildSnapshotForPlayer(roomPlayer, Date.now());
assert.ok(Array.isArray(hotbarSnapshot.self.hotbar));
assert.strictEqual(hotbarSnapshot.self.hotbar[0].item_id, 'stone_spear');
assert.strictEqual(hotbarSnapshot.self.hotbar[1].item_id, 'coins');

const coinDropResult = room.handleInventoryDrop(roomPlayer, {
    item_id: 'coins',
    quantity: 5,
}, Date.now());
assert.strictEqual(coinDropResult.ok, true);
assert.strictEqual(roomPlayer.coins, 67);
const coinDrop = [...room.loot.values()].find((entry) => entry.item_id === 'coins');
assert.ok(coinDrop);
roomPlayer.x = coinDrop.x;
roomPlayer.y = coinDrop.y;
const coinPickupResult = room._pickupLoot(roomPlayer, coinDrop.id);
assert.strictEqual(coinPickupResult.ok, true);
assert.strictEqual(roomPlayer.coins, 72);

const spearDropResult = room.handleInventoryDrop(roomPlayer, {
    item_id: 'stone_spear',
    quantity: 1,
}, Date.now());
assert.strictEqual(spearDropResult.ok, true);
assert.strictEqual(roomPlayer.equip_weapon, '');
assert.strictEqual(room.buildSnapshotForPlayer(roomPlayer, Date.now()).self.hotbar[0].item_id, null);

const closeResult = room.closeInteraction(roomPlayer);
assert.strictEqual(closeResult.ok, true);
const closedSnapshot = room.buildSnapshotForPlayer(roomPlayer, interactNow + 120);
assert.strictEqual(closedSnapshot.interaction.active, null);
assert.ok(closedSnapshot.interaction.prompt);
assert.ok(closedSnapshot.interaction.prompt.label.startsWith('E · '));

const moddedPlayerRow = model.upsertPlayer({
    user_id: 'modder',
    display_name: 'Firekeep Fan',
    coins: 160,
    zone: 'outpost',
    x: 4128,
    y: 3996,
});
assert.strictEqual(moddedPlayerRow.coins, 160);

const registeredMod = modRegistry.registerMod({
    owner_id: '42',
    manifest: {
        id: 'openvibe.firekeep-expansion',
        name: 'Firekeep Expansion',
        version: '1.0.0',
        engine_version: '17.x',
        permissions: {
            media_namespaces: ['games.assets.firekeep'],
        },
        scripts: {
            server: [
                {
                    name: 'ember-hooks',
                    description: 'Adds ember ambience and a shrine prompt in the scripted zone.',
                    code: `
hook.Add('snapshot:decorate', 'ember-glow', function(snapshot, ctx) {
    if (!ctx || !ctx.player || ctx.player.zone_id !== 'ember_camp') return;
    snapshot.world = Object.assign({}, snapshot.world || {}, {
        ambience: Object.assign({}, snapshot.world && snapshot.world.ambience || {}, {
            tint: '#ffb16a',
            alpha: 0.09,
        }),
    });
    snapshot.feed = snapshot.feed || [];
    snapshot.feed.push({
        type: 'script',
        payload: {
            mod: 'openvibe.firekeep-expansion',
            message: 'Ember winds rise.',
        },
    });
});

hook.Add('interaction:prompt', 'ember-shrine', function(ctx) {
    if (!ctx || !ctx.player || ctx.player.zone_id !== 'ember_camp') return;
    return {
        type: 'script',
        target_id: 'ember-shrine',
        x: 6200,
        y: 2140,
        label: 'E · Inspect ember shrine',
        description: 'Trusted hook scripts can add ambient prompts.',
    };
});
                    `,
                },
            ],
        },
        content: {
            items: [
                {
                    item_id: 'ember_blade',
                    name: 'Ember Blade',
                    category: 'weapon',
                    stackable: 0,
                    metadata: { damage: 13, range: 40 },
                    render: { weapon_type: 'blade', color: '#ff8844', accent: '#4a1f10', length: 38 },
                },
            ],
            recipes: [
                {
                    id: 'recipe.ember_blade',
                    result: { item_id: 'ember_blade', quantity: 1 },
                    inputs: [{ item_id: 'iron_ore', quantity: 2 }, { item_id: 'coal', quantity: 1 }],
                    station: 'build_furnace',
                    skill: 'smithing',
                    level: 12,
                    xp: 90,
                },
            ],
            npc_templates: [
                {
                    id: 'npc.firekeep.merchant',
                    name: 'Firekeep Merchant',
                    kind: 'npc',
                    hp: 30,
                    damage: 0,
                    speed: 34,
                    aggro_radius: 0,
                    held_item_id: 'ember_blade',
                    render: {
                        body: 'humanoid',
                        palette: {
                            tunic: '#6b2f1f',
                            trim: '#ffb366',
                            skin: '#f0d2b8',
                            leg: '#2c1612',
                            accent: '#ffd9a0',
                        },
                        parts: [
                            { shape: 'roundedRect', x: -8, y: -30, w: 16, h: 6, radius: 3, palette: 'accent', alpha: 0.88 },
                            { shape: 'line', x1: 0, y1: -24, x2: 0, y2: -38, palette: 'trim', width: 2, alpha: 0.6 },
                        ],
                    },
                    interaction: {
                        type: 'shop',
                        shop_id: 'shop.firekeep.merchant',
                        title: 'Firekeep Relics',
                        prompt: 'Browse ember relics',
                        description: 'Experimental gear from the hottest corner of the outpost.',
                        inventory: [
                            { item_id: 'ember_blade', price: 64, quantity: 1, note: 'A very warm sword.' },
                        ],
                    },
                },
            ],
            zones: [
                {
                    zone_id: 'ember_camp',
                    kind: 'safe',
                    pvp: false,
                    spawn: { x: 6200, y: 2200 },
                    radius: 180,
                    description: 'Tiny volcanic camp added by a pure-data mod.',
                },
            ],
            travel: [
                { from: 'outpost', to: 'ember_camp', kind: 'portal' },
            ],
            world_npcs: [
                { zone_id: 'outpost', template_id: 'npc.firekeep.merchant', x: 4128, y: 3996 },
            ],
        },
    },
});

modRegistry.setEnabled(registeredMod.id, room.world.id, true);

const moddedCatalog = buildCatalog(room.world, STARTER_WORLD);
assert.ok(moddedCatalog.engine.hook_surfaces.includes('interaction:prompt'));
assert.ok(moddedCatalog.items.some((item) => item.item_id === 'ember_blade'));
assert.ok(moddedCatalog.recipes.some((recipe) => recipe.id === 'recipe.ember_blade'));
assert.ok(moddedCatalog.zones.some((zone) => zone.zone_id === 'ember_camp'));
assert.ok(moddedCatalog.world_definition.npcs.some((npc) => npc.template_id === 'npc.firekeep.merchant'));
assert.ok(moddedCatalog.world_definition.presentation && moddedCatalog.world_definition.presentation.player_render);
assert.ok(moddedCatalog.world_definition.presentation.sprite_layers.detail.some((entry) => entry.src && entry.src.includes('/assets/2dworld-legacy/')));
assert.ok(moddedCatalog.definitions.items.stone_hatchet.render.icon.includes('/assets/2dworld-legacy/hatchet.png'));
assert.ok(moddedCatalog.definitions.resources.tree.render.sprite.src.includes('/assets/2dworld-legacy/tree-oak.png'));
assert.strictEqual(moddedCatalog.definitions.items.ember_blade.render.weapon_type, 'blade');
assert.strictEqual(moddedCatalog.engine.scripting.active_script_mod_count, 0);
assert.ok(moddedCatalog.mods.some((mod) => mod.id === registeredMod.id && mod.has_scripts === true));
assert.ok(Array.isArray(moddedCatalog.definitions.npcs['npc.firekeep.merchant'].render.parts));

const moddedRoom = new WorldRoom({
    world: room.world,
    worldDefinition: moddedCatalog.world_definition,
    catalog: moddedCatalog,
    publish: () => {},
    emitToSocket: () => {},
    tickRate: 20,
});

moddedRoom.join({
    socketId: 'socket-modder',
    userId: 'modder',
    displayName: 'Firekeep Fan',
    zoneId: 'outpost',
});

const moddedPlayer = moddedRoom.players.get('socket-modder');
moddedPlayer.x = 4128;
moddedPlayer.y = 3996;
moddedPlayer.zone_id = 'outpost';

const modPromptSnapshot = moddedRoom.buildSnapshotForPlayer(moddedPlayer, Date.now());
assert.ok(modPromptSnapshot.interaction.prompt);
assert.ok(modPromptSnapshot.interaction.prompt.label.includes('Browse ember relics'));

const modInteractNow = Date.now();
const modInteractResult = moddedRoom.receiveInput('socket-modder', {
    seq: 1,
    dt: 0.05,
    sent_at: modInteractNow,
    keys: {},
    aim: { x: 4128, y: 3996 },
    action: 'interact',
});
assert.strictEqual(modInteractResult.ok, true);
moddedRoom.tick(0.05, modInteractNow + 50);

const modShopSnapshot = moddedRoom.buildSnapshotForPlayer(moddedPlayer, modInteractNow + 60);
assert.ok(modShopSnapshot.interaction.active);
assert.ok(modShopSnapshot.interaction.active.items.some((entry) => entry.item_id === 'ember_blade'));

const modPurchaseResult = moddedRoom.handleShopPurchase(moddedPlayer, {
    npc_id: modShopSnapshot.interaction.active.npc_id,
    item_id: 'ember_blade',
    quantity: 1,
});
assert.strictEqual(modPurchaseResult.ok, true);
assert.strictEqual(moddedPlayer.equip_weapon, 'ember_blade');
assert.strictEqual(moddedPlayer.held_item_id, 'ember_blade');
assert.ok(model.listInventory('modder').some((entry) => entry.item_id === 'ember_blade' && entry.quantity >= 1));

const trustedMod = modRegistry.setTrustLevel(registeredMod.id, 'trusted');
assert.strictEqual(trustedMod.trust_level, 'trusted');

const trustedCatalog = buildCatalog(room.world, STARTER_WORLD);
assert.strictEqual(trustedCatalog.engine.scripting.active_script_mod_count, 1);
assert.ok(trustedCatalog.engine.scripting.modules.some((module) => module.slug === 'openvibe.firekeep-expansion' && module.can_run === true));

const scriptedRoom = new WorldRoom({
    world: room.world,
    worldDefinition: trustedCatalog.world_definition,
    catalog: trustedCatalog,
    publish: () => {},
    emitToSocket: () => {},
    tickRate: 20,
});

model.upsertPlayer({
    user_id: 'emberfan',
    display_name: 'Ember Fan',
    coins: 90,
    zone: 'ember_camp',
    x: 6200,
    y: 2200,
});

scriptedRoom.join({
    socketId: 'socket-ember',
    userId: 'emberfan',
    displayName: 'Ember Fan',
    zoneId: 'ember_camp',
});

const emberPlayer = scriptedRoom.players.get('socket-ember');
emberPlayer.x = 6200;
emberPlayer.y = 2200;
emberPlayer.zone_id = 'ember_camp';

const emberSnapshot = scriptedRoom.buildSnapshotForPlayer(emberPlayer, Date.now());
assert.ok(emberSnapshot.interaction.prompt);
assert.ok(emberSnapshot.interaction.prompt.label.includes('Inspect ember shrine'));
assert.strictEqual(emberSnapshot.world.ambience.tint, '#ffb16a');
assert.ok(emberSnapshot.feed.some((entry) => entry.type === 'script' && entry.payload && entry.payload.mod === 'openvibe.firekeep-expansion'));

console.log('openvibe-games smoke OK');
