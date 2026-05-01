'use strict';

class BindRegistry {
    constructor() {
        this.binds = new Map();
    }

    Set(key, command) {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey) throw new Error('bind key required');
        const value = String(command || '').trim();
        if (!value) throw new Error('bind command required');
        this.binds.set(normalizedKey, value);
        return { key: normalizedKey, command: value };
    }

    Get(key) {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey) return null;
        const command = this.binds.get(normalizedKey);
        return command ? { key: normalizedKey, command } : null;
    }

    Delete(key) {
        return this.binds.delete(String(key || '').trim());
    }

    List() {
        return Array.from(this.binds.entries())
            .map(([key, command]) => ({ key, command }))
            .sort((a, b) => a.key.localeCompare(b.key));
    }
}

module.exports = {
    BindRegistry,
};
