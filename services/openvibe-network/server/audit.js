'use strict';

// openvibe-network — audit log helper. Every mutating route writes one row.

const db = require('./db');

function record({ actorType, actorId, action, resource, outcome, detail }) {
    try {
        db.get().prepare(`
            INSERT INTO audit_log (actor_type, actor_id, action, resource, outcome, detail_json)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            actorType || null,
            actorId != null ? String(actorId) : null,
            String(action || 'unknown'),
            String(resource || ''),
            String(outcome || 'allow'),
            detail != null ? JSON.stringify(detail) : null
        );
    } catch (err) {
        console.warn(`[Audit] failed to record ${action} on ${resource}: ${err.message}`);
    }
}

function recent({ limit = 50 } = {}) {
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    return db.get().prepare(
        `SELECT id, actor_type, actor_id, action, resource, outcome, detail_json, recorded_at
         FROM audit_log ORDER BY id DESC LIMIT ?`
    ).all(cap).map(r => ({
        ...r,
        detail: r.detail_json ? safeParse(r.detail_json) : null,
    }));
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

module.exports = { record, recent };
