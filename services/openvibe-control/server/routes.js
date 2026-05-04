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

    return r;
}

module.exports = { buildRouter };
