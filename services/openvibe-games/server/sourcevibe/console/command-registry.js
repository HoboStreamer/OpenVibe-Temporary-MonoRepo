'use strict';

class CommandRegistry {
    constructor() {
        this.commands = new Map();
    }

    Add(name, fn, options = {}) {
        const key = String(name || '').trim().toLowerCase();
        if (!key) throw new Error('command name required');
        if (typeof fn !== 'function') throw new Error('command handler must be a function');
        const entry = {
            name: key,
            handler: fn,
            description: options.description || '',
            usage: options.usage || key,
            aliases: Array.isArray(options.aliases) ? options.aliases.map((alias) => String(alias).trim().toLowerCase()).filter(Boolean) : [],
        };
        this.commands.set(key, entry);
        for (const alias of entry.aliases) this.commands.set(alias, Object.assign({}, entry, { aliasOf: key }));
        return entry;
    }

    Get(name) {
        return this.commands.get(String(name || '').trim().toLowerCase()) || null;
    }

    List() {
        const seen = new Set();
        const items = [];
        for (const entry of this.commands.values()) {
            const key = entry.aliasOf || entry.name;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push(Object.assign({}, this.commands.get(key)));
        }
        return items.sort((a, b) => a.name.localeCompare(b.name));
    }

    Autocomplete(inputString = '') {
        const prefix = String(inputString || '').trim().toLowerCase();
        return this.List().filter((entry) => entry.name.startsWith(prefix));
    }
}

module.exports = {
    CommandRegistry,
};
