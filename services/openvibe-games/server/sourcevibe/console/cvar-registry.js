'use strict';

function normalizeFlags(flags) {
    if (!Array.isArray(flags)) return [];
    return [...new Set(flags.map((flag) => String(flag || '').trim()).filter(Boolean))];
}

function coerceValue(defaultValue, nextValue) {
    if (typeof defaultValue === 'boolean') {
        if (typeof nextValue === 'string') return !['0', 'false', 'off', 'no'].includes(nextValue.trim().toLowerCase());
        return !!nextValue;
    }
    if (typeof defaultValue === 'number') {
        const parsed = Number(nextValue);
        return Number.isFinite(parsed) ? parsed : defaultValue;
    }
    return nextValue == null ? '' : String(nextValue);
}

class CvarRegistry {
    constructor() {
        this.cvars = new Map();
    }

    Create(name, defaultValue, flags = [], description = '') {
        const key = String(name || '').trim().toLowerCase();
        if (!key) throw new Error('cvar name required');
        const entry = {
            name: key,
            defaultValue,
            value: defaultValue,
            flags: normalizeFlags(flags),
            description: String(description || ''),
        };
        this.cvars.set(key, entry);
        return this.Get(key);
    }

    Get(name) {
        const entry = this.cvars.get(String(name || '').trim().toLowerCase());
        return entry ? Object.assign({}, entry) : null;
    }

    Set(name, value) {
        const key = String(name || '').trim().toLowerCase();
        const entry = this.cvars.get(key);
        if (!entry) throw new Error(`unknown cvar: ${key}`);
        entry.value = coerceValue(entry.defaultValue, value);
        return this.Get(key);
    }

    Reset(name) {
        const key = String(name || '').trim().toLowerCase();
        const entry = this.cvars.get(key);
        if (!entry) throw new Error(`unknown cvar: ${key}`);
        entry.value = entry.defaultValue;
        return this.Get(key);
    }

    List() {
        return Array.from(this.cvars.values())
            .map((entry) => Object.assign({}, entry))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    Autocomplete(inputString = '') {
        const prefix = String(inputString || '').trim().toLowerCase();
        return this.List().filter((entry) => entry.name.startsWith(prefix));
    }
}

module.exports = {
    CvarRegistry,
};
