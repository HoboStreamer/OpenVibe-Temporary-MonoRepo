'use strict';

const vm = require('vm');

const { listScriptRealms, listScriptsForRealm } = require('../../mods/manifest-schema');

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function freeze(value) {
    return value && typeof value === 'object' ? Object.freeze(value) : value;
}

function stringifyArg(value) {
    if (value == null) return String(value);
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return '[unserializable]';
    }
}

function pushDiagnostic(diagnostics, entry) {
    diagnostics.push(Object.assign({ at: new Date().toISOString() }, entry));
}

function createConsole(modName, scriptName, diagnostics) {
    const emit = (level) => (...args) => {
        pushDiagnostic(diagnostics, {
            level,
            mod: modName,
            script: scriptName,
            message: args.map(stringifyArg).join(' '),
        });
    };

    return freeze({
        log: emit('info'),
        info: emit('info'),
        warn: emit('warn'),
        error: emit('error'),
    });
}

function buildPublicScriptingSummary(mods = [], options = {}) {
    const allowUntrusted = options.allowUntrusted === true;
    const allowedHooks = Array.isArray(options.allowedHooks) ? options.allowedHooks.map(String) : [];
    const modules = [];
    let totalServerScripts = 0;
    let activeScriptModCount = 0;

    for (const mod of mods) {
        const modName = String(mod && (mod.slug || mod.id) || 'mod');
        const trustLevel = String(mod && mod.trust_level || 'untrusted');
        const scriptRealms = listScriptRealms(mod && mod.manifest || {});
        const serverScripts = listScriptsForRealm(mod && mod.manifest || {}, 'server');
        const canRun = serverScripts.length > 0 && (allowUntrusted || trustLevel === 'trusted');
        totalServerScripts += serverScripts.length;
        if (canRun) activeScriptModCount += 1;
        if (!scriptRealms.length) continue;
        modules.push({
            id: mod && mod.id || modName,
            slug: mod && mod.slug || modName,
            name: mod && mod.name || modName,
            trust_level: trustLevel,
            realms: scriptRealms,
            server_script_count: serverScripts.length,
            can_run: canRun,
        });
    }

    return {
        realms: ['server'],
        trusted_only: !allowUntrusted,
        allowed_hooks: allowedHooks,
        script_mod_count: modules.length,
        active_script_mod_count: activeScriptModCount,
        total_server_scripts: totalServerScripts,
        modules,
    };
}

function createHookApi({ hooks, diagnostics, modName, scriptName, allowedHooks, installed }) {
    const allowed = new Set((allowedHooks || []).map(String));

    return freeze({
        Add(hookName, name, fn) {
            const resolvedHook = String(hookName || '');
            const resolvedName = String(name || '');
            if (!allowed.has(resolvedHook)) {
                throw new Error(`hook ${resolvedHook} is not allowed for mod scripts`);
            }
            if (!resolvedName) {
                throw new Error('hook listener name is required');
            }
            if (typeof fn !== 'function') {
                throw new Error('hook listener must be a function');
            }
            const listenerName = `${modName}:${scriptName}:${resolvedName}`;
            hooks.add(resolvedHook, listenerName, (...args) => {
                try {
                    return Reflect.apply(fn, undefined, args);
                } catch (error) {
                    pushDiagnostic(diagnostics, {
                        level: 'error',
                        mod: modName,
                        script: scriptName,
                        hook: resolvedHook,
                        message: error.message,
                    });
                    return undefined;
                }
            });
            installed.push({ mod: modName, script: scriptName, hook: resolvedHook, name: listenerName });
        },
    });
}

function installModHooks({ hooks, room, catalog, mods = [], allowedHooks = [], allowUntrusted = false }) {
    const diagnostics = [];
    const installed = [];

    for (const mod of mods || []) {
        const modName = String(mod && (mod.slug || mod.id) || 'mod');
        const serverScripts = listScriptsForRealm(mod && mod.manifest || {}, 'server');
        if (!serverScripts.length) continue;

        const trustLevel = String(mod && mod.trust_level || 'untrusted');
        if (!allowUntrusted && trustLevel !== 'trusted') {
            pushDiagnostic(diagnostics, {
                level: 'warn',
                mod: modName,
                message: 'Skipping server scripts for an untrusted mod',
            });
            continue;
        }

        for (const script of serverScripts) {
            const scriptName = String(script && script.name || 'script');
            const before = installed.length;
            try {
                const diagnosticsConsole = createConsole(modName, scriptName, diagnostics);
                const sandbox = {
                    console: diagnosticsConsole,
                    log: diagnosticsConsole.log,
                    Math,
                    JSON,
                    Date: freeze({ now: () => Date.now() }),
                    room: freeze({
                        world_id: room && room.world && room.world.id || null,
                        world_slug: room && room.world && room.world.slug || null,
                        tick_rate: room && room.tickRate || null,
                    }),
                    catalog: freeze({
                        world: freeze({
                            id: room && room.world && room.world.id || null,
                            slug: room && room.world && room.world.slug || null,
                            name: room && room.world && room.world.name || null,
                        }),
                        hook_surfaces: freeze([...(allowedHooks || []).map(String)]),
                        mods: freeze((catalog && Array.isArray(catalog.mods) ? catalog.mods : []).map((entry) => freeze({
                            id: entry.id,
                            slug: entry.slug,
                            name: entry.name,
                            trust_level: entry.trust_level || 'untrusted',
                        }))),
                    }),
                    utils: freeze({
                        clamp,
                        lerp(a, b, t) {
                            return a + ((b - a) * clamp(Number(t) || 0, 0, 1));
                        },
                        rand(min = 0, max = 1) {
                            const low = Number(min) || 0;
                            const high = Number(max);
                            if (!Number.isFinite(high)) return Math.random() * low;
                            return low + (Math.random() * (high - low));
                        },
                    }),
                };
                sandbox.hook = createHookApi({ hooks, diagnostics, modName, scriptName, allowedHooks, installed });
                sandbox.globalThis = sandbox;

                const context = vm.createContext(sandbox, {
                    codeGeneration: { strings: false, wasm: false },
                });
                const compiled = new vm.Script(`'use strict';\n${String(script.code || '')}`, {
                    filename: `${modName}/${scriptName}.mod.js`,
                    displayErrors: true,
                });
                compiled.runInContext(context, { timeout: 50 });
                pushDiagnostic(diagnostics, {
                    level: 'info',
                    mod: modName,
                    script: scriptName,
                    message: `Loaded ${installed.length - before} hook listener(s)`,
                });
            } catch (error) {
                pushDiagnostic(diagnostics, {
                    level: 'error',
                    mod: modName,
                    script: scriptName,
                    message: error.message,
                });
            }
        }
    }

    return { diagnostics, installed };
}

module.exports = {
    buildPublicScriptingSummary,
    installModHooks,
};
