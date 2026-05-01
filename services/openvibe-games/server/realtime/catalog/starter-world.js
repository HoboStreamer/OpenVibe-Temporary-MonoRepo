'use strict';

const { buildClassicWorldPresentation } = require('../../sourcevibe/gamemodes/2dworld/legacy-style');

// Starter world for the 2D World vertical slice. The original fixed layout is
// preserved around the classic outpost/wilderness cluster, but the runtime now
// grows that into a larger deterministic world with extra biomes, generated
// resources, terrain styling, and richer ambience data for the client.

function createRng(seed) {
    let state = (Math.abs(Math.floor(Number(seed) || 1)) || 1) >>> 0;
    return function next() {
        state = ((state * 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function roundToGrid(value, grid = 10) {
    return Math.round(Number(value || 0) / grid) * grid;
}

function pick(rng, list) {
    return list[Math.floor(rng() * list.length)] || list[0];
}

function scatterPoints({ rng, center, radiusX, radiusY, count, minDistance = 60, padding = 0 }) {
    const points = [];
    const attemptsLimit = Math.max(40, count * 30);
    const minDistSq = minDistance * minDistance;
    let attempts = 0;
    const rx = Math.max(20, Number(radiusX) - padding);
    const ry = Math.max(20, Number(radiusY) - padding);
    while (points.length < count && attempts < attemptsLimit) {
        attempts += 1;
        const theta = rng() * Math.PI * 2;
        const dist = Math.sqrt(rng());
        const point = {
            x: roundToGrid(center.x + (Math.cos(theta) * rx * dist)),
            y: roundToGrid(center.y + (Math.sin(theta) * ry * dist)),
        };
        let tooClose = false;
        for (const existing of points) {
            const dx = existing.x - point.x;
            const dy = existing.y - point.y;
            if (((dx * dx) + (dy * dy)) < minDistSq) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) points.push(point);
    }
    return points;
}

function makeScatterPatch({ rng, center, radiusX, radiusY, count, minRadius, maxRadius, color, alpha, yScale = 1 }) {
    return {
        type: 'scatter',
        color,
        alpha,
        points: scatterPoints({
            rng,
            center,
            radiusX,
            radiusY,
            count,
            minDistance: Math.max(18, minRadius * 2.8),
        }).map((point) => ({
            x: point.x,
            y: point.y,
            rx: roundToGrid(minRadius + ((maxRadius - minRadius) * rng()), 1),
            ry: roundToGrid((minRadius + ((maxRadius - minRadius) * rng())) * yScale, 1),
        })),
    };
}

function createResourceCluster(resources, config) {
    const points = scatterPoints({
        rng: config.rng,
        center: config.center,
        radiusX: config.radiusX,
        radiusY: config.radiusY,
        count: config.count,
        minDistance: config.minDistance,
        padding: config.padding,
    });
    for (const point of points) {
        resources.push({
            zone_id: config.zone_id,
            kind: config.kind,
            x: point.x,
            y: point.y,
            hp: config.hp,
            max_hp: config.max_hp,
            loot_table_id: config.loot_table_id,
        });
    }
}

function createNpcCluster(npcs, config) {
    const points = scatterPoints({
        rng: config.rng,
        center: config.center,
        radiusX: config.radiusX,
        radiusY: config.radiusY,
        count: config.count,
        minDistance: config.minDistance,
        padding: config.padding,
    });
    for (const point of points) {
        npcs.push({
            zone_id: config.zone_id,
            template_id: config.template_id,
            x: point.x,
            y: point.y,
        });
    }
}

function buildStarterWorld(seed = 20260430) {
    const rng = createRng(seed);
    const terrainRng = createRng(seed ^ 0x9e3779b9);

    const zones = [
        {
            zone_id: 'outpost',
            label: 'Outpost',
            kind: 'safe',
            pvp: false,
            spawn: { x: 4096, y: 4096 },
            radius: 360,
            description: 'Safe spawn city. Bank, vendors, and tutorial NPCs.',
            ambience: { tint: '#8ed8ff', alpha: 0.045 },
        },
        {
            zone_id: 'wilderness',
            label: 'Wilderness',
            kind: 'pvp',
            pvp: true,
            spawn: { x: 5200, y: 4096 },
            radius: 1480,
            description: 'PvP and resource zone. Trees, ore, animals, bandits.',
            ambience: { tint: '#ffc48d', alpha: 0.035 },
        },
        {
            zone_id: 'farm_island',
            label: 'Farm Island',
            kind: 'farm',
            pvp: false,
            spawn: { x: 3000, y: 5200 },
            radius: 640,
            description: 'Farming island. Plots, herbs, fishing, boat dock.',
            ambience: { tint: '#b9f6ae', alpha: 0.04 },
        },
        {
            zone_id: 'ship',
            label: 'Dock',
            kind: 'travel',
            pvp: false,
            spawn: { x: 2400, y: 4400 },
            radius: 260,
            description: 'Boat travel and sea minigame.',
            ambience: { tint: '#8bd6ff', alpha: 0.05 },
        },
        {
            zone_id: 'dungeon_depths',
            label: 'Dungeon Depths',
            kind: 'instance',
            pvp: false,
            spawn: { x: 6000, y: 6000 },
            radius: 360,
            description: 'Instanced PvE depths. Hoarders and the Hoarder King.',
            ambience: { tint: '#ff918a', alpha: 0.06 },
        },
        {
            zone_id: 'pine_watch',
            label: 'Pine Watch',
            kind: 'overworld',
            pvp: false,
            spawn: { x: 2200, y: 2500 },
            radius: 900,
            description: 'Tall woods, winding paths, and safer early-game hunting lanes.',
            ambience: { tint: '#a3ffd1', alpha: 0.03 },
        },
        {
            zone_id: 'glass_lake',
            label: 'Glass Lake',
            kind: 'coast',
            pvp: false,
            spawn: { x: 8350, y: 7420 },
            radius: 880,
            description: 'A broad reflective lake with fishing routes and soft shoreline reeds.',
            ambience: { tint: '#8dd8ff', alpha: 0.05 },
        },
        {
            zone_id: 'iron_fields',
            label: 'Iron Fields',
            kind: 'pvp',
            pvp: true,
            spawn: { x: 9800, y: 3200 },
            radius: 1120,
            description: 'Wind-scoured mining flats rich with ore and aggressive raiders.',
            ambience: { tint: '#d7d3c8', alpha: 0.035 },
        },
        {
            zone_id: 'ember_basin',
            label: 'Ember Basin',
            kind: 'pvp',
            pvp: true,
            spawn: { x: 12400, y: 4800 },
            radius: 960,
            description: 'Volcanic badlands with richer ore veins, ash haze, and dangerous patrols.',
            ambience: { tint: '#ffb16a', alpha: 0.05 },
        },
    ];

    const resources = [
        // Original practice nodes.
        { zone_id: 'outpost', kind: 'tree', x: 4180, y: 4080, hp: 3, max_hp: 3, loot_table_id: 'loot.tree.oak' },
        { zone_id: 'outpost', kind: 'rock', x: 4080, y: 4180, hp: 3, max_hp: 3, loot_table_id: 'loot.rock.basic' },
        // Original wilderness landmarks.
        { zone_id: 'wilderness', kind: 'tree', x: 5300, y: 4060, hp: 4, max_hp: 4, loot_table_id: 'loot.tree.oak' },
        { zone_id: 'wilderness', kind: 'tree', x: 5380, y: 4150, hp: 4, max_hp: 4, loot_table_id: 'loot.tree.oak' },
        { zone_id: 'wilderness', kind: 'rock', x: 5500, y: 4200, hp: 5, max_hp: 5, loot_table_id: 'loot.rock.iron' },
        { zone_id: 'wilderness', kind: 'rock', x: 5420, y: 4280, hp: 5, max_hp: 5, loot_table_id: 'loot.rock.basic' },
        { zone_id: 'wilderness', kind: 'bush', x: 5260, y: 4220, hp: 2, max_hp: 2, loot_table_id: 'loot.bush.herbs' },
        // Original farm island starters.
        { zone_id: 'farm_island', kind: 'bush', x: 3040, y: 5240, hp: 2, max_hp: 2, loot_table_id: 'loot.bush.herbs' },
        { zone_id: 'farm_island', kind: 'tree', x: 2960, y: 5180, hp: 3, max_hp: 3, loot_table_id: 'loot.tree.oak' },
    ];

    createResourceCluster(resources, {
        rng,
        zone_id: 'wilderness',
        kind: 'tree',
        center: { x: 5560, y: 3980 },
        radiusX: 980,
        radiusY: 860,
        count: 18,
        minDistance: 110,
        hp: 4,
        max_hp: 4,
        loot_table_id: 'loot.tree.oak',
    });
    createResourceCluster(resources, {
        rng,
        zone_id: 'wilderness',
        kind: 'rock',
        center: { x: 5820, y: 4480 },
        radiusX: 860,
        radiusY: 720,
        count: 11,
        minDistance: 120,
        hp: 5,
        max_hp: 5,
        loot_table_id: pick(rng, ['loot.rock.basic', 'loot.rock.iron']),
    });
    createResourceCluster(resources, {
        rng,
        zone_id: 'wilderness',
        kind: 'bush',
        center: { x: 5050, y: 4570 },
        radiusX: 560,
        radiusY: 520,
        count: 9,
        minDistance: 90,
        hp: 2,
        max_hp: 2,
        loot_table_id: 'loot.bush.herbs',
    });
    createResourceCluster(resources, {
        rng,
        zone_id: 'farm_island',
        kind: 'bush',
        center: { x: 3050, y: 5280 },
        radiusX: 360,
        radiusY: 320,
        count: 14,
        minDistance: 70,
        hp: 2,
        max_hp: 2,
        loot_table_id: 'loot.bush.herbs',
    });
    createResourceCluster(resources, {
        rng,
        zone_id: 'farm_island',
        kind: 'tree',
        center: { x: 2800, y: 5000 },
        radiusX: 460,
        radiusY: 380,
        count: 8,
        minDistance: 95,
        hp: 3,
        max_hp: 3,
        loot_table_id: 'loot.tree.oak',
    });
    createResourceCluster(resources, {
        rng,
        zone_id: 'pine_watch',
        kind: 'tree',
        center: { x: 2150, y: 2480 },
        radiusX: 760,
        radiusY: 700,
        count: 24,
        minDistance: 110,
        hp: 4,
        max_hp: 4,
        loot_table_id: 'loot.tree.oak',
    });
    createResourceCluster(resources, {
        rng,
        zone_id: 'glass_lake',
        kind: 'bush',
        center: { x: 8360, y: 7420 },
        radiusX: 620,
        radiusY: 500,
        count: 14,
        minDistance: 75,
        hp: 2,
        max_hp: 2,
        loot_table_id: 'loot.bush.herbs',
    });
    createResourceCluster(resources, {
        rng,
        zone_id: 'iron_fields',
        kind: 'rock',
        center: { x: 9800, y: 3200 },
        radiusX: 860,
        radiusY: 780,
        count: 20,
        minDistance: 115,
        hp: 5,
        max_hp: 5,
        loot_table_id: pick(rng, ['loot.rock.basic', 'loot.rock.iron']),
    });
    createResourceCluster(resources, {
        rng,
        zone_id: 'ember_basin',
        kind: 'rock',
        center: { x: 12400, y: 4800 },
        radiusX: 760,
        radiusY: 700,
        count: 16,
        minDistance: 115,
        hp: 6,
        max_hp: 6,
        loot_table_id: 'loot.rock.iron',
    });
    createResourceCluster(resources, {
        rng,
        zone_id: 'ember_basin',
        kind: 'tree',
        center: { x: 11880, y: 4460 },
        radiusX: 380,
        radiusY: 340,
        count: 7,
        minDistance: 100,
        hp: 4,
        max_hp: 4,
        loot_table_id: 'loot.tree.oak',
    });

    const npcs = [
        { zone_id: 'outpost', template_id: 'npc.farmer', x: 4080, y: 4040 },
        { zone_id: 'outpost', template_id: 'npc.fisherman', x: 4040, y: 4150 },
        { zone_id: 'outpost', template_id: 'npc.quartermaster', x: 4168, y: 4028 },
        { zone_id: 'wilderness', template_id: 'npc.boar', x: 5340, y: 4080 },
        { zone_id: 'wilderness', template_id: 'npc.boar', x: 5460, y: 4180 },
        { zone_id: 'wilderness', template_id: 'npc.bandit', x: 5520, y: 4280 },
        { zone_id: 'wilderness', template_id: 'npc.hoarder', x: 5600, y: 4320 },
        { zone_id: 'dungeon_depths', template_id: 'npc.boss.hoarder_king', x: 6000, y: 6000 },
    ];

    createNpcCluster(npcs, {
        rng,
        zone_id: 'wilderness',
        template_id: 'npc.boar',
        center: { x: 5660, y: 3920 },
        radiusX: 860,
        radiusY: 760,
        count: 8,
        minDistance: 170,
    });
    createNpcCluster(npcs, {
        rng,
        zone_id: 'wilderness',
        template_id: 'npc.bandit',
        center: { x: 6020, y: 4520 },
        radiusX: 620,
        radiusY: 540,
        count: 4,
        minDistance: 190,
    });
    createNpcCluster(npcs, {
        rng,
        zone_id: 'pine_watch',
        template_id: 'npc.boar',
        center: { x: 2320, y: 2360 },
        radiusX: 680,
        radiusY: 620,
        count: 6,
        minDistance: 180,
    });
    createNpcCluster(npcs, {
        rng,
        zone_id: 'iron_fields',
        template_id: 'npc.bandit',
        center: { x: 9880, y: 3260 },
        radiusX: 760,
        radiusY: 620,
        count: 6,
        minDistance: 190,
    });
    createNpcCluster(npcs, {
        rng,
        zone_id: 'ember_basin',
        template_id: 'npc.hoarder',
        center: { x: 12440, y: 4820 },
        radiusX: 640,
        radiusY: 580,
        count: 5,
        minDistance: 200,
    });
    createNpcCluster(npcs, {
        rng,
        zone_id: 'glass_lake',
        template_id: 'npc.boar',
        center: { x: 8070, y: 7100 },
        radiusX: 380,
        radiusY: 340,
        count: 3,
        minDistance: 180,
    });

    const terrain_patches = [
        { type: 'rect', x: 0, y: 0, w: 16384, h: 16384, color: '#274634', alpha: 1 },
        { type: 'ellipse', x: 4096, y: 4096, rx: 720, ry: 540, color: '#7b6b57', alpha: 0.92 },
        { type: 'ellipse', x: 5200, y: 4096, rx: 1680, ry: 1320, color: '#5a6f36', alpha: 0.55 },
        { type: 'ellipse', x: 3000, y: 5200, rx: 760, ry: 620, color: '#7caf4f', alpha: 0.62 },
        { type: 'ellipse', x: 2400, y: 4400, rx: 240, ry: 210, color: '#2f7fa9', alpha: 0.86 },
        { type: 'ellipse', x: 6000, y: 6000, rx: 520, ry: 440, color: '#3a2f26', alpha: 0.9 },
        { type: 'ring', x: 6000, y: 6000, radius: 380, width: 52, color: '#a94a42', alpha: 0.18 },
        { type: 'ellipse', x: 2200, y: 2500, rx: 1020, ry: 900, color: '#355a39', alpha: 0.58 },
        { type: 'ellipse', x: 8350, y: 7420, rx: 1080, ry: 920, color: '#317ea6', alpha: 0.82 },
        { type: 'ring', x: 8350, y: 7420, radius: 980, width: 70, color: '#b1e8ff', alpha: 0.16 },
        { type: 'ellipse', x: 9800, y: 3200, rx: 1320, ry: 960, color: '#6c6a63', alpha: 0.48 },
        { type: 'ellipse', x: 12400, y: 4800, rx: 1100, ry: 860, color: '#5d3729', alpha: 0.76 },
        { type: 'ring', x: 12400, y: 4800, radius: 760, width: 82, color: '#ff9f57', alpha: 0.22 },
        {
            type: 'path',
            color: '#c9b082',
            alpha: 0.26,
            width: 110,
            points: [
                { x: 4096, y: 4096 },
                { x: 4700, y: 4100 },
                { x: 5200, y: 4096 },
                { x: 6400, y: 3880 },
                { x: 7850, y: 3520 },
                { x: 9800, y: 3200 },
                { x: 11150, y: 3860 },
                { x: 12400, y: 4800 },
            ],
        },
        {
            type: 'path',
            color: '#c9b082',
            alpha: 0.24,
            width: 96,
            points: [
                { x: 4096, y: 4096 },
                { x: 3520, y: 4620 },
                { x: 3000, y: 5200 },
                { x: 2600, y: 4780 },
                { x: 2400, y: 4400 },
            ],
        },
        {
            type: 'path',
            color: '#9cc0a5',
            alpha: 0.2,
            width: 82,
            points: [
                { x: 4096, y: 4096 },
                { x: 3380, y: 3400 },
                { x: 2780, y: 2920 },
                { x: 2200, y: 2500 },
            ],
        },
        makeScatterPatch({ rng: terrainRng, center: { x: 5200, y: 4096 }, radiusX: 1640, radiusY: 1280, count: 120, minRadius: 10, maxRadius: 28, color: '#2a5a32', alpha: 0.22, yScale: 0.72 }),
        makeScatterPatch({ rng: terrainRng, center: { x: 2200, y: 2500 }, radiusX: 980, radiusY: 860, count: 90, minRadius: 16, maxRadius: 34, color: '#234a2d', alpha: 0.26, yScale: 0.76 }),
        makeScatterPatch({ rng: terrainRng, center: { x: 8350, y: 7420 }, radiusX: 1040, radiusY: 860, count: 55, minRadius: 14, maxRadius: 36, color: '#9ae3ff', alpha: 0.14, yScale: 0.72 }),
        makeScatterPatch({ rng: terrainRng, center: { x: 9800, y: 3200 }, radiusX: 1260, radiusY: 900, count: 80, minRadius: 12, maxRadius: 28, color: '#8d8a80', alpha: 0.16, yScale: 0.72 }),
        makeScatterPatch({ rng: terrainRng, center: { x: 12400, y: 4800 }, radiusX: 980, radiusY: 760, count: 74, minRadius: 12, maxRadius: 30, color: '#ff9d64', alpha: 0.16, yScale: 0.7 }),
    ];

    const landmarks = zones.map((zone) => ({
        type: 'label',
        label: zone.label,
        x: zone.spawn.x,
        y: zone.spawn.y - clamp(zone.radius * 0.6, 110, 520),
        size: zone.zone_id === 'outpost' ? 20 : 17,
        color: zone.zone_id === 'ember_basin' ? '#ffd1b2' : zone.zone_id === 'glass_lake' ? '#dff7ff' : '#e8fff3',
    }));
    landmarks.push(
        { type: 'label', label: 'Ashfall Pass', x: 11140, y: 3980, size: 15, color: '#ffd3b0' },
        { type: 'label', label: 'Lowwater Causeway', x: 3440, y: 4830, size: 14, color: '#e6ffe2' },
    );

    const classicPresentation = buildClassicWorldPresentation({
        bounds: { x: 0, y: 0, w: 16384, h: 16384 },
    });

    return Object.assign({
        slug: '2d-world',
        name: '2D World',
        mode: 'mmo',
        seed,
        bounds: { x: 0, y: 0, w: 16384, h: 16384 },
        chunk_size: 256,
        camera: {
            damping: 0.14,
            look_ahead: 0.18,
            max_lead: 150,
        },
        ambience: {
            vignette: 0.18,
            grid_alpha: 0.028,
            base_color: '#274634',
        },
        terrain_patches,
        landmarks,
        zones,
        resources,
        npcs,
        travel: [
            { from: 'outpost', to: 'wilderness', kind: 'walk' },
            { from: 'wilderness', to: 'outpost', kind: 'walk' },
            { from: 'outpost', to: 'farm_island', kind: 'boat' },
            { from: 'farm_island', to: 'outpost', kind: 'boat' },
            { from: 'farm_island', to: 'ship', kind: 'walk' },
            { from: 'ship', to: 'farm_island', kind: 'walk' },
            { from: 'outpost', to: 'dungeon_depths', kind: 'bus' },
            { from: 'dungeon_depths', to: 'outpost', kind: 'bus' },
            { from: 'outpost', to: 'pine_watch', kind: 'trail' },
            { from: 'pine_watch', to: 'outpost', kind: 'trail' },
            { from: 'wilderness', to: 'iron_fields', kind: 'road' },
            { from: 'iron_fields', to: 'wilderness', kind: 'road' },
            { from: 'wilderness', to: 'glass_lake', kind: 'trail' },
            { from: 'glass_lake', to: 'wilderness', kind: 'trail' },
            { from: 'iron_fields', to: 'ember_basin', kind: 'road' },
            { from: 'ember_basin', to: 'iron_fields', kind: 'road' },
            { from: 'glass_lake', to: 'ember_basin', kind: 'ferry' },
            { from: 'ember_basin', to: 'glass_lake', kind: 'ferry' },
        ],
    }, classicPresentation);
}

const STARTER_WORLD = Object.freeze(buildStarterWorld());

module.exports = { STARTER_WORLD, buildStarterWorld };
