'use strict';

const path = require('path');

const { createHookLibrary } = require('./hooks/hook-library');
const { CommandRegistry } = require('./console/command-registry');
const { CvarRegistry } = require('./console/cvar-registry');
const { BindRegistry } = require('./console/bind-registry');
const { createCommandExecutor } = require('./console/command-executor');
const { createNetLibrary } = require('./net/net-library');
const { DEFAULT_RATE_LIMITS, clampRateSettings } = require('./net/rate-limits');
const { EntityRegistry } = require('./ents/entity-registry');
const { GamemodeRegistry } = require('./gamemodes/gamemode-registry');
const { createGamemodeLoader } = require('./gamemodes/gamemode-loader');
const { AddonRegistry } = require('./addons/addon-registry');
const { MapRegistry } = require('./maps/map-registry');
const { createMapLoader } = require('./maps/map-loader');
const { PredictionTable } = require('./prediction/prediction-table');
const { normalizeUserCmd } = require('./prediction/usercmd');
const { computeInterpolationPeriod } = require('./prediction/interpolation');
const { createLagCompensationTracker } = require('./prediction/lag-compensation');
const { NetgraphMetrics } = require('./prediction/netgraph-metrics');
const { WorldStateStore } = require('./persistence/world-state-store');
const { ServerStore } = require('./persistence/server-store');
const { PlayerStateStore } = require('./persistence/player-state-store');
const { SourceVibeRoomHost } = require('./room-host');

function sanitizeSlug(value, fallback = 'sourcevibe-server') {
    const slug = String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || fallback;
}

function summarizeCommand(entry) {
    return {
        name: entry.name,
        description: entry.description,
        usage: entry.usage,
        aliases: entry.aliases,
    };
}

function withQuery(route, params = {}) {
    const rawRoute = String(route || '').trim();
    if (!rawRoute) return null;
    const [pathname, search = ''] = rawRoute.split('?');
    const query = new URLSearchParams(search);
    for (const [key, value] of Object.entries(params || {})) {
        if (value == null || value === '') continue;
        if (!query.has(key)) query.set(key, String(value));
    }
    const serialized = query.toString();
    return serialized ? `${pathname}?${serialized}` : pathname;
}

function buildServerRoutes(gamemode, serverId, gamemodeId) {
    const routes = Object.assign({}, gamemode && gamemode.manifest && gamemode.manifest.routes || {});
    const extra = { server: serverId, gamemode: gamemodeId };
    return {
        play: withQuery(routes.play || '/sourcevibe', extra),
        launcher: withQuery(routes.launcher || '/sourcevibe', extra),
        status: withQuery(routes.status || '/sourcevibe', Object.assign({ panel: 'status' }, extra)),
        editor: routes.editor ? withQuery(routes.editor, extra) : null,
    };
}

function createSourceVibeEngine({ realtime, eventBus, config, sourcevibeRoot } = {}) {
    const root = sourcevibeRoot || __dirname;
    const hook = createHookLibrary();
    const commands = new CommandRegistry();
    const cvars = new CvarRegistry();
    const binds = new BindRegistry();
    const consoleExecutor = createCommandExecutor({ commands, cvars, binds });
    const net = createNetLibrary();
    const ents = new EntityRegistry();
    const gamemodes = new GamemodeRegistry();
    const gamemodeLoader = createGamemodeLoader({ sourcevibeRoot: root });
    const addons = new AddonRegistry();
    const maps = new MapRegistry();
    const mapLoader = createMapLoader({ sourcevibeRoot: root });
    const predictionTable = new PredictionTable();
    const lagComp = createLagCompensationTracker({ maxUnlagMs: DEFAULT_RATE_LIMITS.sv_maxunlag * 1000 });
    const netgraph = new NetgraphMetrics();
    const worldStates = new WorldStateStore();
    const serverStore = new ServerStore();
    const playerStates = new PlayerStateStore();
    const serviceActor = {
        actor_type: 'service',
        actor_id: config && config.serviceId || 'openvibe-games',
    };

    function publishEngineEvent(type, payload = {}) {
        if (!eventBus || typeof eventBus.publishGameEvent !== 'function') return;
        eventBus.publishGameEvent(type, payload, serviceActor);
    }

    function runConsoleCommand(input, context = {}) {
        const raw = String(input || '').trim();
        const result = consoleExecutor.Run(raw, context);
        publishEngineEvent('sourcevibe.command.executed', {
            command: raw,
            ok: result.ok !== false,
            code: result.code || null,
            user_id: context.userId ? String(context.userId) : null,
        });
        if (result && result.cvar) {
            publishEngineEvent('sourcevibe.cvar.changed', {
                name: result.cvar.name,
                value: result.cvar.value,
                user_id: context.userId ? String(context.userId) : null,
            });
        }
        return result;
    }

    const api = {
        name: 'SourceVibe Engine',
        shortName: 'SourceVibe',
        version: '1.0.0',
        root,
        eventBus,
        config,
        realtime,
        hook,
        hooks: hook,
        commands,
        cvars,
        binds,
        console: {
            commands,
            cvars,
            binds,
            run(input, context) {
                return runConsoleCommand(input, context);
            },
            autocomplete(input) {
                return consoleExecutor.Autocomplete(input);
            },
        },
        net,
        ents,
        gamemodes,
        addons,
        maps,
        prediction: {
            table: predictionTable,
            lagComp,
            normalizeUserCmd,
            computeInterpolationPeriod,
            netgraph,
        },
        persistence: {
            worlds: worldStates,
            servers: serverStore,
            players: playerStates,
        },
    };

    function registerDefaultCvars() {
        cvars.Create('net_graph', 0, ['archive'], 'Show basic SourceVibe network graph diagnostics.');
        cvars.Create('cl_showfps', 0, ['archive'], 'Show the client FPS counter.');
        cvars.Create('cl_showerror', 0, ['archive'], 'Show client-side prediction errors.');
        cvars.Create('cl_showpos', 0, ['archive'], 'Show client-side position diagnostics.');
        cvars.Create('cl_pdump', 0, ['archive'], 'Prediction dump toggle.');
        cvars.Create('cl_predictionlist', 0, ['archive'], 'Prediction list toggle.');
        cvars.Create('cl_smooth', 1, ['archive'], 'Smooth prediction corrections when enabled.');
        cvars.Create('cl_smoothtime', 0.1, ['archive'], 'Seconds spent smoothing prediction corrections.');
        cvars.Create('cl_interp', DEFAULT_RATE_LIMITS.cl_interp, ['archive'], 'Interpolation amount in seconds.');
        cvars.Create('cl_interp_ratio', DEFAULT_RATE_LIMITS.cl_interp_ratio, ['archive'], 'Interpolation ratio.');
        cvars.Create('cl_updaterate', DEFAULT_RATE_LIMITS.cl_updaterate, ['archive'], 'Snapshot update rate.');
        cvars.Create('cl_cmdrate', DEFAULT_RATE_LIMITS.cl_cmdrate, ['archive'], 'Command send rate.');
        cvars.Create('cl_extrapolate', 0, ['archive'], 'Allow limited client extrapolation.');
        cvars.Create('cl_extrapolate_amount', 0.25, ['archive'], 'Maximum extrapolation amount in seconds.');
        cvars.Create('rate', DEFAULT_RATE_LIMITS.rate, ['archive'], 'Requested bandwidth rate.');
        cvars.Create('sv_tickrate', DEFAULT_RATE_LIMITS.sv_tickrate, ['replicated'], 'Authoritative server tickrate.');
        cvars.Create('sv_snapshotrate', DEFAULT_RATE_LIMITS.sv_snapshotrate, ['replicated'], 'Snapshot broadcast rate.');
        cvars.Create('sv_maxunlag', DEFAULT_RATE_LIMITS.sv_maxunlag, ['replicated'], 'Max lag compensation rewind window.');
        cvars.Create('sv_showlagcompensation', 0, ['replicated'], 'Show lag compensation overlays.');
    }

    function registerDefaultBinds() {
        binds.Set('w', '+forward');
        binds.Set('a', '+moveleft');
        binds.Set('s', '+back');
        binds.Set('d', '+moveright');
        binds.Set('space', '+jump');
        binds.Set('shift', '+speed');
        binds.Set('e', '+use');
        binds.Set('1', 'slot1');
        binds.Set('2', 'slot2');
        binds.Set('3', 'slot3');
        binds.Set('4', 'slot4');
        binds.Set('5', 'slot5');
        binds.Set('6', 'slot6');
        binds.Set('7', 'slot7');
        binds.Set('8', 'slot8');
        binds.Set('9', 'slot9');
        binds.Set('i', 'toggleinventory');
        binds.Set('m', 'togglemap');
        binds.Set('c', 'togglecrafting');
        binds.Set('`', 'toggleconsole');
        binds.Set('escape', 'showmenu');
    }

    function registerDefaultNetMessages() {
        net.Register('sv_snapshot', { channel: 'snapshot' });
        net.Register('sv_notify', { channel: 'event' });
        net.Register('sv_console', { channel: 'reliable' });
        net.Register('sv_inventory', { channel: 'reliable' });
        net.Register('sv_chat', { channel: 'reliable' });
        net.Register('sv_connect', { channel: 'command' });
    }

    function registerPredictionDefaults() {
        predictionTable.Define('sv_player', 'x', { type: 'float', predicted: true });
        predictionTable.Define('sv_player', 'y', { type: 'float', predicted: true });
        predictionTable.Define('sv_player', 'vx', { type: 'float', predicted: true });
        predictionTable.Define('sv_player', 'vy', { type: 'float', predicted: true });
        predictionTable.Define('sv_player', 'Stamina', { type: 'float', predicted: true });
        predictionTable.Define('sv_player', 'ActiveWeapon', { type: 'string', predicted: true });
    }

    function activeGamemode() {
        return gamemodes.Active() || gamemodes.List()[0] || null;
    }

    function summarizeGamemode(entry) {
        if (!entry) return null;
        return {
            id: entry.id,
            name: entry.manifest.name,
            title: entry.manifest.title || entry.manifest.name,
            description: entry.manifest.description || '',
            base: entry.manifest.base || null,
            routes: Object.assign({}, entry.manifest.routes || {}),
            surfaces: Object.assign({}, entry.manifest.surfaces || {}),
            maps: Array.isArray(entry.manifest.maps) ? entry.manifest.maps.slice() : [],
            ui: JSON.parse(JSON.stringify(entry.ui || {})),
            active: activeGamemode() && activeGamemode().id === entry.id,
        };
    }

    function resolveGamemodeIdFromWorld(world) {
        const metadata = world && world.metadata || {};
        const explicit = metadata.gamemode || metadata.sourcevibe && metadata.sourcevibe.gamemode;
        if (explicit && gamemodes.Get(explicit)) return String(explicit).toLowerCase();
        const mode = String(world && world.mode || '').toLowerCase();
        if (mode.includes('2d') || mode.includes('sandbox') || String(world && world.slug || '').toLowerCase().includes('2d')) return '2dworld';
        return activeGamemode() ? activeGamemode().id : 'base';
    }

    function syncWorldServer(world) {
        const gamemodeId = resolveGamemodeIdFromWorld(world);
        const gm = gamemodes.Get(gamemodeId) || activeGamemode();
        const featured = gm && gm.server && typeof gm.server.buildFeaturedServer === 'function'
            ? gm.server.buildFeaturedServer({ realtime, world, gamemode: gm, engine: api })
            : null;
        const routes = Object.assign({}, buildServerRoutes(gm, world && (world.slug || world.id), gamemodeId), world && world.metadata && world.metadata.routes || {}, featured ? {
            play: featured.route,
            status: featured.statusRoute,
            editor: featured.editorRoute,
        } : {});
        const liveRoom = realtime && realtime.summary ? (realtime.summary().world_rooms || []).find((room) => room.world_id === world.id) : null;
        const entry = Object.assign({}, serverStore.get(world.id) || {}, {
            id: world.id,
            worldId: world.id,
            slug: world.slug,
            name: world.name,
            gamemode: gamemodeId,
            map: world && world.metadata && world.metadata.map || gm && gm.manifest && Array.isArray(gm.manifest.maps) && gm.manifest.maps[0] || 'flatgrass',
            route: routes.play || withQuery('/sourcevibe', { server: world.id, gamemode: gamemodeId }),
            statusRoute: routes.status || withQuery('/sourcevibe', { server: world.id, panel: 'status', gamemode: gamemodeId }),
            editorRoute: routes.editor || null,
            players: liveRoom ? Number(liveRoom.player_count || 0) : 0,
            maxPlayers: Number(world && world.metadata && world.metadata.maxPlayers) || 64,
            official: !!(realtime && realtime.rootWorld && realtime.rootWorld.id === world.id),
            tags: Array.from(new Set([gamemodeId].concat(realtime && realtime.rootWorld && realtime.rootWorld.id === world.id ? ['official'] : []).concat(featured && featured.tags || []).concat(world && world.status ? [world.status] : []))),
            metadata: Object.assign({}, featured && featured.metadata || {}, world && world.metadata || {}),
        });
        if (serverStore.get(entry.id)) return serverStore.update(entry.id, entry);
        return serverStore.create(entry);
    }

    function syncServers() {
        const worlds = worldStates.list({ limit: 100 });
        worlds.forEach((world) => syncWorldServer(world));
        return serverStore.list();
    }

    function buildEngineRates() {
        return clampRateSettings({
            rate: cvars.Get('rate') && cvars.Get('rate').value,
            cl_cmdrate: cvars.Get('cl_cmdrate') && cvars.Get('cl_cmdrate').value,
            cl_updaterate: cvars.Get('cl_updaterate') && cvars.Get('cl_updaterate').value,
            cl_interp: cvars.Get('cl_interp') && cvars.Get('cl_interp').value,
            cl_interp_ratio: cvars.Get('cl_interp_ratio') && cvars.Get('cl_interp_ratio').value,
            sv_tickrate: cvars.Get('sv_tickrate') && cvars.Get('sv_tickrate').value,
            sv_snapshotrate: cvars.Get('sv_snapshotrate') && cvars.Get('sv_snapshotrate').value,
            sv_maxunlag: cvars.Get('sv_maxunlag') && cvars.Get('sv_maxunlag').value,
        });
    }

    api.summary = function summary() {
        return {
            ok: true,
            name: api.name,
            version: api.version,
            active_gamemode: summarizeGamemode(activeGamemode()),
            gamemode_count: gamemodes.List().length,
            map_count: maps.List().length,
            addon_count: addons.list().length,
            entity_class_count: ents.ListDefinitions().length,
            server_count: syncServers().length,
            realtime_path: '/games/realtime',
            rates: buildEngineRates(),
        };
    };

    api.listGamemodes = function listGamemodes() {
        return gamemodes.List()
            .sort((a, b) => {
                if (a.id === '2dworld' && b.id !== '2dworld') return -1;
                if (b.id === '2dworld' && a.id !== '2dworld') return 1;
                return a.id.localeCompare(b.id);
            })
            .map((entry) => summarizeGamemode(entry));
    };

    api.getGamemode = function getGamemode(id) {
        return summarizeGamemode(gamemodes.Get(id));
    };

    api.activeGamemode = activeGamemode;

    api.setActiveGamemode = function setActiveGamemode(id) {
        const next = summarizeGamemode(gamemodes.Activate(id));
        publishEngineEvent('sourcevibe.gamemode.loaded', { gamemode: next && next.id || null, active: true });
        return next;
    };

    api.resolveWorldGamemode = resolveGamemodeIdFromWorld;

    api.getGamemodeDescriptor = function getGamemodeDescriptor(id) {
        return gamemodes.Get(id);
    };

    api.listMaps = function listMaps() {
        return maps.List();
    };

    api.listAddons = function listAddons(worldId) {
        return worldId ? addons.listEnabled(worldId) : addons.list();
    };

    api.listServers = function listServers() {
        return syncServers();
    };

    api.getServer = function getServer(id) {
        syncServers();
        const direct = serverStore.get(id);
        if (direct) return direct;
        const needle = String(id || '').trim().toLowerCase();
        return serverStore.list().find((entry) => entry.id === needle || String(entry.slug || '').toLowerCase() === needle) || null;
    };

    api.createServer = function createServer(payload = {}) {
        const gamemodeId = gamemodes.Get(payload.gamemode) ? String(payload.gamemode).toLowerCase() : activeGamemode() && activeGamemode().id || 'base';
        const gm = gamemodes.Get(gamemodeId) || activeGamemode();
        const slug = sanitizeSlug(payload.slug || payload.name || `${gamemodeId}-server`);
        const mapId = payload.map || gm && gm.manifest && Array.isArray(gm.manifest.maps) && gm.manifest.maps[0] || 'flatgrass';
        const routes = buildServerRoutes(gm, slug, gamemodeId);
        const world = worldStates.upsert({
            slug,
            name: payload.name || `${gm && gm.manifest && gm.manifest.name || 'SourceVibe'} Server`,
            owner_id: payload.ownerId || null,
            mode: `sourcevibe:${gamemodeId}`,
            seed: Number(payload.seed) || 0,
            status: payload.status || 'published',
            metadata: {
                gamemode: gamemodeId,
                map: mapId,
                maxPlayers: Number(payload.maxPlayers) || 32,
                description: payload.description || '',
                routes,
                sourcevibe: {
                    created_from_launcher: true,
                    gamemode: gamemodeId,
                },
            },
        });
        const server = syncWorldServer(world);
        publishEngineEvent('sourcevibe.server.created', {
            world_id: world.id,
            slug: world.slug,
            gamemode: gamemodeId,
            owner_id: payload.ownerId || null,
        });
        return server;
    };

    api.connect = function connect(payload = {}) {
        const server = api.getServer(payload.id || payload.serverId || payload.worldId || payload.world_id);
        if (!server) {
            return { ok: false, error: 'server not found' };
        }
        const userId = payload.userId || payload.user_id || null;
        const displayName = payload.displayName || payload.display_name || undefined;
        if (userId) playerStates.ensure(String(userId), displayName);
        return {
            ok: true,
            server,
            launch: {
                url: server.route,
                realtimePath: '/games/realtime',
                auth: {
                    worldId: server.worldId,
                    worldSlug: server.slug,
                    gamemode: server.gamemode,
                    userId: userId ? String(userId) : null,
                    displayName: displayName || null,
                },
            },
        };
    };

    api.buildClientBootstrap = function buildClientBootstrap(options = {}) {
        const requestedServer = options.serverId || options.worldId || options.world_id || null;
        const server = requestedServer ? api.getServer(requestedServer) : null;
        const requestedGamemode = options.gamemode || options.gamemodeId || server && server.gamemode || activeGamemode() && activeGamemode().id;
        const gamemode = gamemodes.Get(requestedGamemode) || activeGamemode();
        const userId = options.userId || options.user_id || null;
        const displayName = options.displayName || options.display_name || undefined;
        const player = userId ? playerStates.ensure(String(userId), displayName) : null;
        const worldId = server && server.worldId || realtime && realtime.rootWorld && realtime.rootWorld.id || null;
        const rates = buildEngineRates();
        return {
            engine: {
                name: api.name,
                shortName: api.shortName,
                version: api.version,
                api: ['hook', 'net', 'ents', 'gamemode', 'addon', 'console', 'cvar', 'bind'],
                realtimePath: '/games/realtime',
            },
            gamemode: summarizeGamemode(gamemode),
            gamemodeUi: JSON.parse(JSON.stringify(gamemode && gamemode.ui || {})),
            gamemodes: api.listGamemodes(),
            maps: api.listMaps(),
            addons: api.listAddons(worldId),
            servers: api.listServers(),
            activeServer: server,
            console: {
                commands: commands.List().map((entry) => summarizeCommand(entry)),
                cvars: cvars.List(),
                binds: binds.List(),
                suggestions: [].concat(
                    gamemodes.Get('base') && gamemodes.Get('base').client && gamemodes.Get('base').client.ui && gamemodes.Get('base').client.ui.console && gamemodes.Get('base').client.ui.console.suggestions || [],
                    gamemode && gamemode.client && gamemode.client.ui && gamemode.client.ui.console && gamemode.client.ui.console.suggestions || []
                ).filter(Boolean),
            },
            prediction: {
                interpolation: computeInterpolationPeriod(rates),
                rates,
                netgraph: netgraph.summary(),
                table: predictionTable.List('sv_player'),
            },
            inventory: {
                layout: JSON.parse(JSON.stringify(gamemode && gamemode.ui && gamemode.ui.inventory || { rows: 4, cols: 6, hotbar: 9 })),
                hotbar: player && player.metadata && player.metadata.sourcevibe && player.metadata.sourcevibe.hotbar || [],
            },
            player: player || null,
            menu: {
                connected: ['Resume Game', 'Disconnect', 'Player List', 'Find Servers', 'Create Server', 'Gamemodes', 'Addons', 'Options', 'Console', 'Quit'],
                disconnected: ['Gamemodes', 'Find Servers', 'Create Server', 'Options', 'Console', 'Quit'],
            },
            options: {
                tabs: ['Keyboard', 'Mouse', 'Audio', 'Video', 'Voice', 'Multiplayer', 'Advanced'],
            },
            launcher: {
                route: '/sourcevibe',
                legacyPlayRoute: '/2d-world',
            },
        };
    };

    api.setPlayerHotbar = function setPlayerHotbar(userId, hotbar) {
        return playerStates.setHotbar(userId, hotbar);
    };

    api.setPlayerInventoryLayout = function setPlayerInventoryLayout(userId, layout) {
        return playerStates.setInventoryLayout(userId, layout);
    };

    api.createRoomHost = function createRoomHost(options = {}) {
        const world = options.world || {};
        const gamemodeId = options.gamemodeId || resolveGamemodeIdFromWorld(world);
        const descriptor = gamemodes.Get(gamemodeId) || activeGamemode();
        if (!descriptor || !descriptor.server) return null;
        if (typeof descriptor.server.createRoomHost === 'function') {
            return descriptor.server.createRoomHost(Object.assign({}, options, {
                engine: api,
                gamemode: descriptor,
            }));
        }
        if (typeof descriptor.server.createRoom !== 'function') return null;
        const room = descriptor.server.createRoom(Object.assign({}, options, {
            engine: api,
            gamemode: descriptor,
        }));
        if (!room) return null;
        return room instanceof SourceVibeRoomHost
            ? room
            : new SourceVibeRoomHost({ engine: api, gamemodeId: descriptor.id, descriptor, room });
    };

    api.reloadContent = function reloadContent() {
        gamemodeLoader.registerBuiltins({ gamemodeRegistry: gamemodes, entityRegistry: ents });
        mapLoader.loadBuiltins().forEach((map) => maps.Register(map));
        gamemodes.List().forEach((entry) => publishEngineEvent('sourcevibe.gamemode.loaded', {
            gamemode: entry.id,
            active: activeGamemode() && activeGamemode().id === entry.id,
        }));
        return api.summary();
    };

    function registerDefaultCommands() {
        commands.Add('help', () => ({ ok: true, output: commands.List().map((entry) => `${entry.name} - ${entry.description}`).join('\n') }), {
            description: 'List available SourceVibe console commands.',
            usage: 'help',
        });
        commands.Add('echo', ({ args }) => ({ ok: true, output: args.join(' ') }), {
            description: 'Print text to the SourceVibe console.',
            usage: 'echo <text>',
        });
        commands.Add('clear', () => ({ ok: true, output: '__CLEAR__' }), {
            description: 'Clear the SourceVibe console scrollback.',
            usage: 'clear',
        });
        commands.Add('status', () => ({ ok: true, output: JSON.stringify(api.summary(), null, 2) }), {
            description: 'Show SourceVibe engine status.',
            usage: 'status',
        });
        commands.Add('find', ({ args }) => {
            const query = String(args[0] || '').toLowerCase();
            const matches = commands.List().map((entry) => entry.name).concat(cvars.List().map((entry) => entry.name)).filter((entry) => entry.includes(query));
            return { ok: true, output: matches.join('\n') };
        }, {
            description: 'Find commands or cvars by substring.',
            usage: 'find <query>',
        });
        commands.Add('bind', ({ args }) => {
            if (!args.length) return { ok: true, output: binds.List().map((entry) => `${entry.key} ${entry.command}`).join('\n') };
            if (args.length === 1) {
                const entry = binds.Get(args[0]);
                return { ok: true, output: entry ? `${entry.key} ${entry.command}` : `${args[0]} is not bound` };
            }
            const entry = binds.Set(args[0], args.slice(1).join(' '));
            return { ok: true, output: `${entry.key} ${entry.command}` };
        }, {
            description: 'Inspect or update key bindings.',
            usage: 'bind <key> [command]',
        });
        commands.Add('unbind', ({ args }) => ({ ok: true, output: binds.Delete(args[0]) ? `unbound ${args[0]}` : `${args[0]} was not bound` }), {
            description: 'Remove a key binding.',
            usage: 'unbind <key>',
        });
        commands.Add('connect', ({ args, context }) => {
            const result = api.connect({ id: args[0], userId: context && context.userId, displayName: context && context.displayName });
            return { ok: result.ok, output: result.ok ? result.launch.url : result.error, data: result };
        }, {
            description: 'Resolve a SourceVibe server launch URL.',
            usage: 'connect <serverId>',
        });
        commands.Add('disconnect', () => ({ ok: true, output: 'disconnect acknowledged' }), {
            description: 'Disconnect from the current server.',
            usage: 'disconnect',
        });
        commands.Add('retry', ({ context }) => ({ ok: true, output: context && context.lastServerId ? api.connect({ id: context.lastServerId, userId: context.userId, displayName: context.displayName }).launch.url : 'no previous server' }), {
            description: 'Reconnect to the last connected server.',
            usage: 'retry',
        });
        commands.Add('gamemode_list', () => ({ ok: true, output: api.listGamemodes().map((entry) => `${entry.id} - ${entry.title}`).join('\n') }), {
            description: 'List installed SourceVibe gamemodes.',
            usage: 'gamemode_list',
        });
        commands.Add('gamemode_run', ({ args }) => {
            const next = api.setActiveGamemode(args[0]);
            return { ok: true, output: `active gamemode: ${next.id}` };
        }, {
            description: 'Switch the active SourceVibe gamemode.',
            usage: 'gamemode_run <gamemode>',
        });
        commands.Add('map', ({ args }) => ({ ok: true, output: args[0] ? `queued map ${args[0]}` : api.listMaps().map((entry) => entry.id).join('\n') }), {
            description: 'List maps or queue a map change.',
            usage: 'map [mapId]',
        });
        commands.Add('changelevel', ({ args }) => ({ ok: true, output: args[0] ? `changelevel ${args[0]}` : 'map required' }), {
            description: 'Alias for map selection.',
            usage: 'changelevel <mapId>',
        });
        commands.Add('ent_create', ({ args }) => {
            const entity = ents.Create(args[0], { x: Number(args[1]) || 0, y: Number(args[2]) || 0 });
            return { ok: true, output: JSON.stringify(entity.Serialize(), null, 2), data: entity.Serialize() };
        }, {
            description: 'Spawn a scripted SourceVibe entity.',
            usage: 'ent_create <className> [x] [y]',
        });
        commands.Add('ent_remove', ({ args }) => {
            const removed = ents.Remove(args[0]);
            return { ok: removed, output: removed ? `removed ${args[0]}` : `entity not found: ${args[0]}` };
        }, {
            description: 'Remove a scripted SourceVibe entity.',
            usage: 'ent_remove <entityId>',
        });
        commands.Add('ent_info', ({ args }) => {
            const entity = ents.Get(args[0]);
            return { ok: !!entity, output: entity ? JSON.stringify(entity.Serialize(), null, 2) : `entity not found: ${args[0]}` };
        }, {
            description: 'Inspect a scripted SourceVibe entity.',
            usage: 'ent_info <entityId>',
        });
        commands.Add('gm_reload', () => ({ ok: true, output: JSON.stringify(api.reloadContent(), null, 2) }), {
            description: 'Reload gamemode and map content.',
            usage: 'gm_reload',
        });
        commands.Add('addons_reload', () => ({ ok: true, output: JSON.stringify(addons.summary(realtime && realtime.rootWorld && realtime.rootWorld.id), null, 2) }), {
            description: 'Summarize addon state for the active world.',
            usage: 'addons_reload',
        });
        commands.Add('cl_fullupdate', () => ({ ok: true, output: 'requested full snapshot refresh' }), {
            description: 'Request a fresh full update from the current server.',
            usage: 'cl_fullupdate',
        });
        commands.Add('toggleconsole', () => ({ ok: true, output: 'toggleconsole' }), { description: 'Toggle the SourceVibe console.', usage: 'toggleconsole' });
        commands.Add('showmenu', () => ({ ok: true, output: 'showmenu' }), { description: 'Open the SourceVibe launcher menu.', usage: 'showmenu' });
        commands.Add('hidepanel', ({ args }) => ({ ok: true, output: `hidepanel ${args[0] || ''}`.trim() }), { description: 'Hide a launcher panel.', usage: 'hidepanel <panel>' });
    }

    registerDefaultCvars();
    registerDefaultBinds();
    registerDefaultNetMessages();
    registerPredictionDefaults();
    registerDefaultCommands();
    api.reloadContent();
    if (gamemodes.Get('2dworld')) gamemodes.Activate('2dworld');

    hook.SetBase('SVGetEngineSummary', () => api.summary());
    publishEngineEvent('sourcevibe.engine.started', {
        version: api.version,
        active_gamemode: api.activeGamemode() && api.activeGamemode().id || null,
    });

    return api;
}

module.exports = {
    createSourceVibeEngine,
};
