'use strict';

function createHookLibrary(options = {}) {
    const events = new Map();
    const baseHandlers = new Map();
    const defaultStopOnDefined = options.stopOnDefined !== false;

    function keyOf(value) {
        return String(value || '').trim();
    }

    function bucket(eventName, create = false) {
        const key = keyOf(eventName);
        if (!key) throw new Error('event name required');
        if (!events.has(key) && create) events.set(key, new Map());
        return events.get(key) || null;
    }

    function list(eventName) {
        const store = bucket(eventName, false);
        return store ? Array.from(store.values()) : [];
    }

    function dispatch(eventName, gm, args, runOptions = {}) {
        const stopOnDefined = runOptions.stopOnDefined == null ? defaultStopOnDefined : !!runOptions.stopOnDefined;
        const handlers = [];
        for (const entry of list(eventName)) handlers.push(entry);
        if (gm && typeof gm[eventName] === 'function') {
            handlers.push({
                id: `gm:${eventName}`,
                fn: gm[eventName].bind(gm),
                continueOnReturn: false,
            });
        }
        const baseFn = typeof runOptions.base === 'function' ? runOptions.base : baseHandlers.get(keyOf(eventName));
        if (typeof baseFn === 'function') {
            handlers.push({
                id: `base:${eventName}`,
                fn: baseFn,
                continueOnReturn: false,
            });
        }

        let lastResult;
        for (const entry of handlers) {
            const result = entry.fn(...args);
            if (result !== undefined) {
                lastResult = result;
                if (stopOnDefined && entry.continueOnReturn !== true) return result;
            }
        }
        return lastResult;
    }

    const api = {
        Add(eventName, hookId, fn, entryOptions = {}) {
            const key = keyOf(eventName);
            const id = keyOf(hookId);
            if (!id) throw new Error('hook id required');
            if (typeof fn !== 'function') throw new Error('hook handler must be a function');
            const store = bucket(key, true);
            store.set(id, {
                id,
                fn,
                continueOnReturn: entryOptions.continueOnReturn === true,
            });
            return api;
        },
        Remove(eventName, hookId) {
            const store = bucket(eventName, false);
            if (!store) return false;
            return store.delete(keyOf(hookId));
        },
        SetBase(eventName, fn) {
            if (typeof fn !== 'function') throw new Error('base hook must be a function');
            baseHandlers.set(keyOf(eventName), fn);
            return api;
        },
        Clear(eventName) {
            if (eventName == null) {
                events.clear();
                baseHandlers.clear();
                return api;
            }
            events.delete(keyOf(eventName));
            baseHandlers.delete(keyOf(eventName));
            return api;
        },
        Run(eventName, ...args) {
            return dispatch(eventName, null, args, {});
        },
        Call(eventName, gm, ...args) {
            return dispatch(eventName, gm, args, {});
        },
        Dispatch(eventName, gm, args = [], runOptions = {}) {
            return dispatch(eventName, gm, Array.isArray(args) ? args : [args], runOptions);
        },
        List(eventName) {
            return list(eventName).map((entry) => ({ id: entry.id, continueOnReturn: entry.continueOnReturn }));
        },
        Has(eventName, hookId) {
            const store = bucket(eventName, false);
            return !!store && store.has(keyOf(hookId));
        },
    };

    return api;
}

module.exports = {
    createHookLibrary,
};
