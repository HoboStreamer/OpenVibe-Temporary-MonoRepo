'use strict';

const express = require('express');
const model = require('./model');
const policy = require('./policy');
const { STREAM_EVENT_TYPES } = require('@openvibe/contracts/stream-events');

function buildRouter({ eventBus, config, buildSessionResponse }) {
    const r = express.Router();
    const json = express.json({ limit: '256kb' });

    function liveChannelUrl(slug) {
        return `${config.live.url}/@${encodeURIComponent(slug)}`;
    }

    function actorMeta(req) {
        const a = policy.actorOfReq(req);
        return { actor_type: a.type, actor_id: a.id };
    }

    r.get('/session', (req, res) => {
        if (typeof buildSessionResponse === 'function') {
            return res.json(buildSessionResponse(req, { service: config.serviceId || 'openre-stream' }));
        }
        res.json({
            authenticated: !!req.user,
            anonymous: false,
            user: req.user || null,
            service: config.serviceId || 'openre-stream',
        });
    });

    // ── channels ─────────────────────────────────────────────
    r.post('/channels', json, (req, res) => {
        const b = req.body || {};
        if (!b.slug || !b.owner_user_id) return res.status(400).json({ error: 'slug, owner_user_id required' });
        const existing = model.getChannelBySlug(b.slug);
        if (existing && String(existing.owner_user_id) !== String(b.owner_user_id)) {
            if (!req.serviceActor && (!req.user || req.user.role !== 'admin')) {
                return res.status(409).json({ error: 'channel handle already claimed', reason: 'slug_taken' });
            }
        }
        try { policy.assert(policy.decideChannelWrite({ req, ownerUserId: b.owner_user_id }), { ...actorMeta(req), action: 'channel.upsert' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const ch = model.upsertChannel(b);
        res.status(201).json({ channel: ch });
    });
    r.get('/channels', (req, res) => res.json({ items: model.listChannels({ owner_user_id: req.query.owner_user_id, limit: req.query.limit }) }));
    r.get('/channels/:slug', (req, res) => {        const ch = model.getChannelBySlug(req.params.slug);
        if (!ch) return res.status(404).json({ error: 'not found' });
        res.json({ channel: ch });
    });
    r.patch('/channels/:slug', json, (req, res) => {
        const ch = model.getChannelBySlug(req.params.slug);
        if (!ch) return res.status(404).json({ error: 'channel not found' });
        try { policy.assert(policy.decideChannelWrite({ req, ownerUserId: ch.owner_user_id }), { ...actorMeta(req), action: 'channel.update' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const updated = model.updateChannel(req.params.slug, req.body || {});
        res.json({ channel: updated });
    });
    r.post('/channels/:slug/regenerate-key', json, (req, res) => {
        const ch = model.getChannelBySlug(req.params.slug);
        if (!ch) return res.status(404).json({ error: 'channel not found' });
        try { policy.assert(policy.decideChannelWrite({ req, ownerUserId: ch.owner_user_id }), { ...actorMeta(req), action: 'channel.regenerate-key' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const updated = model.regenerateStreamKey(req.params.slug);
        res.json({ channel: updated });
    });
    r.get('/streams/:id/outputs', (req, res) => {
        const s = model.getStreamById(req.params.id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        res.json({ items: model.listOutputsByStreamId(req.params.id) });
    });

    // ── streams ──────────────────────────────────────────────
    r.post('/streams', json, (req, res) => {
        const b = req.body || {};
        const ch = b.channel_slug ? model.getChannelBySlug(b.channel_slug)
            : (b.channel_id ? model.getChannelById(b.channel_id) : null);
        if (!ch) return res.status(404).json({ error: 'channel not found' });
        try { policy.assert(policy.decideStreamWrite({ req, channel: ch }), { ...actorMeta(req), action: 'stream.create' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const s = model.createStream({
            channel_id: ch.id, protocol: b.protocol || 'rtmp', title: b.title, category: b.category,
            stream_key: b.stream_key, metadata: b.metadata || {},
        });
        eventBus.publishStreamEvent(STREAM_EVENT_TYPES.CREATED, s, ch);
        res.status(201).json({
            stream: s,
            channel: ch,
            ingest: {
                rtmp:   `${config.ingest.rtmp}/${ch.slug}?key=${encodeURIComponent(s.stream_key || s.id)}`,
                whip:   `${config.ingest.whip}/${ch.slug}?key=${encodeURIComponent(s.stream_key || s.id)}`,
                jsmpeg: `${config.ingest.jsmpeg}/${ch.slug}?key=${encodeURIComponent(s.stream_key || s.id)}`,
            },
        });
    });

    r.post('/streams/:id/start', json, (req, res) => {
        const s = model.getStreamById(req.params.id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        const ch = model.getChannelById(s.channel_id);
        try { policy.assert(policy.decideStreamWrite({ req, channel: ch }), { ...actorMeta(req), action: 'stream.start' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const started = model.startStream(s.id);
        eventBus.publishStreamEvent(STREAM_EVENT_TYPES.STARTED, started, ch);

        // Auto-mirror to openvibe.live: emit MIRRORED_TO_LIVE so openvibe-live
        // can react to it via subscription (openvibe-live also subscribes to
        // STARTED — both paths converge on the same mirror_state row).
        const liveUrl = liveChannelUrl(ch.slug);
        model.recordMirror({ stream_id: started.id, live_url: liveUrl, channel_slug: ch.slug, details: {} });
        eventBus.publishStreamEvent(STREAM_EVENT_TYPES.MIRRORED_TO_LIVE, started, ch, { live_url: liveUrl });

        res.json({ stream: started, channel: ch, mirror: { live_url: liveUrl } });
    });

    r.post('/streams/:id/end', json, (req, res) => {
        const s = model.getStreamById(req.params.id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        const ch = model.getChannelById(s.channel_id);
        try { policy.assert(policy.decideStreamWrite({ req, channel: ch }), { ...actorMeta(req), action: 'stream.end' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const b = req.body || {};
        const ended = model.endStream(s.id, { vod_media_id: b.vod_media_id });
        eventBus.publishStreamEvent(STREAM_EVENT_TYPES.ENDED, ended, ch);
        if (b.vod_media_id) eventBus.publishStreamEvent(STREAM_EVENT_TYPES.VOD_ATTACHED, ended, ch, { vod_media_id: b.vod_media_id });
        res.json({ stream: ended });
    });

    r.post('/streams/:id/attach-vod', json, (req, res) => {
        const s = model.getStreamById(req.params.id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        const ch = model.getChannelById(s.channel_id);
        try { policy.assert(policy.decideStreamWrite({ req, channel: ch }), { ...actorMeta(req), action: 'stream.attach_vod' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        if (!req.body || !req.body.vod_media_id) return res.status(400).json({ error: 'vod_media_id required' });
        const updated = model.attachVod(s.id, req.body.vod_media_id);
        eventBus.publishStreamEvent(STREAM_EVENT_TYPES.VOD_ATTACHED, updated, ch, { vod_media_id: req.body.vod_media_id });
        res.json({ stream: updated });
    });

    r.get('/streams', (req, res) => {
        res.json({ items: model.listStreams({ channel_id: req.query.channel_id, status: req.query.status, limit: req.query.limit }) });
    });
    r.get('/streams/:id', (req, res) => {
        const s = model.getStreamById(req.params.id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        res.json({ stream: s, mirror: model.getMirrorState(s.id) || null });
    });

    r.post('/streams/:id/recordings', json, (req, res) => {
        const s = model.getStreamById(req.params.id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        const ch = model.getChannelById(s.channel_id);
        try { policy.assert(policy.decideStreamWrite({ req, channel: ch }), { ...actorMeta(req), action: 'recording.upsert' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const recording = model.upsertRecording(Object.assign({ stream_id: s.id, channel_slug: ch.slug }, req.body || {}));
        res.status(201).json({ recording });
    });

    r.post('/streams/:id/segments', json, (req, res) => {
        const s = model.getStreamById(req.params.id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        const ch = model.getChannelById(s.channel_id);
        try { policy.assert(policy.decideStreamWrite({ req, channel: ch }), { ...actorMeta(req), action: 'segment.upsert' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const recording = model.getRecordingByStreamId(s.id) || model.upsertRecording({ stream_id: s.id, channel_slug: ch.slug, status: 'recording' });
        const segment = model.upsertRecordingSegment(Object.assign({ recording_id: recording.id }, req.body || {}));
        res.status(201).json({ recording, segment });
    });

    r.get('/streams/:id/timeline', (req, res) => {
        const s = model.getStreamById(req.params.id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        const recording = model.getRecordingByStreamId(s.id);
        res.json({
            stream: s,
            recording,
            segments: recording ? model.listRecordingSegments(recording.id, { limit: req.query.limit }) : [],
            clips: model.listClipProjects({ stream_id: s.id, limit: req.query.limit }),
        });
    });

    r.post('/clips', json, (req, res) => {
        const b = req.body || {};
        if (!b.stream_id) return res.status(400).json({ error: 'stream_id required' });
        const s = model.getStreamById(b.stream_id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        const ch = model.getChannelById(s.channel_id);
        try { policy.assert(policy.decideStreamWrite({ req, channel: ch }), { ...actorMeta(req), action: 'clip.create' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const clip = model.createClipProject(b);
        res.status(201).json({ clip });
    });

    r.get('/streams/:id/clips', (req, res) => {
        const s = model.getStreamById(req.params.id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        res.json({ items: model.listClipProjects({ stream_id: s.id, limit: req.query.limit }) });
    });

    // ── ingest webhook (called by ingest edge: nginx-rtmp / WHIP server) ──
    r.post('/ingest/connected', json, (req, res) => {
        const b = req.body || {};
        if (!b.stream_id) return res.status(400).json({ error: 'stream_id required' });
        const s = model.getStreamById(b.stream_id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        const ch = model.getChannelById(s.channel_id);
        try { policy.assert(policy.decideStreamWrite({ req, channel: ch }), { ...actorMeta(req), action: 'ingest.connected' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        model.recordIngestConnected({ stream_id: s.id, protocol: b.protocol || s.protocol, client_addr: b.client_addr, details: b.details });
        eventBus.publishStreamEvent(STREAM_EVENT_TYPES.INGEST_CONNECTED, s, ch, { protocol: b.protocol || s.protocol });
        res.json({ ok: true });
    });
    r.post('/ingest/disconnected', json, (req, res) => {
        const b = req.body || {};
        const s = model.getStreamById(b.stream_id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        const ch = model.getChannelById(s.channel_id);
        try { policy.assert(policy.decideStreamWrite({ req, channel: ch }), { ...actorMeta(req), action: 'ingest.disconnected' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        model.recordIngestDisconnected({ stream_id: s.id });
        eventBus.publishStreamEvent(STREAM_EVENT_TYPES.INGEST_DISCONNECTED, s, ch);
        res.json({ ok: true });
    });

    // ── restream destinations ────────────────────────────────
    r.post('/destinations', json, (req, res) => {
        const b = req.body || {};
        if (!b.owner_user_id || !b.kind || !b.target_url) return res.status(400).json({ error: 'owner_user_id, kind, target_url required' });
        try { policy.assert(policy.decideChannelWrite({ req, ownerUserId: b.owner_user_id }), { ...actorMeta(req), action: 'destination.create' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const d = model.createDestination(b);
        res.status(201).json({ destination: d });
    });
    r.put('/destinations/:id', json, (req, res) => {
        const d = model.getDestinationById(req.params.id);
        if (!d) return res.status(404).json({ error: 'destination not found' });
        try { policy.assert(policy.decideChannelWrite({ req, ownerUserId: d.owner_user_id }), { ...actorMeta(req), action: 'destination.update' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const updated = model.updateDestination(req.params.id, req.body || {});
        res.json({ destination: updated });
    });
    r.delete('/destinations/:id', (req, res) => {
        const d = model.getDestinationById(req.params.id);
        if (!d) return res.status(404).json({ error: 'destination not found' });
        try { policy.assert(policy.decideChannelWrite({ req, ownerUserId: d.owner_user_id }), { ...actorMeta(req), action: 'destination.delete' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        model.deleteDestination(req.params.id);
        res.json({ ok: true });
    });
    r.get('/destinations', (req, res) => {
        res.json({ items: model.listDestinations({ owner_user_id: req.query.owner_user_id }) });
    });
    r.post('/streams/:id/output', json, (req, res) => {
        const s = model.getStreamById(req.params.id);
        if (!s) return res.status(404).json({ error: 'stream not found' });
        const ch = model.getChannelById(s.channel_id);
        try { policy.assert(policy.decideStreamWrite({ req, channel: ch }), { ...actorMeta(req), action: 'stream.output' }); }
        catch (err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason }); }
        const b = req.body || {};
        if (!b.destination_id || !b.state) return res.status(400).json({ error: 'destination_id, state required' });
        model.setOutputState({ stream_id: s.id, destination_id: b.destination_id, state: b.state, last_error: b.last_error });
        const evt = b.state === 'started' ? STREAM_EVENT_TYPES.OUTPUT_STARTED
                  : b.state === 'failed'  ? STREAM_EVENT_TYPES.OUTPUT_FAILED
                  : b.state === 'stopped' ? STREAM_EVENT_TYPES.OUTPUT_STOPPED
                  : null;
        if (evt) eventBus.publishStreamEvent(evt, s, ch, { destination_id: b.destination_id, error: b.last_error || null });
        res.json({ ok: true });
    });

    // ── legacy lookup ────────────────────────────────────────
    r.get('/legacy/:source/:kind/:legacyId', (req, res) => {
        const row = model.lookupLegacy(req.params.source, req.params.kind, req.params.legacyId);
        if (!row) return res.status(404).json({ error: 'not mapped' });
        res.json({ new_id: row.new_id });
    });

    return r;
}

module.exports = { buildRouter };
