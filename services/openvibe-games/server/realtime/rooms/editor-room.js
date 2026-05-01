'use strict';

const crypto = require('crypto');

function uid(prefix) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

class EditorRoom {
    constructor(options) {
        const opts = options || {};
        this.emitToSocket = typeof opts.emitToSocket === 'function' ? opts.emitToSocket : () => {};
        this.publish = typeof opts.publish === 'function' ? opts.publish : () => {};
        this.worlds = new Map();
        this.clients = new Map();
    }

    join({ socketId, worldId }) {
        this.clients.set(socketId, { socketId, worldId: String(worldId || 'draft') });
        if (!this.worlds.has(String(worldId || 'draft'))) {
            this.worlds.set(String(worldId || 'draft'), {
                id: String(worldId || 'draft'),
                tiles: [],
                objects: [],
                updated_at: new Date().toISOString(),
            });
        }
        return this.snapshot(String(worldId || 'draft'));
    }

    leave(socketId) {
        this.clients.delete(socketId);
    }

    applyEdit(socketId, payload) {
        const client = this.clients.get(socketId);
        if (!client) return { ok: false, reason: 'editor client not joined' };
        const world = this.worlds.get(client.worldId);
        if (!world) return { ok: false, reason: 'world not found' };
        if (payload && payload.kind === 'tile') {
            world.tiles.push({ id: uid('tile'), x: Number(payload.x) || 0, y: Number(payload.y) || 0, terrain: payload.terrain || 'grass' });
        }
        if (payload && payload.kind === 'object') {
            world.objects.push({ id: uid('obj'), x: Number(payload.x) || 0, y: Number(payload.y) || 0, type: payload.type || 'tree' });
        }
        world.updated_at = new Date().toISOString();
        return { ok: true, world: this.snapshot(client.worldId) };
    }

    snapshot(worldId) {
        const world = this.worlds.get(String(worldId || 'draft'));
        return world ? JSON.parse(JSON.stringify(world)) : null;
    }

    summary() {
        return {
            client_count: this.clients.size,
            draft_count: this.worlds.size,
        };
    }
}

module.exports = { EditorRoom };
