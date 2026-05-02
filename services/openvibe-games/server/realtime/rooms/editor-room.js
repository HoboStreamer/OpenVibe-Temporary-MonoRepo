'use strict';

const crypto = require('crypto');

function uid(prefix) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function cellKey(payload) {
    return `${Number(payload && payload.x) || 0}:${Number(payload && payload.y) || 0}`;
}

function createDraftWorld(id) {
    return {
        id: String(id || 'draft'),
        bounds: { x: 0, y: 0, w: 16384, h: 16384 },
        cellSize: 64,
        camera: { x: 4096, y: 4096, zoom: 0.72 },
        tiles: [],
        objects: [],
        updated_at: new Date().toISOString(),
    };
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
            this.worlds.set(String(worldId || 'draft'), createDraftWorld(worldId));
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
        if (payload && payload.bounds && typeof payload.bounds === 'object') world.bounds = Object.assign({}, world.bounds, clone(payload.bounds));
        if (payload && payload.camera && typeof payload.camera === 'object') {
            world.camera = Object.assign({}, world.camera, {
                x: Number(payload.camera.x) || world.camera.x,
                y: Number(payload.camera.y) || world.camera.y,
                zoom: Number(payload.camera.zoom) || world.camera.zoom,
            });
        }
        if (payload && payload.cellSize) world.cellSize = Math.max(16, Number(payload.cellSize) || world.cellSize || 64);

        if (payload && payload.kind === 'tile') {
            const key = cellKey(payload);
            if (payload.remove) {
                world.tiles = world.tiles.filter((entry) => cellKey(entry) !== key);
            } else {
                const nextTile = { id: payload.id || uid('tile'), x: Number(payload.x) || 0, y: Number(payload.y) || 0, terrain: payload.terrain || 'grass' };
                const existingIndex = world.tiles.findIndex((entry) => cellKey(entry) === key);
                if (existingIndex >= 0) world.tiles.splice(existingIndex, 1, nextTile);
                else world.tiles.push(nextTile);
            }
        }
        if (payload && payload.kind === 'object') {
            const key = cellKey(payload);
            if (payload.remove) {
                world.objects = world.objects.filter((entry) => cellKey(entry) !== key);
            } else {
                const nextObject = { id: payload.id || uid('obj'), x: Number(payload.x) || 0, y: Number(payload.y) || 0, type: payload.type || 'tree' };
                if (nextObject.type === 'spawn') {
                    world.objects = world.objects.filter((entry) => entry.type !== 'spawn');
                }
                const existingIndex = world.objects.findIndex((entry) => cellKey(entry) === key);
                if (existingIndex >= 0) world.objects.splice(existingIndex, 1, nextObject);
                else world.objects.push(nextObject);
            }
        }
        world.updated_at = new Date().toISOString();
        return { ok: true, world: this.snapshot(client.worldId) };
    }

    snapshot(worldId) {
        const world = this.worlds.get(String(worldId || 'draft'));
        return world ? clone(world) : null;
    }

    summary() {
        return {
            client_count: this.clients.size,
            draft_count: this.worlds.size,
        };
    }
}

module.exports = { EditorRoom };
