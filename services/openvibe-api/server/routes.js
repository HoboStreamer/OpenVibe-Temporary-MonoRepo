'use strict';

const express = require('express');
const { proxyRequest } = require('./proxy');

/**
 * Build the routing table for openvibe-api.
 *
 * Route strategy:
 *   GET  /api/v1/network/**   → openvibe-network
 *   GET  /api/v1/events/**    → openvibe-events
 *   *    /api/v1/media/**     → openvibe-media
 *   *    /api/v1/live/**      → openvibe-live
 *   *    /api/v1/restream/**  → openre-stream
 *   *    /api/v1/chat/**      → openvibe-chat
 *   *    /api/v1/community/** → openvibe-community
 *   *    /api/v1/billing/**   → openvibe-billing
 *   *    /api/v1/ai/**        → openvibe-ai
 *   *    /api/v1/games/**     → openvibe-games
 *   GET  /api/v1/realtime/**  → openvibe-realtime
 *   GET  /api/v1/content/**   → openvibe-content
 *
 * Each route strips the `/api/v1/<segment>` prefix and rewrites to the
 * upstream's own `/api/v1/*` path. Authenticated routes forward the
 * `authorization` header unchanged.
 */
function buildRouter(config) {
    const r = express.Router();
    const svc = config.services;

    function proxy(serviceUrl, pathPrefix) {
        return (req, res) => {
            const stripped = req.path.slice(pathPrefix.length) || '/';
            proxyRequest(req, res, serviceUrl, {
                pathSuffix: `/api/v1${stripped}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`,
            });
        };
    }

    // ── service routes ───────────────────────────────────────
    r.all('/network*',   proxy(svc.network,   '/network'));
    r.all('/events*',    proxy(svc.events,    '/events'));
    r.all('/media*',     proxy(svc.media,     '/media'));
    r.all('/live*',      proxy(svc.live,      '/live'));
    r.all('/restream*',  proxy(svc.restream,  '/restream'));
    r.all('/chat*',      proxy(svc.chat,      '/chat'));
    r.all('/community*', proxy(svc.community, '/community'));
    r.all('/billing*',   proxy(svc.billing,   '/billing'));
    r.all('/ai*',        proxy(svc.ai,        '/ai'));
    r.all('/games*',     proxy(svc.games,     '/games'));
    r.all('/realtime*',  proxy(svc.realtime,  '/realtime'));
    r.all('/content*',   proxy(svc.content,   '/content'));

    return r;
}

module.exports = { buildRouter };
