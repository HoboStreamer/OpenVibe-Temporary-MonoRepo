'use strict';

class MessageRegistry {
    constructor() {
        this.messages = new Map();
    }

    Register(name, schema = {}) {
        const key = String(name || '').trim();
        if (!key) throw new Error('message name required');
        const entry = {
            name: key,
            schema: Object.assign({}, schema),
        };
        this.messages.set(key, entry);
        return this.Get(key);
    }

    Get(name) {
        const entry = this.messages.get(String(name || '').trim());
        return entry ? Object.assign({}, entry) : null;
    }

    List() {
        return Array.from(this.messages.values())
            .map((entry) => Object.assign({}, entry))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
}

module.exports = {
    MessageRegistry,
};
