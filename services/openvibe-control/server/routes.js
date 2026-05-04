'use strict';

const express = require('express');
const { safeFetch } = require('./fetcher');
const {
    renderUnauthorized,
    renderDashboard,
    renderEventsPage,
    renderStreamsPage,
    renderRealtimePage,
    renderCommunityPage,
    renderServicesPage,
    renderEcosystemPage,
} = require('./ssr');

/**
 * Probe a service's /health endpoint and measure latency.
 */
async function probeService(name, url, internalKey) {
    const start = Date.now();
    const data  = await safeFetch(`${url}/health`, internalKey);
    const latencyMs = Date.now() - start;
    const ok = data && !data.error;
    return { name, url, ok, latencyMs: ok ? latencyMs : undefined, error: data && data.error || null };
}

function buildRouter(config) {
    const r = express.Router();
    const svc = config.services;
    const key = config.internalKey;

    // Guard: admin only
    function adminOnly(req, res, next) {
        if (!req.user || req.user.role !== 'admin') {
            res.status(403).send(renderUnauthorized());
            return;
        }
        next();
    }

    // ── dashboard ───────────────────────────────────────────────
    r.get('/', adminOnly, async (req, res) => {
        const [eventsData, realtimeData, streamsData, communityData, ...serviceResults] = await Promise.all([
            safeFetch(`${svc.events}/api/v1/topics`, key).then((d) => ({
                total: Array.isArray(d && d.items) ? d.items.reduce((s, t) => s + (t.event_count || 0), 0) : 0,
                topics: d && d.items || [],
            })),
            safeFetch(`${svc.realtime}/api/v1/realtime/stats`, key),
            safeFetch(`${svc.live}/api/v1/go-live/streams`, key).then((d) => ({
                active: Array.isArray(d && d.items) ? d.items.filter((s) => s.status === 'live').length : 0,
            })),
            safeFetch(`${svc.community}/api/v1/community/stats`, key),
            ...Object.entries(svc).map(([name, url]) => probeService(name, url, key)),
        ]);

        const html = renderDashboard({
            events:    eventsData,
            realtime:  realtimeData,
            streams:   streamsData,
            community: communityData,
            services:  serviceResults,
        }, req.user && req.user.email);

        res.status(200).set('content-type', 'text/html').send(html);
    });

    // ── events page ──────────────────────────────────────────────
    r.get('/events', adminOnly, async (req, res) => {
        const [topicsData, recentData] = await Promise.all([
            safeFetch(`${svc.events}/api/v1/topics`, key),
            safeFetch(`${svc.events}/api/v1/events?limit=50`, key),
        ]);
        const html = renderEventsPage({
            topics: topicsData && topicsData.items || [],
            recent: recentData && recentData.items || [],
        }, req.user && req.user.email);
        res.status(200).set('content-type', 'text/html').send(html);
    });

    // ── streams page ─────────────────────────────────────────────
    r.get('/streams', adminOnly, async (req, res) => {
        const data = await safeFetch(`${svc.live}/api/v1/go-live/streams`, key);
        const html = renderStreamsPage({
            streams: data && data.items || [],
        }, req.user && req.user.email);
        res.status(200).set('content-type', 'text/html').send(html);
    });

    // ── realtime page ────────────────────────────────────────────
    r.get('/realtime', adminOnly, async (req, res) => {
        const stats = await safeFetch(`${svc.realtime}/api/v1/realtime/stats`, key);
        const html  = renderRealtimePage({ stats }, req.user && req.user.email);
        res.status(200).set('content-type', 'text/html').send(html);
    });

    // ── community page ───────────────────────────────────────────
    r.get('/community', adminOnly, async (req, res) => {
        const stats = await safeFetch(`${svc.community}/api/v1/community/stats`, key);
        const html  = renderCommunityPage({ stats }, req.user && req.user.email);
        res.status(200).set('content-type', 'text/html').send(html);
    });

    // ── ecosystem page ────────────────────────────────────────────
    r.get('/ecosystem', adminOnly, (req, res) => {
        const html = renderEcosystemPage(req.user && req.user.email);
        res.status(200).set('content-type', 'text/html').send(html);
    });

    // ── services page ────────────────────────────────────────────
    r.get('/services', adminOnly, async (req, res) => {
        const results = await Promise.all(
            Object.entries(svc).map(([name, url]) => probeService(name, url, key))
        );
        const html = renderServicesPage(results, req.user && req.user.email);
        res.status(200).set('content-type', 'text/html').send(html);
    });

    // ── JSON API (internal) ──────────────────────────────────────
    r.get('/api/status', adminOnly, async (req, res) => {
        const results = await Promise.all(
            Object.entries(svc).map(([name, url]) => probeService(name, url, key))
        );
        res.json({ items: results, total: results.length });
    });

    // ── action: event replay ──────────────────────────────────────
    r.post('/api/events/:id/replay', express.json({ limit: '64kb' }), adminOnly, async (req, res) => {
        const result = await safeFetch(
            `${svc.events}/api/v1/events/${encodeURIComponent(req.params.id)}/replay`,
            key,
            { method: 'POST', body: JSON.stringify(req.body || {}) }
        );
        if (result && result.error) {
            return res.status(result._status || 500).json({ error: result.error });
        }
        res.json({ ok: true, result });
    });

    // ── action: API key management (proxied to openvibe-api) ──────
    r.post('/api/api-keys', express.json({ limit: '64kb' }), adminOnly, async (req, res) => {
        const result = await safeFetch(
            `${svc.api}/api/v1/me/api-keys`,
            key,
            { method: 'POST', body: JSON.stringify(req.body || {}), userId: req.user && (req.user.id || req.user.sub) }
        );
        if (result && result.error) {
            return res.status(result._status || 500).json({ error: result.error });
        }
        res.status(201).json(result);
    });

    r.delete('/api/api-keys/:id', adminOnly, async (req, res) => {
        const result = await safeFetch(
            `${svc.api}/api/v1/me/api-keys/${encodeURIComponent(req.params.id)}`,
            key,
            { method: 'DELETE', userId: req.user && (req.user.id || req.user.sub) }
        );
        if (result && result.error) {
            return res.status(result._status || 404).json({ error: result.error });
        }
        res.json({ ok: true });
    });

    // ── action: trigger paste migration ──────────────────────────
    r.post('/api/migrations/hobostreamer-pastes/import', express.json({ limit: '16kb' }), adminOnly, async (req, res) => {
        const result = await safeFetch(
            `${svc.community}/api/v1/community/admin/migrations/hobostreamer-pastes/import`,
            key,
            { method: 'POST', body: JSON.stringify(req.body || {}), userId: req.user && (req.user.id || req.user.sub), role: 'admin' }
        );
        if (result && result.error) {
            return res.status(result._status || 500).json({ error: result.error });
        }
        res.json(result);
    });

    r.get('/api/migrations/hobostreamer-pastes/status', adminOnly, async (req, res) => {
        const result = await safeFetch(
            `${svc.community}/api/v1/community/admin/migrations/hobostreamer-pastes/status`,
            key,
            { userId: req.user && (req.user.id || req.user.sub), role: 'admin' }
        );
        if (result && result.error) {
            return res.status(result._status || 500).json({ error: result.error });
        }
        res.json(result);
    });

    r.get('/api/migrations/hobostreamer-pastes/dry-run', adminOnly, async (req, res) => {
        const qs = req.query.limit ? `?limit=${encodeURIComponent(req.query.limit)}` : '';
        const result = await safeFetch(
            `${svc.community}/api/v1/community/admin/migrations/hobostreamer-pastes/dry-run${qs}`,
            key,
            { userId: req.user && (req.user.id || req.user.sub), role: 'admin' }
        );
        if (result && result.error) {
            return res.status(result._status || 500).json({ error: result.error });
        }
        res.json(result);
    });

    return r;
}

module.exports = { buildRouter };
