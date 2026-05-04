'use strict';

const express = require('express');
const http    = require('http');
const { proxyRequest } = require('./proxy');
const db = require('./db');
const {
    ECOSYSTEM_SERVICES,
    WELL_KNOWN_URLS,
    listServices,
    listServicesByCategory,
    getService,
    getServiceByDomain,
    listEventTopics,
    ECOSYSTEM_CATEGORY_LABELS,
} = require('@openvibe/contracts/ecosystem');
const { TOPIC_LIST } = require('@openvibe/contracts/topics');
const { EVENT_TYPE_LIST } = require('@openvibe/contracts/events');

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
 *   GET  /api/v1/me/api-keys        → list caller's keys
 *   POST /api/v1/me/api-keys        → create API key (returns raw key once)
 *   DELETE /api/v1/me/api-keys/:id  → revoke key
 *
 *   GET  /api/v1/registry/services      → list known services + health
 *   GET  /api/v1/registry/capabilities  → forward capability queries to each service
 *
 *   GET  /.well-known/openvibe  → JSON service registry document
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

    // ── API key management ────────────────────────────────────
    r.get('/me/api-keys', (req, res) => {
        if (!req.user) return res.status(401).json({ error: 'authentication required' });
        const userId = String(req.user.id || req.user.sub || '');
        if (!userId) return res.status(401).json({ error: 'user identity missing' });
        res.json({ items: db.listApiKeys(userId) });
    });

    r.post('/me/api-keys', express.json({ limit: '16kb' }), (req, res) => {
        if (!req.user) return res.status(401).json({ error: 'authentication required' });
        const userId = String(req.user.id || req.user.sub || '');
        if (!userId) return res.status(401).json({ error: 'user identity missing' });
        const b = req.body || {};
        const name = String(b.name || '').trim();
        if (!name) return res.status(400).json({ error: 'name required' });
        if (name.length > 120) return res.status(400).json({ error: 'name too long (max 120)' });
        const scopes = Array.isArray(b.scopes) ? b.scopes.filter((s) => typeof s === 'string') : [];
        const record = db.createApiKey({ userId, name, scopes });
        // Return the raw key ONCE — it is never readable again
        res.status(201).json({
            id:         record.id,
            name:       record.name,
            scopes:     record.scopes,
            created_at: record.created_at,
            key:        record.key,
            warning:    'Store this key securely — it will not be shown again.',
        });
    });

    r.delete('/me/api-keys/:id', (req, res) => {
        if (!req.user) return res.status(401).json({ error: 'authentication required' });
        const userId = String(req.user.id || req.user.sub || '');
        const result = db.revokeApiKey(req.params.id, userId);
        if (!result) return res.status(404).json({ error: 'key not found or already revoked' });
        res.json({ ok: true, id: result.id, revoked: true });
    });

    // ── registry ──────────────────────────────────────────────
    function probeHealth(serviceUrl) {
        return new Promise((resolve) => {
            const url = new URL('/health', serviceUrl);
            const mod = url.protocol === 'https:' ? require('https') : http;
            const timer = setTimeout(() => resolve({ status: 'timeout' }), 1500);
            mod.get(url.toString(), (httpRes) => {
                clearTimeout(timer);
                let body = '';
                httpRes.on('data', (d) => { body += d; });
                httpRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        resolve({ status: httpRes.statusCode === 200 ? 'ok' : 'degraded', ...parsed });
                    } catch {
                        resolve({ status: httpRes.statusCode === 200 ? 'ok' : 'degraded' });
                    }
                });
            }).on('error', () => { clearTimeout(timer); resolve({ status: 'unreachable' }); });
        });
    }

    r.get('/registry/services', (req, res) => {
        const probes = Object.entries(svc).map(([name, url]) =>
            probeHealth(url).then((health) => ({ name, url, health }))
        );
        Promise.all(probes).then((results) => {
            res.json({ services: results, probed_at: new Date().toISOString() });
        }).catch((err) => {
            res.status(500).json({ error: err.message });
        });
    });

    r.get('/registry/capabilities', (req, res) => {
        // Collect capabilities from each service's /api/v1/capabilities endpoint
        const fetches = Object.entries(svc).map(([name, url]) =>
            new Promise((resolve) => {
                const fullUrl = `${url}/api/v1/capabilities`;
                const mod = fullUrl.startsWith('https') ? require('https') : http;
                const timer = setTimeout(() => resolve({ service: name, capabilities: [] }), 2000);
                mod.get(fullUrl, (httpRes) => {
                    clearTimeout(timer);
                    let body = '';
                    httpRes.on('data', (d) => { body += d; });
                    httpRes.on('end', () => {
                        try {
                            const parsed = JSON.parse(body);
                            resolve({ service: name, capabilities: parsed.capabilities || [] });
                        } catch {
                            resolve({ service: name, capabilities: [] });
                        }
                    });
                }).on('error', () => { clearTimeout(timer); resolve({ service: name, capabilities: [] }); });
            })
        );
        Promise.all(fetches).then((results) => {
            const merged = {};
            for (const { service, capabilities } of results) {
                if (capabilities.length) merged[service] = capabilities;
            }
            res.json({ capabilities: merged, fetched_at: new Date().toISOString() });
        }).catch((err) => {
            res.status(500).json({ error: err.message });
        });
    });

    // Single service by contract ID
    r.get('/registry/services/:id', (req, res) => {
        const svcRecord = getService(req.params.id);
        if (!svcRecord) return res.status(404).json({ error: 'service not found', id: req.params.id });
        res.json({ service: svcRecord });
    });

    // Service by domain
    r.get('/registry/domains/:domain', (req, res) => {
        const svcRecord = getServiceByDomain(req.params.domain);
        if (!svcRecord) return res.status(404).json({ error: 'service not found for domain', domain: req.params.domain });
        res.json({ service: svcRecord });
    });

    // Canonical event bus topics from contracts
    r.get('/registry/topics', (req, res) => {
        res.json({
            topics: TOPIC_LIST,
            event_types: EVENT_TYPE_LIST,
            count: TOPIC_LIST.length,
            event_type_count: EVENT_TYPE_LIST.length,
        });
    });

    // Full ecosystem hierarchy from contracts
    r.get('/registry/ecosystem', (req, res) => {
        const categories = {};
        for (const [cat, label] of Object.entries(ECOSYSTEM_CATEGORY_LABELS)) {
            categories[cat] = {
                label,
                services: listServicesByCategory(cat),
            };
        }
        res.json({
            version: 1,
            well_known: WELL_KNOWN_URLS,
            categories,
            service_count: ECOSYSTEM_SERVICES.length,
            topic_count: TOPIC_LIST.length,
        });
    });

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

