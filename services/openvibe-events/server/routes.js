'use strict';

const express = require('express');
const bus = require('./bus');
const { requireInternalKey } = require('@openvibe/sdk/middleware');

function buildRouter(internalKey) {
    const r = express.Router();
    const internal = requireInternalKey(internalKey);

    // ── publish ──────────────────────────────────────────────
    r.post('/events', internal, (req, res) => {
        try {
            const { topic, envelope } = req.body || {};
            const result = bus.persistEvent(topic, envelope);
            res.status(201).json(result);
        } catch (err) {
            const status = err.code === 'EBADENVELOPE' || err.code === 'EBADTOPIC' ? 400 : 500;
            console.error(`[events] publish failed: ${err.message}`);
            res.status(status).json({ error: err.message, code: err.code || null });
        }
    });

    // ── inspect ──────────────────────────────────────────────
    r.get('/events', (req, res) => {
        const items = bus.listEvents({
            topic: req.query.topic,
            eventType: req.query.event_type,
            limit: req.query.limit,
            sinceId: req.query.since_id,
        });
        res.json({ items });
    });

    r.get('/events/:eventId', (req, res) => {
        const evt = bus.getEventById(req.params.eventId);
        if (!evt) return res.status(404).json({ error: 'not found' });
        res.json(evt);
    });

    r.post('/events/:eventId/replay', internal, (req, res) => {
        try {
            const result = bus.replayEvent(req.params.eventId);
            res.json(result);
        } catch (err) {
            const status = err.code === 'ENOTFOUND' ? 404 : 500;
            res.status(status).json({ error: err.message });
        }
    });

    // ── subscriptions ────────────────────────────────────────
    r.get('/subscriptions', (_req, res) => {
        res.json({ items: bus.listSubscriptions() });
    });

    r.post('/subscriptions', internal, (req, res) => {
        try {
            const sub = bus.createSubscription(req.body || {});
            res.status(201).json(sub);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    r.delete('/subscriptions/:id', internal, (req, res) => {
        bus.deactivateSubscription(req.params.id);
        res.json({ ok: true });
    });

    // ── dlq ──────────────────────────────────────────────────
    r.get('/dlq', (req, res) => {
        res.json({ items: bus.listDeadLetters({ limit: req.query.limit }) });
    });

    return r;
}

module.exports = { buildRouter };
