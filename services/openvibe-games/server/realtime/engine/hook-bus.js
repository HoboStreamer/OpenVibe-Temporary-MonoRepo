'use strict';

function createHookBus() {
    const hooks = new Map();

    function list(hook, create = false) {
        if (!hooks.has(hook) && create) hooks.set(hook, []);
        return hooks.get(hook) || [];
    }

    return {
        add(hook, name, fn) {
            if (typeof hook !== 'string' || !hook) throw new Error('hook name required');
            if (typeof name !== 'string' || !name) throw new Error('listener name required');
            if (typeof fn !== 'function') throw new Error('listener must be a function');
            const entries = list(hook, true).filter((entry) => entry.name !== name);
            entries.push({ name, fn });
            hooks.set(hook, entries);
            return this;
        },
        remove(hook, name) {
            if (!hooks.has(hook)) return false;
            const entries = list(hook).filter((entry) => entry.name !== name);
            const changed = entries.length !== list(hook).length;
            if (entries.length) hooks.set(hook, entries);
            else hooks.delete(hook);
            return changed;
        },
        call(hook, ...args) {
            let lastResult;
            for (const entry of list(hook)) {
                const result = entry.fn(...args);
                if (result !== undefined) lastResult = result;
            }
            return lastResult;
        },
        firstDefined(hook, ...args) {
            for (const entry of list(hook)) {
                const result = entry.fn(...args);
                if (result !== undefined && result !== null) return result;
            }
            return undefined;
        },
        collect(hook, ...args) {
            const results = [];
            for (const entry of list(hook)) {
                const result = entry.fn(...args);
                if (result !== undefined) results.push(result);
            }
            return results;
        },
        names(hook) {
            return list(hook).map((entry) => entry.name);
        },
    };
}

module.exports = { createHookBus };
