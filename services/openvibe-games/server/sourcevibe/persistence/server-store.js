'use strict';

const crypto = require('crypto');

function uid(prefix = 'svsrv') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

class ServerStore {
    constructor() {
        this.servers = new Map();
    }

    create(payload = {}) {
        const id = payload.id || uid();
        const entry = Object.assign({
            id,
            name: 'SourceVibe Server',
            gamemode: 'base',
            map: 'flatgrass',
            maxPlayers: 32,
            players: 0,
            tags: [],
            createdAt: new Date().toISOString(),
        }, payload, { id });
        this.servers.set(id, entry);
        return this.get(id);
    }

    update(id, patch = {}) {
        const current = this.servers.get(String(id || ''));
        if (!current) return null;
        this.servers.set(current.id, Object.assign({}, current, patch, { id: current.id }));
        return this.get(current.id);
    }

    get(id) {
        const entry = this.servers.get(String(id || ''));
        return entry ? JSON.parse(JSON.stringify(entry)) : null;
    }

    list() {
        return Array.from(this.servers.values())
            .map((entry) => JSON.parse(JSON.stringify(entry)))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
}

module.exports = {
    ServerStore,
};
