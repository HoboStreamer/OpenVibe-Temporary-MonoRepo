'use strict';

const mapManifest = require('./maps/2dworld_outpost.json');

const CLASSIC_STYLE_ID = '2dworld_classic';
const LEGACY_ASSET_ROUTE = '/assets/2dworld-legacy';

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function asset(file) {
    return `${LEGACY_ASSET_ROUTE}/${String(file || '').replace(/^\/+/, '')}`;
}

function sprite(file, extra = {}) {
    return Object.assign({ src: asset(file) }, extra || {});
}

const CLASSIC_PLAYER_RENDER = Object.freeze({
    mode: 'legacy_parts',
    bbox: [0, 0, 40, 94],
    body: { x: -20, y: -44, w: 40, h: 80, radius: 8 },
    face: sprite('face1.png', { x: -19, y: -44, w: 38, h: 42 }),
    handLight: sprite('hand.png', { x: 24, y: -2, w: 28, h: 24, anchorX: 0.18, anchorY: 0.55 }),
    handDark: sprite('hand-black2.png', { x: 24, y: -2, w: 28, h: 24, anchorX: 0.18, anchorY: 0.55 }),
    handDarkest: sprite('hand-black.png', { x: 24, y: -2, w: 28, h: 24, anchorX: 0.18, anchorY: 0.55 }),
    shoe: sprite('shoe-right.png', { w: 30, h: 18, anchorX: 0.5, anchorY: 0.56 }),
    leftFoot: { x: -13, y: 33 },
    rightFoot: { x: 13, y: 33 },
    headOffsetY: -24,
    handOffsetX: 22,
    handOffsetY: -4,
    shadow: { rx: 18, ry: 7, y: 28, alpha: 0.18 },
    labelY: -48,
    hpBarY: -46,
});

const CLASSIC_ITEM_RENDER = Object.freeze({
    coins: { icon: asset('chips.png'), sprite: sprite('chips.png', { w: 28, h: 28, anchorX: 0.5, anchorY: 0.7 }) },
    wood: { icon: asset('logs.png'), sprite: sprite('logs.png', { w: 42, h: 20, anchorX: 0.5, anchorY: 0.65 }) },
    oak_log: { icon: asset('logs_oak.png'), sprite: sprite('logs_oak.png', { w: 42, h: 20, anchorX: 0.5, anchorY: 0.65 }) },
    stone: { icon: asset('rock.png'), sprite: sprite('rock.png', { w: 28, h: 24, anchorX: 0.5, anchorY: 0.72 }) },
    copper_ore: { icon: asset('ore_copper.png'), sprite: sprite('ore_copper.png', { w: 28, h: 24, anchorX: 0.5, anchorY: 0.72 }) },
    iron_ore: { icon: asset('ore_iron.png'), sprite: sprite('ore_iron.png', { w: 28, h: 24, anchorX: 0.5, anchorY: 0.72 }) },
    gold_ore: { icon: asset('ore_iron.png'), sprite: sprite('ore_iron.png', { w: 28, h: 24, anchorX: 0.5, anchorY: 0.72, tint: 0xf0c85a }) },
    coal: { icon: asset('ore_coal.png'), sprite: sprite('ore_coal.png', { w: 28, h: 24, anchorX: 0.5, anchorY: 0.72 }) },
    herbs: { icon: asset('berries.png'), sprite: sprite('berries.png', { w: 26, h: 22, anchorX: 0.5, anchorY: 0.72 }) },
    seeds: { icon: asset('seeds.png'), sprite: sprite('seeds.png', { w: 24, h: 24, anchorX: 0.5, anchorY: 0.72 }) },
    stone_hatchet: { icon: asset('hatchet.png'), sprite: sprite('hatchet.png', { w: 46, h: 20, anchorX: 0.18, anchorY: 0.5 }), weapon_type: 'axe' },
    iron_hatchet: { icon: asset('hatchet_iron.png'), sprite: sprite('hatchet_iron.png', { w: 46, h: 20, anchorX: 0.18, anchorY: 0.5 }), weapon_type: 'axe' },
    stone_pickaxe: { icon: asset('pickaxe_wood.png'), sprite: sprite('pickaxe_wood.png', { w: 48, h: 20, anchorX: 0.2, anchorY: 0.52 }), weapon_type: 'pickaxe' },
    iron_pickaxe: { icon: asset('pickaxe_iron.png'), sprite: sprite('pickaxe_iron.png', { w: 48, h: 20, anchorX: 0.2, anchorY: 0.52 }), weapon_type: 'pickaxe' },
    hammer: { icon: asset('hammer.png'), sprite: sprite('hammer.png', { w: 34, h: 22, anchorX: 0.18, anchorY: 0.55 }), weapon_type: 'hammer' },
    iron_sword: { icon: asset('sword_iron.png'), sprite: sprite('sword_iron.png', { w: 52, h: 18, anchorX: 0.14, anchorY: 0.52 }), weapon_type: 'blade' },
    wooden_club: { icon: asset('logs.png'), sprite: sprite('logs.png', { w: 44, h: 18, anchorX: 0.16, anchorY: 0.55 }), weapon_type: 'club' },
    short_bow: { icon: asset('pistol-wood.png'), sprite: sprite('pistol-wood.png', { w: 42, h: 18, anchorX: 0.18, anchorY: 0.55 }), weapon_type: 'bow' },
    arrow: { icon: asset('ore_iron.png') },
    build_wall: { icon: asset('wall-wood.png') },
    build_half_wall: { icon: asset('wall-wood.png') },
    build_door: { icon: asset('door.png') },
    build_bed: { icon: asset('bed.png') },
    build_chest: { icon: asset('chest.png') },
    build_tool_cupboard: { icon: '🗄' },
    build_sign: { icon: '🪧' },
    build_workbench: { icon: asset('anvil.png') },
    build_furnace: { icon: asset('furnace.png') },
    build_farm_plot: { icon: asset('can-plant.png') },
    build_campfire: { icon: asset('campfire.png') },
    cooked_fish: { icon: asset('berries.png') },
    soup: { icon: asset('berries.png') },
    medkit: { icon: asset('chips.png') },
    stamina_drink: { icon: asset('chips.png') },
});

const CLASSIC_RESOURCE_RENDER = Object.freeze({
    tree: {
        sprite: sprite('tree-oak.png', { w: 114, h: 132, anchorX: 0.5, anchorY: 0.88 }),
        hit: 0x8cff8c,
    },
    rock: {
        sprite: sprite('rock.png', { w: 58, h: 42, anchorX: 0.5, anchorY: 0.76 }),
        hit: 0xd2dee7,
    },
    bush: {
        sprite: sprite('bush.png', { w: 56, h: 38, anchorX: 0.5, anchorY: 0.72 }),
        hit: 0xb3ff9c,
    },
});

const CLASSIC_STRUCTURE_RENDER = Object.freeze({
    wall: { sprite: sprite('wall-wood.png', { w: 116, h: 42, anchorX: 0.5, anchorY: 0.72 }) },
    door: { sprite: sprite('door.png', { w: 74, h: 58, anchorX: 0.5, anchorY: 0.82 }) },
    bed: { sprite: sprite('bed.png', { w: 92, h: 56, anchorX: 0.5, anchorY: 0.8 }) },
    chest: { sprite: sprite('chest.png', { w: 70, h: 54, anchorX: 0.5, anchorY: 0.8 }) },
    workbench: { sprite: sprite('anvil.png', { w: 74, h: 52, anchorX: 0.5, anchorY: 0.76 }) },
    furnace: { sprite: sprite('furnace.png', { w: 70, h: 86, anchorX: 0.5, anchorY: 0.9 }) },
    farm_plot: { sprite: sprite('can-plant.png', { w: 62, h: 62, anchorX: 0.5, anchorY: 0.84 }) },
    campfire: { sprite: sprite('campfire.png', { w: 52, h: 52, anchorX: 0.5, anchorY: 0.78 }) },
});

const CLASSIC_NPC_RENDER = Object.freeze({
    'npc.boar': { sprite: sprite('pig.png', { w: 56, h: 42, anchorX: 0.5, anchorY: 0.78 }) },
    'npc.bandit': { sprite: sprite('guard_noob.png', { w: 54, h: 86, anchorX: 0.5, anchorY: 0.9 }) },
    'npc.hoarder': { sprite: sprite('goblin.png', { w: 50, h: 80, anchorX: 0.5, anchorY: 0.88 }) },
    'npc.farmer': { sprite: sprite('seller.png', { w: 58, h: 88, anchorX: 0.5, anchorY: 0.9 }) },
    'npc.fisherman': { sprite: sprite('seller.png', { w: 58, h: 88, anchorX: 0.5, anchorY: 0.9, tint: 0x8dd8ff }) },
    'npc.quartermaster': { sprite: sprite('guard_noob.png', { w: 56, h: 88, anchorX: 0.5, anchorY: 0.9 }) },
    'npc.boss.hoarder_king': { sprite: sprite('guard_noob.png', { w: 72, h: 112, anchorX: 0.5, anchorY: 0.92, tint: 0xffb980 }) },
});

function buildSpriteLayers(bounds = {}) {
    const safeBounds = Object.assign({ x: 0, y: 0, w: 16384, h: 16384 }, bounds || {});
    const background = [];
    const detail = [];

    const bg = mapManifest && mapManifest.layers && mapManifest.layers.background;
    if (bg && bg.file) {
        background.push({
            id: bg.id || 'classic-map-main',
            type: bg.type || 'image',
            src: asset(bg.file),
            x: safeBounds.x,
            y: safeBounds.y,
            w: safeBounds.w,
            h: safeBounds.h,
            anchorX: 0,
            anchorY: 0,
            alpha: bg.alpha == null ? 0.96 : Number(bg.alpha),
            layer: 'background',
        });
    }

    for (const entry of mapManifest && mapManifest.layers && mapManifest.layers.detail || []) {
        if (!entry || !entry.file) continue;
        detail.push(Object.assign({}, entry, {
            type: entry.type || 'image',
            src: asset(entry.file),
            layer: entry.layer || 'background',
        }));
    }

    return { background, detail };
}

function buildEditorPalette() {
    return (mapManifest && mapManifest.editorPalette || []).map((entry) => Object.assign({}, entry, {
        sprite: entry && entry.sprite ? asset(entry.sprite) : null,
    }));
}

function buildClassicWorldPresentation(options = {}) {
    const bounds = Object.assign({ x: 0, y: 0, w: 16384, h: 16384 }, options.bounds || {});
    return {
        style_id: CLASSIC_STYLE_ID,
        editor_palette: buildEditorPalette(),
        presentation: {
            map_id: mapManifest.id,
            map_kind: mapManifest.kind,
            show_grid: false,
            show_landmarks: false,
            show_terrain_patches: false,
            sprite_layers: buildSpriteLayers(bounds),
            player_render: clone(CLASSIC_PLAYER_RENDER),
        },
    };
}

module.exports = {
    CLASSIC_STYLE_ID,
    LEGACY_ASSET_ROUTE,
    CLASSIC_ITEM_RENDER,
    CLASSIC_RESOURCE_RENDER,
    CLASSIC_STRUCTURE_RENDER,
    CLASSIC_NPC_RENDER,
    CLASSIC_PLAYER_RENDER,
    asset,
    buildClassicWorldPresentation,
};