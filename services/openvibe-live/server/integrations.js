'use strict';

// openvibe-live — Phase 16 product integrations.
//
// Each integration is a per-channel or per-stream descriptor pointing at a
// downstream product surface (chat-room, tips, vip, audio-overlay, ai-assist).
// The "ensure" path is best-effort: it materializes a row in
// live_stream_integrations and probes the downstream URL. When the URL is
// unconfigured or the probe fails, the record is stored with
// status='unavailable' and a truthful detail string. We never throw from a
// probe failure; consumers see status truthfully.

const crypto = require('crypto');
const db = require('./db');

const TARGET_KINDS = new Set(['chat-room', 'tips', 'vip', 'audio-overlay', 'ai-assist']);
const TERMINAL_STATUSES = new Set(['delivered', 'queued_local', 'unavailable', 'failed']);

function newId() {
    return `lsi_${crypto.randomBytes(10).toString('hex')}`;
}

function parseJson(value) {
    if (!value) return {};
    try { return JSON.parse(value); } catch { return {}; }
}

function hydrate(row) {
    if (!row) return null;
    return {
        id: row.id,
        owner_kind: row.owner_kind,
        owner_ref: row.owner_ref,
        channel_slug: row.channel_slug || null,
        target_kind: row.target_kind,
        target_url: row.target_url || null,
        status: row.status,
        detail: row.detail || null,
        metadata: parseJson(row.metadata_json),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function getIntegration({ owner_kind, owner_ref, target_kind }) {
    const row = db.get().prepare(
        'SELECT * FROM live_stream_integrations WHERE owner_kind = ? AND owner_ref = ? AND target_kind = ?'
    ).get(String(owner_kind), String(owner_ref), String(target_kind));
    return hydrate(row);
}

function listIntegrationsForChannel(slug) {
    const rows = db.get().prepare(
        'SELECT * FROM live_stream_integrations WHERE owner_kind = \'channel\' AND owner_ref = ? ORDER BY target_kind ASC'
    ).all(String(slug));
    return rows.map(hydrate);
}

function listIntegrationsForStream(streamId) {
    const rows = db.get().prepare(
        'SELECT * FROM live_stream_integrations WHERE owner_kind = \'stream\' AND owner_ref = ? ORDER BY target_kind ASC'
    ).all(String(streamId));
    return rows.map(hydrate);
}

function listIntegrationsByStatus({ status, limit }) {
    const cap = Math.min(Number(limit) || 100, 500);
    const rows = db.get().prepare(
        'SELECT * FROM live_stream_integrations WHERE status = ? ORDER BY updated_at DESC LIMIT ?'
    ).all(String(status), cap);
    return rows.map(hydrate);
}

function summary() {
    const rows = db.get().prepare(
        'SELECT target_kind, status, COUNT(*) AS n FROM live_stream_integrations GROUP BY target_kind, status'
    ).all();
    const total = { delivered: 0, queued_local: 0, unavailable: 0, failed: 0 };
    const byKind = {};
    for (const row of rows) {
        const tk = row.target_kind;
        if (!byKind[tk]) byKind[tk] = { delivered: 0, queued_local: 0, unavailable: 0, failed: 0 };
        if (row.status in byKind[tk]) byKind[tk][row.status] = row.n;
        if (row.status in total) total[row.status] += row.n;
    }
    return { total, by_target_kind: byKind };
}

function upsertIntegration({ owner_kind, owner_ref, channel_slug, target_kind, target_url, status, detail, metadata }) {
    if (!TARGET_KINDS.has(target_kind)) {
        throw new Error(`unsupported target_kind: ${target_kind}`);
    }
    if (!TERMINAL_STATUSES.has(status)) {
        throw new Error(`unsupported status: ${status}`);
    }
    const existing = getIntegration({ owner_kind, owner_ref, target_kind });
    const id = existing ? existing.id : newId();
    db.get().prepare(`
        INSERT INTO live_stream_integrations (
            id, owner_kind, owner_ref, channel_slug, target_kind,
            target_url, status, detail, metadata_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (owner_kind, owner_ref, target_kind) DO UPDATE SET
            channel_slug = excluded.channel_slug,
            target_url = excluded.target_url,
            status = excluded.status,
            detail = excluded.detail,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        id,
        String(owner_kind),
        String(owner_ref),
        channel_slug ? String(channel_slug) : null,
        String(target_kind),
        target_url ? String(target_url) : null,
        String(status),
        detail ? String(detail) : null,
        JSON.stringify(metadata || {}),
    );
    return getIntegration({ owner_kind, owner_ref, target_kind });
}

// Compute the canonical downstream URL for a given (target_kind, owner_kind,
// owner_ref) tuple given the configured services map. Returns null when the
// downstream service URL is not configured.
function describeTarget({ target_kind, owner_kind, owner_ref, channel_slug, services }) {
    const svc = services || {};
    const ownerType = owner_kind === 'channel' ? 'channel' : 'live_stream';
    const ownerId = owner_ref;
    switch (target_kind) {
        case 'chat-room':
            if (!svc.chat) return { target_url: null, base_url: null };
            return {
                base_url: svc.chat,
                target_url: `${svc.chat}/api/v1/stream-bindings/${encodeURIComponent(ownerId)}?stream_ref_type=${encodeURIComponent(owner_kind === 'channel' ? 'live_channel' : 'live_stream')}`,
            };
        case 'tips':
            if (!svc.billing) return { target_url: null, base_url: null };
            return {
                base_url: svc.billing,
                target_url: `${svc.billing}/api/tips/overlay/${encodeURIComponent(ownerType)}/${encodeURIComponent(ownerId)}`,
            };
        case 'vip':
            if (!svc.billing) return { target_url: null, base_url: null };
            return {
                base_url: svc.billing,
                target_url: `${svc.billing}/api/vip/plans?owner_type=${encodeURIComponent(ownerType)}&owner_id=${encodeURIComponent(ownerId)}`,
            };
        case 'audio-overlay':
            if (!svc.chat) return { target_url: null, base_url: null };
            return {
                base_url: svc.chat,
                target_url: `${svc.chat}/api/v1/audio/overlay/${encodeURIComponent(ownerType)}/${encodeURIComponent(ownerId)}?queue_type=tts`,
            };
        case 'ai-assist':
            if (!svc.ai) return { target_url: null, base_url: null };
            return {
                base_url: svc.ai,
                target_url: `${svc.ai}/api/v1/ai/product/status`,
            };
        default:
            return { target_url: null, base_url: null };
    }
}

// Best-effort probe: HEAD request, 1500ms timeout. Returns
// {status, detail} where status is one of TERMINAL_STATUSES. Never throws.
async function probeTarget({ base_url }) {
    if (!base_url) return { status: 'unavailable', detail: 'downstream_url_not_configured' };
    const probeUrl = `${base_url}/healthz`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
        const response = await fetch(probeUrl, { method: 'GET', signal: controller.signal });
        clearTimeout(timer);
        if (response.ok) return { status: 'delivered', detail: `probe ${response.status}` };
        return { status: 'failed', detail: `probe ${response.status}` };
    } catch (error) {
        clearTimeout(timer);
        return { status: 'unavailable', detail: `probe_error: ${error.name || 'Error'}` };
    }
}

async function ensureIntegration({ owner_kind, owner_ref, channel_slug, target_kind, services, metadata }) {
    if (!TARGET_KINDS.has(target_kind)) {
        const error = new Error(`unsupported target_kind: ${target_kind}`);
        error.code = 'unsupported_target_kind';
        throw error;
    }
    const target = describeTarget({ target_kind, owner_kind, owner_ref, channel_slug, services });
    let outcome;
    if (!target.base_url) {
        outcome = { status: 'unavailable', detail: 'downstream_url_not_configured' };
    } else if (typeof fetch !== 'function') {
        outcome = { status: 'unavailable', detail: 'fetch_unavailable' };
    } else {
        outcome = await probeTarget({ base_url: target.base_url });
    }
    return upsertIntegration({
        owner_kind,
        owner_ref,
        channel_slug,
        target_kind,
        target_url: target.target_url,
        status: outcome.status,
        detail: outcome.detail,
        metadata: Object.assign({ base_url: target.base_url || null }, metadata || {}),
    });
}

module.exports = {
    TARGET_KINDS,
    TERMINAL_STATUSES,
    getIntegration,
    listIntegrationsForChannel,
    listIntegrationsForStream,
    listIntegrationsByStatus,
    upsertIntegration,
    ensureIntegration,
    describeTarget,
    summary,
};
