'use strict';

const express = require('express');

const { queueSearchReindex } = require('./search-indexer');
const {
    hostStatuses,
    renderRequest,
} = require('./ssr');

function asyncHandler(fn) {
    return function wrappedHandler(req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

function buildRouter({ config, contentStore }) {
    const router = express.Router();
    router.use(express.json({ limit: '512kb' }));

    function serviceActorId(req) {
        return typeof req.serviceActor === 'string'
            ? req.serviceActor
            : req.serviceActor && req.serviceActor.id || null;
    }

    router.get('/api/v1/content/status', asyncHandler(async (_req, res) => {
        res.json({
            service: config.serviceId,
            limits: config.limits,
            ai_url_configured: !!config.aiUrl,
            surfaces: hostStatuses(config),
            persistence: contentStore.describePersistence(),
            content_store: contentStore.getStatus(),
            counts: await contentStore.getCounts(),
        });
    }));

    router.get('/api/v1/content/hosts', (_req, res) => {
        res.json({ items: hostStatuses(config) });
    });

    router.get('/api/v1/content/sources', asyncHandler(async (req, res) => {
        res.json({ items: await contentStore.listSources(req.query || {}) });
    }));

    router.post('/api/v1/content/sources', asyncHandler(async (req, res) => {
        const source = await contentStore.createSource(req.body || {});
        res.status(201).json({ source });
    }));

    router.get('/api/v1/content/items', asyncHandler(async (req, res) => {
        res.json({ items: await contentStore.listItems(req.query || {}) });
    }));

    router.post('/api/v1/content/items', asyncHandler(async (req, res) => {
        const item = await contentStore.createItem(req.body || {});
        res.status(201).json({ item });
    }));

    router.get('/api/v1/content/search', asyncHandler(async (req, res) => {
        const searchQuery = req.query.q ? String(req.query.q) : '';
        res.json({ items: await contentStore.searchItems(searchQuery, req.query || {}) });
    }));

    router.get('/api/v1/content/items/:id', asyncHandler(async (req, res) => {
        const item = await contentStore.getItemById(req.params.id);
        if (!item) return res.status(404).json({ error: 'not found' });
        return res.json({ item });
    }));

    router.get('/api/v1/content/jobs', asyncHandler(async (req, res) => {
        res.json({ items: await contentStore.listJobs(req.query || {}) });
    }));

    router.post('/api/v1/content/jobs', asyncHandler(async (req, res) => {
        const job = await contentStore.queueJob(req.body || {});
        res.status(201).json({ job });
    }));

    router.post('/api/v1/internal/search/reindex', asyncHandler(async (req, res) => {
        if (!req.serviceActor) {
            return res.status(403).json({ error: 'internal service actor required' });
        }
        const serviceId = serviceActorId(req) || config.serviceId;
        const result = await queueSearchReindex({
            contentStore,
            requestedByService: serviceId,
        }, req.body || {});
        res.status(202).json(result);
    }));

    // ── Phase 16: review decisions + publish workflow ─────────────
    router.get('/api/v1/content/items/:id/reviews', asyncHandler(async (req, res) => {
        const item = await contentStore.getItemById(req.params.id);
        if (!item) return res.status(404).json({ error: 'not found' });
        const items = await contentStore.listReviewDecisions({ item_id: item.id, limit: req.query.limit });
        res.json({ items });
    }));

    router.post('/api/v1/content/items/:id/reviews', asyncHandler(async (req, res) => {
        if (!req.serviceActor) {
            return res.status(403).json({ error: 'internal service actor required' });
        }
        const item = await contentStore.getItemById(req.params.id);
        if (!item) return res.status(404).json({ error: 'not found' });
        const body = req.body || {};
        try {
            const decision = await contentStore.recordReviewDecision({
                item_id: item.id,
                decision: body.decision,
                to_state: body.to_state,
                reviewer_actor_type: body.reviewer_actor_type || 'service',
                reviewer_actor_id: body.reviewer_actor_id || serviceActorId(req),
                notes: body.notes,
                metadata: body.metadata,
            });
            res.status(201).json({ decision });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }));

    router.get('/api/v1/content/reviews', asyncHandler(async (req, res) => {
        res.json({ items: await contentStore.listReviewDecisions(req.query || {}) });
    }));

    // ── Phase 16: distribution audit ──────────────────────────────
    router.get('/api/v1/content/items/:id/distribution', asyncHandler(async (req, res) => {
        const item = await contentStore.getItemById(req.params.id);
        if (!item) return res.status(404).json({ error: 'not found' });
        res.json({ items: await contentStore.listDistributionAudit({ item_id: item.id, limit: req.query.limit }) });
    }));

    router.post('/api/v1/content/items/:id/distribution', asyncHandler(async (req, res) => {
        if (!req.serviceActor) {
            return res.status(403).json({ error: 'internal service actor required' });
        }
        const item = await contentStore.getItemById(req.params.id);
        if (!item) return res.status(404).json({ error: 'not found' });
        const body = req.body || {};
        try {
            const entry = await contentStore.recordDistributionAudit({
                item_id: item.id,
                surface: body.surface,
                channel: body.channel,
                outcome: body.outcome,
                actor_type: body.actor_type || 'service',
                actor_id: body.actor_id || serviceActorId(req),
                error_message: body.error_message,
                metadata: body.metadata,
            });
            res.status(201).json({ entry });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }));

    router.get('/api/v1/content/distribution', asyncHandler(async (req, res) => {
        res.json({ items: await contentStore.listDistributionAudit(req.query || {}) });
    }));

    // Phase 16 — content product status seam.
    router.get('/api/v1/content/product/status', asyncHandler(async (_req, res) => {
        res.json(Object.assign({ ok: true, product: 'content' }, await contentStore.getProductWorkflowStatus()));
    }));

    // Phase 16 — per-surface content listing helpers. The full content_items
    // table already filters by surface+kind+state; these endpoints just expose
    // that surface dimension explicitly so each product (wiki/blog/news/
    // reviews/deals/coupons/trade/host) has a stable per-surface route. Deeper
    // per-surface schemas (e.g. coupon redemption history, trade listings)
    // remain Phase 17 work and are tracked as deferred capabilities.
    router.get('/api/v1/content/surfaces', asyncHandler(async (_req, res) => {
        const status = await contentStore.getProductWorkflowStatus();
        const surfaces = Object.keys(status.items_by_surface || {}).sort();
        res.json({ ok: true, surfaces, items_by_surface: status.items_by_surface || {} });
    }));
    router.get('/api/v1/content/surfaces/:surface/items', asyncHandler(async (req, res) => {
        const filters = Object.assign({}, req.query || {}, { surface: req.params.surface });
        res.json({ ok: true, surface: req.params.surface, items: await contentStore.listItems(filters) });
    }));
    router.get('/api/v1/content/surfaces/:surface/product/status', asyncHandler(async (req, res) => {
        const status = await contentStore.getProductWorkflowStatus();
        const surfaceTruth = (status.items_by_surface || {})[req.params.surface] || { total: 0, by_state: {}, by_kind: {} };
        res.json({ ok: true, product: 'content', surface: req.params.surface, items: surfaceTruth });
    }));

    router.get('*', (req, res) => {
        const rendered = renderRequest({
            config,
            surfaceId: req.openvibeSurface,
            routePath: req.path || '/',
        });
        res.status(rendered.status).type(rendered.contentType).send(rendered.body);
    });

    return router;
}

module.exports = {
    buildRouter,
};
