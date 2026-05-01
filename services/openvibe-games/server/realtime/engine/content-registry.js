'use strict';

const { ITEMS } = require('../catalog/item-catalog');
const { RECIPES } = require('../catalog/recipes');
const { LOOT_TABLES } = require('../catalog/loot-tables');
const { NPC_TEMPLATES } = require('../catalog/npc-templates');
const { SKILL_KEYS } = require('../catalog/skills');
const { listScriptRealms } = require('../../mods/manifest-schema');

const HOOK_SURFACES = Object.freeze([
    'player:join',
    'player:leave',
    'interaction:prompt',
    'action:processed',
    'snapshot:decorate',
]);

const BASE_RESOURCE_TYPES = Object.freeze([
    {
        kind: 'tree',
        name: 'Tree',
        interaction: {
            verb: 'chop',
            label: 'tree',
            tool_hint: 'Gather with your hatchet',
            held_item_id: 'stone_hatchet',
            skill: 'woodcut',
        },
        render: {
            shape: 'tree',
            foliage: [0x4caf50, 0x3f9850, 0x56b85b],
            trunk: 0x8d6e63,
            hit: 0x8cff8c,
        },
    },
    {
        kind: 'rock',
        name: 'Ore Vein',
        interaction: {
            verb: 'mine',
            label: 'ore vein',
            tool_hint: 'Gather with your pickaxe',
            held_item_id: 'stone_pickaxe',
            skill: 'mining',
        },
        render: {
            shape: 'rock',
            rock: 0x95a5a6,
            hit: 0xd2dee7,
        },
    },
    {
        kind: 'bush',
        name: 'Bush',
        interaction: {
            verb: 'harvest',
            label: 'bush',
            tool_hint: 'Gather with your hands',
            held_item_id: '',
            skill: 'farming',
        },
        render: {
            shape: 'bush',
            shrub: [0x7ed957, 0x6dc44e],
            hit: 0xb3ff9c,
        },
    },
]);

const BASE_STRUCTURE_TYPES = Object.freeze([
    { id: 'wall', name: 'Wall', size: 48, render: { shape: 'wall', color: 0x786452, accent: 0x0f0f0f } },
    { id: 'door', name: 'Door', size: 48, render: { shape: 'door', color: 0xb5651d, accent: 0xf0c85a } },
    { id: 'bed', name: 'Bed', size: 52, render: { shape: 'bed', color: 0x6f4e7c, accent: 0xe7d6ff } },
    { id: 'chest', name: 'Chest', size: 46, render: { shape: 'chest', color: 0x8b5a2b, accent: 0xe5c07b } },
    { id: 'workbench', name: 'Workbench', size: 52, render: { shape: 'workbench', color: 0x6d4c41, accent: 0xcaa472 } },
    { id: 'furnace', name: 'Furnace', size: 54, render: { shape: 'furnace', color: 0x5d6d7e, accent: 0xf0c85a } },
    { id: 'farm_plot', name: 'Farm Plot', size: 56, render: { shape: 'farm_plot', color: 0x6b4f2d, accent: 0x8bc34a } },
    { id: 'campfire', name: 'Campfire', size: 42, render: { shape: 'campfire', color: 0x7a4a1f, accent: 0xffd166 } },
]);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
    return Array.isArray(value) ? value.filter(isObject) : [];
}

function humanizeId(value) {
    return String(value || '')
        .replace(/^build_/, '')
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (match) => match.toUpperCase())
        .trim();
}

function buildIndex(entries, keyField) {
    return Object.fromEntries((entries || [])
        .filter((entry) => entry && entry[keyField] != null)
        .map((entry) => [String(entry[keyField]), entry]));
}

function mergeRecords(baseEntries, extraEntries, keyField) {
    const map = new Map();
    for (const entry of baseEntries || []) {
        if (!entry || entry[keyField] == null) continue;
        map.set(String(entry[keyField]), clone(entry));
    }
    for (const entry of extraEntries || []) {
        if (!entry || entry[keyField] == null) continue;
        const key = String(entry[keyField]);
        map.set(key, Object.assign({}, map.get(key) || {}, clone(entry)));
    }
    return Array.from(map.values());
}

function mergeTravel(baseEntries, extraEntries) {
    const map = new Map();
    for (const entry of [...(baseEntries || []), ...(extraEntries || [])]) {
        if (!entry || !entry.from || !entry.to) continue;
        const key = `${entry.from}|${entry.to}|${entry.kind || ''}`;
        map.set(key, Object.assign({}, map.get(key) || {}, clone(entry)));
    }
    return Array.from(map.values());
}

function spawnKey(entry, kindField) {
    if (entry && entry.id != null) return String(entry.id);
    const zone = String(entry && (entry.zone_id || entry.zoneId) || 'outpost');
    const kind = String(entry && entry[kindField] || entry && entry.kind || 'spawn');
    const x = Number(entry && entry.x) || 0;
    const y = Number(entry && entry.y) || 0;
    return `${zone}|${kind}|${x}|${y}`;
}

function mergeSpawns(baseEntries, extraEntries, kindField) {
    const map = new Map();
    for (const entry of [...(baseEntries || []), ...(extraEntries || [])]) {
        if (!entry) continue;
        const key = spawnKey(entry, kindField);
        map.set(key, Object.assign({}, map.get(key) || {}, clone(entry)));
    }
    return Array.from(map.values());
}

function splitNpcEntries(entries) {
    const templates = [];
    const spawns = [];
    for (const entry of entries || []) {
        if (!entry) continue;
        if ((entry.template_id || entry.templateId) && (entry.x != null || entry.y != null)) {
            spawns.push(Object.assign({}, entry, {
                template_id: entry.template_id || entry.templateId,
                zone_id: entry.zone_id || entry.zoneId || 'outpost',
            }));
        } else if (entry.id) {
            templates.push(entry);
        }
    }
    return { templates, spawns };
}

function splitResourceEntries(entries) {
    const definitions = [];
    const spawns = [];
    for (const entry of entries || []) {
        if (!entry || !entry.kind) continue;
        if (entry.x != null || entry.y != null) spawns.push(entry);
        else definitions.push(entry);
    }
    return { definitions, spawns };
}

function equipSlotFor(item) {
    if (!item || !item.category) return null;
    if (item.category === 'weapon') return 'weapon';
    if (item.category === 'armor') return 'armor';
    if (item.category === 'tool') {
        const skill = item.metadata && item.metadata.skill;
        if (skill === 'woodcut') return 'axe';
        if (skill === 'mining') return 'pickaxe';
        if (skill === 'fishing') return 'rod';
    }
    return null;
}

function defaultWeaponType(itemId) {
    const id = String(itemId || '');
    if (id.includes('sword')) return 'blade';
    if (id.includes('spear')) return 'spear';
    if (id.includes('bow')) return 'bow';
    if (id.includes('hatchet') || id.includes('axe')) return 'axe';
    if (id.includes('pickaxe')) return 'pickaxe';
    if (id.includes('fishing_rod')) return 'rod';
    if (id.includes('hoe')) return 'hoe';
    if (id === 'hammer') return 'hammer';
    return 'club';
}

function defaultItemRender(item) {
    const type = defaultWeaponType(item && item.item_id);
    const byType = {
        blade: { weapon_type: 'blade', length: 34, color: 0xe8edf8, accent: 0x6b4c2d },
        spear: { weapon_type: 'spear', length: 42, color: 0xc7d2de, accent: 0x7f5539 },
        bow: { weapon_type: 'bow', length: 34, color: 0xb07a3c, accent: 0xdcc18f },
        axe: { weapon_type: 'axe', length: 28, color: 0x8c613c, accent: 0xb8c4cf },
        pickaxe: { weapon_type: 'pickaxe', length: 30, color: 0x8c613c, accent: 0xb8c4cf },
        rod: { weapon_type: 'rod', length: 40, color: 0xb78e58, accent: 0x7de3ff },
        hoe: { weapon_type: 'hoe', length: 30, color: 0x8e6b41, accent: 0xadb8c2 },
        hammer: { weapon_type: 'hammer', length: 24, color: 0x8b633e, accent: 0x9ba8b3 },
        club: { weapon_type: 'club', length: 26, color: 0x8c613c, accent: 0xb08d57 },
    };
    if (item && (item.category === 'weapon' || item.category === 'tool')) return byType[type];
    return { icon: item && item.category || 'misc' };
}

function defaultNpcRender(template) {
    const id = String(template && template.id || '');
    if (id.includes('boar')) {
        return {
            body: 'boar',
            palette: {
                tunic: 0x5f4738,
                trim: 0x755744,
                skin: 0xf7f0df,
                leg: 0x2e2118,
                accent: 0xf4efe7,
            },
            parts: [
                { shape: 'line', x1: 10, y1: -4, x2: 20, y2: -10, width: 2.5, palette: 'accent' },
                { shape: 'line', x1: 10, y1: 2, x2: 20, y2: 10, width: 2.5, palette: 'accent' },
            ],
        };
    }
    if (template && template.kind === 'boss') {
        return {
            body: 'humanoid',
            palette: {
                tunic: 0x5e2a2a,
                trim: 0xffb980,
                skin: 0xe8c3a0,
                leg: 0x2e1616,
                accent: 0xffd8b0,
            },
            parts: [
                { shape: 'polygon', points: [[-10, -28], [-4, -40], [0, -30], [4, -40], [10, -28], [0, -24]], palette: 'trim', alpha: 0.95 },
                { shape: 'ellipse', x: 0, y: 10, rx: 16, ry: 7, palette: 'accent', alpha: 0.12 },
            ],
        };
    }
    if (template && template.kind === 'mob') {
        return {
            body: 'humanoid',
            palette: {
                tunic: 0x5d2e2e,
                trim: 0xff9191,
                skin: 0xd0b090,
                leg: 0x342018,
                accent: 0xffc7b8,
            },
            parts: [
                { shape: 'roundedRect', x: -11, y: 1, w: 22, h: 8, radius: 4, palette: 'trim', alpha: 0.92 },
                { shape: 'line', x1: -14, y1: -12, x2: -22, y2: 2, width: 3, palette: 'accent', alpha: 0.55 },
            ],
        };
    }
    return {
        body: 'humanoid',
        palette: {
            tunic: 0x365544,
            trim: 0xa7f2c2,
            skin: 0xf0d8bc,
            leg: 0x24352d,
            accent: 0xd8fff0,
        },
        parts: [
            { shape: 'roundedRect', x: 7, y: -1, w: 8, h: 18, radius: 4, palette: 'trim', alpha: 0.9 },
            { shape: 'line', x1: -12, y1: -18, x2: 12, y2: -18, width: 2, palette: 'accent', alpha: 0.45 },
        ],
    };
}

function defaultStructureRender(id) {
    const kind = String(id || '');
    if (kind.includes('door')) return { shape: 'door', color: 0xb5651d, accent: 0xf0c85a };
    if (kind.includes('bed')) return { shape: 'bed', color: 0x6f4e7c, accent: 0xe7d6ff };
    if (kind.includes('furnace')) return { shape: 'furnace', color: 0x5d6d7e, accent: 0xf0c85a };
    if (kind.includes('campfire')) return { shape: 'campfire', color: 0x7a4a1f, accent: 0xffd166 };
    if (kind.includes('farm')) return { shape: 'farm_plot', color: 0x6b4f2d, accent: 0x8bc34a };
    if (kind.includes('chest')) return { shape: 'chest', color: 0x8b5a2b, accent: 0xe5c07b };
    if (kind.includes('workbench')) return { shape: 'workbench', color: 0x6d4c41, accent: 0xcaa472 };
    if (kind.includes('wall')) return { shape: 'wall', color: 0x786452, accent: 0x0f0f0f };
    return { shape: 'block', color: 0x786452, accent: 0x0f0f0f };
}

function buildStructureDefinitions(structures) {
    const definitions = {};
    for (const structure of structures || []) {
        const id = String(structure.id || structure.type || 'structure');
        const render = isObject(structure.render) ? clone(structure.render) : {};
        definitions[id] = {
            id,
            name: structure.name || humanizeId(id),
            size: Number(structure.size) || 48,
            render: Object.assign({}, defaultStructureRender(id), render),
        };
    }
    return definitions;
}

function buildItemDefinitions(items, structureDefinitions) {
    const definitions = {};
    for (const item of items || []) {
        const metadata = isObject(item.metadata) ? clone(item.metadata) : {};
        const render = isObject(item.render) ? clone(item.render) : (isObject(metadata.render) ? clone(metadata.render) : {});
        const buildKind = item.category === 'build'
            ? String(item.structure_kind || metadata.structure_kind || String(item.item_id || '').replace(/^build_/, ''))
            : '';
        const structureDefinition = buildKind ? structureDefinitions[buildKind] || null : null;
        definitions[item.item_id] = {
            id: item.item_id,
            name: item.name,
            category: item.category,
            stackable: item.stackable !== 0,
            max_stack: Number(item.max_stack) || (item.stackable === 0 ? 1 : 999),
            equip_slot: equipSlotFor(item),
            metadata,
            builds: buildKind ? {
                structure_kind: buildKind,
                size: Number(item.size || metadata.size || structureDefinition && structureDefinition.size) || 48,
            } : null,
            render: Object.assign({}, defaultItemRender(item), render),
        };
    }
    return definitions;
}

function buildNpcDefinitions(templates) {
    const definitions = {};
    for (const template of templates || []) {
        const render = isObject(template.render) ? clone(template.render) : {};
        definitions[template.id] = {
            id: template.id,
            name: template.name,
            kind: template.kind,
            held_item_id: template.held_item_id || '',
            interaction: template.interaction ? clone(template.interaction) : null,
            render: Object.assign({}, defaultNpcRender(template), render),
        };
    }
    return definitions;
}

function buildResourceDefinitions(resourceTypes) {
    const defaults = buildIndex(BASE_RESOURCE_TYPES, 'kind');
    const definitions = {};
    for (const resourceType of resourceTypes || []) {
        const kind = String(resourceType.kind);
        const base = defaults[kind] || { kind, name: humanizeId(kind), interaction: {}, render: {} };
        definitions[kind] = {
            kind,
            name: resourceType.name || base.name,
            interaction: Object.assign({}, base.interaction || {}, clone(resourceType.interaction || {})),
            render: Object.assign({}, base.render || {}, clone(resourceType.render || {})),
        };
    }
    return definitions;
}

function buildRuntimeCatalog({ world, worldDefinition, mods = [] }) {
    const sourceWorldDefinition = clone(worldDefinition || {});
    let items = clone(ITEMS);
    let recipes = clone(RECIPES);
    let lootTables = clone(LOOT_TABLES);
    let npcTemplates = clone(NPC_TEMPLATES);
    let resourceTypes = clone(BASE_RESOURCE_TYPES);
    let structureTypes = clone(BASE_STRUCTURE_TYPES);
    let zones = clone(sourceWorldDefinition.zones || []);
    let travel = clone(sourceWorldDefinition.travel || []);
    let worldResources = clone(sourceWorldDefinition.resources || []);
    let worldNpcs = clone(sourceWorldDefinition.npcs || []);

    const enabledMods = [];

    for (const mod of mods || []) {
        const manifest = mod && isObject(mod.manifest) ? mod.manifest : {};
        const content = isObject(manifest.content) ? manifest.content : {};
        const scriptRealms = listScriptRealms(manifest);
        const npcSplit = splitNpcEntries([
            ...asArray(content.npcs),
            ...asArray(content.npc_templates),
        ]);
        const resourceSplit = splitResourceEntries([
            ...asArray(content.resources),
            ...asArray(content.resource_types),
        ]);

        items = mergeRecords(items, asArray(content.items), 'item_id');
        recipes = mergeRecords(recipes, asArray(content.recipes), 'id');
        lootTables = mergeRecords(lootTables, asArray(content.loot_tables), 'id');
        npcTemplates = mergeRecords(npcTemplates, npcSplit.templates, 'id');
        resourceTypes = mergeRecords(resourceTypes, resourceSplit.definitions, 'kind');
        structureTypes = mergeRecords(structureTypes, asArray(content.structures), 'id');
        zones = mergeRecords(zones, asArray(content.zones), 'zone_id');
        travel = mergeTravel(travel, asArray(content.travel));
        worldResources = mergeSpawns(worldResources, [
            ...resourceSplit.spawns,
            ...asArray(content.world_resources),
        ], 'kind');
        worldNpcs = mergeSpawns(worldNpcs, [
            ...npcSplit.spawns,
            ...asArray(content.world_npcs),
        ], 'template_id');

        enabledMods.push({
            id: mod.id,
            slug: mod.slug,
            name: mod.name,
            version: mod.version,
            owner_id: mod.owner_id || null,
            trust_level: mod.trust_level || 'untrusted',
            permissions: clone(manifest.permissions || {}),
            content_keys: Object.keys(content),
            has_scripts: scriptRealms.length > 0,
            script_realms: scriptRealms,
            assets: clone(mod.assets || []),
        });
    }

    const structureDefinitions = buildStructureDefinitions(structureTypes);
    const itemDefinitions = buildItemDefinitions(items, structureDefinitions);
    const npcDefinitions = buildNpcDefinitions(npcTemplates);
    const resourceDefinitions = buildResourceDefinitions(resourceTypes);

    const mergedWorldDefinition = Object.assign({}, sourceWorldDefinition, {
        zones,
        travel,
        resources: worldResources,
        npcs: worldNpcs,
    });

    return {
        version: 1,
        world,
        world_definition: mergedWorldDefinition,
        items,
        item_map: buildIndex(items, 'item_id'),
        recipes,
        recipe_map: buildIndex(recipes, 'id'),
        npcs: npcTemplates,
        npc_map: buildIndex(npcTemplates, 'id'),
        loot_tables: lootTables,
        loot_table_map: buildIndex(lootTables, 'id'),
        skills: clone(SKILL_KEYS),
        zones,
        travel,
        mods: enabledMods,
        definitions: {
            items: itemDefinitions,
            npcs: npcDefinitions,
            resources: resourceDefinitions,
            structures: structureDefinitions,
            render_profiles: {
                items: Object.fromEntries(Object.entries(itemDefinitions).map(([key, entry]) => [key, clone(entry.render || {})])),
                npcs: Object.fromEntries(Object.entries(npcDefinitions).map(([key, entry]) => [key, clone(entry.render || {})])),
                resources: Object.fromEntries(Object.entries(resourceDefinitions).map(([key, entry]) => [key, clone(entry.render || {})])),
                structures: Object.fromEntries(Object.entries(structureDefinitions).map(([key, entry]) => [key, clone(entry.render || {})])),
            },
        },
        engine: {
            catalog_version: 1,
            content_layers: ['core', ...enabledMods.map((mod) => `mod:${mod.slug}`)],
            hook_surfaces: clone(HOOK_SURFACES),
        },
    };
}

module.exports = {
    BASE_RESOURCE_TYPES,
    BASE_STRUCTURE_TYPES,
    HOOK_SURFACES,
    buildRuntimeCatalog,
};
