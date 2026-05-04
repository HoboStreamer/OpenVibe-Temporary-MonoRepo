'use strict';

// openvibe-tips — REST + webhook routes.

const express  = require('express');
const { randomUUID } = require('crypto');
const model      = require('./model');
const policy     = require('./policy');
const connectors = require('./connectors');
const { renderOverlay } = require('./overlay');

function buildRouter({ eventBus, config }) {
    const r    = express.Router();
    const json = express.json({ limit: '512kb' });

    function actorMeta(req) {
        const a = policy.actorOfReq(req);
        return { actor_type: a.type, actor_id: a.id };
    }
    function denied(res, err) {
        return res.status(err.status || 403).json({ error: err.message, reason: err.reason || null });
    }
    function err500(res, err) {
        console.error('[tips] error:', err && err.stack || err);
        return res.status(500).json({ error: 'internal error' });
    }

    // ── Health ────────────────────────────────────────────────────────────
    r.get('/_ping', (_req, res) => res.json({ ok: true, service: 'openvibe-tips' }));

    // ── Connector types ───────────────────────────────────────────────────
    r.get('/connectors', (_req, res) => {
        res.json({ connectors: connectors.listConnectorTypes() });
    });

    // ── Creators ──────────────────────────────────────────────────────────
    r.get('/creators', (req, res) => {
        try {
            const status = req.query.status || 'active';
            const limit  = Math.min(Number(req.query.limit) || 50, 200);
            res.json({ creators: model.listCreators({ status, limit }) });
        } catch (e) { return err500(res, e); }
    });

    r.get('/creators/:slug', (req, res) => {
        try {
            const creator = model.getCreatorBySlug(req.params.slug)
                || model.getCreatorById(req.params.slug);
            if (!creator) return res.status(404).json({ error: 'creator not found' });
            const conns = model.listConnectors(creator.id);
            const recentTips = model.listTipEvents({ creator_id: creator.id, limit: 20 });
            res.json({ creator, connectors: conns, recent_tips: recentTips });
        } catch (e) { return err500(res, e); }
    });

    r.post('/creators', json, (req, res) => {
        try {
            const body = req.body || {};
            if (!body.slug || !body.display_name) {
                return res.status(400).json({ error: 'slug and display_name required' });
            }
            // Validate slug
            if (!/^[a-z0-9_-]{2,48}$/i.test(body.slug)) {
                return res.status(400).json({ error: 'slug must be 2-48 alphanumeric/dash/underscore characters' });
            }
            // Check ownership — only creator owner or service actor may create
            const actor = policy.actorOfReq(req);
            const existing = model.getCreatorBySlug(body.slug);
            try { policy.assert(policy.decideManageCreator({ req, creator: existing }), actorMeta(req)); }
            catch (e) { return denied(res, e); }

            const userId = body.user_id || (actor.type === 'user' ? actor.id : 'service:' + config.serviceId);
            const creator = model.upsertCreator({
                id:             existing ? existing.id : body.id || null,
                user_id:        userId,
                slug:           body.slug,
                display_name:   body.display_name,
                bio:            body.bio || null,
                avatar_url:     body.avatar_url || null,
                accent_color:   body.accent_color || '#f59e0b',
                currency:       body.currency || 'USD',
                native_enabled: body.native_enabled !== false,
                custom_amounts: body.custom_amounts ? JSON.stringify(body.custom_amounts) : '[1,5,10,25]',
                min_amount:     body.min_amount || 100,
                status:         'active',
                metadata_json:  body.metadata_json ? JSON.stringify(body.metadata_json) : '{}',
            });
            res.status(existing ? 200 : 201).json({ creator });
        } catch (e) {
            if (e.message && e.message.includes('UNIQUE')) {
                return res.status(409).json({ error: 'slug already taken' });
            }
            return err500(res, e);
        }
    });

    // ── Connectors ────────────────────────────────────────────────────────
    r.get('/creators/:slug/connectors', (req, res) => {
        try {
            const creator = model.getCreatorBySlug(req.params.slug);
            if (!creator) return res.status(404).json({ error: 'creator not found' });
            try { policy.assert(policy.decideManageConnector({ req, creator }), actorMeta(req)); }
            catch (e) { return denied(res, e); }
            res.json({ connectors: model.listConnectors(creator.id) });
        } catch (e) { return err500(res, e); }
    });

    r.post('/creators/:slug/connectors', json, (req, res) => {
        try {
            const creator = model.getCreatorBySlug(req.params.slug);
            if (!creator) return res.status(404).json({ error: 'creator not found' });
            try { policy.assert(policy.decideManageConnector({ req, creator }), actorMeta(req)); }
            catch (e) { return denied(res, e); }

            const body = req.body || {};
            if (!body.connector_type) return res.status(400).json({ error: 'connector_type required' });
            if (!connectors.getConnector(body.connector_type)) {
                return res.status(400).json({ error: `unknown connector_type '${body.connector_type}'. Available: ${connectors.listConnectorTypes().map(c => c.type).join(', ')}` });
            }

            const conn = model.upsertConnector({
                creator_id:     creator.id,
                connector_type: body.connector_type,
                label:          body.label || null,
                config_json:    body.config ? JSON.stringify(body.config) : '{}',
                status:         'active',
            });
            res.status(201).json({ connector: conn });
        } catch (e) { return err500(res, e); }
    });

    // ── Webhook tokens ────────────────────────────────────────────────────
    r.post('/creators/:slug/webhook-tokens', json, (req, res) => {
        try {
            const creator = model.getCreatorBySlug(req.params.slug);
            if (!creator) return res.status(404).json({ error: 'creator not found' });
            try { policy.assert(policy.decideManageCreator({ req, creator }), actorMeta(req)); }
            catch (e) { return denied(res, e); }
            const tok = model.createWebhookToken({ creator_id: creator.id, label: (req.body || {}).label || null });
            // Return the full token only on creation — it won't be shown again
            const baseUrl = String(config.publicBaseUrl || '').replace(/\/$/, '');
            res.status(201).json({
                token: tok,
                webhook_urls: {
                    streamlabs:     `${baseUrl}/webhooks/streamlabs/${tok.token}`,
                    streamelements: `${baseUrl}/webhooks/streamelements/${tok.token}`,
                    powerchat:      `${baseUrl}/webhooks/powerchat/${tok.token}`,
                    generic:        `${baseUrl}/webhooks/generic/${tok.token}`,
                },
            });
        } catch (e) { return err500(res, e); }
    });

    r.get('/creators/:slug/webhook-tokens', (req, res) => {
        try {
            const creator = model.getCreatorBySlug(req.params.slug);
            if (!creator) return res.status(404).json({ error: 'creator not found' });
            try { policy.assert(policy.decideManageCreator({ req, creator }), actorMeta(req)); }
            catch (e) { return denied(res, e); }
            res.json({ tokens: model.listWebhookTokens(creator.id) });
        } catch (e) { return err500(res, e); }
    });

    // ── Native tip submission ─────────────────────────────────────────────
    r.post('/tip', json, (req, res) => {
        try {
            try { policy.assert(policy.decideSendTip({ req }), actorMeta(req)); }
            catch (e) { return denied(res, e); }

            const body = req.body || {};
            if (!body.creator_id && !body.creator_slug) {
                return res.status(400).json({ error: 'creator_id or creator_slug required' });
            }
            const creator = body.creator_id
                ? model.getCreatorById(body.creator_id)
                : model.getCreatorBySlug(body.creator_slug);
            if (!creator) return res.status(404).json({ error: 'creator not found' });
            if (creator.status !== 'active') return res.status(422).json({ error: 'creator not accepting tips' });
            if (!creator.native_enabled) return res.status(422).json({ error: 'native tips disabled for this creator' });

            const actor   = policy.actorOfReq(req);
            const amountMinor = Number(body.amount_minor) || 0;
            if (amountMinor < (creator.min_amount || 100)) {
                return res.status(400).json({ error: `minimum tip amount is ${creator.min_amount || 100} minor units` });
            }

            const event = model.insertTipEvent({
                creator_id:      creator.id,
                connector_id:    null,
                source:          'native',
                event_type:      'tip',
                sender:          body.sender || (actor.type === 'user' ? actor.id : null),
                amount_value:    String((amountMinor / 100).toFixed(2)),
                amount_currency: body.currency || creator.currency || 'USD',
                amount_minor:    amountMinor,
                message:         body.message ? String(body.message).slice(0, 512) : null,
                is_anonymous:    body.is_anonymous ? 1 : 0,
                visibility:      body.visibility || 'public',
                external_id:     null,
                raw_json:        JSON.stringify(body),
            });

            // Fire event to bus (best-effort)
            if (eventBus) {
                eventBus.publishTipEvent({
                    creator_id:   creator.id,
                    creator_slug: creator.slug,
                    ...event,
                }).catch(() => {});
            }

            res.status(201).json({ event });
        } catch (e) { return err500(res, e); }
    });

    // ── Feed ──────────────────────────────────────────────────────────────
    r.get('/feed', (req, res) => {
        try {
            const creator_id = req.query.creator_id || null;
            const source     = req.query.source     || null;
            const limit      = Math.min(Number(req.query.limit) || 50, 200);
            const before     = req.query.before     || null;
            const events = model.listTipEvents({ creator_id, source, limit, before });
            res.json({ events });
        } catch (e) { return err500(res, e); }
    });

    // ── Admin ─────────────────────────────────────────────────────────────
    r.get('/admin/summary', (req, res) => {
        try {
            try { policy.assert(policy.decideAdminAction({ req }), actorMeta(req)); }
            catch (e) { return denied(res, e); }
            const creators = model.listCreators({ limit: 1000 });
            const events   = model.listTipEvents({ limit: 100 });
            res.json({
                creator_count: creators.length,
                recent_events: events.length,
                connectors:    connectors.listConnectorTypes().map(c => c.type),
            });
        } catch (e) { return err500(res, e); }
    });

    return r;
}

// ── Webhook routes (separate router — no serviceActorMiddleware) ──────────────
function buildWebhookRouter({ eventBus }) {
    const r    = express.Router();
    const json = express.json({ limit: '512kb' });

    function handleWebhook(connectorType) {
        return [json, (req, res) => {
            const token = req.params.token;
            if (!token) return res.status(401).json({ error: 'missing token' });

            const tokenRow = model.getWebhookToken(token);
            if (!tokenRow) return res.status(401).json({ error: 'invalid token' });

            const creator = model.getCreatorById(tokenRow.creator_id);
            if (!creator) return res.status(404).json({ error: 'creator not found' });

            const connector = connectors.getConnector(connectorType);
            if (!connector) return res.status(400).json({ error: `unsupported connector: ${connectorType}` });

            // Get or create connector record
            let connRecord = model.getConnectorByType(creator.id, connector.name());
            if (!connRecord) {
                connRecord = model.upsertConnector({
                    creator_id:     creator.id,
                    connector_type: connector.name(),
                    label:          connector.label(),
                    config_json:    '{}',
                    status:         'active',
                });
            }

            const body = req.body || {};
            const events = connector.normalise(body, {
                creator_id:   creator.id,
                connector_id: connRecord.id,
                config_json:  connRecord.config_json,
            });

            const saved = [];
            for (const ev of events) {
                try {
                    const inserted = model.insertTipEvent(ev);
                    if (inserted) {
                        saved.push(inserted);
                        if (eventBus) {
                            eventBus.publishTipEvent({
                                creator_id:   creator.id,
                                creator_slug: creator.slug,
                                ...inserted,
                            }).catch(() => {});
                        }
                    }
                } catch { /* duplicate external_id → skip */ }
            }
            if (connRecord && saved.length > 0) {
                model.touchConnector(connRecord.id, saved.length);
            }

            res.json({ ok: true, received: events.length, saved: saved.length });
        }];
    }

    r.post('/streamlabs/:token',     handleWebhook('streamlabs'));
    r.post('/streamelements/:token', handleWebhook('streamelements'));
    r.post('/powerchat/:token',      handleWebhook('powerchat'));
    r.post('/generic/:token',        handleWebhook('generic'));
    // Accept any connector type via /:type/:token pattern
    r.post('/:connectorType/:token', handleWebhook('generic')); // fallback → generic normaliser

    return r;
}

// ── Overlay route ──────────────────────────────────────────────────────────────
function buildOverlayRouter({ config }) {
    const r = express.Router();
    r.get('/:slug', (req, res) => {
        try {
            const creator = model.getCreatorBySlug(req.params.slug);
            if (!creator) return res.status(404).send('Creator not found');
            const recentTips = model.listTipEvents({ creator_id: creator.id, limit: 20 });
            res.type('html').send(renderOverlay(creator, recentTips, config));
        } catch (e) {
            console.error('[tips/overlay] error:', e.message);
            res.status(500).send('Overlay error');
        }
    });
    return r;
}

module.exports = { buildRouter, buildWebhookRouter, buildOverlayRouter };
