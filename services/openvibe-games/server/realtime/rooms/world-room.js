'use strict';

const crypto = require('crypto');

const model = require('../../model');
const worldStore = require('../world-store');
const { GAME_EVENT_TYPES } = require('@openvibe/contracts');
const { visibleWithinAoi } = require('../net/interest-management');
const { pushHistory } = require('../net/lag-compensation');
const { defaultWeapon, computeDamage, canAttack, markAttack, findRewoundTarget, targetInRange } = require('../systems/combat-system');
const { updatePlayerMovement } = require('../systems/movement-system');
const { applyGatherDamage, maybeRespawn: maybeRespawnResource } = require('../systems/resource-system');
const { canPlaceStructure } = require('../systems/build-system');
const { canTravel, spawnForZone } = require('../systems/travel-system');
const { worldSnapshotPayload } = require('../systems/persistence-system');
const { validateInput } = require('../systems/anti-cheat-system');
const { SKILL_KEYS, SKILL_TO_XP_FIELD } = require('../catalog/skills');
const { buildRuntimeCatalog } = require('../engine/content-registry');
const { createHookBus } = require('../engine/hook-bus');
const { installModHooks } = require('../engine/mod-script-runtime');
const { levelForXp, xpRequiredForNext } = require('../engine/skills');
const { rollLoot } = require('../engine/loot');
const { normalizeLegacyContainer } = require('../engine/legacy-entity-importer');
const inventoryUtils = require('../engine/inventory');

const LOOT_PICKUP_RADIUS = 48;
const NPC_INTERACT_RADIUS = 96;
const RESOURCE_INTERACT_RADIUS = 72;
const HOTBAR_SIZE = 9;
const HOTBAR_ASSIGNABLE_CATEGORIES = new Set(['weapon', 'tool', 'build', 'consumable', 'resource', 'currency']);

function uid(prefix) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function humanizeId(value) {
    return String(value || '')
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (match) => match.toUpperCase())
        .trim() || 'Object';
}

function asBoolObject(input) {
    const keys = input && typeof input === 'object' ? input : {};
    return {
        up: !!keys.up,
        down: !!keys.down,
        left: !!keys.left,
        right: !!keys.right,
        sprint: !!keys.sprint,
        attack: !!keys.attack,
        interact: !!keys.interact,
    };
}

function isHostileNpc(npc) {
    return npc && (npc.kind === 'mob' || npc.kind === 'boss');
}

function distanceSq(a, b) {
    const dx = Number(a && a.x || 0) - Number(b && b.x || 0);
    const dy = Number(a && a.y || 0) - Number(b && b.y || 0);
    return (dx * dx) + (dy * dy);
}

class WorldRoom {
    constructor(options) {
        const opts = options || {};
        this.world = opts.world;
        this.worldDefinition = opts.worldDefinition;
        this.publish = typeof opts.publish === 'function' ? opts.publish : () => {};
        this.emitToSocket = typeof opts.emitToSocket === 'function' ? opts.emitToSocket : () => {};
        this.tickRate = Number(opts.tickRate) || 20;
        this.chunkSize = Number((opts.worldDefinition && opts.worldDefinition.chunk_size) || 256);
        this.aoiRadius = Number(opts.aoiRadius) || 520;
        this.players = new Map();
        this.playersBySocket = new Map();
        this.histories = new Map();
        this.npcs = new Map();
        this.resources = new Map();
        this.runtimeEntities = new Map();
        this.loot = new Map();
        this.projectiles = new Map();
        this.structures = new Map();
        this.chat = [];
        this.feed = [];
        this.lastPersistAt = 0;
        this.lastSnapshotAt = 0;
        this.sequence = 0;
        this.hooks = createHookBus();
        this.scriptDiagnostics = [];
        this.catalog = null;
        this.itemMap = {};
        this.itemDefinitions = {};
        this.recipeMap = {};
        this.npcTemplateMap = {};
        this.npcDefinitions = {};
        this.lootTableMap = {};
        this.resourceDefinitions = {};
        this.structureDefinitions = {};
        this.runtimeEntityDefinitions = {};
        this.setCatalog(opts.catalog || buildRuntimeCatalog({
            world: this.world,
            worldDefinition: this.worldDefinition,
            mods: [],
        }));
        this._seed();
    }

    setCatalog(catalog) {
        const nextCatalog = catalog || buildRuntimeCatalog({
            world: this.world,
            worldDefinition: this.worldDefinition,
            mods: [],
        });
        this.catalog = nextCatalog;
        if (nextCatalog && nextCatalog.world_definition) this.worldDefinition = nextCatalog.world_definition;
        this.chunkSize = Number((this.worldDefinition && this.worldDefinition.chunk_size) || this.chunkSize || 256);
        this.itemMap = nextCatalog.item_map || {};
        this.itemDefinitions = nextCatalog.definitions && nextCatalog.definitions.items || {};
        this.recipeMap = nextCatalog.recipe_map || {};
        this.npcTemplateMap = nextCatalog.npc_map || {};
        this.npcDefinitions = nextCatalog.definitions && nextCatalog.definitions.npcs || {};
        this.lootTableMap = nextCatalog.loot_table_map || {};
        this.resourceDefinitions = nextCatalog.definitions && nextCatalog.definitions.resources || {};
        this.structureDefinitions = nextCatalog.definitions && nextCatalog.definitions.structures || {};
        this.runtimeEntityDefinitions = nextCatalog.definitions && (nextCatalog.definitions.runtime_entities || nextCatalog.definitions.entities) || {};
        this.hooks = createHookBus();
        this.scriptDiagnostics = [];
        if (nextCatalog && nextCatalog.__server && Array.isArray(nextCatalog.__server.enabledMods)) {
            const scriptRuntime = installModHooks({
                hooks: this.hooks,
                room: this,
                catalog: nextCatalog,
                mods: nextCatalog.__server.enabledMods,
                allowedHooks: nextCatalog.engine && nextCatalog.engine.hook_surfaces || [],
                allowUntrusted: nextCatalog.__server.allowUntrustedScripts === true,
            });
            this.scriptDiagnostics = scriptRuntime.diagnostics;
        }
        if (this.resources && this.npcs && (this.resources.size > 0 || this.npcs.size > 0)) this._syncCatalogSpawns();
        return this.catalog;
    }

    _resourceSeedKey(resource) {
        if (resource && resource.id) return String(resource.id);
        return `${String(resource && resource.zone_id || 'outpost')}|${String(resource && resource.kind || 'resource')}|${Number(resource && resource.x) || 0}|${Number(resource && resource.y) || 0}`;
    }

    _npcSeedKey(seed) {
        if (seed && seed.id) return String(seed.id);
        return `${String(seed && seed.zone_id || 'outpost')}|${String(seed && seed.template_id || 'npc')}|${Number(seed && seed.x) || 0}|${Number(seed && seed.y) || 0}`;
    }

    _runtimeEntitySeedKey(entity) {
        if (entity && entity.id) return String(entity.id);
        return `${String(entity && entity.zone_id || 'wilderness')}|${String(entity && entity.kind || 'entity')}|${Number(entity && entity.x) || 0}|${Number(entity && entity.y) || 0}`;
    }

    _createResourceEntry(resource) {
        return Object.assign({}, resource, {
            id: resource.id || uid('resource'),
            _catalog_key: this._resourceSeedKey(resource),
            zone_id: resource.zone_id || 'outpost',
            kind: resource.kind,
            x: Number(resource.x) || 0,
            y: Number(resource.y) || 0,
            hp: Number(resource.hp || resource.max_hp || 1),
            max_hp: Number(resource.max_hp || resource.hp || 1),
            respawn_ms: Number(resource.respawn_ms || 15000),
            respawn_at: resource.respawn_at ? Number(resource.respawn_at) : null,
            loot_table_id: resource.loot_table_id || null,
        });
    }

    _createNpcEntry(seed) {
        const template = this.npcTemplateMap[seed.template_id];
        if (!template) return null;
        return Object.assign({}, template, seed, {
            id: seed.id || uid('npc'),
            _catalog_key: this._npcSeedKey(seed),
            template_id: seed.template_id,
            zone_id: seed.zone_id || 'outpost',
            x: Number(seed.x) || 0,
            y: Number(seed.y) || 0,
            home_x: Number(seed.x) || 0,
            home_y: Number(seed.y) || 0,
            hp: Number(seed.hp || template.hp || 10),
            max_hp: Number(seed.max_hp || template.hp || 10),
            respawn_ms: Number(seed.respawn_ms || (template.kind === 'boss' ? 45000 : 15000)),
            cooldowns: { attack: 0 },
            interaction: template.interaction ? clone(template.interaction) : null,
            held_item_id: seed.held_item_id || template.held_item_id || '',
            facing: Number(seed.facing) || 1,
            aim_x: Number(seed.x) || 0,
            aim_y: Number(seed.y) || 0,
            vx: 0,
            vy: 0,
            moving: false,
            sprinting: false,
            step_phase: 0,
            attack_anim_until: 0,
            hit_flash_until: 0,
        });
    }

    _createRuntimeEntityEntry(seed) {
        if (!seed) return null;
        return {
            id: seed.id || uid('entity'),
            _catalog_key: this._runtimeEntitySeedKey(seed),
            world_id: seed.world_id || this.world.id,
            zone_id: seed.zone_id || 'wilderness',
            kind: String(seed.kind || seed.type || 'prop'),
            template_id: seed.template_id || null,
            x: Number(seed.x) || 0,
            y: Number(seed.y) || 0,
            hp: Number(seed.hp || 0),
            max_hp: Number(seed.max_hp || seed.hp || 0),
            owner_id: seed.owner_id || null,
            state_version: Number(seed.state_version || 0),
            metadata: clone(seed.metadata || {}),
        };
    }

    _syncCatalogSpawns() {
        const resourceSeeds = (this.worldDefinition && this.worldDefinition.resources) || [];
        for (const seed of resourceSeeds) {
            const key = this._resourceSeedKey(seed);
            const existing = Array.from(this.resources.values()).find((entry) => entry._catalog_key === key);
            if (!existing) {
                const resource = this._createResourceEntry(seed);
                this.resources.set(resource.id, resource);
            }
        }
        const npcSeeds = (this.worldDefinition && this.worldDefinition.npcs) || [];
        for (const seed of npcSeeds) {
            const key = this._npcSeedKey(seed);
            const existing = Array.from(this.npcs.values()).find((entry) => entry._catalog_key === key);
            if (!existing) {
                const npc = this._createNpcEntry(seed);
                if (npc) this.npcs.set(npc.id, npc);
                continue;
            }
            const template = this.npcTemplateMap[seed.template_id];
            if (!template) continue;
            existing.template_id = seed.template_id;
            existing.kind = seed.kind || template.kind || existing.kind;
            existing.name = seed.name || template.name || existing.name;
            existing.interaction = template.interaction ? clone(template.interaction) : existing.interaction;
            existing.held_item_id = seed.held_item_id || template.held_item_id || existing.held_item_id;
            existing.respawn_ms = Number(seed.respawn_ms || existing.respawn_ms || (template.kind === 'boss' ? 45000 : 15000));
        }

        const runtimeEntitySeeds = (this.worldDefinition && this.worldDefinition.runtime_entities) || [];
        for (const seed of runtimeEntitySeeds) {
            const key = this._runtimeEntitySeedKey(seed);
            const existing = Array.from(this.runtimeEntities.values()).find((entry) => entry._catalog_key === key);
            if (!existing) {
                const entity = this._createRuntimeEntityEntry(seed);
                if (entity) this.runtimeEntities.set(entity.id, entity);
            }
        }
    }

    bounds() {
        return Object.assign({ x: 0, y: 0, w: 8192, h: 8192 }, this.worldDefinition && this.worldDefinition.bounds || {});
    }

    _feed(type, payload) {
        this.feed.push({ type, payload: clone(payload || {}), at: new Date().toISOString() });
        while (this.feed.length > 50) this.feed.shift();
    }

    _publish(type, payload) {
        this.publish(type, payload);
        this._feed(type, payload);
    }

    _seed() {
        const storedResources = worldStore.listResourceNodes(this.world.id);
        const resourceSeeds = new Map();
        for (const resource of [...storedResources, ...((this.worldDefinition && this.worldDefinition.resources) || [])]) {
            const entry = this._createResourceEntry(resource);
            resourceSeeds.set(entry._catalog_key, entry);
        }
        for (const entry of resourceSeeds.values()) {
            this.resources.set(entry.id, entry);
        }

        const worldNpcs = (this.worldDefinition && this.worldDefinition.npcs) || [];
        for (const seed of worldNpcs) {
            const npc = this._createNpcEntry(seed);
            if (!npc) continue;
            this.npcs.set(npc.id, npc);
        }

        const runtimeEntitySeeds = new Map();
        for (const entry of [
            ...worldStore.listRuntimeEntities(this.world.id),
            ...((this.worldDefinition && this.worldDefinition.runtime_entities) || []),
        ]) {
            const entity = this._createRuntimeEntityEntry(entry);
            if (!entity) continue;
            runtimeEntitySeeds.set(entity._catalog_key, entity);
        }
        for (const entity of runtimeEntitySeeds.values()) {
            this.runtimeEntities.set(entity.id, entity);
        }

        const structures = model.listStructures({ world_id: this.world.id, limit: 500 });
        for (const structure of structures) {
            this.structures.set(structure.id, Object.assign({}, structure, {
                zone_id: structure.data && structure.data.zone_id || 'wilderness',
                size: Number(structure.data && structure.data.size) || 48,
            }));
        }

        const snapshot = worldStore.latestSnapshot(this.world.id);
        if (snapshot && snapshot.payload && snapshot.payload.version === 1) {
            this._restoreFromSnapshot(snapshot.payload);
        }
    }

    _restoreFromSnapshot(payload) {
        const resources = Array.isArray(payload.resources) ? payload.resources : [];
        for (const entry of resources) {
            if (!this.resources.has(entry.id)) continue;
            Object.assign(this.resources.get(entry.id), entry);
        }
        const npcs = Array.isArray(payload.npcs) ? payload.npcs : [];
        for (const entry of npcs) {
            if (!this.npcs.has(entry.id)) continue;
            Object.assign(this.npcs.get(entry.id), entry);
        }
        const loot = Array.isArray(payload.loot) ? payload.loot : [];
        for (const drop of loot) this.loot.set(drop.id, Object.assign({}, drop));
        const runtimeEntities = Array.isArray(payload.runtime_entities) ? payload.runtime_entities : [];
        for (const entry of runtimeEntities) {
            if (!this.runtimeEntities.has(entry.id)) continue;
            Object.assign(this.runtimeEntities.get(entry.id), entry, {
                metadata: clone(entry.metadata || this.runtimeEntities.get(entry.id).metadata || {}),
            });
        }
    }

    _recordHistory(entity) {
        const entry = { at: Date.now(), x: entity.x, y: entity.y, zone_id: entity.zone_id };
        const history = this.histories.get(entity.id) || [];
        this.histories.set(entity.id, pushHistory(history, entry, { maxEntries: 32 }));
    }

    _findPlayerByUserId(userId) {
        return Array.from(this.players.values()).find((player) => player.user_id === userId) || null;
    }

    _currentWorldChat(zoneId) {
        return this.chat.filter((item) => !zoneId || !item.zone_id || item.zone_id === zoneId).slice(-20);
    }

    _skillSnapshot(player) {
        const levels = {};
        for (const skill of SKILL_KEYS) {
            const field = SKILL_TO_XP_FIELD[skill];
            const xp = field ? Number(player[field] || 0) : 0;
            levels[skill] = Number(player.levels && player.levels[skill]) || levelForXp(xp);
        }
        return levels;
    }

    _skillXpSnapshot(player) {
        const xp = {};
        for (const skill of SKILL_KEYS) {
            const field = SKILL_TO_XP_FIELD[skill];
            xp[skill] = field ? Number(player[field] || 0) : 0;
        }
        return xp;
    }

    _skillProgressSnapshot(player) {
        const progress = {};
        for (const skill of SKILL_KEYS) {
            const field = SKILL_TO_XP_FIELD[skill];
            const xp = field ? Number(player[field] || 0) : 0;
            const level = Number(player.levels && player.levels[skill]) || levelForXp(xp);
            progress[skill] = {
                level,
                xp,
                xp_to_next: xpRequiredForNext(xp),
            };
        }
        return progress;
    }

    _normalizeHotbarEntry(entry) {
        if (!entry) return null;
        const itemId = String(entry && (entry.item_id || entry.itemId) || entry || '').trim();
        return itemId ? { item_id: itemId } : null;
    }

    _hotbarDefaults(player) {
        const defaults = Array.from({ length: HOTBAR_SIZE }, () => null);
        const preferred = [
            player && (player.equip_weapon || 'wooden_club'),
            player && (player.equip_axe || 'stone_hatchet'),
            player && (player.equip_pickaxe || 'stone_pickaxe'),
            player && (player.equip_rod || 'fishing_rod'),
            'hammer',
        ];
        preferred.forEach((itemId, index) => {
            if (itemId) defaults[index] = { item_id: itemId };
        });
        return defaults;
    }

    _coerceHotbar(entries, player) {
        const next = this._hotbarDefaults(player);
        const incoming = Array.isArray(entries) ? entries : [];
        for (let index = 0; index < HOTBAR_SIZE; index += 1) {
            if (incoming[index] === null) {
                next[index] = null;
                continue;
            }
            const normalized = this._normalizeHotbarEntry(incoming[index]);
            if (normalized) next[index] = normalized;
        }
        return next.slice(0, HOTBAR_SIZE);
    }

    _persistHotbar(player) {
        const updated = model.setPlayerSourceVibeMetadata(player.user_id, {
            hotbar: Array.isArray(player.hotbar) ? player.hotbar : [],
        });
        if (updated && updated.metadata) player.metadata = clone(updated.metadata);
        return player.hotbar;
    }

    _inventoryMapForPlayer(player) {
        return new Map(model.listInventory(player.user_id).map((entry) => [String(entry.item_id), entry]));
    }

    _hotbarEntryForSlot(player, slotNumber, inventoryMap = null) {
        const hotbar = Array.isArray(player && player.hotbar) ? player.hotbar : [];
        const slotIndex = Math.max(0, Math.min(HOTBAR_SIZE - 1, (Number(slotNumber || player && player.quick_slot) || 1) - 1));
        const normalized = this._normalizeHotbarEntry(hotbar[slotIndex]);
        if (!normalized) return null;
        if (normalized.item_id === 'coins') {
            const quantity = Math.max(0, Number(player && player.coins || 0));
            return quantity > 0 ? { item_id: 'coins', quantity, metadata: { icon: 'coins' } } : null;
        }
        const inventory = inventoryMap || this._inventoryMapForPlayer(player);
        const entry = inventory.get(normalized.item_id);
        return entry && Number(entry.quantity || 0) > 0 ? entry : null;
    }

    _buildHotbarSnapshot(player) {
        const inventory = this._inventoryMapForPlayer(player);
        return Array.from({ length: HOTBAR_SIZE }, (_, index) => {
            const slot = index + 1;
            const normalized = this._normalizeHotbarEntry(Array.isArray(player.hotbar) ? player.hotbar[index] : null);
            const active = slot === Number(player.quick_slot || 1);
            if (!normalized) return { slot, item_id: null, quantity: 0, active };
            const itemDefinition = normalized.item_id === 'coins'
                ? this.itemDefinitions.coins || this.itemMap.coins || { item_id: 'coins', name: 'Coins', category: 'currency', metadata: { icon: 'coins' } }
                : this.itemDefinitions[normalized.item_id] || this.itemMap[normalized.item_id] || { item_id: normalized.item_id, name: normalized.item_id, category: 'misc', metadata: {} };
            const quantity = normalized.item_id === 'coins'
                ? Math.max(0, Number(player.coins || 0))
                : Math.max(0, Number(inventory.get(normalized.item_id) && inventory.get(normalized.item_id).quantity || 0));
            if (quantity <= 0) return { slot, item_id: null, quantity: 0, active };
            return {
                slot,
                item_id: normalized.item_id,
                name: itemDefinition.name || normalized.item_id,
                category: itemDefinition.category || null,
                quantity,
                active,
                icon: itemDefinition.icon || itemDefinition.metadata && itemDefinition.metadata.icon || itemDefinition.render && itemDefinition.render.icon || null,
                droppable: normalized.item_id === 'coins' || !(itemDefinition.metadata && itemDefinition.metadata.droppable === false),
                hold_type: itemDefinition.category === 'weapon'
                    ? 'weapon'
                    : itemDefinition.category === 'tool'
                        ? 'tool'
                        : itemDefinition.category === 'build'
                            ? 'build'
                            : itemDefinition.category === 'consumable'
                                ? 'consumable'
                                : 'misc',
            };
        });
    }

    _legacyHeldItem(player) {
        switch (Number(player.quick_slot) || 1) {
        case 2:
            return player.equip_axe || player.equip_weapon || '';
        case 3:
            return player.equip_pickaxe || player.equip_weapon || '';
        case 4:
            return player.equip_rod || player.equip_weapon || '';
        case 5:
            return 'hammer';
        default:
            return player.equip_weapon || player.equip_axe || player.equip_pickaxe || '';
        }
    }

    _applyHotbarSelection(player, slotNumber) {
        const nextSlot = Math.max(1, Math.min(HOTBAR_SIZE, Number(slotNumber) || 1));
        const inventory = this._inventoryMapForPlayer(player);
        const activeEntry = this._hotbarEntryForSlot(player, nextSlot, inventory);
        const patch = { user_id: player.user_id };
        let changed = false;
        player.quick_slot = nextSlot;

        if (activeEntry && activeEntry.item_id !== 'coins') {
            const item = this.itemDefinitions[activeEntry.item_id] || this.itemMap[activeEntry.item_id] || null;
            if (item && item.equip_slot) {
                const field = this._equipmentFieldForSlot(item.equip_slot);
                if (field && player[field] !== activeEntry.item_id) {
                    player[field] = activeEntry.item_id;
                    patch[field] = activeEntry.item_id;
                    changed = true;
                }
            }
            player.held_item_id = item && item.category === 'build' ? 'hammer' : activeEntry.item_id;
        } else if (activeEntry && activeEntry.item_id === 'coins') {
            player.held_item_id = 'coins';
        } else {
            player.held_item_id = 'hands';
        }

        if (changed) model.upsertPlayer(patch);
        return player.held_item_id;
    }

    _clearItemReferences(player, itemId) {
        const clearValues = {
            equip_weapon: '',
            equip_armor: '',
            equip_axe: null,
            equip_pickaxe: null,
            equip_rod: null,
        };
        const patch = { user_id: player.user_id };
        let changed = false;
        for (const [field, emptyValue] of Object.entries(clearValues)) {
            if (player[field] === itemId) {
                player[field] = emptyValue;
                patch[field] = emptyValue;
                changed = true;
            }
        }
        if (Array.isArray(player.hotbar)) {
            let hotbarChanged = false;
            player.hotbar = player.hotbar.map((entry) => {
                const normalized = this._normalizeHotbarEntry(entry);
                if (normalized && normalized.item_id === itemId) {
                    hotbarChanged = true;
                    return null;
                }
                return normalized;
            });
            if (hotbarChanged) this._persistHotbar(player);
        }
        if (changed) model.upsertPlayer(patch);
        this._applyHotbarSelection(player, player.quick_slot);
    }

    _defaultHeldItem(player) {
        const activeEntry = this._hotbarEntryForSlot(player, player && player.quick_slot);
        if (activeEntry) {
            if (activeEntry.item_id === 'coins') return 'coins';
            const item = this.itemDefinitions[activeEntry.item_id] || this.itemMap[activeEntry.item_id] || null;
            return item && item.category === 'build' ? 'hammer' : activeEntry.item_id;
        }
        return 'hands';
    }

    _setHeldItem(player, itemId, now, holdMs = 320) {
        player.held_item_id = itemId || this._defaultHeldItem(player);
        player.hold_until = now + Math.max(100, Number(holdMs) || 320);
    }

    _equipmentFieldForSlot(slot) {
        switch (String(slot || '').trim()) {
        case 'weapon': return 'equip_weapon';
        case 'armor': return 'equip_armor';
        case 'axe': return 'equip_axe';
        case 'pickaxe': return 'equip_pickaxe';
        case 'rod': return 'equip_rod';
        default: return null;
        }
    }

    _emptyEquipmentValue(slot) {
        return slot === 'weapon' || slot === 'armor' ? '' : null;
    }

    _equipmentSnapshot(player) {
        return {
            weapon: player.equip_weapon || '',
            armor: player.equip_armor || '',
            axe: player.equip_axe || '',
            pickaxe: player.equip_pickaxe || '',
            rod: player.equip_rod || '',
        };
    }

    _shopInteractionPayload(npc) {
        if (!npc || !npc.interaction || npc.interaction.type !== 'shop') return null;
        return {
            type: 'shop',
            npc_id: npc.id,
            shop_id: npc.interaction.shop_id || npc.id,
            npc_name: npc.name,
            title: npc.interaction.title || npc.name,
            prompt: npc.interaction.prompt || `Browse ${npc.name}`,
            description: npc.interaction.description || '',
            items: (npc.interaction.inventory || []).map((entry) => ({
                item_name: this.itemDefinitions[String(entry.item_id)] && this.itemDefinitions[String(entry.item_id)].name || String(entry.item_id),
                category: this.itemDefinitions[String(entry.item_id)] && this.itemDefinitions[String(entry.item_id)].category || null,
                item_id: String(entry.item_id),
                price: Math.max(0, Number(entry.price) || 0),
                quantity: Math.max(1, Number(entry.quantity) || 1),
                note: entry.note || '',
            })),
        };
    }

    _activeInteractionNpc(player) {
        if (!player || !player.activeInteraction || player.activeInteraction.type !== 'shop') return null;
        const npc = this.npcs.get(player.activeInteraction.npc_id);
        if (!npc || npc.zone_id !== player.zone_id || npc.hp <= 0 || distanceSq(player, npc) > (NPC_INTERACT_RADIUS * NPC_INTERACT_RADIUS)) {
            player.activeInteraction = null;
            return null;
        }
        return npc;
    }

    _nearestNpcInteraction(player) {
        let best = null;
        let bestDistSq = NPC_INTERACT_RADIUS * NPC_INTERACT_RADIUS;
        for (const npc of this.npcs.values()) {
            if (npc.zone_id !== player.zone_id || npc.hp <= 0 || !npc.interaction) continue;
            const distSq = distanceSq(player, npc);
            if (distSq <= bestDistSq) {
                bestDistSq = distSq;
                best = npc;
            }
        }
        return best;
    }

    _structureState(structure) {
        return structure && structure.data && typeof structure.data === 'object' ? structure.data : {};
    }

    _runtimeEntityState(entity) {
        return entity && entity.metadata && typeof entity.metadata === 'object' ? entity.metadata : {};
    }

    _interactionProfileForStructure(structure) {
        if (!structure) return null;
        const definition = this.structureDefinitions[structure.type] || {};
        const state = this._structureState(structure);
        if (definition.interaction) return clone(definition.interaction);
        if (Array.isArray(state.container)) return { type: 'container', radius: 72, prompt: 'open container', title: definition.name || humanizeId(structure.type) };
        if (state.sign_text) return { type: 'sign', radius: 96, prompt: 'read sign', title: definition.name || humanizeId(structure.type) };
        return null;
    }

    _interactionProfileForRuntimeEntity(entity) {
        if (!entity) return null;
        const definition = this.runtimeEntityDefinitions[entity.kind] || this.structureDefinitions[entity.kind] || {};
        const state = this._runtimeEntityState(entity);
        if (definition.interaction) return clone(definition.interaction);
        if (state.item_id) return { type: 'pickup', radius: 58, prompt: 'pick up', title: definition.name || humanizeId(entity.kind) };
        if (Array.isArray(state.container)) return { type: 'container', radius: 72, prompt: 'open container', title: definition.name || humanizeId(entity.kind) };
        if (state.sign_text) return { type: 'sign', radius: 96, prompt: 'read sign', title: definition.name || humanizeId(entity.kind) };
        return null;
    }

    _worldObjectDisplayName(source, target) {
        if (source === 'structure') {
            const definition = this.structureDefinitions[target.type] || {};
            return definition.name || humanizeId(target.type);
        }
        const definition = this.runtimeEntityDefinitions[target.kind] || this.structureDefinitions[target.kind] || {};
        return definition.name || humanizeId(target.kind);
    }

    _containerItemsForSource(source, target) {
        const state = source === 'structure' ? this._structureState(target) : this._runtimeEntityState(target);
        return normalizeLegacyContainer(state.container || state.Container || []);
    }

    _persistStructureState(structure, nextState) {
        const updated = model.updateStructureData(structure.id, nextState);
        structure.data = clone(updated && updated.data || nextState || {});
        return structure.data;
    }

    _persistRuntimeEntityState(entity, nextState) {
        entity.metadata = clone(nextState || {});
        entity.state_version = Number(entity.state_version || 0) + 1;
        const updated = worldStore.upsertRuntimeEntity(Object.assign({}, entity, { metadata: entity.metadata }));
        if (updated) {
            Object.assign(entity, updated, { metadata: clone(updated.metadata || {}) });
        }
        return entity.metadata;
    }

    _updateWorldObjectState(source, target, patch) {
        const current = source === 'structure' ? this._structureState(target) : this._runtimeEntityState(target);
        const next = Object.assign({}, current, patch || {});
        if (source === 'structure') return this._persistStructureState(target, next);
        return this._persistRuntimeEntityState(target, next);
    }

    _activeInteractionWorldObject(player) {
        if (!player || !player.activeInteraction || !player.activeInteraction.source || !player.activeInteraction.target_id) return null;
        const source = player.activeInteraction.source;
        const target = source === 'structure'
            ? this.structures.get(player.activeInteraction.target_id)
            : this.runtimeEntities.get(player.activeInteraction.target_id);
        if (!target || target.zone_id !== player.zone_id) {
            player.activeInteraction = null;
            return null;
        }
        const profile = source === 'structure'
            ? this._interactionProfileForStructure(target)
            : this._interactionProfileForRuntimeEntity(target);
        if (!profile) {
            player.activeInteraction = null;
            return null;
        }
        const radius = Math.max(48, Number(profile.radius || 72));
        if (distanceSq(player, target) > (radius * radius)) {
            player.activeInteraction = null;
            return null;
        }
        return { source, target, profile };
    }

    _nearestInteractiveWorldObject(player) {
        let best = null;
        let bestDistSq = Number.POSITIVE_INFINITY;
        const consider = (source, target, profile) => {
            if (!target || !profile || target.zone_id !== player.zone_id) return;
            const radius = Math.max(48, Number(profile.radius || 72));
            const distSq = distanceSq(player, target);
            if (distSq <= (radius * radius) && distSq < bestDistSq) {
                best = { source, target, profile };
                bestDistSq = distSq;
            }
        };
        for (const structure of this.structures.values()) consider('structure', structure, this._interactionProfileForStructure(structure));
        for (const entity of this.runtimeEntities.values()) consider('runtime', entity, this._interactionProfileForRuntimeEntity(entity));
        return best;
    }

    _worldObjectPrompt(source, target, profile) {
        if (!target || !profile) return null;
        const state = source === 'structure' ? this._structureState(target) : this._runtimeEntityState(target);
        const labelName = this._worldObjectDisplayName(source, target).toLowerCase();
        if (profile.type === 'pickup') {
            const itemId = String(state.item_id || '').trim();
            const item = this.itemDefinitions[itemId] || this.itemMap[itemId] || { name: itemId || labelName };
            return {
                type: 'pickup',
                target_id: target.id,
                x: target.x,
                y: target.y - 34,
                label: `E · pick up ${item.name || labelName}`,
                description: `Quantity ${Math.max(1, Number(state.quantity || 1))}`,
            };
        }
        if (profile.type === 'door') {
            return {
                type: 'door',
                target_id: target.id,
                x: target.x,
                y: target.y - 42,
                label: `E · ${state.opened ? 'close' : 'open'} ${labelName}`,
                description: state.opened ? 'Passage is currently open.' : 'A closed barrier blocks the lane.',
            };
        }
        if (profile.type === 'container') {
            const items = this._containerItemsForSource(source, target);
            return {
                type: 'container',
                target_id: target.id,
                x: target.x,
                y: target.y - 48,
                label: `E · ${profile.prompt || 'open'} ${labelName}`,
                description: items.length ? `${items.length} stored stack${items.length === 1 ? '' : 's'}` : 'Nothing stored yet.',
            };
        }
        if (profile.type === 'sign') {
            return {
                type: 'sign',
                target_id: target.id,
                x: target.x,
                y: target.y - 46,
                label: `E · ${profile.prompt || 'read'} ${labelName}`,
                description: String(state.sign_text || 'A blank plank waits for a message.').slice(0, 64),
            };
        }
        return {
            type: profile.type || 'inspect',
            target_id: target.id,
            x: target.x,
            y: target.y - 46,
            label: `E · ${profile.prompt || 'inspect'} ${labelName}`,
            description: profile.description || '',
        };
    }

    _interactionPayloadForWorldObject(context, player) {
        if (!context) return null;
        const { source, target, profile } = context;
        const state = source === 'structure' ? this._structureState(target) : this._runtimeEntityState(target);
        const title = profile.title || this._worldObjectDisplayName(source, target);
        const ownerId = target.owner_id || state.owner || null;
        if (profile.type === 'container') {
            return {
                type: 'container',
                source,
                entity_id: target.id,
                title,
                description: ownerId ? `Owner ${ownerId}` : 'Legacy storage with server-authoritative contents.',
                owner_id: ownerId,
                editable: !ownerId || ownerId === player.user_id,
                can_store: true,
                can_take: true,
                items: this._containerItemsForSource(source, target).map((entry) => ({
                    item_id: entry.item_id,
                    item_name: this.itemDefinitions[entry.item_id] && this.itemDefinitions[entry.item_id].name || this.itemMap[entry.item_id] && this.itemMap[entry.item_id].name || entry.item_id,
                    quantity: entry.quantity,
                    note: entry.metadata && entry.metadata.legacy_item_id && entry.metadata.legacy_item_id !== entry.item_id
                        ? `legacy ${entry.metadata.legacy_item_id}`
                        : '',
                })),
            };
        }
        if (profile.type === 'sign') {
            return {
                type: 'sign',
                source,
                entity_id: target.id,
                title,
                description: ownerId ? `Owner ${ownerId}` : 'A weathered sign from the old sandbox.',
                text: String(state.sign_text || ''),
                editable: !ownerId || ownerId === player.user_id,
            };
        }
        if (profile.type === 'vehicle') {
            return {
                type: 'vehicle',
                source,
                entity_id: target.id,
                title,
                description: state.vehicle_model ? `Recovered ${humanizeId(state.vehicle_model)} waiting for a future driving pass.` : 'A parked vehicle from the legacy shard.',
                details: {
                    condition: `${Math.max(0, Number(target.hp || target.max_hp || 100))}%`,
                    cargo_stacks: this._containerItemsForSource(source, target).length,
                },
            };
        }
        return {
            type: profile.type || 'inspect',
            source,
            entity_id: target.id,
            title,
            description: profile.description || `Inspect ${title.toLowerCase()}.`,
        };
    }

    _interactionPrompt(player) {
        const hookPrompt = this.hooks.firstDefined('interaction:prompt', { room: this, player });
        if (hookPrompt) return hookPrompt;

        const activeNpc = this._activeInteractionNpc(player);
        if (activeNpc) {
            const activeShop = this._shopInteractionPayload(activeNpc);
            return activeShop ? {
                type: 'shop',
                target_id: activeNpc.id,
                x: activeNpc.x,
                y: activeNpc.y - 58,
                label: `Esc · close ${activeShop.title}`,
                description: activeShop.description,
            } : null;
        }

        const activeWorldObject = this._activeInteractionWorldObject(player);
        if (activeWorldObject) {
            const activeInteraction = this._interactionPayloadForWorldObject(activeWorldObject, player);
            return activeInteraction ? {
                type: activeInteraction.type,
                target_id: activeWorldObject.target.id,
                x: activeWorldObject.target.x,
                y: activeWorldObject.target.y - 58,
                label: `Esc · close ${activeInteraction.title}`,
                description: activeInteraction.description,
            } : null;
        }

        for (const drop of this.loot.values()) {
            if (drop.zone_id !== player.zone_id) continue;
            if (distanceSq(player, drop) <= (LOOT_PICKUP_RADIUS * LOOT_PICKUP_RADIUS)) {
                const item = this.itemDefinitions[drop.item_id] || this.itemMap[drop.item_id];
                return {
                    type: 'loot',
                    target_id: drop.id,
                    x: drop.x,
                    y: drop.y - 34,
                    label: `E · pick up ${item && item.name || drop.item_id}`,
                    description: `Quantity ${drop.quantity}`,
                };
            }
        }

        const worldObject = this._nearestInteractiveWorldObject(player);
        if (worldObject) return this._worldObjectPrompt(worldObject.source, worldObject.target, worldObject.profile);

        const npc = this._nearestNpcInteraction(player);
        if (npc) {
            const shop = this._shopInteractionPayload(npc);
            return shop ? {
                type: 'shop',
                target_id: npc.id,
                x: npc.x,
                y: npc.y - 58,
                label: `E · ${shop.prompt}`,
                description: shop.description,
            } : null;
        }

        let closest = null;
        let bestDistSq = RESOURCE_INTERACT_RADIUS * RESOURCE_INTERACT_RADIUS;
        for (const resource of this.resources.values()) {
            if (resource.zone_id !== player.zone_id || resource.hp <= 0) continue;
            const distSq = distanceSq(player, resource);
            if (distSq <= bestDistSq) {
                bestDistSq = distSq;
                closest = resource;
            }
        }
        if (!closest) return null;
        const definition = this.resourceDefinitions[closest.kind] || {};
        const interaction = definition.interaction || {};
        const verb = interaction.verb || (closest.kind === 'tree' ? 'chop' : closest.kind === 'rock' ? 'mine' : 'harvest');
        const name = interaction.label || definition.name || (closest.kind === 'tree' ? 'tree' : closest.kind === 'rock' ? 'ore vein' : 'bush');
        return {
            type: 'resource',
            target_id: closest.id,
            x: closest.x,
            y: closest.y - 42,
            label: `E · ${verb} ${name}`,
            description: interaction.tool_hint || `Gather with your ${closest.kind === 'rock' ? 'pickaxe' : closest.kind === 'tree' ? 'hatchet' : 'hands'}`,
        };
    }

    _autoEquipPurchasedItem(player, itemId) {
        const item = this.itemDefinitions[itemId] || this.itemMap[itemId];
        if (!item) return;
        const patch = { user_id: player.user_id };
        let changed = false;
        if (item.category === 'weapon') {
            player.equip_weapon = itemId;
            patch.equip_weapon = itemId;
            changed = true;
        } else if (item.category === 'armor') {
            player.equip_armor = itemId;
            patch.equip_armor = itemId;
            changed = true;
        } else if (item.metadata && item.metadata.skill === 'woodcut') {
            player.equip_axe = itemId;
            patch.equip_axe = itemId;
            changed = true;
        } else if (item.metadata && item.metadata.skill === 'mining') {
            player.equip_pickaxe = itemId;
            patch.equip_pickaxe = itemId;
            changed = true;
        } else if (item.metadata && item.metadata.skill === 'fishing') {
            player.equip_rod = itemId;
            patch.equip_rod = itemId;
            changed = true;
        }
        if (changed) model.upsertPlayer(patch);
    }

    closeInteraction(player) {
        if (!player) return { ok: false, reason: 'player not joined' };
        player.activeInteraction = null;
        return { ok: true };
    }

    handleInventoryEquip(player, payload) {
        if (!player) return { ok: false, reason: 'player not joined' };
        const requestedSlot = String(payload && payload.slot || '').trim();
        const field = this._equipmentFieldForSlot(requestedSlot);
        if (!field) return { ok: false, reason: 'invalid equipment slot' };
        const now = Date.now();

        if (payload && payload.clear) {
            player[field] = this._emptyEquipmentValue(requestedSlot);
            model.upsertPlayer({ user_id: player.user_id, [field]: player[field] });
            this._setHeldItem(player, this._defaultHeldItem(player), now, 260);
            this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, {
                user_id: player.user_id,
                world_id: this.world.id,
                action: 'equip-clear',
                slot: requestedSlot,
            });
            return { ok: true, slot: requestedSlot, item_id: null, equipment: this._equipmentSnapshot(player) };
        }

        const itemId = String(payload && payload.item_id || '').trim();
        if (!itemId) return { ok: false, reason: 'item_id required' };
        const inventory = model.listInventory(player.user_id);
        const entry = inventory.find((item) => item.item_id === itemId && Number(item.quantity || 0) > 0);
        if (!entry) return { ok: false, reason: 'item not in backpack' };

        const item = this.itemDefinitions[itemId] || this.itemMap[itemId] || null;
        const inferredSlot = item && item.equip_slot || null;
        if (!inferredSlot) return { ok: false, reason: 'item cannot be equipped' };
        if (inferredSlot !== requestedSlot) {
            return { ok: false, reason: `${item.name || itemId} fits ${inferredSlot}, not ${requestedSlot}` };
        }

        player[field] = itemId;
        model.upsertPlayer({ user_id: player.user_id, [field]: itemId });
        this._setHeldItem(player, this._defaultHeldItem(player), now, 320);
        this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, {
            user_id: player.user_id,
            world_id: this.world.id,
            action: 'equip',
            slot: requestedSlot,
            item_id: itemId,
        });
        return { ok: true, slot: requestedSlot, item_id: itemId, equipment: this._equipmentSnapshot(player) };
    }

    handleShopPurchase(player, payload) {
        const npc = this._activeInteractionNpc(player);
        if (!npc) return { ok: false, reason: 'no shop is open' };
        if (payload && payload.npc_id && String(payload.npc_id) !== npc.id) return { ok: false, reason: 'shop mismatch' };
        const shop = this._shopInteractionPayload(npc);
        const offer = shop && shop.items.find((entry) => entry.item_id === String(payload && payload.item_id || ''));
        if (!offer) return { ok: false, reason: 'item not sold here' };
        const bundles = Math.max(1, Math.min(25, Number(payload && payload.quantity) || 1));
        const totalPrice = offer.price * bundles;
        if (Number(player.coins || 0) < totalPrice) return { ok: false, reason: 'not enough coins' };
        const totalQuantity = offer.quantity * bundles;
        player.coins -= totalPrice;
        model.upsertPlayer({ user_id: player.user_id, coins: player.coins });
        model.addInventoryItem({ user_id: player.user_id, item_id: offer.item_id, quantity: totalQuantity, metadata: { source: npc.id, shop_id: shop.shop_id } });
        this._autoEquipPurchasedItem(player, offer.item_id);
        this._setHeldItem(player, offer.item_id, Date.now(), 650);
        this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, {
            user_id: player.user_id,
            world_id: this.world.id,
            item_id: offer.item_id,
            action: 'shop-buy',
            quantity: totalQuantity,
            coins_spent: totalPrice,
            npc_id: npc.id,
        });
        this._feed('shop-purchase', {
            user_id: player.user_id,
            npc_id: npc.id,
            item_id: offer.item_id,
            quantity: totalQuantity,
            coins_spent: totalPrice,
        });
        return {
            ok: true,
            item_id: offer.item_id,
            quantity: totalQuantity,
            remaining_coins: player.coins,
            interaction: this._shopInteractionPayload(npc),
        };
    }

    handleHotbarUpdate(player, payload) {
        if (!player) return { ok: false, reason: 'player not joined' };
        const slot = Math.max(1, Math.min(HOTBAR_SIZE, Number(payload && payload.slot) || 0));
        if (!slot) return { ok: false, reason: 'slot required' };
        if (!Array.isArray(player.hotbar)) player.hotbar = this._coerceHotbar(null, player);

        if (payload && payload.clear) {
            player.hotbar[slot - 1] = null;
            this._persistHotbar(player);
            this._applyHotbarSelection(player, player.quick_slot);
            this._publish('game.2dworld.hotbar.updated', {
                user_id: player.user_id,
                world_id: this.world.id,
                slot,
                item_id: null,
            });
            return { ok: true, slot, item_id: null, hotbar: this._buildHotbarSnapshot(player) };
        }

        const itemId = String(payload && (payload.item_id || payload.itemId) || '').trim();
        if (!itemId) return { ok: false, reason: 'item_id required' };
        if (itemId === 'coins') {
            if (Number(player.coins || 0) <= 0) return { ok: false, reason: 'no coins available' };
        } else {
            const inventory = model.listInventory(player.user_id);
            const inventoryEntry = inventory.find((entry) => entry.item_id === itemId && Number(entry.quantity || 0) > 0);
            if (!inventoryEntry) return { ok: false, reason: 'item not in backpack' };
            const item = this.itemDefinitions[itemId] || this.itemMap[itemId] || null;
            if (!item || !HOTBAR_ASSIGNABLE_CATEGORIES.has(String(item.category || '').toLowerCase())) {
                return { ok: false, reason: 'item cannot be added to the hotbar' };
            }
        }

        player.hotbar[slot - 1] = { item_id: itemId };
        this._persistHotbar(player);
        this._applyHotbarSelection(player, payload && payload.select === false ? player.quick_slot : slot);
        this._publish('game.2dworld.hotbar.updated', {
            user_id: player.user_id,
            world_id: this.world.id,
            slot,
            item_id: itemId,
        });
        return { ok: true, slot, item_id: itemId, hotbar: this._buildHotbarSnapshot(player) };
    }

    handleInventoryDrop(player, payload, now = Date.now()) {
        if (!player) return { ok: false, reason: 'player not joined' };
        const itemId = String(payload && payload.item_id || '').trim();
        const requestedQuantity = Math.max(1, Math.floor(Number(payload && payload.quantity) || 1));
        if (!itemId) return { ok: false, reason: 'item_id required' };
        const dropX = Number.isFinite(Number(payload && payload.x)) ? Number(payload.x) : player.x + ((player.facing || 1) * 28);
        const dropY = Number.isFinite(Number(payload && payload.y)) ? Number(payload.y) : player.y + 12;

        if (itemId === 'coins') {
            const amount = Math.min(requestedQuantity, Math.max(0, Number(player.coins || 0)));
            if (amount <= 0) return { ok: false, reason: 'not enough coins' };
            player.coins -= amount;
            model.upsertPlayer({ user_id: player.user_id, coins: player.coins });
            this._dropLoot(dropX, dropY, player.zone_id, [{ item_id: 'coins', quantity: amount }], { kind: 'player', id: player.user_id, action: 'drop' });
            this._publish('game.2dworld.item.dropped', {
                user_id: player.user_id,
                world_id: this.world.id,
                zone_id: player.zone_id,
                item_id: 'coins',
                quantity: amount,
            });
            this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, { user_id: player.user_id, item_id: 'coins', world_id: this.world.id });
            return { ok: true, item_id: 'coins', quantity: amount, remaining_coins: player.coins, hotbar: this._buildHotbarSnapshot(player) };
        }

        const inventory = model.listInventory(player.user_id);
        const entry = inventory.find((item) => item.item_id === itemId && Number(item.quantity || 0) > 0);
        if (!entry) return { ok: false, reason: 'item not in backpack' };
        const amount = Math.min(requestedQuantity, Math.max(0, Number(entry.quantity || 0)));
        if (amount <= 0) return { ok: false, reason: 'invalid quantity' };
        model.addInventoryItem({ user_id: player.user_id, item_id: itemId, quantity: -amount, metadata: {} });
        this._dropLoot(dropX, dropY, player.zone_id, [{ item_id: itemId, quantity: amount }], { kind: 'player', id: player.user_id, action: 'drop' });
        if (!model.listInventory(player.user_id).some((item) => item.item_id === itemId && Number(item.quantity || 0) > 0)) {
            this._clearItemReferences(player, itemId);
        } else {
            this._applyHotbarSelection(player, player.quick_slot);
        }
        this._publish('game.2dworld.item.dropped', {
            user_id: player.user_id,
            world_id: this.world.id,
            zone_id: player.zone_id,
            item_id: itemId,
            quantity: amount,
        });
        this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, { user_id: player.user_id, item_id: itemId, world_id: this.world.id });
        return { ok: true, item_id: itemId, quantity: amount, hotbar: this._buildHotbarSnapshot(player) };
    }

    _removeRuntimeEntity(entity) {
        if (!entity) return;
        this.runtimeEntities.delete(entity.id);
        worldStore.deleteRuntimeEntity(entity.id);
    }

    _takeWorldObjectItem(player, context, payload) {
        const { source, target, profile } = context;
        const itemId = String(payload && payload.item_id || '').trim();
        const requestedQuantity = Math.max(1, Math.floor(Number(payload && payload.quantity) || 1));
        if (profile.type !== 'container') return { ok: false, reason: 'target is not a container' };
        if (!itemId) return { ok: false, reason: 'item_id required' };
        const items = this._containerItemsForSource(source, target);
        const entry = items.find((item) => item.item_id === itemId);
        if (!entry) return { ok: false, reason: 'item not found in container' };
        const amount = Math.min(requestedQuantity, Math.max(0, Number(entry.quantity || 0)));
        if (amount <= 0) return { ok: false, reason: 'invalid quantity' };
        if (itemId === 'coins') {
            player.coins += amount;
            model.upsertPlayer({ user_id: player.user_id, coins: player.coins });
        } else {
            model.addInventoryItem({ user_id: player.user_id, item_id: itemId, quantity: amount, metadata: { source: target.id, source_type: `${source}:container` } });
        }
        entry.quantity -= amount;
        const nextItems = items.filter((item) => Number(item.quantity || 0) > 0);
        this._updateWorldObjectState(source, target, { container: nextItems });
        this._applyHotbarSelection(player, player.quick_slot);
        this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, { user_id: player.user_id, item_id: itemId, world_id: this.world.id });
        return {
            ok: true,
            item_id: itemId,
            quantity: amount,
            interaction: this._interactionPayloadForWorldObject(context, player),
        };
    }

    _storeWorldObjectItem(player, context, payload) {
        const { source, target, profile } = context;
        const itemId = String(payload && payload.item_id || '').trim();
        const requestedQuantity = Math.max(1, Math.floor(Number(payload && payload.quantity) || 1));
        if (profile.type !== 'container') return { ok: false, reason: 'target is not a container' };
        if (!itemId) return { ok: false, reason: 'item_id required' };
        const items = this._containerItemsForSource(source, target);
        let amount = requestedQuantity;
        if (itemId === 'coins') {
            amount = Math.min(amount, Math.max(0, Number(player.coins || 0)));
            if (amount <= 0) return { ok: false, reason: 'not enough coins' };
            player.coins -= amount;
            model.upsertPlayer({ user_id: player.user_id, coins: player.coins });
        } else {
            const inventory = model.listInventory(player.user_id);
            const entry = inventory.find((item) => item.item_id === itemId && Number(item.quantity || 0) > 0);
            if (!entry) return { ok: false, reason: 'item not in backpack' };
            amount = Math.min(amount, Math.max(0, Number(entry.quantity || 0)));
            if (amount <= 0) return { ok: false, reason: 'invalid quantity' };
            model.addInventoryItem({ user_id: player.user_id, item_id: itemId, quantity: -amount, metadata: {} });
            if (!model.listInventory(player.user_id).some((item) => item.item_id === itemId && Number(item.quantity || 0) > 0)) this._clearItemReferences(player, itemId);
            else this._applyHotbarSelection(player, player.quick_slot);
        }
        const existing = items.find((item) => item.item_id === itemId);
        if (existing) existing.quantity += amount;
        else items.push({ item_id: itemId, quantity: amount, metadata: { stored_by: player.user_id } });
        this._updateWorldObjectState(source, target, { container: items });
        this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, { user_id: player.user_id, item_id: itemId, world_id: this.world.id });
        return {
            ok: true,
            item_id: itemId,
            quantity: amount,
            interaction: this._interactionPayloadForWorldObject(context, player),
        };
    }

    handleInteractionAction(player, payload) {
        if (!player) return { ok: false, reason: 'player not joined' };
        const context = this._activeInteractionWorldObject(player);
        if (!context) return { ok: false, reason: 'no active world interaction' };
        if (payload && payload.entity_id && String(payload.entity_id) !== context.target.id) return { ok: false, reason: 'interaction target mismatch' };
        const action = String(payload && payload.action || 'close').trim().toLowerCase();
        if (context.profile.type === 'container') {
            if (action === 'take') return this._takeWorldObjectItem(player, context, payload);
            if (action === 'store') return this._storeWorldObjectItem(player, context, payload);
            if (action === 'close') return this.closeInteraction(player);
            return { ok: false, reason: 'unsupported container action' };
        }
        if (context.profile.type === 'sign') {
            if (action === 'set_text') {
                const nextText = String(payload && (payload.value || payload.text) || '').slice(0, 180);
                const ownerId = context.target.owner_id || (context.source === 'structure' ? this._structureState(context.target).owner : this._runtimeEntityState(context.target).owner) || null;
                if (ownerId && ownerId !== player.user_id) {
                    return { ok: false, reason: 'sign is read-only' };
                }
                this._updateWorldObjectState(context.source, context.target, { sign_text: nextText });
                return {
                    ok: true,
                    interaction: this._interactionPayloadForWorldObject(context, player),
                };
            }
            if (action === 'close') return this.closeInteraction(player);
            return { ok: false, reason: 'unsupported sign action' };
        }
        if (action === 'close') return this.closeInteraction(player);
        return { ok: false, reason: 'unsupported interaction action' };
    }

    _addSkillXp(player, skill, amount, reason) {
        const field = SKILL_TO_XP_FIELD[skill];
        if (!field || !amount) return player;
        const beforeXp = Number(player[field] || 0);
        const afterXp = beforeXp + Math.max(0, Math.floor(Number(amount) || 0));
        const beforeLevel = levelForXp(beforeXp);
        const afterLevel = levelForXp(afterXp);
        player[field] = afterXp;
        player.levels[skill] = afterLevel;
        model.upsertPlayer({ user_id: player.user_id, [field]: afterXp });
        this._publish(GAME_EVENT_TYPES.PLAYER_SKILL_XP_ADDED, {
            user_id: player.user_id,
            skill,
            amount,
            reason: reason || 'gameplay',
            world_id: this.world.id,
        });
        if (afterLevel > beforeLevel) {
            this._publish(GAME_EVENT_TYPES.PLAYER_LEVEL_UP, {
                user_id: player.user_id,
                skill,
                level: afterLevel,
                world_id: this.world.id,
            });
        }
        return player;
    }

    _pickupLoot(player, dropId) {
        const drop = this.loot.get(dropId);
        if (!drop || drop.zone_id !== player.zone_id) return { ok: false, reason: 'loot not found' };
        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        if ((dx * dx + dy * dy) > (48 * 48)) return { ok: false, reason: 'loot out of range' };
        if (drop.item_id === 'coins') {
            player.coins += Math.max(0, Number(drop.quantity || 0));
            model.upsertPlayer({ user_id: player.user_id, coins: player.coins });
        } else {
            model.addInventoryItem({ user_id: player.user_id, item_id: drop.item_id, quantity: drop.quantity, metadata: {} });
        }
        this.loot.delete(drop.id);
        this._publish(GAME_EVENT_TYPES.ITEM_PICKED_UP, {
            user_id: player.user_id,
            item_id: drop.item_id,
            quantity: drop.quantity,
            world_id: this.world.id,
        });
        this._publish('game.2dworld.item.picked_up', {
            user_id: player.user_id,
            item_id: drop.item_id,
            quantity: drop.quantity,
            world_id: this.world.id,
            zone_id: player.zone_id,
        });
        this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, { user_id: player.user_id, item_id: drop.item_id, world_id: this.world.id });
        return { ok: true };
    }

    _dropLoot(x, y, zone_id, drops, source) {
        for (const drop of drops || []) {
            const entity = {
                id: uid('loot'),
                zone_id,
                item_id: drop.item_id,
                quantity: drop.quantity,
                x,
                y,
                source: source || null,
                created_at: new Date().toISOString(),
            };
            this.loot.set(entity.id, entity);
            this._publish(GAME_EVENT_TYPES.COMBAT_LOOT_GENERATED, {
                world_id: this.world.id,
                zone_id,
                item_id: entity.item_id,
                quantity: entity.quantity,
                source,
            });
        }
    }

    _killNpc(npc, killer, now) {
        npc.hp = 0;
        npc.respawn_at = now + npc.respawn_ms;
        const lootTable = npc.loot_table_id ? this.lootTableMap[npc.loot_table_id] : null;
        const drops = lootTable ? rollLoot(lootTable.entries, { seed: now % 0x7fffffff, rolls: npc.kind === 'boss' ? 3 : 1 }) : [];
        this._dropLoot(npc.x, npc.y, npc.zone_id, drops, { kind: npc.kind, id: npc.id });
        this._publish(npc.kind === 'boss' ? GAME_EVENT_TYPES.BOSS_DEFEATED : GAME_EVENT_TYPES.NPC_DIED, {
            npc_id: npc.id,
            template_id: npc.template_id,
            killed_by: killer && killer.user_id,
            world_id: this.world.id,
            zone_id: npc.zone_id,
        });
        if (killer) {
            this._publish(GAME_EVENT_TYPES.COMBAT_KILL, {
                killer_id: killer.user_id,
                target_id: npc.id,
                target_type: npc.kind,
                world_id: this.world.id,
                zone_id: npc.zone_id,
            });
            this._addSkillXp(killer, 'attack', npc.kind === 'boss' ? 180 : 32, 'combat.kill');
            this._addSkillXp(killer, 'strength', npc.kind === 'boss' ? 120 : 18, 'combat.kill');
            if (drops.length) this._publish(GAME_EVENT_TYPES.NPC_DROP_GENERATED, {
                npc_id: npc.id,
                template_id: npc.template_id,
                drops,
                world_id: this.world.id,
            });
        }
    }

    _killPlayer(player, source, now) {
        player.hp = 0;
        player.dead = true;
        player.dead_until = now + 3000;
        player.activeInteraction = null;
        this._publish(GAME_EVENT_TYPES.PLAYER_DIED, {
            user_id: player.user_id,
            world_id: this.world.id,
            zone_id: player.zone_id,
            source: source ? { id: source.id || source.user_id || null, kind: source.kind || 'player' } : null,
        });
    }

    _applyDamage(target, source, amount, now) {
        const damage = Math.max(1, Math.floor(Number(amount) || 0));
        target.hp = Math.max(0, target.hp - damage);
        target.hit_flash_until = now + 180;
        if (target.user_id) {
            model.upsertPlayer({ user_id: target.user_id, hp: target.hp });
            this._publish(GAME_EVENT_TYPES.COMBAT_HIT, {
                world_id: this.world.id,
                zone_id: target.zone_id,
                target_id: target.user_id,
                target_type: 'player',
                source_id: source && (source.user_id || source.id),
                damage,
            });
            if (target.hp <= 0) this._killPlayer(target, source, now);
        } else {
            this._publish(GAME_EVENT_TYPES.COMBAT_HIT, {
                world_id: this.world.id,
                zone_id: target.zone_id,
                target_id: target.id,
                target_type: target.kind || 'npc',
                source_id: source && (source.user_id || source.id),
                damage,
            });
            if (target.hp <= 0) this._killNpc(target, source, now);
        }
    }

    _spawnProjectile(player, input, weapon, now) {
        const aim = input.aim && typeof input.aim === 'object' ? input.aim : { x: player.x + 1, y: player.y };
        const dx = Number(aim.x) - player.x;
        const dy = Number(aim.y) - player.y;
        const len = Math.sqrt((dx * dx) + (dy * dy)) || 1;
        const speed = Number(weapon.projectile_speed) || 360;
        const projectile = {
            id: uid('proj'),
            owner_id: player.user_id,
            zone_id: player.zone_id,
            x: player.x,
            y: player.y,
            vx: (dx / len) * speed,
            vy: (dy / len) * speed,
            damage: computeDamage(player, weapon),
            target_id: input.targetId || null,
            expires_at: now + 1300,
        };
        player.aim_x = Number(aim.x) || player.x;
        player.aim_y = Number(aim.y) || player.y;
        this.projectiles.set(projectile.id, projectile);
        this._publish(GAME_EVENT_TYPES.COMBAT_PROJECTILE_SPAWNED, {
            projectile_id: projectile.id,
            owner_id: player.user_id,
            world_id: this.world.id,
            zone_id: player.zone_id,
        });
    }

    _nearestTarget(player, range, targetTime) {
        const candidates = [];
        for (const other of this.players.values()) {
            if (other.user_id === player.user_id || other.zone_id !== player.zone_id || other.dead) continue;
            const zone = ((this.worldDefinition && this.worldDefinition.zones) || []).find((z) => z.zone_id === other.zone_id);
            if (zone && zone.pvp !== true) continue;
            candidates.push(other);
        }
        for (const npc of this.npcs.values()) {
            if (npc.zone_id !== player.zone_id || npc.hp <= 0 || !isHostileNpc(npc)) continue;
            candidates.push(npc);
        }
        let best = null;
        let bestDistSq = range * range;
        for (const candidate of candidates) {
            const rewound = Object.assign({}, candidate, candidate.id ? (require('../net/lag-compensation').rewindPosition(this.histories.get(candidate.id), targetTime, candidate)) : candidate);
            const dx = player.x - rewound.x;
            const dy = player.y - rewound.y;
            const distSq = (dx * dx) + (dy * dy);
            if (distSq <= bestDistSq) {
                bestDistSq = distSq;
                best = candidate;
            }
        }
        return best;
    }

    _handleAttack(player, input, now) {
        const weapon = defaultWeapon(player);
        if (!canAttack(now, player, weapon)) return;
        player.activeInteraction = null;
        markAttack(now, player, weapon);
        player.attack_anim_until = now + Math.min(300, Math.max(180, Number(weapon.cooldown_ms || 500) * 0.6));
        player.aim_x = Number(input && input.aim && input.aim.x) || player.aim_x || player.x + 48;
        player.aim_y = Number(input && input.aim && input.aim.y) || player.aim_y || player.y;
        if (Math.abs(player.aim_x - player.x) > 4) player.facing = player.aim_x >= player.x ? 1 : -1;
        this._setHeldItem(player, weapon.item_id, now, 520);
        this._publish(GAME_EVENT_TYPES.COMBAT_STARTED, {
            user_id: player.user_id,
            world_id: this.world.id,
            zone_id: player.zone_id,
            weapon_id: weapon.item_id,
        });
        if (weapon.projectile) {
            this._spawnProjectile(player, input, weapon, now);
            return;
        }
        const targetTime = now - Math.max(0, Math.min(225, now - (Number(input.sent_at) || now)));
        const target = findRewoundTarget(
            now,
            input,
            [
                ...Array.from(this.players.values()).filter((other) => other.user_id !== player.user_id && other.zone_id === player.zone_id && !other.dead),
                ...Array.from(this.npcs.values()).filter((npc) => npc.zone_id === player.zone_id && npc.hp > 0),
            ],
            this.histories,
            () => this._nearestTarget(player, weapon.range, targetTime)
        );
        if (!target || !targetInRange(player, target, weapon.range)) {
            this._publish(GAME_EVENT_TYPES.COMBAT_MISSED, {
                user_id: player.user_id,
                world_id: this.world.id,
                zone_id: player.zone_id,
                weapon_id: weapon.item_id,
            });
            return;
        }
        this._applyDamage(target, player, computeDamage(player, weapon), now);
    }

    _gatherPower(player, resource) {
        const heldItemId = String(player && player.held_item_id || '').trim();
        const heldItem = heldItemId ? this.itemDefinitions[heldItemId] || this.itemMap[heldItemId] || null : null;
        if (resource.kind === 'tree') {
            const axe = heldItem && heldItem.metadata && heldItem.metadata.skill === 'woodcut'
                ? heldItem
                : this.itemDefinitions.stone_hatchet || this.itemMap.stone_hatchet || null;
            return axe && axe.metadata && axe.metadata.tier ? axe.metadata.tier : 1;
        }
        if (resource.kind === 'rock') {
            const pick = heldItem && heldItem.metadata && heldItem.metadata.skill === 'mining'
                ? heldItem
                : this.itemDefinitions.stone_pickaxe || this.itemMap.stone_pickaxe || null;
            return pick && pick.metadata && pick.metadata.tier ? pick.metadata.tier : 1;
        }
        return 1;
    }

    _handleInteract(player, now) {
        for (const drop of this.loot.values()) {
            if (drop.zone_id !== player.zone_id) continue;
            if (distanceSq(player, drop) <= (LOOT_PICKUP_RADIUS * LOOT_PICKUP_RADIUS)) return this._pickupLoot(player, drop.id);
        }

        const worldObject = this._nearestInteractiveWorldObject(player);
        if (worldObject) {
            const { source, target, profile } = worldObject;
            const state = source === 'structure' ? this._structureState(target) : this._runtimeEntityState(target);
            if (profile.type === 'pickup') {
                const itemId = String(state.item_id || '').trim();
                const quantity = Math.max(1, Math.floor(Number(state.quantity || 1)));
                if (!itemId) return { ok: false, reason: 'pickup is empty' };
                if (itemId === 'coins') {
                    player.coins += quantity;
                    model.upsertPlayer({ user_id: player.user_id, coins: player.coins });
                } else {
                    model.addInventoryItem({ user_id: player.user_id, item_id: itemId, quantity, metadata: { source: target.id, source_type: `${source}:pickup` } });
                }
                if (source === 'runtime') this._removeRuntimeEntity(target);
                this._setHeldItem(player, itemId, now, 520);
                this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, { user_id: player.user_id, item_id: itemId, world_id: this.world.id });
                return { ok: true, item_id: itemId, quantity };
            }
            if (profile.type === 'door') {
                const opened = !state.opened;
                this._updateWorldObjectState(source, target, {
                    opened,
                    auto_close_at: opened ? now + 12000 : null,
                });
                this._setHeldItem(player, this._defaultHeldItem(player), now, 220);
                return { ok: true, opened };
            }
            player.activeInteraction = {
                type: profile.type,
                source,
                target_id: target.id,
                opened_at: now,
            };
            return { ok: true, interaction: this._interactionPayloadForWorldObject(worldObject, player) };
        }

        const interactiveNpc = this._nearestNpcInteraction(player);
        if (interactiveNpc) {
            player.activeInteraction = {
                type: 'shop',
                npc_id: interactiveNpc.id,
                opened_at: now,
            };
            this._setHeldItem(player, interactiveNpc.held_item_id || this._defaultHeldItem(player), now, 500);
            return { ok: true, interaction: this._shopInteractionPayload(interactiveNpc) };
        }

        let closest = null;
        let bestDistSq = RESOURCE_INTERACT_RADIUS * RESOURCE_INTERACT_RADIUS;
        for (const resource of this.resources.values()) {
            if (resource.zone_id !== player.zone_id || resource.hp <= 0) continue;
            const distSq = distanceSq(player, resource);
            if (distSq <= bestDistSq) {
                bestDistSq = distSq;
                closest = resource;
            }
        }
        if (!closest) return { ok: false, reason: 'nothing to interact with' };
        player.activeInteraction = null;
        const resourceDefinition = this.resourceDefinitions[closest.kind] || {};
        const power = this._gatherPower(player, closest);
        closest.hit_flash_until = now + 140;
        if (player.held_item_id && player.held_item_id !== 'hands' && player.held_item_id !== 'coins') this._setHeldItem(player, player.held_item_id, now, 460);
        applyGatherDamage(closest, power);
        this._publish(GAME_EVENT_TYPES.RESOURCE_GATHERED, {
            user_id: player.user_id,
            resource_id: closest.id,
            kind: closest.kind,
            world_id: this.world.id,
            zone_id: player.zone_id,
        });
        if (closest.hp <= 0) {
            const lootTable = closest.loot_table_id ? this.lootTableMap[closest.loot_table_id] : null;
            const drops = lootTable ? rollLoot(lootTable.entries, { seed: now % 0x7fffffff, rolls: 1 }) : [];
            for (const drop of drops) {
                model.addInventoryItem({ user_id: player.user_id, item_id: drop.item_id, quantity: drop.quantity, metadata: {} });
            }
            if (closest.kind === 'tree') this._addSkillXp(player, 'woodcut', 16, 'resource.gather');
            if (closest.kind === 'rock') this._addSkillXp(player, 'mining', 18, 'resource.gather');
            if (closest.kind === 'bush') this._addSkillXp(player, 'farming', 10, 'resource.gather');
            this._publish(GAME_EVENT_TYPES.RESOURCE_DEPLETED, {
                user_id: player.user_id,
                resource_id: closest.id,
                kind: closest.kind,
                world_id: this.world.id,
                zone_id: player.zone_id,
            });
            this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, { user_id: player.user_id, world_id: this.world.id });
        }
        return { ok: true };
    }

    _handleCraft(player, input) {
        const recipe = this.recipeMap[input.recipe_id];
        if (!recipe) return { ok: false, reason: 'recipe not found' };
        const skillLevel = Number(player.levels[recipe.skill] || 1);
        if (skillLevel < Number(recipe.level || 1)) return { ok: false, reason: 'skill too low' };
        const inventory = model.listInventory(player.user_id);
        if (!inventoryUtils.hasItems(inventory, recipe.inputs)) return { ok: false, reason: 'missing ingredients' };
        for (const req of recipe.inputs) {
            model.addInventoryItem({ user_id: player.user_id, item_id: req.item_id, quantity: -Math.abs(req.quantity), metadata: {} });
        }
        model.addInventoryItem({ user_id: player.user_id, item_id: recipe.result.item_id, quantity: recipe.result.quantity, metadata: {} });
        this._addSkillXp(player, recipe.skill, recipe.xp || 10, 'craft');
        this._publish(GAME_EVENT_TYPES.ITEM_CRAFTED, {
            user_id: player.user_id,
            recipe_id: recipe.id,
            item_id: recipe.result.item_id,
            quantity: recipe.result.quantity,
            world_id: this.world.id,
        });
        this._publish(GAME_EVENT_TYPES.INVENTORY_UPDATED, { user_id: player.user_id, world_id: this.world.id });
        return { ok: true };
    }

    _buildPrivilegeDecision(player, placement) {
        const cupboards = [
            ...Array.from(this.structures.values()).filter((structure) => structure.zone_id === placement.zone_id && structure.type === 'tool_cupboard'),
            ...Array.from(this.runtimeEntities.values()).filter((entity) => entity.zone_id === placement.zone_id && entity.kind === 'tool_cupboard'),
        ];
        for (const cupboard of cupboards) {
            const isStructure = Object.prototype.hasOwnProperty.call(cupboard, 'type');
            const state = isStructure ? this._structureState(cupboard) : this._runtimeEntityState(cupboard);
            const radius = Math.max(0, Number(state.build_radius || state.BuildRadius || this.structureDefinitions.tool_cupboard && this.structureDefinitions.tool_cupboard.build_privilege && this.structureDefinitions.tool_cupboard.build_privilege.radius || 600));
            if (!radius) continue;
            if (distanceSq(placement, cupboard) > (radius * radius)) continue;
            const ownerId = cupboard.owner_id || state.owner || null;
            if (ownerId && ownerId !== player.user_id) {
                return { ok: false, reason: `build privilege belongs to ${ownerId}` };
            }
        }
        return { ok: true };
    }

    _initialStructureState(structureKind, player, placement, itemId, structureSize, input = {}) {
        const state = {
            zone_id: placement.zone_id,
            size: structureSize,
            source_item_id: itemId,
        };
        if (structureKind === 'chest' || structureKind === 'tool_cupboard') state.container = [];
        if (structureKind === 'tool_cupboard') {
            state.build_radius = Number(this.structureDefinitions.tool_cupboard && this.structureDefinitions.tool_cupboard.build_privilege && this.structureDefinitions.tool_cupboard.build_privilege.radius || 600);
            state.build_origin = [Math.round(placement.x - player.x), Math.round(placement.y - player.y)];
        }
        if (structureKind === 'text_sign') state.sign_text = String(input.sign_text || 'A freshly hammered sign.').slice(0, 180);
        if (structureKind === 'door' || structureKind === 'forcefield') {
            state.opened = false;
            state.auto_close_at = null;
        }
        return state;
    }

    _handleBuild(player, input) {
        const itemId = String(input.item_id || 'build_wall');
        player.activeInteraction = null;
        const inventory = model.listInventory(player.user_id);
        const entry = inventory.find((item) => item.item_id === itemId && item.quantity > 0);
        if (!entry) return { ok: false, reason: 'missing build item' };
        const itemDefinition = this.itemDefinitions[itemId] || this.itemMap[itemId] || null;
        const buildDefinition = itemDefinition && itemDefinition.builds || {
            structure_kind: itemId.replace(/^build_/, ''),
            size: 48,
        };
        const structureDefinition = this.structureDefinitions[buildDefinition.structure_kind] || null;
        const structureSize = Number(buildDefinition.size || structureDefinition && structureDefinition.size) || 48;
        const placement = {
            x: Number(input.x) || player.x + 48,
            y: Number(input.y) || player.y,
            zone_id: player.zone_id,
        };
        const blockingEntities = [
            ...Array.from(this.structures.values()),
            ...Array.from(this.runtimeEntities.values())
                .filter((entity) => {
                    const definition = this.runtimeEntityDefinitions[entity.kind] || this.structureDefinitions[entity.kind] || {};
                    return definition.blocks_movement !== false;
                })
                .map((entity) => ({
                    x: entity.x,
                    y: entity.y,
                    size: Number(entity.metadata && entity.metadata.size || 48),
                })),
        ];
        const decision = canPlaceStructure({
            x: placement.x,
            y: placement.y,
            size: structureSize,
            zone_id: placement.zone_id,
            bounds: this.bounds(),
            structures: blockingEntities,
        });
        if (!decision.ok) return decision;
        const privilegeDecision = this._buildPrivilegeDecision(player, placement);
        if (!privilegeDecision.ok) return privilegeDecision;
        const structureData = this._initialStructureState(buildDefinition.structure_kind, player, placement, itemId, structureSize, input);
        const structure = model.createStructure({
            type: buildDefinition.structure_kind,
            world_id: this.world.id,
            x: placement.x,
            y: placement.y,
            owner_id: player.user_id,
            data: structureData,
        });
        const hydrated = {
            id: structure.id,
            type: structure.type,
            world_id: structure.world_id,
            owner_id: structure.owner_id,
            x: Number(structure.x),
            y: Number(structure.y),
            zone_id: placement.zone_id,
            size: structureSize,
            data: structure.data || structureData,
        };
        this.structures.set(hydrated.id, hydrated);
        model.addInventoryItem({ user_id: player.user_id, item_id: itemId, quantity: -1, metadata: {} });
        if (!model.listInventory(player.user_id).some((item) => item.item_id === itemId && Number(item.quantity || 0) > 0)) this._clearItemReferences(player, itemId);
        else this._applyHotbarSelection(player, player.quick_slot);
        this._setHeldItem(player, 'hammer', Date.now(), 540);
        this._addSkillXp(player, 'construction', 14, 'build');
        this._publish(GAME_EVENT_TYPES.STRUCTURE_PLACED, {
            structure_id: hydrated.id,
            type: hydrated.type,
            owner_id: player.user_id,
            world_id: this.world.id,
            zone_id: placement.zone_id,
        });
        return { ok: true, structure: hydrated };
    }

    _handleTravel(player, input) {
        const targetZone = String(input.targetZone || input.target_zone || '');
        if (!targetZone) return { ok: false, reason: 'target zone required' };
        if (!canTravel(this.worldDefinition, player.zone_id, targetZone)) {
            return { ok: false, reason: 'travel route unavailable' };
        }
        player.activeInteraction = null;
        const fromZone = player.zone_id;
        this._publish(GAME_EVENT_TYPES.TRAVEL_STARTED, {
            user_id: player.user_id,
            from_zone: fromZone,
            to_zone: targetZone,
            world_id: this.world.id,
        });
        const spawn = spawnForZone(this.worldDefinition, targetZone);
        player.zone_id = targetZone;
        player.x = Number(spawn.x) || player.x;
        player.y = Number(spawn.y) || player.y;
        model.upsertPlayer({ user_id: player.user_id, zone: targetZone, x: player.x, y: player.y, world_id: this.world.id });
        this._publish(GAME_EVENT_TYPES.TRAVEL_COMPLETED, {
            user_id: player.user_id,
            from_zone: fromZone,
            to_zone: targetZone,
            world_id: this.world.id,
        });
        return { ok: true };
    }

    _respawnPlayer(player) {
        const spawn = spawnForZone(this.worldDefinition, 'outpost');
        player.dead = false;
        player.dead_until = 0;
        player.activeInteraction = null;
        player.zone_id = 'outpost';
        player.hp = player.max_hp;
        player.stamina = player.max_stamina;
        player.x = Number(spawn.x) || 4096;
        player.y = Number(spawn.y) || 4096;
        player.vx = 0;
        player.vy = 0;
        player.facing = 1;
        player.aim_x = player.x + 72;
        player.aim_y = player.y;
        player.hit_flash_until = 0;
        player.attack_anim_until = 0;
        player.held_item_id = this._defaultHeldItem(player);
        model.upsertPlayer({ user_id: player.user_id, zone: player.zone_id, x: player.x, y: player.y, hp: player.hp, stamina: player.stamina, world_id: this.world.id });
        this._publish(GAME_EVENT_TYPES.PLAYER_RESPAWNED, {
            user_id: player.user_id,
            world_id: this.world.id,
            zone_id: player.zone_id,
        });
    }

    join({ socketId, userId, displayName, zoneId }) {
        const existing = this._findPlayerByUserId(String(userId));
        const playerRow = model.ensurePlayer(String(userId), displayName || `Player ${userId}`);
        const zone = zoneId || playerRow.zone || 'outpost';
        const spawn = spawnForZone(this.worldDefinition, zone);
        const player = existing || {
            id: `player:${String(userId)}`,
            user_id: String(userId),
            display_name: displayName || playerRow.display_name,
            metadata: clone(playerRow.metadata || {}),
            world_id: this.world.id,
            zone_id: zone,
            x: Number(playerRow.x || spawn.x || 4096),
            y: Number(playerRow.y || spawn.y || 4096),
            vx: 0,
            vy: 0,
            coins: Number(playerRow.coins || 0),
            loyalty_points: Number(playerRow.loyalty_points || 0),
            hp: Number(playerRow.hp || playerRow.max_hp || 100),
            max_hp: Number(playerRow.max_hp || 100),
            stamina: Number(playerRow.stamina || playerRow.max_stamina || 100),
            max_stamina: Number(playerRow.max_stamina || 100),
            equip_weapon: playerRow.equip_weapon || 'wooden_club',
            equip_armor: playerRow.equip_armor || '',
            equip_axe: playerRow.equip_axe || 'stone_hatchet',
            equip_pickaxe: playerRow.equip_pickaxe || 'stone_pickaxe',
            equip_rod: playerRow.equip_rod || 'fishing_rod',
            levels: clone(playerRow.levels || {}),
            mining_xp: playerRow.mining_xp,
            fishing_xp: playerRow.fishing_xp,
            woodcut_xp: playerRow.woodcut_xp,
            farming_xp: playerRow.farming_xp,
            combat_xp: playerRow.combat_xp,
            crafting_xp: playerRow.crafting_xp,
            smithing_xp: playerRow.smithing_xp,
            agility_xp: playerRow.agility_xp,
            input: { seq: 0, keys: {} },
            pendingActions: [],
            lastInputSeq: 0,
            lastProcessedInputSeq: 0,
            lastActionSeq: 0,
            cooldowns: { attack: 0 },
            dead: false,
            dead_until: 0,
            facing: 1,
            aim_x: Number(playerRow.x || spawn.x || 4096) + 72,
            aim_y: Number(playerRow.y || spawn.y || 4096),
            moving: false,
            sprinting: false,
            speed: 0,
            step_phase: 0,
            attack_anim_until: 0,
            hit_flash_until: 0,
            quick_slot: 1,
            held_item_id: playerRow.equip_weapon || 'wooden_club',
            hold_until: 0,
            activeInteraction: null,
        };
        player.socketId = socketId;
        player.zone_id = zone;
        player.coins = Number(playerRow.coins || player.coins || 0);
        player.metadata = clone(playerRow.metadata || player.metadata || {});
        player.loyalty_points = Number(playerRow.loyalty_points || player.loyalty_points || 0);
        player.levels = this._skillSnapshot(player);
        player.quick_slot = Number(player.quick_slot) || 1;
        player.hotbar = this._coerceHotbar(player.metadata && player.metadata.sourcevibe && player.metadata.sourcevibe.hotbar, player);
        this._applyHotbarSelection(player, player.quick_slot);
        player.held_item_id = player.held_item_id || this._defaultHeldItem(player);
        player.aim_x = Number(player.aim_x) || player.x + ((player.facing || 1) * 72);
        player.aim_y = Number(player.aim_y) || player.y;
        if (!existing && (playerRow.zone !== zone || playerRow.world_id !== this.world.id)) {
            player.x = Number(spawn.x) || player.x;
            player.y = Number(spawn.y) || player.y;
        }
        this.players.set(socketId, player);
        this.playersBySocket.set(socketId, player.user_id);
        player.session_id = worldStore.recordSession({ world_id: this.world.id, user_id: player.user_id }).id;
        this._recordHistory(player);
        this._publish(GAME_EVENT_TYPES.SESSION_STARTED, { user_id: player.user_id, world_id: this.world.id, zone_id: player.zone_id });
        this._publish(GAME_EVENT_TYPES.PLAYER_JOINED, { user_id: player.user_id, world_id: this.world.id, zone_id: player.zone_id });
        this._publish(GAME_EVENT_TYPES.PLAYER_SPAWNED, { user_id: player.user_id, world_id: this.world.id, zone_id: player.zone_id });
        this.hooks.call('player:join', { room: this, player, socketId });
        return this.buildSnapshotForPlayer(player, Date.now());
    }

    leave(socketId) {
        const player = this.players.get(socketId);
        if (!player) return;
        if (player.session_id) worldStore.endSession(player.session_id);
        model.upsertPlayer({
            user_id: player.user_id,
            x: player.x,
            y: player.y,
            zone: player.zone_id,
            hp: player.hp,
            stamina: player.stamina,
            world_id: this.world.id,
            coins: player.coins,
            equip_weapon: player.equip_weapon,
            equip_axe: player.equip_axe,
            equip_pickaxe: player.equip_pickaxe,
            equip_rod: player.equip_rod,
            equip_armor: player.equip_armor,
        });
        this.players.delete(socketId);
        this.playersBySocket.delete(socketId);
        this._publish(GAME_EVENT_TYPES.PLAYER_LEFT, { user_id: player.user_id, world_id: this.world.id, zone_id: player.zone_id });
        this._publish(GAME_EVENT_TYPES.SESSION_ENDED, { user_id: player.user_id, world_id: this.world.id, zone_id: player.zone_id });
        this.hooks.call('player:leave', { room: this, player, socketId });
    }

    receiveInput(socketId, input) {
        const player = this.players.get(socketId);
        if (!player) return { ok: false, reason: 'player not joined' };
        const validity = validateInput(input);
        if (!validity.ok) {
            this._feed('anti-cheat', { user_id: player.user_id, reason: validity.reason });
            return validity;
        }
        if (validity.seq <= player.lastInputSeq) return { ok: true, duplicate: true };
        player.lastInputSeq = validity.seq;
        player.input = {
            seq: validity.seq,
            dt: validity.dt,
            sent_at: Number(input.sent_at) || Date.now(),
            keys: asBoolObject(input.keys),
            aim: input.aim && typeof input.aim === 'object' ? { x: Number(input.aim.x) || player.x, y: Number(input.aim.y) || player.y } : null,
            action: input.action || null,
            targetId: input.targetId || null,
            quickSlot: input.quickSlot == null ? null : Number(input.quickSlot),
            item_id: input.item_id || null,
            recipe_id: input.recipe_id || null,
            x: Number(input.x),
            y: Number(input.y),
            targetZone: input.targetZone || input.target_zone || null,
        };
        if (player.input.quickSlot != null) this._applyHotbarSelection(player, Math.max(1, Math.min(HOTBAR_SIZE, player.input.quickSlot)));
        if (player.input.aim) {
            player.aim_x = player.input.aim.x;
            player.aim_y = player.input.aim.y;
            if (Math.abs(player.aim_x - player.x) > 4) player.facing = player.aim_x >= player.x ? 1 : -1;
        }
        if (!player.hold_until || Date.now() >= player.hold_until) player.held_item_id = this._defaultHeldItem(player);
        if (player.input.action && player.lastActionSeq < validity.seq) {
            player.pendingActions.push(clone(player.input));
            player.lastActionSeq = validity.seq;
        }
        return { ok: true };
    }

    sendChat(socketId, text) {
        const player = this.players.get(socketId);
        if (!player) return { ok: false, reason: 'player not joined' };
        const message = String(text || '').trim();
        if (!message) return { ok: false, reason: 'message required' };
        const item = {
            id: uid('chat'),
            user_id: player.user_id,
            display_name: player.display_name,
            zone_id: player.zone_id,
            text: message.slice(0, 240),
            created_at: new Date().toISOString(),
        };
        this.chat.push(item);
        while (this.chat.length > 80) this.chat.shift();
        return { ok: true, message: item };
    }

    _processAction(player, action, now) {
        let result;
        switch (action.action) {
        case 'attack':
            result = this._handleAttack(player, action, now);
            break;
        case 'interact':
        case 'pickup':
            result = this._handleInteract(player, now);
            break;
        case 'craft':
            result = this._handleCraft(player, action, now);
            break;
        case 'build':
            result = this._handleBuild(player, action, now);
            break;
        case 'travel':
            result = this._handleTravel(player, action, now);
            break;
        case 'close_interaction':
            result = this.closeInteraction(player);
            break;
        case 'interaction_action':
            result = this.handleInteractionAction(player, action);
            break;
        case 'respawn':
            if (player.dead && now >= player.dead_until) this._respawnPlayer(player);
            result = { ok: true };
            break;
        default:
            result = { ok: false, reason: 'unknown action' };
            break;
        }
        this.hooks.call('action:processed', { room: this, player, action, now, result });
        return result;
    }

    _updateProjectiles(dt, now) {
        for (const projectile of this.projectiles.values()) {
            projectile.x += projectile.vx * dt;
            projectile.y += projectile.vy * dt;
            if (now >= projectile.expires_at) {
                this.projectiles.delete(projectile.id);
                continue;
            }
            const owner = this._findPlayerByUserId(projectile.owner_id);
            let target = projectile.target_id ? this.npcs.get(projectile.target_id) || this._findPlayerByUserId(projectile.target_id) : null;
            if (!target) {
                target = Array.from(this.npcs.values()).find((npc) => npc.zone_id === projectile.zone_id && npc.hp > 0 && ((npc.x - projectile.x) ** 2 + (npc.y - projectile.y) ** 2) < (16 * 16))
                    || Array.from(this.players.values()).find((player) => player.zone_id === projectile.zone_id && player.user_id !== projectile.owner_id && !player.dead && ((player.x - projectile.x) ** 2 + (player.y - projectile.y) ** 2) < (16 * 16));
            }
            if (!target) continue;
            this._applyDamage(target, owner || projectile, projectile.damage, now);
            this._publish(GAME_EVENT_TYPES.COMBAT_PROJECTILE_HIT, {
                projectile_id: projectile.id,
                target_id: target.user_id || target.id,
                world_id: this.world.id,
                zone_id: projectile.zone_id,
            });
            this.projectiles.delete(projectile.id);
        }
    }

    _updateNpcs(dt, now) {
        for (const npc of this.npcs.values()) {
            if (npc.hp <= 0) {
                if (npc.respawn_at && now >= npc.respawn_at) {
                    npc.hp = npc.max_hp;
                    npc.x = npc.home_x;
                    npc.y = npc.home_y;
                    npc.vx = 0;
                    npc.vy = 0;
                    npc.moving = false;
                    npc.attack_anim_until = 0;
                    npc.hit_flash_until = 0;
                    npc.respawn_at = null;
                    this._publish(npc.kind === 'boss' ? GAME_EVENT_TYPES.BOSS_SPAWNED : GAME_EVENT_TYPES.NPC_SPAWNED, {
                        npc_id: npc.id,
                        template_id: npc.template_id,
                        world_id: this.world.id,
                        zone_id: npc.zone_id,
                    });
                }
                continue;
            }
            const players = Array.from(this.players.values()).filter((player) => player.zone_id === npc.zone_id && !player.dead);
            if (!players.length) {
                npc.aggro_target = null;
                npc.vx = 0;
                npc.vy = 0;
                npc.moving = false;
                continue;
            }
            let target = players.find((player) => player.user_id === npc.aggro_target) || null;
            if (!target) {
                let best = null;
                let bestDistSq = (Number(npc.aggro_radius) || 0) ** 2;
                for (const player of players) {
                    const dx = npc.x - player.x;
                    const dy = npc.y - player.y;
                    const distSq = (dx * dx) + (dy * dy);
                    if (distSq <= bestDistSq) {
                        best = player;
                        bestDistSq = distSq;
                    }
                }
                target = best;
                if (target && npc.aggro_target !== target.user_id) {
                    npc.aggro_target = target.user_id;
                    this._publish(GAME_EVENT_TYPES.NPC_AGGRO, {
                        npc_id: npc.id,
                        target_id: target.user_id,
                        world_id: this.world.id,
                        zone_id: npc.zone_id,
                    });
                }
            }
            if (!target) {
                npc.vx = 0;
                npc.vy = 0;
                npc.moving = false;
                continue;
            }
            const dx = target.x - npc.x;
            const dy = target.y - npc.y;
            const dist = Math.sqrt((dx * dx) + (dy * dy)) || 1;
            npc.aim_x = target.x;
            npc.aim_y = target.y;
            if (Math.abs(dx) > 2) npc.facing = dx >= 0 ? 1 : -1;
            if (dist > 28) {
                const moveSpeed = Number(npc.speed || 60);
                const stepX = (dx / dist) * (moveSpeed * dt);
                const stepY = (dy / dist) * (moveSpeed * dt);
                npc.x += stepX;
                npc.y += stepY;
                npc.vx = stepX / Math.max(dt, 1e-6);
                npc.vy = stepY / Math.max(dt, 1e-6);
                npc.moving = true;
                npc.step_phase = Number(npc.step_phase || 0) + (Math.sqrt((npc.vx * npc.vx) + (npc.vy * npc.vy)) * dt * 0.04);
            } else if (now >= (npc.cooldowns.attack || 0)) {
                npc.cooldowns.attack = now + 1000;
                npc.vx = 0;
                npc.vy = 0;
                npc.moving = false;
                npc.attack_anim_until = now + 240;
                this._applyDamage(target, npc, Number(npc.damage || 1), now);
            } else {
                npc.vx = 0;
                npc.vy = 0;
                npc.moving = false;
            }
            this._recordHistory(npc);
        }
    }

    tick(dt, now) {
        this.sequence += 1;
        for (const player of this.players.values()) {
            if (!player.dead) {
                updatePlayerMovement(player, dt, this.bounds());
                player.lastProcessedInputSeq = player.input && player.input.seq || player.lastProcessedInputSeq;
                while (player.pendingActions.length) this._processAction(player, player.pendingActions.shift(), now);
                if (!player.hold_until || now >= player.hold_until) player.held_item_id = this._defaultHeldItem(player);
                this._recordHistory(player);
                model.upsertPlayer({ user_id: player.user_id, x: player.x, y: player.y, zone: player.zone_id, hp: player.hp, stamina: Math.floor(player.stamina), world_id: this.world.id });
            } else if (now >= player.dead_until && player.input && player.input.action === 'respawn') {
                this._respawnPlayer(player);
            }
        }
        for (const resource of this.resources.values()) {
            if (maybeRespawnResource(resource, now)) {
                this._publish(GAME_EVENT_TYPES.RESOURCE_RESPAWNED, { resource_id: resource.id, kind: resource.kind, world_id: this.world.id, zone_id: resource.zone_id });
            }
        }
        for (const structure of this.structures.values()) {
            const state = this._structureState(structure);
            if (state.opened && state.auto_close_at && now >= Number(state.auto_close_at)) {
                this._updateWorldObjectState('structure', structure, { opened: false, auto_close_at: null });
            }
        }
        for (const entity of this.runtimeEntities.values()) {
            const state = this._runtimeEntityState(entity);
            if (state.opened && state.auto_close_at && now >= Number(state.auto_close_at)) {
                this._updateWorldObjectState('runtime', entity, { opened: false, auto_close_at: null });
            }
        }
        this._updateNpcs(dt, now);
        this._updateProjectiles(dt, now);
        if (now - this.lastSnapshotAt >= Math.round(1000 / this.tickRate)) {
            this.lastSnapshotAt = now;
            this.broadcastSnapshots(now);
        }
        if (now - this.lastPersistAt >= 10000) {
            this.lastPersistAt = now;
            const snapshot = worldStore.recordSnapshot(this.world.id, worldSnapshotPayload(this));
            this._publish(GAME_EVENT_TYPES.WORLD_SNAPSHOT_CREATED, { world_id: this.world.id, snapshot_id: snapshot.id, sequence: snapshot.sequence });
        }
    }

    buildSnapshotForPlayer(player, now) {
        const prompt = this._interactionPrompt(player);
        const activeNpc = this._activeInteractionNpc(player);
        const activeWorldObject = this._activeInteractionWorldObject(player);
        const activeInteraction = activeNpc
            ? this._shopInteractionPayload(activeNpc)
            : activeWorldObject
                ? this._interactionPayloadForWorldObject(activeWorldObject, player)
                : null;
        const zoneDefinition = ((this.worldDefinition && this.worldDefinition.zones) || []).find((zone) => zone.zone_id === player.zone_id) || {};
        const sameZonePlayers = Array.from(this.players.values())
            .filter((entry) => entry.zone_id === player.zone_id && entry.user_id !== player.user_id && !entry.dead)
            .map((entry) => ({
                id: entry.user_id,
                kind: 'player',
                display_name: entry.display_name,
                x: entry.x,
                y: entry.y,
                vx: entry.vx,
                vy: entry.vy,
                hp: entry.hp,
                max_hp: entry.max_hp,
                zone_id: entry.zone_id,
                facing: entry.facing || 1,
                aim_x: entry.aim_x || (entry.x + ((entry.facing || 1) * 72)),
                aim_y: entry.aim_y || entry.y,
                held_item: entry.held_item_id || this._defaultHeldItem(entry),
                equip_weapon: entry.equip_weapon || '',
                attack_anim_until: Number(entry.attack_anim_until || 0),
                hit_flash_until: Number(entry.hit_flash_until || 0),
                sprinting: !!entry.sprinting,
                moving: !!entry.moving,
                step_phase: Number(entry.step_phase || 0),
            }));
        const npcs = Array.from(this.npcs.values())
            .filter((entry) => entry.zone_id === player.zone_id && entry.hp > 0)
            .map((entry) => ({
                id: entry.id,
                kind: entry.kind,
                template_id: entry.template_id,
                name: entry.name,
                x: entry.x,
                y: entry.y,
                vx: entry.vx,
                vy: entry.vy,
                hp: entry.hp,
                max_hp: entry.max_hp,
                zone_id: entry.zone_id,
                facing: entry.facing || 1,
                aim_x: entry.aim_x || entry.x,
                aim_y: entry.aim_y || entry.y,
                held_item: entry.held_item_id || '',
                attack_anim_until: Number(entry.attack_anim_until || 0),
                hit_flash_until: Number(entry.hit_flash_until || 0),
                moving: !!entry.moving,
                step_phase: Number(entry.step_phase || 0),
                interaction: entry.interaction ? { type: entry.interaction.type, title: entry.interaction.title || entry.name } : null,
            }));
        const resources = Array.from(this.resources.values())
            .filter((entry) => entry.zone_id === player.zone_id && entry.hp > 0)
            .map((entry) => ({ id: entry.id, kind: entry.kind, x: entry.x, y: entry.y, hp: entry.hp, max_hp: entry.max_hp, zone_id: entry.zone_id, hit_flash_until: Number(entry.hit_flash_until || 0) }));
        const structures = Array.from(this.structures.values())
            .filter((entry) => entry.zone_id === player.zone_id)
            .map((entry) => ({ id: entry.id, kind: entry.type, x: entry.x, y: entry.y, owner_id: entry.owner_id, zone_id: entry.zone_id, size: entry.size || 48, data: clone(entry.data || {}) }));
        const runtimeEntities = Array.from(this.runtimeEntities.values())
            .filter((entry) => entry.zone_id === player.zone_id)
            .map((entry) => ({
                id: entry.id,
                kind: entry.kind,
                template_id: entry.template_id || null,
                x: entry.x,
                y: entry.y,
                owner_id: entry.owner_id,
                zone_id: entry.zone_id,
                hp: entry.hp,
                max_hp: entry.max_hp,
                metadata: clone(entry.metadata || {}),
            }));
        const loot = Array.from(this.loot.values())
            .filter((entry) => entry.zone_id === player.zone_id)
            .map((entry) => ({ id: entry.id, item_id: entry.item_id, quantity: entry.quantity, x: entry.x, y: entry.y, zone_id: entry.zone_id }));
        const projectiles = Array.from(this.projectiles.values())
            .filter((entry) => entry.zone_id === player.zone_id)
            .map((entry) => ({ id: entry.id, x: entry.x, y: entry.y, vx: entry.vx, vy: entry.vy, owner_id: entry.owner_id, zone_id: entry.zone_id }));
        const snapshot = {
            world: {
                id: this.world.id,
                slug: this.world.slug,
                name: this.world.name,
                zone_id: player.zone_id,
                zone_name: zoneDefinition.label || zoneDefinition.name || zoneDefinition.zone_id || player.zone_id,
                zone_kind: zoneDefinition.kind || null,
                zone_description: zoneDefinition.description || '',
                chunk_size: this.chunkSize,
                bounds: this.bounds(),
                ambience: clone(zoneDefinition.ambience || this.worldDefinition && this.worldDefinition.ambience || {}),
                camera: clone(this.worldDefinition && this.worldDefinition.camera || {}),
            },
            tick: this.sequence,
            server_time: now,
            lastProcessedInputSeq: player.lastProcessedInputSeq || 0,
            self: {
                id: player.user_id,
                display_name: player.display_name,
                x: player.x,
                y: player.y,
                vx: player.vx,
                vy: player.vy,
                facing: player.facing || 1,
                aim_x: player.aim_x || (player.x + ((player.facing || 1) * 72)),
                aim_y: player.aim_y || player.y,
                hp: player.hp,
                max_hp: player.max_hp,
                stamina: Math.round(player.stamina),
                max_stamina: player.max_stamina,
                zone_id: player.zone_id,
                dead: !!player.dead,
                moving: !!player.moving,
                sprinting: !!player.sprinting,
                step_phase: Number(player.step_phase || 0),
                quick_slot: Number(player.quick_slot || 1),
                coins: Number(player.coins || 0),
                loyalty_points: Number(player.loyalty_points || 0),
                held_item: player.held_item_id || this._defaultHeldItem(player),
                attack_anim_until: Number(player.attack_anim_until || 0),
                hit_flash_until: Number(player.hit_flash_until || 0),
                equipment: {
                    weapon: player.equip_weapon || '',
                    armor: player.equip_armor || '',
                    axe: player.equip_axe || '',
                    pickaxe: player.equip_pickaxe || '',
                    rod: player.equip_rod || '',
                },
                levels: this._skillSnapshot(player),
                skill_xp: this._skillXpSnapshot(player),
                skill_progress: this._skillProgressSnapshot(player),
                inventory: model.listInventory(player.user_id),
                hotbar: this._buildHotbarSnapshot(player),
                bank: model.listBank(player.user_id),
                quests: model.listDailyQuests(player.user_id),
                achievements: model.listAchievements(player.user_id),
            },
            interaction: {
                prompt,
                active: activeInteraction,
            },
            entities: {
                players: visibleWithinAoi(player, sameZonePlayers, this.aoiRadius, { zone_id: player.zone_id }),
                npcs: visibleWithinAoi(player, npcs, this.aoiRadius, { zone_id: player.zone_id }),
                resources: visibleWithinAoi(player, resources, this.aoiRadius, { zone_id: player.zone_id }),
                structures: visibleWithinAoi(player, structures, this.aoiRadius + 64, { zone_id: player.zone_id }),
                runtime_entities: visibleWithinAoi(player, runtimeEntities, this.aoiRadius + 96, { zone_id: player.zone_id }),
                loot: visibleWithinAoi(player, loot, this.aoiRadius, { zone_id: player.zone_id }),
                projectiles: visibleWithinAoi(player, projectiles, this.aoiRadius, { zone_id: player.zone_id }),
            },
            chat: this._currentWorldChat(player.zone_id),
            feed: this.feed.slice(-10),
            performance: {
                tick_rate: this.tickRate,
                aoi_radius: this.aoiRadius,
                players_in_room: this.players.size,
                entities_visible: sameZonePlayers.length + npcs.length + resources.length + structures.length + runtimeEntities.length + loot.length,
            },
        };
        this.hooks.call('snapshot:decorate', snapshot, { room: this, player, now });
        return snapshot;
    }

    broadcastSnapshots(now) {
        for (const [socketId, player] of this.players.entries()) {
            this.emitToSocket(socketId, 'snapshot', this.buildSnapshotForPlayer(player, now));
        }
    }

    summary() {
        return {
            world_id: this.world.id,
            world_slug: this.world.slug,
            tick_rate: this.tickRate,
            player_count: this.players.size,
            npc_count: Array.from(this.npcs.values()).filter((npc) => npc.hp > 0).length,
            resource_count: Array.from(this.resources.values()).filter((resource) => resource.hp > 0).length,
            structure_count: this.structures.size,
            runtime_entity_count: this.runtimeEntities.size,
            loot_count: this.loot.size,
            latest_feed: this.feed.slice(-5),
            script_diagnostics: this.scriptDiagnostics.slice(-5),
        };
    }
}

module.exports = { WorldRoom };
