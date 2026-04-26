'use strict';

// openvibe-network — URL registry surface.
//
// We do NOT replace the hobo-tools URL registry. Instead this endpoint
// returns the federated view:
//   1. fetch the legacy hobo-tools resolved registry (when configured)
//   2. overlay any OpenVibe-specific keys stored in url_registry_overlay
//   3. return the merged map plus the OpenVibe surface URLs
//
// Consumers (HoboStreamer, future OpenVibe services) get a single endpoint
// that always works, even when hobo-tools is offline (fallback to env+overlay).

const express = require('express');
const db = require('../db');
const policy = require('../policy');

function buildRouter(deps) {
    const r = express.Router();
    const { config } = deps;

    r.get('/url-registry/resolved', async (_req, res) => {
        const merged = {};

        // Legacy hobo-tools (best-effort, never fatal)
        if (config.hoboTools.internalUrl) {
            try {
                const url = `${config.hoboTools.internalUrl}/internal/url-registry/resolved`;
                const upstream = await fetch(url, {
                    headers: { 'X-Internal-Key': config.internalKey, 'Accept': 'application/json' },
                });
                if (upstream.ok) {
                    const body = await upstream.json();
                    if (body && body.registry && typeof body.registry === 'object') {
                        for (const [k, v] of Object.entries(body.registry)) {
                            merged[k] = (v && typeof v === 'object' && 'value' in v)
                                ? { value: v.value, source: v.source || 'hobo-tools' }
                                : { value: v, source: 'hobo-tools' };
                        }
                    }
                } else {
                    console.warn(`[url-registry] hobo-tools fetch returned ${upstream.status}`);
                }
            } catch (err) {
                console.warn(`[url-registry] hobo-tools fetch failed: ${err.message}`);
            }
        }

        // OpenVibe surface URLs (always present so consumers can find us)
        const surfaceMap = {
            OPENVIBE_NETWORK_URL: config.surfaces.network,
            OPENVIBE_AUTH_URL:    config.surfaces.auth,
            OPENVIBE_API_URL:     config.surfaces.api,
            OPENVIBE_ADMIN_URL:   config.surfaces.admin,
            OPENVIBE_MY_URL:      config.surfaces.my,
            OPENVIBE_THEMES_URL:  config.surfaces.themes,
            OPENVIBE_EVENTS_URL:  config.events.url,
            OPENVIBE_MEDIA_URL:            config.media && config.media.url,
            OPENVIBE_MEDIA_INTERNAL_URL:   config.media && config.media.internalUrl,
            OPENVIBE_LIVE_URL:             config.live && config.live.url,
            OPENVIBE_LIVE_INTERNAL_URL:    config.live && config.live.internalUrl,
            OPENRE_STREAM_URL:             config.restream && config.restream.url,
            OPENRE_STREAM_INTERNAL_URL:    config.restream && config.restream.internalUrl,
            OPENVIBE_CHAT_URL:             config.chat && config.chat.url,
            OPENVIBE_CHAT_INTERNAL_URL:    config.chat && config.chat.internalUrl,
            OPENVIBE_COMMUNITY_URL:        config.community && config.community.url,
            OPENVIBE_COMMUNITY_INTERNAL_URL: config.community && config.community.internalUrl,
            OPENVIBE_BILLING_URL:          config.billing && config.billing.url,
            OPENVIBE_BILLING_INTERNAL_URL: config.billing && config.billing.internalUrl,
            OPENVIBE_AI_URL:               config.ai && config.ai.url,
            OPENVIBE_AI_INTERNAL_URL:      config.ai && config.ai.internalUrl,
            AI_OPENVIBE_NETWORK_HOST:      config.ai && config.ai.canonicalHost,
        };
        for (const [k, v] of Object.entries(surfaceMap)) {
            if (v) merged[k] = { value: v, source: 'openvibe-config' };
        }

        // Overlay (admin-set OpenVibe-only keys)
        const rows = db.get().prepare(`SELECT key, value FROM url_registry_overlay`).all();
        for (const row of rows) {
            merged[row.key] = { value: row.value, source: 'openvibe-overlay' };
        }

        res.json({ registry: merged });
    });

    r.put('/url-registry/overlay/:key', express.json(), (req, res) => {
        const a = policy.actorOfReq(req);
        try {
            policy.assert(policy.decideRegistryWrite({ req, registry: 'url_registry_overlay' }),
                { actorType: a.type, actorId: a.id, action: 'set', resource: `url_overlay:${req.params.key}` });
        } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
        }
        const key = String(req.params.key);
        const value = req.body && 'value' in req.body ? String(req.body.value) : null;
        const description = req.body && req.body.description || null;
        db.get().prepare(`
            INSERT INTO url_registry_overlay (key, value, description, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = excluded.description, updated_at = CURRENT_TIMESTAMP
        `).run(key, value, description);
        res.json({ ok: true, key, value });
    });

    return r;
}

module.exports = { buildRouter };
