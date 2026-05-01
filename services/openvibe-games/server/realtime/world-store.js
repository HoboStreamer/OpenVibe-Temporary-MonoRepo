'use strict';

// Persistence helpers for the 2D World runtime tables. Pure CRUD — the
// WorldRoom owns simulation state and only reaches in here for snapshots and
// world catalog reads/writes.

const crypto = require('crypto');
const db = require('../db');

function uid(prefix) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function safeParse(value, fallback) {
    if (value == null || value === '') return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
}

function getDb() { return db.get(); }

function rowToWorld(row) {
    if (!row) return null;
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        owner_id: row.owner_id || null,
        mode: row.mode,
        seed: row.seed,
        status: row.status,
        metadata: safeParse(row.metadata_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function listWorlds(options = {}) {
    const limit = Math.min(200, Math.max(1, Number(options.limit) || 25));
    const rows = getDb().prepare(`SELECT * FROM game_worlds ORDER BY updated_at DESC LIMIT ?`).all(limit);
    return rows.map(rowToWorld);
}

function getWorld(idOrSlug) {
    const row = getDb().prepare(`SELECT * FROM game_worlds WHERE id = ? OR slug = ? LIMIT 1`).get(idOrSlug, idOrSlug);
    return rowToWorld(row);
}

function upsertWorld({ slug, name, owner_id, mode, seed, status, metadata }) {
    if (!slug || !name) {
        const err = new Error('slug and name required'); err.status = 400; throw err;
    }
    const existing = getDb().prepare('SELECT id FROM game_worlds WHERE slug = ?').get(slug);
    const id = existing ? existing.id : uid('world');
    const now = new Date().toISOString();
    getDb().prepare(`
        INSERT INTO game_worlds (id, slug, name, owner_id, mode, seed, status, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            owner_id = COALESCE(excluded.owner_id, game_worlds.owner_id),
            mode = excluded.mode,
            seed = excluded.seed,
            status = excluded.status,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `).run(
        id, String(slug), String(name), owner_id || null,
        String(mode || 'sandbox'), Number(seed) || 0, String(status || 'draft'),
        JSON.stringify(metadata || {}), now, now,
    );
    return getWorld(id);
}

function setZones(worldId, zones) {
    const stmt = getDb().prepare(`
        INSERT INTO game_world_zones (world_id, zone_id, kind, pvp, metadata_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(world_id, zone_id) DO UPDATE SET
            kind = excluded.kind,
            pvp = excluded.pvp,
            metadata_json = excluded.metadata_json
    `);
    const tx = getDb().transaction((items) => {
        for (const zone of items) {
            stmt.run(
                String(worldId),
                String(zone.zone_id),
                String(zone.kind || 'overworld'),
                zone.pvp ? 1 : 0,
                JSON.stringify(zone),
            );
        }
    });
    tx(zones || []);
}

function listZones(worldId) {
    return getDb().prepare(`SELECT * FROM game_world_zones WHERE world_id = ? ORDER BY zone_id`)
        .all(String(worldId))
        .map((row) => Object.assign({ pvp: !!row.pvp }, safeParse(row.metadata_json, {}), { zone_id: row.zone_id, kind: row.kind }));
}

function setResourceNodes(worldId, nodes) {
    const stmt = getDb().prepare(`
        INSERT INTO game_resource_nodes (id, world_id, zone_id, kind, x, y, hp, max_hp, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = getDb().transaction((items) => {
        getDb().prepare('DELETE FROM game_resource_nodes WHERE world_id = ?').run(String(worldId));
        for (const node of items) {
            stmt.run(
                uid('rn'), String(worldId), String(node.zone_id), String(node.kind),
                Number(node.x) || 0, Number(node.y) || 0,
                Number(node.hp) || 1, Number(node.max_hp || node.hp) || 1,
                JSON.stringify(node),
            );
        }
    });
    tx(nodes || []);
}

function listResourceNodes(worldId) {
    return getDb().prepare(`SELECT * FROM game_resource_nodes WHERE world_id = ?`)
        .all(String(worldId))
        .map((row) => Object.assign({}, safeParse(row.metadata_json, {}), {
            id: row.id, zone_id: row.zone_id, kind: row.kind,
            x: row.x, y: row.y, hp: row.hp, max_hp: row.max_hp,
            respawn_at: row.respawn_at,
        }));
}

function recordSnapshot(worldId, payload) {
    const id = uid('snap');
    const next = (getDb().prepare('SELECT COALESCE(MAX(sequence),0)+1 AS n FROM game_world_snapshots WHERE world_id = ?').get(String(worldId)) || {}).n || 1;
    getDb().prepare(`
        INSERT INTO game_world_snapshots (id, world_id, sequence, payload_json)
        VALUES (?, ?, ?, ?)
    `).run(id, String(worldId), next, JSON.stringify(payload || {}));
    return { id, world_id: String(worldId), sequence: next };
}

function latestSnapshot(worldId) {
    const row = getDb().prepare(`
        SELECT * FROM game_world_snapshots WHERE world_id = ? ORDER BY sequence DESC LIMIT 1
    `).get(String(worldId));
    if (!row) return null;
    return { id: row.id, world_id: row.world_id, sequence: row.sequence, payload: safeParse(row.payload_json, {}), created_at: row.created_at };
}

function recordSession({ world_id, user_id }) {
    const id = uid('sess');
    getDb().prepare(`
        INSERT INTO game_runtime_sessions (id, world_id, user_id, joined_at, metadata_json)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, '{}')
    `).run(id, String(world_id), String(user_id));
    return { id, world_id: String(world_id), user_id: String(user_id) };
}

function endSession(sessionId) {
    getDb().prepare(`UPDATE game_runtime_sessions SET left_at = CURRENT_TIMESTAMP WHERE id = ?`).run(String(sessionId));
}

function ensureSeedItemCatalog(items) {
    const stmt = getDb().prepare(`
        INSERT INTO game_item_catalog (item_id, name, category, stackable, max_stack, rarity, metadata_json)
        VALUES (?, ?, ?, ?, ?, 'common', ?)
        ON CONFLICT(item_id) DO UPDATE SET
            name = excluded.name,
            category = excluded.category,
            stackable = excluded.stackable,
            max_stack = excluded.max_stack,
            metadata_json = excluded.metadata_json
    `);
    const tx = getDb().transaction((rows) => {
        for (const item of rows) {
            stmt.run(
                item.item_id, item.name, item.category || 'misc',
                item.stackable === 0 ? 0 : 1,
                Number(item.max_stack) || 999,
                JSON.stringify(item.metadata || {}),
            );
        }
    });
    tx(items || []);
}

function ensureSeedNpcTemplates(templates) {
    const stmt = getDb().prepare(`
        INSERT INTO game_npc_templates (id, name, kind, hp, damage, speed, aggro_radius, loot_table_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            kind = excluded.kind,
            hp = excluded.hp,
            damage = excluded.damage,
            speed = excluded.speed,
            aggro_radius = excluded.aggro_radius,
            loot_table_id = excluded.loot_table_id,
            metadata_json = excluded.metadata_json
    `);
    const tx = getDb().transaction((rows) => {
        for (const t of rows) {
            stmt.run(t.id, t.name, t.kind || 'mob', Number(t.hp) || 1, Number(t.damage) || 0,
                Number(t.speed) || 60, Number(t.aggro_radius) || 0, t.loot_table_id || null,
                JSON.stringify(t));
        }
    });
    tx(templates || []);
}

function ensureSeedLootTables(tables) {
    const stmt = getDb().prepare(`
        INSERT INTO game_loot_tables (id, name, entries_json, metadata_json)
        VALUES (?, ?, ?, '{}')
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            entries_json = excluded.entries_json
    `);
    const tx = getDb().transaction((rows) => {
        for (const t of rows) stmt.run(t.id, t.name, JSON.stringify(t.entries || []));
    });
    tx(tables || []);
}

module.exports = {
    listWorlds, getWorld, upsertWorld,
    setZones, listZones,
    setResourceNodes, listResourceNodes,
    recordSnapshot, latestSnapshot,
    recordSession, endSession,
    ensureSeedItemCatalog, ensureSeedNpcTemplates, ensureSeedLootTables,
};
