'use strict';

// openvibe-media — media object CRUD wrappers. Pure DB ops; HTTP wrapping
// lives in api/media.js. Keep policy/quota/event side-effects out of here.

const crypto = require('crypto');
const db = require('./db');
const namespaces = require('@openvibe/contracts/media-namespaces');

function newMediaId() {
    return `med_${crypto.randomBytes(12).toString('hex')}`;
}

function hydrate(row) {
    if (!row) return null;
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch { metadata = {}; }
    return {
        id: row.id,
        owner_type: row.owner_type,
        owner_id: row.owner_id,
        namespace: row.namespace,
        type: row.type,
        status: row.status,
        visibility: row.visibility,
        storage_tier: row.storage_tier,
        storage_provider: row.storage_provider,
        storage_key: row.storage_key,
        public_url: row.public_url,
        cdn_url: row.cdn_url,
        size_bytes: row.size_bytes,
        mime_type: row.mime_type,
        sha256: row.sha256,
        metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at || null,
    };
}

function create(input) {
    const id = input.id || newMediaId();
    const def = namespaces.getMediaNamespaceDef(input.namespace) || {};
    const visibility   = input.visibility   || def.default_visibility   || 'public';
    const storageTier  = input.storage_tier || def.default_storage_tier || 'hot';
    const meta = input.metadata || {};
    db.get().prepare(`
        INSERT INTO media_objects (
            id, owner_type, owner_id, namespace, type, status, visibility,
            storage_tier, storage_provider, storage_key, public_url, cdn_url,
            size_bytes, mime_type, sha256, metadata_json,
            created_by_actor_type, created_by_actor_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        String(input.owner_type), String(input.owner_id),
        String(input.namespace), String(input.type),
        input.status || 'initialized',
        visibility, storageTier,
        input.storage_provider || 'local',
        input.storage_key || null,
        input.public_url || null,
        input.cdn_url || null,
        input.size_bytes || 0,
        input.mime_type || null,
        input.sha256 || null,
        JSON.stringify(meta),
        input.actor_type || null, input.actor_id || null,
    );
    return getById(id);
}

function getById(id) {
    return hydrate(db.get().prepare(`SELECT * FROM media_objects WHERE id = ?`).get(String(id)));
}

function update(id, patch) {
    const cur = getById(id);
    if (!cur) return null;
    const next = {
        status: patch.status != null ? patch.status : cur.status,
        visibility: patch.visibility != null ? patch.visibility : cur.visibility,
        storage_tier: patch.storage_tier != null ? patch.storage_tier : cur.storage_tier,
        storage_provider: patch.storage_provider != null ? patch.storage_provider : cur.storage_provider,
        storage_key: patch.storage_key !== undefined ? patch.storage_key : cur.storage_key,
        public_url: patch.public_url !== undefined ? patch.public_url : cur.public_url,
        cdn_url: patch.cdn_url !== undefined ? patch.cdn_url : cur.cdn_url,
        size_bytes: patch.size_bytes != null ? patch.size_bytes : cur.size_bytes,
        mime_type: patch.mime_type !== undefined ? patch.mime_type : cur.mime_type,
        sha256: patch.sha256 !== undefined ? patch.sha256 : cur.sha256,
        metadata: patch.metadata != null ? Object.assign({}, cur.metadata, patch.metadata) : cur.metadata,
    };
    db.get().prepare(`
        UPDATE media_objects SET
            status = ?, visibility = ?, storage_tier = ?, storage_provider = ?,
            storage_key = ?, public_url = ?, cdn_url = ?,
            size_bytes = ?, mime_type = ?, sha256 = ?, metadata_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        next.status, next.visibility, next.storage_tier, next.storage_provider,
        next.storage_key, next.public_url, next.cdn_url,
        next.size_bytes, next.mime_type, next.sha256,
        JSON.stringify(next.metadata),
        String(id),
    );
    return getById(id);
}

function softDelete(id, actor) {
    db.get().prepare(`
        UPDATE media_objects SET status='deleted', deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL
    `).run(String(id));
    recordLifecycle(id, { from_status: null, to_status: 'deleted', actor });
    return getById(id);
}

function archive(id, actor) {
    db.get().prepare(`
        UPDATE media_objects SET status='archived', storage_tier='cold', updated_at=CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(String(id));
    recordLifecycle(id, { from_status: null, to_status: 'archived', from_tier: null, to_tier: 'cold', actor });
    return getById(id);
}

function restore(id, actor) {
    db.get().prepare(`
        UPDATE media_objects SET status='ready', storage_tier='warm', updated_at=CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(String(id));
    recordLifecycle(id, { from_status: 'archived', to_status: 'ready', from_tier: 'cold', to_tier: 'warm', actor });
    return getById(id);
}

function recordLifecycle(mediaId, { from_status, to_status, from_tier, to_tier, actor, detail }) {
    const a = actor || { type: 'system', id: null };
    db.get().prepare(`
        INSERT INTO media_lifecycle_audit
            (media_id, from_status, to_status, from_tier, to_tier, actor_type, actor_id, detail_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        String(mediaId), from_status || null, to_status || null,
        from_tier || null, to_tier || null,
        a.type || null, a.id || null,
        JSON.stringify(detail || {}),
    );
}

function list({ namespace, ownerType, ownerId, type, status, visibility, sinceId, limit }) {
    const where = [];
    const args = [];
    if (namespace)  { where.push('namespace = ?');   args.push(String(namespace)); }
    if (ownerType)  { where.push('owner_type = ?');  args.push(String(ownerType)); }
    if (ownerId)    { where.push('owner_id = ?');    args.push(String(ownerId)); }
    if (type)       { where.push('type = ?');        args.push(String(type)); }
    if (status)     { where.push('status = ?');      args.push(String(status)); }
    if (visibility) { where.push('visibility = ?'); args.push(String(visibility)); }
    where.push('deleted_at IS NULL');
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    if (sinceId)    { where.push('rowid > ?'); args.push(parseInt(sinceId, 10) || 0); }
    const rows = db.get().prepare(
        `SELECT * FROM media_objects WHERE ${where.join(' AND ')} ORDER BY rowid DESC LIMIT ?`
    ).all(...args, cap);
    return rows.map(hydrate);
}

function findBySha(sha256) {
    if (!sha256) return null;
    return hydrate(db.get().prepare(`SELECT * FROM media_objects WHERE sha256 = ? AND deleted_at IS NULL LIMIT 1`).get(String(sha256)));
}

function recordLegacyMap({ source, kind, legacy_id, media_id }) {
    db.get().prepare(`
        INSERT OR IGNORE INTO media_legacy_map (source, kind, legacy_id, media_id)
        VALUES (?, ?, ?, ?)
    `).run(String(source), String(kind), String(legacy_id), String(media_id));
}

function lookupLegacy(source, kind, legacyId) {
    return db.get().prepare(
        `SELECT media_id FROM media_legacy_map WHERE source = ? AND kind = ? AND legacy_id = ?`
    ).get(String(source), String(kind), String(legacyId));
}

module.exports = {
    newMediaId, hydrate,
    create, getById, update,
    softDelete, archive, restore, recordLifecycle,
    list, findBySha,
    recordLegacyMap, lookupLegacy,
};
