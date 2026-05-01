'use strict';

const { Server } = require('socket.io');

const worldStore = require('./world-store');
const { createFixedTicker } = require('./systems/fixed-tick');
const { WorldRoom } = require('./rooms/world-room');
const { DungeonRoom } = require('./rooms/dungeon-room');
const { EditorRoom } = require('./rooms/editor-room');
const { STARTER_WORLD } = require('./catalog/starter-world');
const { ITEMS } = require('./catalog/item-catalog');
const { RECIPES } = require('./catalog/recipes');
const { LOOT_TABLES } = require('./catalog/loot-tables');
const { NPC_TEMPLATES } = require('./catalog/npc-templates');
const { SKILL_KEYS } = require('./catalog/skills');
const { GAME_EVENT_TYPES } = require('@openvibe/contracts');
const modRegistry = require('../mods/registry');
const { buildAuthClient } = require('../middleware');
const { buildRuntimeCatalog } = require('./engine/content-registry');
const { buildPublicScriptingSummary } = require('./engine/mod-script-runtime');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseCookieHeader(value) {
    return String(value || '')
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .reduce((acc, entry) => {
            const pivot = entry.indexOf('=');
            if (pivot === -1) return acc;
            const key = entry.slice(0, pivot).trim();
            const nextValue = entry.slice(pivot + 1).trim();
            if (key) acc[key] = decodeURIComponent(nextValue);
            return acc;
        }, {});
}

function socketToken(socket) {
    const auth = socket.handshake && socket.handshake.auth || {};
    const headers = socket.handshake && socket.handshake.headers || {};
    const query = socket.handshake && socket.handshake.query || {};
    const cookies = parseCookieHeader(headers.cookie);
    const raw = auth.token || headers.authorization || query.token || cookies.openvibe_token || cookies.hobo_token || cookies.token || '';
    return String(raw || '').trim().replace(/^Bearer\s+/i, '');
}

function resolveWorldDefinition(world, fallback = STARTER_WORLD) {
    const base = clone(fallback || STARTER_WORLD);
    const metadata = isObject(world && world.metadata) ? world.metadata : {};
    const persistedZones = world && world.id ? worldStore.listZones(world.id) : [];
    const persistedResources = world && world.id ? worldStore.listResourceNodes(world.id) : [];
    const persistedRuntimeEntities = world && world.id ? worldStore.listRuntimeEntities(world.id) : [];
    return Object.assign({}, base, {
        slug: world && world.slug || base.slug,
        name: world && world.name || base.name,
        mode: world && world.mode || base.mode,
        seed: Number(world && world.seed) || base.seed,
        bounds: isObject(metadata.bounds) ? clone(metadata.bounds) : base.bounds,
        chunk_size: Number(metadata.chunk_size) || base.chunk_size,
        ambience: isObject(metadata.ambience) ? Object.assign({}, clone(base.ambience || {}), clone(metadata.ambience)) : clone(base.ambience || {}),
        camera: isObject(metadata.camera) ? Object.assign({}, clone(base.camera || {}), clone(metadata.camera)) : clone(base.camera || {}),
        terrain_patches: Array.isArray(metadata.terrain_patches) ? clone(metadata.terrain_patches) : clone(base.terrain_patches || []),
        landmarks: Array.isArray(metadata.landmarks) ? clone(metadata.landmarks) : clone(base.landmarks || []),
        travel: Array.isArray(metadata.travel) ? clone(metadata.travel) : clone(base.travel || []),
        npcs: Array.isArray(metadata.npcs) ? clone(metadata.npcs) : clone(base.npcs || []),
        runtime_entities: persistedRuntimeEntities.length ? persistedRuntimeEntities : (Array.isArray(metadata.runtime_entities) ? clone(metadata.runtime_entities) : clone(base.runtime_entities || [])),
        zones: persistedZones.length ? persistedZones : (Array.isArray(metadata.zones) ? clone(metadata.zones) : clone(base.zones || [])),
        resources: persistedResources.length ? persistedResources : (Array.isArray(metadata.resources) ? clone(metadata.resources) : clone(base.resources || [])),
    });
}

function actorFromSocket(socket, authClient) {
    const auth = socket.handshake && socket.handshake.auth || {};
    const headers = socket.handshake && socket.handshake.headers || {};
    const token = socketToken(socket);
    if (authClient && token) {
        const user = authClient.verifyToken(token);
        if (user) {
            const actorType = user.actor_type === 'anon' || user.anonymous === true ? 'anonymous' : 'user';
            const actorId = user.sub || user.id || null;
            if (actorId) {
                return {
                    type: actorType,
                    id: String(actorId),
                    display_name: user.display_name || user.username || `Player ${actorId}`,
                    role: user.role || (actorType === 'anonymous' ? 'anonymous' : 'user'),
                };
            }
        }
    }
    const userId = auth.userId || auth.user_id || headers['x-openvibe-user-id'] || null;
    if (userId) {
        return {
            type: 'user',
            id: String(userId),
            display_name: auth.displayName || auth.display_name || headers['x-openvibe-display-name'] || headers['x-openvibe-username'] || `Player ${userId}`,
            role: auth.role || headers['x-openvibe-user-role'] || 'user',
        };
    }
    const guestId = `guest:${socket.id.slice(0, 8)}`;
    return {
        type: 'guest',
        id: guestId,
        display_name: auth.displayName || auth.display_name || 'Guest Adventurer',
        role: 'guest',
    };
}

function seedStarterContent({ publish } = {}) {
    const world = worldStore.upsertWorld({
        slug: STARTER_WORLD.slug,
        name: STARTER_WORLD.name,
        mode: STARTER_WORLD.mode,
        seed: STARTER_WORLD.seed,
        status: 'published',
        metadata: {
            bounds: STARTER_WORLD.bounds,
            chunk_size: STARTER_WORLD.chunk_size,
            description: 'Flagship OpenVibe Games 2D MMO vertical slice.',
            routes: {
                play: '/2d-world',
                editor: '/2d-world/editor',
                status: '/2d-world/status',
            },
        },
    });
    worldStore.ensureSeedItemCatalog(ITEMS);
    worldStore.ensureSeedLootTables(LOOT_TABLES);
    worldStore.ensureSeedNpcTemplates(NPC_TEMPLATES);
    worldStore.setZones(world.id, STARTER_WORLD.zones);
    worldStore.setResourceNodes(world.id, STARTER_WORLD.resources);
    worldStore.setRuntimeEntities(world.id, STARTER_WORLD.runtime_entities || []);
    if (typeof publish === 'function') {
        publish(GAME_EVENT_TYPES.WORLD_SEEDED, { world_id: world.id, slug: world.slug, name: world.name });
    }
    return world;
}

function buildCatalog(world, worldDefinition = STARTER_WORLD) {
    const resolvedWorldDefinition = resolveWorldDefinition(world, worldDefinition || STARTER_WORLD);
    const enabledMods = modRegistry.listEnabledMods(world.id, { includeAssets: true });
    const catalog = buildRuntimeCatalog({
        world,
        worldDefinition: resolvedWorldDefinition,
        mods: enabledMods,
    });
    const scripting = buildPublicScriptingSummary(enabledMods, {
        allowUntrusted: process.env.OPENVIBE_GAMES_ALLOW_UNTRUSTED_MOD_SCRIPTS === '1',
        allowedHooks: catalog.engine && catalog.engine.hook_surfaces || [],
    });
    const nextCatalog = Object.assign({}, catalog, {
        seams: {
            media_namespace: 'games.assets',
            chat_surface: 'openvibe.chat',
            billing_surface: 'billing.openvibe.network',
            ai_surface: 'ai.openvibe.network',
            community_surface: 'openvibe.community',
        },
    });
    nextCatalog.engine = Object.assign({}, catalog.engine || {}, {
        scripting,
    });
    Object.defineProperty(nextCatalog, '__server', {
        enumerable: false,
        value: {
            enabledMods,
            allowUntrustedScripts: scripting.trusted_only === false,
        },
    });
    return nextCatalog;
}

function createRealtimeRuntime({ httpServer, eventBus, config, authClient }) {
    const io = new Server(httpServer, {
        path: '/games/realtime',
        cors: { origin: true, credentials: true },
        transports: ['websocket', 'polling'],
        allowUpgrades: true,
    });
    const socketAuthClient = authClient || buildAuthClient(config);

    const publish = (eventType, payload) => {
        if (eventBus && typeof eventBus.publishGameEvent === 'function') {
            eventBus.publishGameEvent(eventType, payload, { actor_type: 'service', actor_id: config.serviceId || 'openvibe-games' });
        }
    };

    let sourcevibe = null;

    const rootWorld = seedStarterContent({ publish });
    const worldRooms = new Map();
    const dungeonRooms = new Map();
    const editorRoom = new EditorRoom({ emitToSocket, publish });

    function emitToSocket(socketId, eventName, payload) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) socket.emit(eventName, payload);
    }

    function roomKey(worldId, roomType) {
        return `${roomType || 'world'}:${worldId}`;
    }

    function getCatalog(worldId = rootWorld.id) {
        const world = worldStore.getWorld(worldId) || rootWorld;
        return buildCatalog(world);
    }

    function refreshWorldCatalog(worldId = rootWorld.id) {
        const world = worldStore.getWorld(worldId) || rootWorld;
        const catalog = buildCatalog(world);
        for (const room of worldRooms.values()) {
            if (room && room.world && room.world.id === world.id && typeof room.setCatalog === 'function') {
                room.setCatalog(catalog);
            }
        }
        for (const room of dungeonRooms.values()) {
            if (room && room.world && room.world.id === world.id && typeof room.setCatalog === 'function') {
                room.setCatalog(catalog);
            }
        }
        return catalog;
    }

    function getRoom({ worldId, roomType }) {
        const world = worldStore.getWorld(worldId) || rootWorld;
        const catalog = buildCatalog(world);
        const key = roomKey(worldId, roomType);
        if (roomType === 'dungeon') {
            if (!dungeonRooms.has(key)) {
                dungeonRooms.set(key, new DungeonRoom({
                    world,
                    worldDefinition: catalog.world_definition,
                    catalog,
                    publish,
                    emitToSocket,
                    tickRate: Number(process.env.OPENVIBE_GAMES_TICK_RATE) || 20,
                }));
            } else if (typeof dungeonRooms.get(key).setCatalog === 'function') {
                dungeonRooms.get(key).setCatalog(catalog);
            }
            return dungeonRooms.get(key);
        }
        if (!worldRooms.has(key)) {
            const host = sourcevibe && typeof sourcevibe.createRoomHost === 'function'
                ? sourcevibe.createRoomHost({
                    world,
                    roomType,
                    worldDefinition: catalog.world_definition,
                    catalog,
                    publish,
                    emitToSocket,
                    tickRate: Number(process.env.OPENVIBE_GAMES_TICK_RATE) || 20,
                })
                : null;
            worldRooms.set(key, host || new WorldRoom({
                world,
                worldDefinition: catalog.world_definition,
                catalog,
                publish,
                emitToSocket,
                tickRate: Number(process.env.OPENVIBE_GAMES_TICK_RATE) || 20,
            }));
        } else if (typeof worldRooms.get(key).setCatalog === 'function') {
            worldRooms.get(key).setCatalog(catalog);
        }
        return worldRooms.get(key);
    }

    function currentRoom(socket) {
        return worldRooms.get(socket.data.roomKey) || dungeonRooms.get(socket.data.roomKey) || null;
    }

    io.on('connection', (socket) => {
        socket.data.actor = actorFromSocket(socket, socketAuthClient);
        socket.emit('status', {
            ok: true,
            actor: socket.data.actor,
            realtime: summary(),
        });

        socket.on('world:join', (payload, callback) => {
            try {
                const world = worldStore.getWorld(payload && (payload.worldId || payload.worldSlug || payload.world_id || payload.world_slug)) || rootWorld;
                const roomType = payload && (payload.room_type === 'dungeon' || payload.zone_id === 'dungeon_depths') ? 'dungeon' : 'world';
                const room = getRoom({ worldId: world.id, roomType });
                if (socket.data.roomKey) {
                    const previousRoom = worldRooms.get(socket.data.roomKey) || dungeonRooms.get(socket.data.roomKey);
                    if (previousRoom) previousRoom.leave(socket.id);
                    socket.leave(socket.data.roomKey);
                }
                socket.data.roomKey = roomKey(world.id, roomType);
                socket.join(socket.data.roomKey);
                const actor = socket.data.actor || {};
                const authenticatedActor = actor && actor.id && actor.type !== 'guest';
                const resolvedUserId = String(
                    (authenticatedActor && actor.id)
                    || (payload && payload.userId)
                    || actor.id
                    || `guest:${socket.id.slice(0, 8)}`
                );
                const resolvedDisplayName = String(
                    (authenticatedActor && actor.display_name)
                    || (payload && payload.displayName)
                    || actor.display_name
                    || `Player ${resolvedUserId}`
                );
                const snapshot = room.join({
                    socketId: socket.id,
                    userId: resolvedUserId,
                    displayName: resolvedDisplayName,
                    zoneId: payload && payload.zone_id || 'outpost',
                });
                socket.emit('world:joined', snapshot);
                if (typeof callback === 'function') callback({ ok: true, world_id: world.id, room_type: roomType });
            } catch (error) {
                if (typeof callback === 'function') callback({ ok: false, error: error.message });
            }
        });

        socket.on('input', (payload, callback) => {
            const room = currentRoom(socket);
            const result = room ? room.receiveInput(socket.id, payload) : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('chat:send', (payload, callback) => {
            const room = currentRoom(socket);
            const result = room ? room.sendChat(socket.id, payload && payload.message) : { ok: false, reason: 'room not joined' };
            if (result.ok) io.to(socket.data.roomKey).emit('chat:message', result.message);
            if (typeof callback === 'function') callback(result);
        });

        socket.on('craft', (payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.craft === 'function'
                ? room.craft(socket.id, { recipe_id: payload && payload.recipe_id || payload && payload.recipeId })
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('build', (payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.build === 'function'
                ? room.build(socket.id, payload || {})
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('shop:buy', (payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.buyFromShop === 'function'
                ? room.buyFromShop(socket.id, payload || {})
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('inventory:equip', (payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.equipInventory === 'function'
                ? room.equipInventory(socket.id, payload || {})
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('hotbar:update', (payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.updateHotbar === 'function'
                ? room.updateHotbar(socket.id, payload || {})
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('inventory:drop', (payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.dropInventory === 'function'
                ? room.dropInventory(socket.id, payload || {})
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('interaction:close', (_payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.closeInteraction === 'function'
                ? room.closeInteraction(socket.id)
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('interaction:perform', (payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.performInteraction === 'function'
                ? room.performInteraction(socket.id, payload || {})
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('travel', (payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.travel === 'function'
                ? room.travel(socket.id, payload || {})
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('pickup', (_payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.pickup === 'function'
                ? room.pickup(socket.id)
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('respawn', (_payload, callback) => {
            const room = currentRoom(socket);
            const result = room && typeof room.respawn === 'function'
                ? room.respawn(socket.id)
                : { ok: false, reason: 'room not joined' };
            if (typeof callback === 'function') callback(result);
        });

        socket.on('editor:join', (payload, callback) => {
            const snapshot = editorRoom.join({ socketId: socket.id, worldId: payload && payload.worldId || 'draft' });
            socket.emit('editor:snapshot', snapshot);
            if (typeof callback === 'function') callback({ ok: true });
        });

        socket.on('editor:save', (payload, callback) => {
            const result = editorRoom.applyEdit(socket.id, payload);
            if (result.ok) socket.emit('editor:saved', result.world);
            if (typeof callback === 'function') callback(result);
        });

        socket.on('disconnect', () => {
            const room = worldRooms.get(socket.data.roomKey) || dungeonRooms.get(socket.data.roomKey);
            if (room) room.leave(socket.id);
            editorRoom.leave(socket.id);
        });
    });

    const ticker = createFixedTicker({
        tickRate: Number(process.env.OPENVIBE_GAMES_TICK_RATE) || 20,
        onTick(dt, now) {
            for (const room of worldRooms.values()) room.tick(dt, now);
            for (const room of dungeonRooms.values()) room.tick(dt, now);
        },
    });

    function summary() {
        const catalog = getCatalog(rootWorld.id);
        return {
            ok: true,
            socket_clients: io.engine.clientsCount,
            world_rooms: Array.from(worldRooms.values()).map((room) => room.summary()),
            dungeon_rooms: Array.from(dungeonRooms.values()).map((room) => room.summary()),
            editor: editorRoom.summary(),
            catalog: {
                world_count: worldStore.listWorlds({ limit: 100 }).length,
                item_count: catalog.items.length,
                recipe_count: catalog.recipes.length,
                npc_template_count: catalog.npcs.length,
                loot_table_count: catalog.loot_tables.length,
                enabled_mod_count: catalog.mods.length,
            },
            websocket_path: '/games/realtime',
        };
    }

    return {
        io,
        editorRoom,
        ticker,
        rootWorld,
        attachSourceVibe(engine) {
            sourcevibe = engine || null;
            return sourcevibe;
        },
        get catalog() {
            return getCatalog(rootWorld.id);
        },
        getCatalog,
        refreshWorldCatalog,
        seedStarterContent: () => seedStarterContent({ publish }),
        getRoom,
        start() {
            ticker.start();
            return summary();
        },
        stop() {
            ticker.stop();
            return io.close();
        },
        summary,
    };
}

module.exports = {
    actorFromSocket,
    buildCatalog,
    createRealtimeRuntime,
    seedStarterContent,
};
