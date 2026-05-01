'use strict';

const LEGACY_ITEM_ALIASES = Object.freeze({
    logs: 'wood',
    logs_oak: 'oak_log',
    ore_tin: 'copper_ore',
    ore_copper: 'copper_ore',
    ore_iron: 'iron_ore',
    ore_coal: 'coal',
    berries: 'herbs',
    weed_seed: 'seeds',
    pickaxe: 'stone_pickaxe',
    hatchet: 'stone_hatchet',
    sword_iron: 'iron_sword',
    weapon_pistol_wood: 'short_bow',
});

const RESOURCE_KIND_BY_CLASS = Object.freeze({
    tree: { kind: 'tree', loot_table_id: 'loot.tree.oak' },
    tree_oak: { kind: 'tree', loot_table_id: 'loot.tree.oak', variant: 'oak' },
    bush: { kind: 'bush', loot_table_id: 'loot.bush.herbs' },
    ore_tin: { kind: 'rock', loot_table_id: 'loot.rock.basic', variant: 'tin' },
    ore_copper: { kind: 'rock', loot_table_id: 'loot.rock.basic', variant: 'copper' },
    ore_iron: { kind: 'rock', loot_table_id: 'loot.rock.iron', variant: 'iron' },
    ore_coal: { kind: 'rock', loot_table_id: 'loot.rock.iron', variant: 'coal' },
});

const RUNTIME_KIND_BY_CLASS = Object.freeze({
    wall1: 'wall',
    'wall1-half': 'wall_half',
    forcefield: 'forcefield',
    chest: 'chest',
    tool_cupboard: 'tool_cupboard',
    text_sign: 'text_sign',
    text_sign_pickup: 'text_sign',
    bed: 'bed',
    vehicle_car1: 'vehicle_car1',
    vehicle_car_police: 'vehicle_car_police',
    barbed_wire: 'barbed_wire',
    weed_plant: 'weed_plant',
    meth_lab_mid: 'meth_lab',
    meth_lab_pro: 'meth_lab',
});

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function round(value) {
    return Math.round(Number(value) || 0);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function legacyClass(entry) {
    return String(entry && entry.class || '').trim();
}

function legacyPosition(entry) {
    const pos = Array.isArray(entry && entry.pos) ? entry.pos : [];
    return {
        x: Number(pos[0]) || 0,
        y: Number(pos[1]) || 0,
    };
}

function legacyRotation(entry) {
    const value = Number(entry && entry.rotate);
    return Number.isFinite(value) ? value : 0;
}

function legacyBbox(entry) {
    return Array.isArray(entry && entry.bbox)
        ? entry.bbox.slice(0, 4).map((value) => Number(value) || 0)
        : [0, 0, 0, 0];
}

function legacySize(entry, fallback = 48) {
    const bbox = legacyBbox(entry);
    const candidates = bbox.slice(2).filter((value) => Number.isFinite(value) && value > 0);
    if (!candidates.length) return fallback;
    return clamp(Math.round(Math.max(...candidates)), 24, 220);
}

function canonicalLegacyItemId(value) {
    const raw = String(value || '').trim();
    return LEGACY_ITEM_ALIASES[raw] || raw;
}

function normalizeLegacyContainer(container) {
    if (!Array.isArray(container)) return [];
    return container
        .map((entry) => {
            const rawId = String(entry && (entry.item_id || entry.itemId || entry.item) || '').trim();
            const quantity = Math.max(0, Math.floor(Number(entry && (entry.quantity || entry.qty || entry.am || entry.amount) || 0)));
            if (!rawId || quantity <= 0) return null;
            return {
                item_id: canonicalLegacyItemId(rawId),
                quantity,
                metadata: {
                    legacy_item_id: rawId,
                },
            };
        })
        .filter(Boolean);
}

function inferZoneId(x, y, zones = []) {
    if (!Array.isArray(zones) || !zones.length) return 'wilderness';
    let containing = null;
    let containingDistSq = Number.POSITIVE_INFINITY;
    for (const zone of zones) {
        if (!zone || !zone.spawn || zone.radius == null) continue;
        const dx = (Number(zone.spawn.x) || 0) - x;
        const dy = (Number(zone.spawn.y) || 0) - y;
        const distSq = (dx * dx) + (dy * dy);
        const radiusSq = Math.pow(Number(zone.radius) || 0, 2);
        if (distSq <= radiusSq && distSq < containingDistSq) {
            containing = zone;
            containingDistSq = distSq;
        }
    }
    if (containing) return containing.zone_id;
    let nearest = zones[0];
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (const zone of zones) {
        if (!zone || !zone.spawn) continue;
        const dx = (Number(zone.spawn.x) || 0) - x;
        const dy = (Number(zone.spawn.y) || 0) - y;
        const distSq = (dx * dx) + (dy * dy);
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            nearest = zone;
        }
    }
    return nearest && nearest.zone_id || 'wilderness';
}

function baseMetadata(entry) {
    const cls = legacyClass(entry);
    return {
        legacy_class: cls,
        legacy_rotation: legacyRotation(entry),
        legacy_bbox: legacyBbox(entry),
        legacy_parts_count: Array.isArray(entry && entry.parts) ? entry.parts.length : 0,
    };
}

function normalizeLegacyResource(entry, index, options = {}) {
    const cls = legacyClass(entry);
    const mapping = RESOURCE_KIND_BY_CLASS[cls];
    if (!mapping) return null;
    const position = legacyPosition(entry);
    const zone_id = inferZoneId(position.x, position.y, options.zones || []);
    const hp = Math.max(1, Math.floor(Number(entry && (entry.Health || entry.hp) || 4)));
    const max_hp = Math.max(hp, Math.floor(Number(entry && (entry.HealthMax || entry.max_hp) || hp)));
    const metadata = Object.assign(baseMetadata(entry), {
        size: legacySize(entry, mapping.kind === 'tree' ? 92 : 54),
    });
    if (mapping.variant) metadata.variant = mapping.variant;
    if (entry && entry.Owner) metadata.owner = String(entry.Owner);
    return {
        id: `${options.idPrefix || 'legacy'}-resource-${index + 1}`,
        zone_id,
        kind: mapping.kind,
        x: position.x,
        y: position.y,
        hp,
        max_hp,
        loot_table_id: mapping.loot_table_id,
        metadata,
    };
}

function normalizeLegacyRuntimeEntity(entry, index, options = {}) {
    const cls = legacyClass(entry);
    if (!cls || cls === 'player') return null;
    const position = legacyPosition(entry);
    const zone_id = inferZoneId(position.x, position.y, options.zones || []);
    const isPickup = entry && entry.itemAm != null;
    const kind = RUNTIME_KIND_BY_CLASS[cls] || (isPickup ? 'pickup' : 'prop');
    const size = legacySize(entry, kind === 'pickup' ? 40 : kind.startsWith('vehicle_') ? 128 : 56);
    const hp = Math.max(0, Math.floor(Number(entry && (entry.Health || entry.hp) || (kind === 'weed_plant' ? 10 : 0))));
    const max_hp = Math.max(hp, Math.floor(Number(entry && (entry.HealthMax || entry.max_hp) || hp)));
    const metadata = Object.assign(baseMetadata(entry), {
        size,
        rotation: legacyRotation(entry),
    });
    const ownerId = entry && (entry.Owner || entry.PlacedBy) ? String(entry.Owner || entry.PlacedBy) : null;
    if (ownerId) metadata.owner = ownerId;
    if (Array.isArray(entry && entry.BuildOrigin)) metadata.build_origin = clone(entry.BuildOrigin);
    if (Number(entry && entry.BuildRadius) > 0) metadata.build_radius = Number(entry.BuildRadius);
    if (entry && entry.SignText) metadata.sign_text = String(entry.SignText);
    if (Array.isArray(entry && entry.Container)) metadata.container = normalizeLegacyContainer(entry.Container);
    if (entry && entry.Opened != null) metadata.opened = Number(entry.Opened) > 0;
    if (entry && entry.AutoClose != null) metadata.auto_close_at = Number(entry.AutoClose) || null;
    if (kind === 'pickup') {
        metadata.item_id = canonicalLegacyItemId(cls);
        metadata.quantity = Math.max(1, Math.floor(Number(entry && entry.itemAm) || 1));
        metadata.legacy_item_id = cls;
    }
    if (kind === 'vehicle_car1' || kind === 'vehicle_car_police') {
        metadata.vehicle_model = cls;
        metadata.quantity = Math.max(1, Math.floor(Number(entry && entry.itemAm) || 1));
    }
    if (kind === 'meth_lab') metadata.lab_variant = cls;
    if (cls === 'weed_plant') {
        metadata.grown = !!(entry && entry.Grown);
        metadata.growing = !!(entry && entry.IsGrowing);
    }
    return {
        id: `${options.idPrefix || 'legacy'}-entity-${index + 1}`,
        world_id: options.worldId || 'main',
        zone_id,
        kind,
        template_id: kind,
        x: position.x,
        y: position.y,
        hp,
        max_hp,
        owner_id: ownerId,
        state_version: 0,
        metadata,
    };
}

function importLegacyEntities(entries, options = {}) {
    const resources = [];
    const runtime_entities = [];
    const skipped = [];
    for (const [index, entry] of (Array.isArray(entries) ? entries : []).entries()) {
        const cls = legacyClass(entry);
        if (!cls || cls === 'player') {
            skipped.push({ index, class: cls || 'unknown', reason: 'non-world-entity' });
            continue;
        }
        const resource = normalizeLegacyResource(entry, index, options);
        if (resource) {
            resources.push(resource);
            continue;
        }
        const runtimeEntity = normalizeLegacyRuntimeEntity(entry, index, options);
        if (runtimeEntity) runtime_entities.push(runtimeEntity);
        else skipped.push({ index, class: cls, reason: 'unsupported' });
    }
    return {
        resources,
        runtime_entities,
        summary: {
            resources: resources.length,
            runtime_entities: runtime_entities.length,
            skipped: skipped.length,
        },
        skipped,
    };
}

module.exports = {
    LEGACY_ITEM_ALIASES,
    RESOURCE_KIND_BY_CLASS,
    RUNTIME_KIND_BY_CLASS,
    canonicalLegacyItemId,
    normalizeLegacyContainer,
    normalizeLegacyResource,
    normalizeLegacyRuntimeEntity,
    importLegacyEntities,
    inferZoneId,
};
