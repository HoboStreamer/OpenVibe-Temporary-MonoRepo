'use strict';

// openvibe-media — quota enforcement. Reads from media_quotas (per-owner
// override) and falls back to config.defaultQuotas (per-namespace defaults).
// Internal platform services may register an unlimited row.

const db = require('./db');
const config = require('./config');

function getQuota(ownerType, ownerId, namespace) {
    const row = db.get().prepare(
        `SELECT * FROM media_quotas
         WHERE owner_type = ? AND owner_id = ? AND namespace = ?`
    ).get(String(ownerType), String(ownerId), String(namespace));
    if (row) {
        return {
            unlimited: !!row.unlimited,
            max_storage_bytes: row.max_storage_bytes,
            max_upload_bytes:  row.max_upload_bytes,
            max_file_count:    row.max_file_count,
            allowed_mime_prefixes: safeJson(row.allowed_mime_prefixes_json, []),
            allowed_types: safeJson(row.allowed_types_json, []),
            source: 'override',
        };
    }
    const def = config.defaultQuotas[namespace];
    if (def) return { ...def, unlimited: false, source: 'default' };
    return {
        unlimited: false,
        max_storage_bytes: 1 * 1024 * 1024 * 1024,
        max_upload_bytes:  10 * 1024 * 1024,
        max_file_count:    10000,
        allowed_mime_prefixes: [],
        allowed_types: [],
        source: 'fallback',
    };
}

function safeJson(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
}

function getUsage(ownerType, ownerId, namespace) {
    const row = db.get().prepare(
        `SELECT total_bytes, hot_bytes, warm_bytes, cold_bytes, file_count, updated_at
         FROM media_usage WHERE owner_type = ? AND owner_id = ? AND namespace = ?`
    ).get(String(ownerType), String(ownerId), String(namespace));
    return row || { total_bytes: 0, hot_bytes: 0, warm_bytes: 0, cold_bytes: 0, file_count: 0, updated_at: null };
}

/**
 * Inspect (don't enqueue) whether an upload of `intendedSize` bytes/`type`
 * is permitted. Returns { allow, reason }.
 */
function checkUpload({ ownerType, ownerId, namespace, type, mimeType, intendedSize }) {
    const quota = getQuota(ownerType, ownerId, namespace);
    if (quota.unlimited) return { allow: true, reason: 'unlimited' };

    const usage = getUsage(ownerType, ownerId, namespace);
    if (intendedSize && intendedSize > quota.max_upload_bytes) {
        return { allow: false, reason: `upload exceeds per-file limit (${intendedSize} > ${quota.max_upload_bytes})` };
    }
    if (intendedSize && (usage.total_bytes + intendedSize) > quota.max_storage_bytes) {
        return { allow: false, reason: `storage quota exceeded (${usage.total_bytes + intendedSize} > ${quota.max_storage_bytes})` };
    }
    if (quota.max_file_count && usage.file_count >= quota.max_file_count) {
        return { allow: false, reason: `file count quota exceeded (${usage.file_count} >= ${quota.max_file_count})` };
    }
    if (Array.isArray(quota.allowed_types) && quota.allowed_types.length && type && !quota.allowed_types.includes(type)) {
        return { allow: false, reason: `type '${type}' not allowed in namespace` };
    }
    if (Array.isArray(quota.allowed_mime_prefixes) && quota.allowed_mime_prefixes.length && mimeType) {
        const ok = quota.allowed_mime_prefixes.some(p => mimeType.startsWith(p));
        if (!ok) return { allow: false, reason: `mime '${mimeType}' not allowed in namespace` };
    }
    return { allow: true, reason: 'within quota' };
}

/**
 * Recompute usage row for (ownerType, ownerId, namespace) from media_objects.
 * Called after every successful upload-complete and after deletes.
 */
function recomputeUsage(ownerType, ownerId, namespace) {
    const sql = db.get();
    const row = sql.prepare(
        `SELECT
             COALESCE(SUM(size_bytes), 0)                                            AS total_bytes,
             COALESCE(SUM(CASE WHEN storage_tier='hot'  THEN size_bytes END), 0)     AS hot_bytes,
             COALESCE(SUM(CASE WHEN storage_tier='warm' THEN size_bytes END), 0)     AS warm_bytes,
             COALESCE(SUM(CASE WHEN storage_tier='cold' THEN size_bytes END), 0)     AS cold_bytes,
             COUNT(*)                                                                AS file_count
         FROM media_objects
         WHERE owner_type = ? AND owner_id = ? AND namespace = ? AND deleted_at IS NULL`
    ).get(String(ownerType), String(ownerId), String(namespace));
    sql.prepare(`
        INSERT INTO media_usage (owner_type, owner_id, namespace, total_bytes, hot_bytes, warm_bytes, cold_bytes, file_count, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(owner_type, owner_id, namespace) DO UPDATE SET
            total_bytes = excluded.total_bytes,
            hot_bytes   = excluded.hot_bytes,
            warm_bytes  = excluded.warm_bytes,
            cold_bytes  = excluded.cold_bytes,
            file_count  = excluded.file_count,
            updated_at  = CURRENT_TIMESTAMP
    `).run(
        String(ownerType), String(ownerId), String(namespace),
        row.total_bytes, row.hot_bytes, row.warm_bytes, row.cold_bytes, row.file_count
    );
    return row;
}

function setQuota({ ownerType, ownerId, namespace, max_storage_bytes, max_upload_bytes, max_file_count, allowed_mime_prefixes, allowed_types, unlimited }) {
    db.get().prepare(`
        INSERT INTO media_quotas (owner_type, owner_id, namespace,
            max_storage_bytes, max_upload_bytes, max_file_count,
            allowed_mime_prefixes_json, allowed_types_json, unlimited)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_type, owner_id, namespace) DO UPDATE SET
            max_storage_bytes = excluded.max_storage_bytes,
            max_upload_bytes  = excluded.max_upload_bytes,
            max_file_count    = excluded.max_file_count,
            allowed_mime_prefixes_json = excluded.allowed_mime_prefixes_json,
            allowed_types_json = excluded.allowed_types_json,
            unlimited         = excluded.unlimited,
            updated_at        = CURRENT_TIMESTAMP
    `).run(
        String(ownerType), String(ownerId), String(namespace),
        max_storage_bytes || 0, max_upload_bytes || 0, max_file_count || 0,
        JSON.stringify(allowed_mime_prefixes || []),
        JSON.stringify(allowed_types || []),
        unlimited ? 1 : 0,
    );
    return getQuota(ownerType, ownerId, namespace);
}

module.exports = { getQuota, getUsage, checkUpload, recomputeUsage, setQuota };
