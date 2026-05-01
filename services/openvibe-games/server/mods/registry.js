'use strict';

// In-process mod registry persisted via game_mods / game_mod_versions /
// game_mod_assets / game_mod_worlds. Scripted hooks are allowed for trusted
// mods only; untrusted mods remain data-only.

const crypto = require('crypto');
const db = require('../db');
const { validateManifest } = require('./manifest-schema');

function uid(prefix) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function safeParse(value, fallback) {
    if (value == null || value === '') return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
}

function toObject(row) {
    if (!row) return null;
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        owner_id: row.owner_id || null,
        version: row.version,
        status: row.status,
        trust_level: row.trust_level,
        manifest: safeParse(row.manifest_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function getDb() { return db.get(); }

function listMods(options = {}) {
    const limit = Math.min(200, Math.max(1, Number(options.limit) || 50));
    const rows = getDb().prepare(`
        SELECT * FROM game_mods
        ORDER BY updated_at DESC
        LIMIT ?
    `).all(limit);
    return rows.map(toObject);
}

function listEnabledMods(worldId, options = {}) {
    const limit = Math.min(200, Math.max(1, Number(options.limit) || 50));
    const rows = getDb().prepare(`
        SELECT gm.*, gmw.world_id, gmw.enabled, gmw.updated_at AS world_updated_at
        FROM game_mod_worlds gmw
        JOIN game_mods gm ON gm.id = gmw.mod_id
        WHERE gmw.world_id = ? AND gmw.enabled = 1
        ORDER BY gmw.updated_at DESC, gm.updated_at DESC
        LIMIT ?
    `).all(String(worldId), limit);
    return rows.map((row) => {
        const mod = toObject(row);
        return Object.assign({}, mod, {
            world_id: String(row.world_id),
            enabled: !!row.enabled,
            world_updated_at: row.world_updated_at,
            assets: options.includeAssets ? listAssets(mod.id) : [],
        });
    });
}

function getMod(id) {
    const row = getDb().prepare(`SELECT * FROM game_mods WHERE id = ? OR slug = ? LIMIT 1`).get(id, id);
    return toObject(row);
}

function registerMod({ manifest, owner_id }) {
    const validation = validateManifest(manifest);
    if (!validation.ok) {
        const err = new Error(`mod manifest invalid: ${validation.errors.join('; ')}`);
        err.status = 400;
        throw err;
    }
    const slug = manifest.id;
    const existing = getDb().prepare('SELECT id FROM game_mods WHERE slug = ?').get(slug);
    const id = existing ? existing.id : uid('mod');
    const manifestJson = JSON.stringify(manifest);
    const now = new Date().toISOString();
    getDb().prepare(`
        INSERT INTO game_mods (id, slug, name, owner_id, version, status, trust_level, manifest_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'registered', 'untrusted', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            owner_id = excluded.owner_id,
            version = excluded.version,
            status = 'registered',
            manifest_json = excluded.manifest_json,
            updated_at = excluded.updated_at
    `).run(id, slug, String(manifest.name), owner_id || null, String(manifest.version), manifestJson, now, now);

    getDb().prepare(`
        INSERT INTO game_mod_versions (id, mod_id, version, manifest_json, validated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(mod_id, version) DO UPDATE SET
            manifest_json = excluded.manifest_json,
            validated_at = excluded.validated_at
    `).run(uid('modv'), id, String(manifest.version), manifestJson, now, now);

    return getMod(id);
}

function setEnabled(modId, worldId, enabled) {
    const mod = getMod(modId);
    if (!mod) {
        const err = new Error('mod not found'); err.status = 404; throw err;
    }
    const id = uid('mw');
    const now = new Date().toISOString();
    getDb().prepare(`
        INSERT INTO game_mod_worlds (id, mod_id, world_id, enabled, metadata_json, updated_at)
        VALUES (?, ?, ?, ?, '{}', ?)
        ON CONFLICT(mod_id, world_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at
    `).run(id, mod.id, String(worldId), enabled ? 1 : 0, now);
    return { mod_id: mod.id, world_id: String(worldId), enabled: !!enabled };
}

function setTrustLevel(modId, trustLevel) {
    const mod = getMod(modId);
    if (!mod) {
        const err = new Error('mod not found'); err.status = 404; throw err;
    }
    const normalized = String(trustLevel || '').trim().toLowerCase();
    if (!['untrusted', 'trusted', 'blocked'].includes(normalized)) {
        const err = new Error('trust_level must be untrusted, trusted, or blocked');
        err.status = 400;
        throw err;
    }
    const now = new Date().toISOString();
    getDb().prepare(`
        UPDATE game_mods
        SET trust_level = ?, updated_at = ?
        WHERE id = ?
    `).run(normalized, now, mod.id);
    return getMod(mod.id);
}

function listAssets(modId) {
    const mod = getMod(modId);
    if (!mod) return [];
    const rows = getDb().prepare(`
        SELECT * FROM game_mod_assets WHERE mod_id = ? ORDER BY created_at DESC LIMIT 200
    `).all(mod.id);
    return rows.map((r) => ({
        id: r.id,
        mod_id: r.mod_id,
        namespace: r.namespace,
        media_id: r.media_id,
        asset_path: r.asset_path,
        metadata: safeParse(r.metadata_json, {}),
        created_at: r.created_at,
    }));
}

function uploadAsset({ modId, namespace, media_id, asset_path, metadata }) {
    const mod = getMod(modId);
    if (!mod) { const err = new Error('mod not found'); err.status = 404; throw err; }
    if (!namespace || typeof namespace !== 'string') { const err = new Error('namespace required'); err.status = 400; throw err; }
    const id = uid('moda');
    getDb().prepare(`
        INSERT INTO game_mod_assets (id, mod_id, namespace, media_id, asset_path, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, mod.id, namespace, media_id || null, asset_path || null, JSON.stringify(metadata || {}));
    return listAssets(mod.id)[0];
}

module.exports = {
    listMods,
    listEnabledMods,
    getMod,
    registerMod,
    setEnabled,
    setTrustLevel,
    listAssets,
    uploadAsset,
};
