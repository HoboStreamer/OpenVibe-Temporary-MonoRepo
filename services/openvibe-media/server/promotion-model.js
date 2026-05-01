'use strict';

const db = require('./db');

function safeJson(value, fallbackValue) {
    try {
        return JSON.parse(value || 'null') || fallbackValue;
    } catch {
        return fallbackValue;
    }
}

function hydrateDecision(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        media_id: row.media_id,
        decision: row.decision,
        from_provider: row.from_provider,
        to_provider: row.to_provider,
        reason: row.reason,
        score: Number(row.score || 0),
        metrics: safeJson(row.metrics_json, {}),
        state: row.state,
        created_at: row.created_at,
        applied_at: row.applied_at || null,
    };
}

function hydrateHold(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        media_id: row.media_id,
        object_key: row.object_key || null,
        hold_type: row.hold_type,
        reason: row.reason,
        reference_id: row.reference_id || null,
        expires_at: row.expires_at || null,
        created_at: row.created_at,
    };
}

function createPromotionDecision(input) {
    const source = input || {};
    const result = db.get().prepare(`
        INSERT INTO media_promotion_decisions (
            media_id, decision, from_provider, to_provider, reason, score, metrics_json, state
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        String(source.mediaId),
        String(source.decision || 'promote'),
        source.fromProvider || null,
        source.toProvider || null,
        String(source.reason || 'unspecified'),
        Number(source.score || 0),
        JSON.stringify(source.metrics || {}),
        String(source.state || 'queued'),
    );
    return getPromotionDecisionById(result.lastInsertRowid);
}

function getPromotionDecisionById(id) {
    return hydrateDecision(db.get().prepare(`
        SELECT * FROM media_promotion_decisions WHERE id = ?
    `).get(Number(id)));
}

function getLatestPromotionDecision(mediaId) {
    return hydrateDecision(db.get().prepare(`
        SELECT * FROM media_promotion_decisions WHERE media_id = ? ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(String(mediaId)));
}

function listPromotionDecisions(filters) {
    const source = filters || {};
    const where = [];
    const args = [];
    if (source.mediaId) {
        where.push('media_id = ?');
        args.push(String(source.mediaId));
    }
    if (source.state) {
        where.push('state = ?');
        args.push(String(source.state));
    }
    const limit = Math.min(Math.max(Number(source.limit) || 100, 1), 500);
    const sql = where.length
        ? `SELECT * FROM media_promotion_decisions WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`
        : `SELECT * FROM media_promotion_decisions ORDER BY created_at DESC, id DESC LIMIT ?`;
    return db.get().prepare(sql).all(...args, limit).map(hydrateDecision);
}

function updatePromotionDecision(id, patch) {
    const current = getPromotionDecisionById(id);
    if (!current) return null;
    const next = Object.assign({}, current, patch || {});
    db.get().prepare(`
        UPDATE media_promotion_decisions SET
            decision = ?,
            from_provider = ?,
            to_provider = ?,
            reason = ?,
            score = ?,
            metrics_json = ?,
            state = ?,
            applied_at = ?
        WHERE id = ?
    `).run(
        String(next.decision || 'promote'),
        next.from_provider || null,
        next.to_provider || null,
        String(next.reason || 'unspecified'),
        Number(next.score || 0),
        JSON.stringify(next.metrics || {}),
        String(next.state || 'queued'),
        next.applied_at || null,
        Number(id),
    );
    return getPromotionDecisionById(id);
}

function markPromotionDecisionApplied(id, state) {
    return updatePromotionDecision(id, {
        state: state || 'applied',
        applied_at: new Date().toISOString(),
    });
}

function createRetentionHold(input) {
    const source = input || {};
    const result = db.get().prepare(`
        INSERT INTO media_retention_holds (
            media_id, object_key, hold_type, reason, reference_id, expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        String(source.mediaId),
        source.objectKey || null,
        String(source.holdType || 'manual'),
        String(source.reason || 'retention hold'),
        source.referenceId || null,
        source.expiresAt || null,
    );
    return getRetentionHoldById(result.lastInsertRowid);
}

function getRetentionHoldById(id) {
    return hydrateHold(db.get().prepare(`
        SELECT * FROM media_retention_holds WHERE id = ?
    `).get(Number(id)));
}

function listRetentionHolds(filters) {
    const source = filters || {};
    const where = [];
    const args = [];
    if (source.mediaId) {
        where.push('media_id = ?');
        args.push(String(source.mediaId));
    }
    if (source.referenceId) {
        where.push('reference_id = ?');
        args.push(String(source.referenceId));
    }
    if (source.objectKey) {
        where.push('object_key = ?');
        args.push(String(source.objectKey));
    }
    if (source.activeOnly !== false) {
        where.push('(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)');
    }
    const limit = Math.min(Math.max(Number(source.limit) || 200, 1), 500);
    const sql = where.length
        ? `SELECT * FROM media_retention_holds WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`
        : `SELECT * FROM media_retention_holds ORDER BY created_at DESC, id DESC LIMIT ?`;
    return db.get().prepare(sql).all(...args, limit).map(hydrateHold);
}

function hasActiveRetentionHold(input) {
    return listRetentionHolds(Object.assign({}, input || {}, { limit: 1, activeOnly: true })).length > 0;
}

function releaseRetentionHoldsByReference(referenceId, holdType) {
    const where = ['reference_id = ?'];
    const args = [String(referenceId)];
    if (holdType) {
        where.push('hold_type = ?');
        args.push(String(holdType));
    }
    db.get().prepare(`
        UPDATE media_retention_holds
        SET expires_at = CURRENT_TIMESTAMP
        WHERE ${where.join(' AND ')}
    `).run(...args);
    return listRetentionHolds({ referenceId, activeOnly: false });
}

module.exports = {
    createPromotionDecision,
    createRetentionHold,
    getLatestPromotionDecision,
    getPromotionDecisionById,
    getRetentionHoldById,
    hasActiveRetentionHold,
    listPromotionDecisions,
    listRetentionHolds,
    markPromotionDecisionApplied,
    releaseRetentionHoldsByReference,
    updatePromotionDecision,
};
