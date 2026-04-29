'use strict';

const express = require('express');

const {
    hostStatuses,
    renderRequest,
} = require('./ssr');

function buildRouter({ config }) {
    const router = express.Router();

    router.get('/api/v1/content/status', (_req, res) => {
        res.json({
            service: config.serviceId,
            limits: config.limits,
            ai_url_configured: !!config.aiUrl,
            surfaces: hostStatuses(config),
        });
    });

    router.get('/api/v1/content/hosts', (_req, res) => {
        res.json({ items: hostStatuses(config) });
    });

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
