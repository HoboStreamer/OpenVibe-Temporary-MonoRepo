'use strict';

const crypto = require('crypto');

const db = require('./db');

function safeJson(value, fallbackValue) {
    try {
        return JSON.parse(value || 'null') || fallbackValue;
    } catch {
        return fallbackValue;
    }
}

function hydrateLocation(row) {
    if (!row) return null;
    return {
        id: row.id,
        media_id: row.media_id,
        provider_name: row.provider_name,
        role: row.role,
        storage_key: row.storage_key,
        bucket: row.bucket,
        endpoint: row.endpoint,
        region: row.region,
        public_url: row.public_url,
        signed_url_required: !!row.signed_url_required,
        checksum_sha256: row.checksum_sha256,
        size_bytes: row.size_bytes,
        status: row.status,
        metadata: safeJson(row.metadata_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateSizeViolation(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        media_id: row.media_id,
        violation_type: row.violation_type,
        detail: safeJson(row.detail_json, {}),
        created_at: row.created_at,
    };
}

function hydrateUploadSession(row) {
    if (!row) return null;
    return {
        id: row.id,
        media_id: row.media_id,
        owner_type: row.owner_type,
        owner_id: row.owner_id,
        namespace: row.namespace,
        provider_name: row.provider_name,
        storage_key: row.storage_key,
        upload_mode: row.upload_mode,
        status: row.status,
        token: row.token,
        mime_type: row.mime_type,
        expected_size_bytes: row.expected_size_bytes,
        metadata: safeJson(row.metadata_json, {}),
        expires_at: row.expires_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateUploadPart(row) {
    if (!row) return null;
    return {
        id: row.id,
        upload_id: row.upload_id,
        part_number: row.part_number,
        etag: row.etag,
        size_bytes: row.size_bytes,
        status: row.status,
        token: row.token,
        metadata: safeJson(row.metadata_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function recordLocation(input) {
    const source = input || {};
    db.get().prepare(`
        INSERT INTO media_object_locations (
            media_id, provider_name, role, storage_key, bucket, endpoint, region,
            public_url, signed_url_required, checksum_sha256, size_bytes, status, metadata_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(media_id, provider_name, role, storage_key) DO UPDATE SET
            bucket = excluded.bucket,
            endpoint = excluded.endpoint,
            region = excluded.region,
            public_url = excluded.public_url,
            signed_url_required = excluded.signed_url_required,
            checksum_sha256 = excluded.checksum_sha256,
            size_bytes = excluded.size_bytes,
            status = excluded.status,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(source.mediaId),
        String(source.providerName),
        String(source.role || 'canonical'),
        String(source.storageKey),
        source.bucket || null,
        source.endpoint || null,
        source.region || null,
        source.publicUrl || null,
        source.signedUrlRequired ? 1 : 0,
        source.checksumSha256 || null,
        Number(source.sizeBytes || 0),
        source.status || 'active',
        JSON.stringify(source.metadata || {}),
    );
    return listLocations(source.mediaId).find((location) => {
        return location.provider_name === String(source.providerName)
            && location.role === String(source.role || 'canonical')
            && location.storage_key === String(source.storageKey);
    }) || null;
}

function getLocationById(id) {
    return hydrateLocation(db.get().prepare(`SELECT * FROM media_object_locations WHERE id = ?`).get(Number(id)));
}

function listLocations(mediaId, options) {
    const source = options || {};
    const where = ['media_id = ?'];
    const args = [String(mediaId)];
    if (source.role) {
        where.push('role = ?');
        args.push(String(source.role));
    }
    if (source.providerName) {
        where.push('provider_name = ?');
        args.push(String(source.providerName));
    }
    if (source.status) {
        where.push('status = ?');
        args.push(String(source.status));
    }
    const limit = source.limit ? `LIMIT ${Math.min(Math.max(Number(source.limit) || 1, 1), 500)}` : '';
    return db.get().prepare(`
        SELECT * FROM media_object_locations
        WHERE ${where.join(' AND ')}
        ORDER BY
            CASE role WHEN 'hot' THEN 0 WHEN 'canonical' THEN 1 WHEN 'asset-origin' THEN 2 ELSE 3 END,
            updated_at DESC,
            created_at DESC
        ${limit}
    `).all(...args).map(hydrateLocation);
}

function findLocation(mediaId, options) {
    return listLocations(mediaId, Object.assign({}, options || {}, { limit: 1 }))[0] || null;
}

function getPreferredLocation(mediaId, role) {
    return role
        ? findLocation(mediaId, { role, status: 'active' })
        : findLocation(mediaId, { status: 'active' });
}

function createUploadSession(input) {
    const source = input || {};
    const id = source.id || `upl_${crypto.randomUUID()}`;
    db.get().prepare(`
        INSERT INTO media_upload_sessions (
            id, media_id, owner_type, owner_id, namespace, provider_name, storage_key,
            upload_mode, status, token, mime_type, expected_size_bytes, metadata_json, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        String(source.mediaId),
        String(source.ownerType),
        String(source.ownerId),
        String(source.namespace),
        String(source.providerName),
        String(source.storageKey),
        String(source.uploadMode || 'multipart'),
        String(source.status || 'initialized'),
        source.token || null,
        source.mimeType || null,
        source.expectedSizeBytes != null ? Number(source.expectedSizeBytes) : null,
        JSON.stringify(source.metadata || {}),
        source.expiresAt || null,
    );
    return getUploadSession(id);
}

function getUploadSession(id) {
    return hydrateUploadSession(db.get().prepare(`SELECT * FROM media_upload_sessions WHERE id = ?`).get(String(id)));
}

function updateUploadSession(id, patch) {
    const current = getUploadSession(id);
    if (!current) return null;
    const next = Object.assign({}, current, patch || {});
    db.get().prepare(`
        UPDATE media_upload_sessions SET
            provider_name = ?,
            storage_key = ?,
            upload_mode = ?,
            status = ?,
            token = ?,
            mime_type = ?,
            expected_size_bytes = ?,
            metadata_json = ?,
            expires_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        String(next.provider_name),
        String(next.storage_key),
        String(next.upload_mode),
        String(next.status),
        next.token || null,
        next.mime_type || null,
        next.expected_size_bytes != null ? Number(next.expected_size_bytes) : null,
        JSON.stringify(next.metadata || {}),
        next.expires_at || null,
        String(id),
    );
    return getUploadSession(id);
}

function upsertUploadPart(input) {
    const source = input || {};
    db.get().prepare(`
        INSERT INTO media_upload_parts (upload_id, part_number, etag, size_bytes, status, token, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(upload_id, part_number) DO UPDATE SET
            etag = excluded.etag,
            size_bytes = excluded.size_bytes,
            status = excluded.status,
            token = excluded.token,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(source.uploadId),
        Number(source.partNumber),
        source.etag || null,
        Number(source.sizeBytes || 0),
        source.status || 'signed',
        source.token || null,
        JSON.stringify(source.metadata || {}),
    );
    return getUploadPart(source.uploadId, source.partNumber);
}

function getUploadPart(uploadId, partNumber) {
    return hydrateUploadPart(db.get().prepare(`SELECT * FROM media_upload_parts WHERE upload_id = ? AND part_number = ?`).get(String(uploadId), Number(partNumber)));
}

function listUploadParts(uploadId) {
    return db.get().prepare(`SELECT * FROM media_upload_parts WHERE upload_id = ? ORDER BY part_number ASC`).all(String(uploadId)).map(hydrateUploadPart);
}

function recordSizeViolation(input) {
    const source = input || {};
    db.get().prepare(`
        INSERT INTO media_size_violations (media_id, violation_type, detail_json)
        VALUES (?, ?, ?)
    `).run(String(source.mediaId), String(source.violationType), JSON.stringify(source.detail || {}));
}

function listSizeViolations(filters) {
    const source = filters || {};
    const where = [];
    const args = [];
    if (source.mediaId) {
        where.push('media_id = ?');
        args.push(String(source.mediaId));
    }
    if (source.violationType) {
        where.push('violation_type = ?');
        args.push(String(source.violationType));
    }
    const limit = Math.min(Math.max(Number(source.limit) || 100, 1), 500);
    const sql = where.length
        ? `SELECT * FROM media_size_violations WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`
        : `SELECT * FROM media_size_violations ORDER BY created_at DESC, id DESC LIMIT ?`;
    return db.get().prepare(sql).all(...args, limit).map(hydrateSizeViolation);
}

function markLocationStatus(locationId, status, metadataPatch) {
    const current = getLocationById(locationId);
    if (!current) return null;
    const metadata = Object.assign({}, current.metadata || {}, metadataPatch || {});
    db.get().prepare(`
        UPDATE media_object_locations SET
            status = ?,
            metadata_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(String(status), JSON.stringify(metadata), Number(locationId));
    return getLocationById(locationId);
}

function countLocations(filters) {
    const source = filters || {};
    const where = ['1 = 1'];
    const args = [];
    if (source.role) {
        where.push('role = ?');
        args.push(String(source.role));
    }
    if (source.providerName) {
        where.push('provider_name = ?');
        args.push(String(source.providerName));
    }
    if (source.status) {
        where.push('status = ?');
        args.push(String(source.status));
    }
    return Number(db.get().prepare(`SELECT COUNT(*) AS count FROM media_object_locations WHERE ${where.join(' AND ')}`).get(...args).count || 0);
}

module.exports = {
    createUploadSession,
    countLocations,
    findLocation,
    getLocationById,
    getPreferredLocation,
    getUploadPart,
    getUploadSession,
    listLocations,
    listSizeViolations,
    listUploadParts,
    markLocationStatus,
    recordLocation,
    recordSizeViolation,
    updateUploadSession,
    upsertUploadPart,
};