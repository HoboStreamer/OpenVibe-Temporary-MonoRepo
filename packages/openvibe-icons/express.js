'use strict';

const { buildBrowserBundle, buildStyleSheet } = require('./index');

function normalizeRoutePrefix(value) {
    const raw = String(value || '/assets').trim() || '/assets';
    return raw.endsWith('/') && raw !== '/' ? raw.slice(0, -1) : raw;
}

function attachIconAssets(app, options) {
    if (!app || typeof app.get !== 'function') {
        throw new Error('An express app is required');
    }
    const routePrefix = normalizeRoutePrefix(options && options.routePrefix);
    app.get(`${routePrefix}/openvibe-icons.js`, (_req, res) => {
        res.type('application/javascript; charset=utf-8').send(buildBrowserBundle());
    });
    app.get(`${routePrefix}/openvibe-icons.css`, (_req, res) => {
        res.type('text/css; charset=utf-8').send(buildStyleSheet());
    });
    return app;
}

module.exports = {
    attachIconAssets,
};
