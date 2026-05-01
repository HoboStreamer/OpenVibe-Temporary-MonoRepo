function flattenSnapshotEntities(snapshot) {
    if (!snapshot) return [];
    const world = snapshot.world || {};
    return [
        ...(snapshot.self ? [{ ...snapshot.self, __kind: 'self' }] : []),
        ...(Array.isArray(world.players) ? world.players.map((entry) => ({ ...entry, __kind: 'player' })) : []),
        ...(Array.isArray(world.npcs) ? world.npcs.map((entry) => ({ ...entry, __kind: 'npc' })) : []),
        ...(Array.isArray(world.resources) ? world.resources.map((entry) => ({ ...entry, __kind: 'resource' })) : []),
        ...(Array.isArray(world.structures) ? world.structures.map((entry) => ({ ...entry, __kind: 'structure' })) : []),
        ...(Array.isArray(world.loot) ? world.loot.map((entry) => ({ ...entry, __kind: 'loot' })) : []),
        ...(Array.isArray(world.projectiles) ? world.projectiles.map((entry) => ({ ...entry, __kind: 'projectile' })) : []),
    ];
}

function createHookLibrary() {
    const hooks = new Map();
    return {
        Add(name, id, handler) {
            if (!hooks.has(name)) hooks.set(name, new Map());
            hooks.get(name).set(id, handler);
            return handler;
        },
        Remove(name, id) {
            if (hooks.has(name)) hooks.get(name).delete(id);
        },
        GetTable() {
            return hooks;
        },
        Call(name, context, ...args) {
            if (!hooks.has(name)) return undefined;
            let result;
            for (const handler of hooks.get(name).values()) {
                result = handler.call(context || null, ...args);
                if (typeof result !== 'undefined') return result;
            }
            return result;
        },
    };
}

function createNetReader(payload) {
    const values = Array.isArray(payload) ? payload.slice() : [];
    let index = 0;
    const read = () => values[index++] || { value: null };
    return {
        ReadBool() {
            return Boolean(read().value);
        },
        ReadFloat() {
            return Number(read().value || 0);
        },
        ReadInt() {
            return Math.trunc(Number(read().value || 0));
        },
        ReadString() {
            return String(read().value || '');
        },
        ReadJSON() {
            return read().value;
        },
    };
}

export function createSourceVibeGlobal({
    getBootstrap,
    getSnapshot,
    runCommand,
    openPanel,
    closePanel,
    togglePanel,
    sendNetPacket,
} = {}) {
    const hook = createHookLibrary();
    const materials = new Map();
    const sounds = new Map();
    const panelRegistry = new Map();
    const localCommands = new Map();
    const localCvars = new Map();
    const localAddons = new Map();
    const netReceivers = new Map();
    let currentPacket = null;

    function dispatchPacket(packet, context) {
        if (!packet || !packet.name) return { ok: false, reason: 'packet missing' };
        const receiver = netReceivers.get(packet.name);
        if (!receiver) return { ok: false, reason: 'no receiver registered' };
        const reader = createNetReader(packet.payload);
        return receiver(reader, context || {});
    }

    function bootstrapCommands() {
        const bootstrap = getBootstrap && getBootstrap();
        return Array.isArray(bootstrap && bootstrap.console && bootstrap.console.commands)
            ? bootstrap.console.commands
            : [];
    }

    function bootstrapCvars() {
        const bootstrap = getBootstrap && getBootstrap();
        return Array.isArray(bootstrap && bootstrap.console && bootstrap.console.cvars)
            ? bootstrap.console.cvars
            : [];
    }

    function bootstrapBinds() {
        const bootstrap = getBootstrap && getBootstrap();
        return Array.isArray(bootstrap && bootstrap.console && bootstrap.console.binds)
            ? bootstrap.console.binds
            : [];
    }

    const api = {
        hook,
        net: {
            Register(name, schema = {}) {
                return { name, schema };
            },
            Receive(name, handler) {
                netReceivers.set(name, handler);
                return handler;
            },
            Start(name) {
                currentPacket = { name, payload: [] };
                return this;
            },
            WriteBool(value) {
                if (currentPacket) currentPacket.payload.push({ type: 'bool', value: Boolean(value) });
                return this;
            },
            WriteFloat(value) {
                if (currentPacket) currentPacket.payload.push({ type: 'float', value: Number(value || 0) });
                return this;
            },
            WriteInt(value) {
                if (currentPacket) currentPacket.payload.push({ type: 'int', value: Math.trunc(Number(value || 0)) });
                return this;
            },
            WriteString(value) {
                if (currentPacket) currentPacket.payload.push({ type: 'string', value: String(value || '') });
                return this;
            },
            WriteJSON(value) {
                if (currentPacket) currentPacket.payload.push({ type: 'json', value });
                return this;
            },
            Send() {
                const packet = currentPacket;
                currentPacket = null;
                return dispatchPacket(packet, { target: 'client' });
            },
            Broadcast() {
                const packet = currentPacket;
                currentPacket = null;
                return dispatchPacket(packet, { target: 'broadcast' });
            },
            SendToServer() {
                const packet = currentPacket;
                currentPacket = null;
                if (typeof sendNetPacket === 'function') return sendNetPacket(packet);
                return dispatchPacket(packet, { target: 'server' });
            },
        },
        ents: {
            Register(className, definition = {}) {
                return { className, definition };
            },
            Create(className, data = {}) {
                return { className, ...data };
            },
            GetAll() {
                return flattenSnapshotEntities(getSnapshot && getSnapshot());
            },
            FindByClass(className) {
                return this.GetAll().filter((entity) => entity.type === className || entity.className === className || entity.kind === className);
            },
            GetById(id) {
                return this.GetAll().find((entity) => entity.id === id) || null;
            },
        },
        command: {
            Add(name, handler, options = {}) {
                localCommands.set(name, { handler, options });
                return handler;
            },
            Remove(name) {
                localCommands.delete(name);
            },
            List() {
                return [
                    ...bootstrapCommands(),
                    ...Array.from(localCommands.keys()).map((name) => ({ name, source: 'client' })),
                ];
            },
            Run(input, context = {}) {
                const [name, ...args] = String(input || '').trim().split(/\s+/);
                if (!name) return Promise.resolve({ ok: false, reason: 'empty command' });
                if (localCommands.has(name)) return Promise.resolve(localCommands.get(name).handler(args, context));
                if (typeof runCommand === 'function') return runCommand(String(input || ''));
                return Promise.resolve({ ok: false, reason: 'command runner unavailable' });
            },
            Autocomplete(prefix = '') {
                const needle = String(prefix || '').trim().toLowerCase();
                return this.List().filter((entry) => String(entry && entry.name || '').toLowerCase().includes(needle));
            },
        },
        cvar: {
            Create(name, defaultValue, flags = [], description = '') {
                localCvars.set(name, { name, value: defaultValue, flags, description, source: 'client' });
                return localCvars.get(name);
            },
            Get(name) {
                const bootstrapValue = bootstrapCvars().find((entry) => entry.name === name);
                return localCvars.get(name) || bootstrapValue || null;
            },
            Set(name, value) {
                localCvars.set(name, { ...(localCvars.get(name) || { name }), value });
                if (typeof runCommand === 'function') return runCommand(`${name} ${value}`);
                return Promise.resolve({ ok: true, name, value });
            },
            List() {
                return [
                    ...bootstrapCvars(),
                    ...Array.from(localCvars.values()),
                ];
            },
        },
        bind: {
            List() {
                return bootstrapBinds();
            },
            Get(command) {
                return this.List().find((entry) => entry.command === command) || null;
            },
            Set(key, command) {
                return typeof runCommand === 'function'
                    ? runCommand(`bind ${key} ${command}`)
                    : Promise.resolve({ ok: true, key, command });
            },
            Remove(key) {
                return typeof runCommand === 'function'
                    ? runCommand(`unbind ${key}`)
                    : Promise.resolve({ ok: true, key });
            },
        },
        gui: {
            RegisterPanel(name, definition) {
                panelRegistry.set(name, definition);
                return definition;
            },
            Create(name, props = {}) {
                const definition = panelRegistry.get(name);
                return definition && typeof definition.create === 'function'
                    ? definition.create(props)
                    : { name, props };
            },
            Open(name, props = {}) {
                if (typeof openPanel === 'function') return openPanel(name, props);
                return this.Create(name, props);
            },
            Close(name) {
                if (typeof closePanel === 'function') return closePanel(name);
                return null;
            },
            Toggle(name, props = {}) {
                if (typeof togglePanel === 'function') return togglePanel(name, props);
                return this.Open(name, props);
            },
        },
        gamemode: {
            GetActive() {
                const bootstrap = getBootstrap && getBootstrap();
                return bootstrap && bootstrap.gamemode || null;
            },
            RunHook(name, ...args) {
                return hook.Call(name, this.GetActive(), ...args);
            },
        },
        addons: {
            Register(manifest) {
                if (manifest && manifest.id) localAddons.set(manifest.id, manifest);
                return manifest;
            },
            List() {
                const bootstrap = getBootstrap && getBootstrap();
                return [
                    ...(Array.isArray(bootstrap && bootstrap.addons) ? bootstrap.addons : []),
                    ...Array.from(localAddons.values()),
                ];
            },
        },
        Material(path, options = {}) {
            if (!materials.has(path)) materials.set(path, { path, ...options });
            return materials.get(path);
        },
        Sound(nameOrPath, options = {}) {
            if (!sounds.has(nameOrPath)) {
                sounds.set(nameOrPath, {
                    id: nameOrPath,
                    ...options,
                    Play(playOptions = {}) {
                        return { ok: true, id: nameOrPath, options: { ...options, ...playOptions } };
                    },
                });
            }
            return sounds.get(nameOrPath);
        },
    };

    api.compat = {
        createLegacyGlobalForGamemode(gamemodeId) {
            return {
                __sourcevibeCompat: true,
                __gamemode: gamemodeId,
                hook: api.hook,
                net: api.net,
                ents: {
                    Create: api.ents.Create.bind(api.ents),
                    Register: api.ents.Register.bind(api.ents),
                    All: api.ents.GetAll.bind(api.ents),
                },
                command: api.command,
                cvar: api.cvar,
                bind: api.bind,
                gui: api.gui,
                gamemode: api.gamemode,
                addons: api.addons,
                Material: api.Material,
                Sound: api.Sound,
                sounds: {},
                wep: {},
            };
        },
    };

    return api;
}
