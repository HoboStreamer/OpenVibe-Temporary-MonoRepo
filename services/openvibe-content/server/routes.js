'use strict';

const express = require('express');

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
