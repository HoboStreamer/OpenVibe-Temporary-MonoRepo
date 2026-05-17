'use strict';

// openvibe-chat — REST routes.
//
// Auth model:
//   - service callers: X-Internal-Key + X-OpenVibe-Service (req.serviceActor)
//   - user callers:    Bearer token / cookie -> req.user (when auth issuer wired)
//   - anonymous:       read-only on public rooms; cannot send

const express = require('express');
const model = require('./model');
const policy = require('./policy');
const { CHAT_EVENT_TYPES } = require('@openvibe/contracts');

function buildRouter({ eventBus, chatWs }) {
    const r = express.Router();
    const json = express.json({ limit: '512kb' });

    function actorMeta(req) {
        const a = policy.actorOfReq(req);
        return { actor_type: a.type, actor_id: a.id };
    }
    function denied(res, err) {
        return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
    }

    function publicRoom(room) {
        if (!room) return null;
        return room;
    }
    function publicMessage(m) { return m; }

    r.get('/session', (req, res) => {
        const actor = policy.actorOfReq(req);
        res.json({
            authenticated: actor.type !== 'anonymous',
            actor,
            user: req.user || null,
        });
    });

    function syncDmReadState(room, actor) {
        if (!room || room.room_type !== 'dm') return null;
        if (!actor || actor.actor_type !== 'user' || !actor.actor_id) return null;
        const participant = model.markRoomRead(room.id, actor.actor_type, actor.actor_id);
        if (!participant) return null;
        const unread = model.getDmUnreadSummary(actor.actor_type, actor.actor_id);
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.DM_READ, {
            room_id: room.id,
            unread_count: 0,
            total_unread: unread.total_unread,
        }, actor);
        return { participant, unread };
    }

    // ── rooms ────────────────────────────────────────────
    r.get('/rooms', (req, res) => {
        const items = model.listRooms({
            room_type: req.query.room_type,
            owner_type: req.query.owner_type,
            owner_id:  req.query.owner_id,
            external_ref_type: req.query.external_ref_type,
            limit: req.query.limit,
        });
        const visible = items.filter(rm => policy.decideRead({ req, room: rm, model }).allow);
        res.json({ items: visible.map(publicRoom) });
    });

    r.post('/rooms', json, (req, res) => {
        const a = actorMeta(req);
        const b = req.body || {};
        if (!b.room_type) return res.status(400).json({ error: 'room_type required' });
        const room = model.createRoom(Object.assign({}, b, { created_by_actor_type: a.actor_type, created_by_actor_id: a.actor_id }));
        if (a.actor_type !== 'anonymous' && a.actor_id) {
            model.upsertParticipant({ room_id: room.id, actor_type: a.actor_type, actor_id: a.actor_id, role: 'owner' });
        }
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.ROOM_CREATED, { room_id: room.id, room_type: room.room_type }, a);
        res.status(201).json({ room });
    });

    r.get('/rooms/:roomId', (req, res) => {
        const room = model.getRoom(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'room not found' });
        try { policy.assert(policy.decideRead({ req, room, model }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        res.json({ room: publicRoom(room), participants: model.listParticipants(room.id) });
    });

    r.get('/rooms/:roomId/messages', (req, res) => {
        const room = model.getRoom(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'room not found' });
        try { policy.assert(policy.decideRead({ req, room, model }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const items = model.listMessages({ room_id: room.id, limit: req.query.limit, before_id: req.query.before_id });
        res.json({ items: items.map(publicMessage) });
    });

    r.post('/rooms/:roomId/messages', json, (req, res) => {
        const room = model.getRoom(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'room not found' });
        try { policy.assert(policy.decideSend({ req, room, model }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const a = actorMeta(req);
        const b = req.body || {};
        const msg = model.createMessage({
            room_id: room.id,
            sender_type: b.sender_type || a.actor_type,
            sender_id:   b.sender_id   || a.actor_id,
            message_type: b.message_type || 'text',
            body: b.body, rich_payload: b.rich_payload, reply_to_message_id: b.reply_to_message_id,
            metadata: b.metadata,
            legacy_source: b.legacy_source, legacy_id: b.legacy_id,
        });
        syncDmReadState(room, a);
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.MESSAGE_CREATED,
            { room_id: room.id, message_id: msg.id, room_type: room.room_type, sender_type: msg.sender_type, sender_id: msg.sender_id }, a);
        // Push to WebSocket subscribers
        if (chatWs) chatWs.broadcastToRoom(room.id, publicMessage(msg));
        res.status(201).json({ message: msg });
    });

    r.put('/messages/:messageId', json, (req, res) => {
        const m = model.getMessage(req.params.messageId);
        if (!m) return res.status(404).json({ error: 'message not found' });
        try { policy.assert(policy.decideEdit({ req, message: m }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const updated = model.editMessage(m.id, { body: req.body && req.body.body, rich_payload: req.body && req.body.rich_payload });
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.MESSAGE_EDITED, { room_id: m.room_id, message_id: m.id }, actorMeta(req));
        res.json({ message: updated });
    });

    r.delete('/messages/:messageId', (req, res) => {
        const m = model.getMessage(req.params.messageId);
        if (!m) return res.status(404).json({ error: 'message not found' });
        const room = model.getRoom(m.room_id);
        try { policy.assert(policy.decideDelete({ req, message: m, room, model }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const deleted = model.deleteMessage(m.id);
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.MESSAGE_DELETED, { room_id: m.room_id, message_id: m.id }, actorMeta(req));
        res.json({ message: deleted });
    });

    // ── compatibility wrappers ───────────────────────────
    function wrappedHistory(refType) {
        return (req, res) => {
            const refId = req.params.streamId || req.params.channelId || 'global';
            const room = model.findRoomByExternal(refType, refId);
            if (!room) return res.json({ items: [] });
            try { policy.assert(policy.decideRead({ req, room, model }), actorMeta(req)); }
            catch (err) { return denied(res, err); }
            const items = model.listMessages({ room_id: room.id, limit: req.query.limit });
            res.json({ items });
        };
    }
    function wrappedSend(refType, defaultRoomType) {
        return (req, res) => {
            const refId = req.params.streamId || req.params.channelId || 'global';
            const room = model.ensureRoomForExternal(refType, refId, {
                room_type: defaultRoomType,
                title: refId === 'global' ? 'Global Chat' : `${defaultRoomType}:${refId}`,
                visibility: 'public',
            });
            try { policy.assert(policy.decideSend({ req, room, model }), actorMeta(req)); }
            catch (err) { return denied(res, err); }
            const a = actorMeta(req);
            const b = req.body || {};
            const msg = model.createMessage({
                room_id: room.id,
                sender_type: a.actor_type, sender_id: a.actor_id,
                message_type: b.message_type || 'text',
                body: b.body, rich_payload: b.rich_payload,
                legacy_source: b.legacy_source || 'hobostreamer', legacy_id: b.legacy_id,
            });
            eventBus.publishChatEvent(CHAT_EVENT_TYPES.MESSAGE_CREATED,
                { room_id: room.id, message_id: msg.id, room_type: room.room_type, external_ref_type: refType, external_ref_id: refId }, a);
            res.status(201).json({ message: msg, room });
        };
    }
    r.get('/global/history', wrappedHistory('global'));
    r.post('/global/send', json, wrappedSend('global', 'global'));
    r.get('/stream/:streamId/history', wrappedHistory('stream'));
    r.post('/stream/:streamId/send', json, wrappedSend('stream', 'stream'));
    r.get('/channel/:channelId/history', wrappedHistory('channel'));
    r.post('/channel/:channelId/send', json, wrappedSend('channel', 'channel'));

    // ── DMs ──────────────────────────────────────────────
    r.get('/dms', (req, res) => {
        const a = policy.actorOfReq(req);
        if (a.type === 'anonymous') return res.status(401).json({ error: 'auth required' });
        res.json({ items: model.listDmsForActor(a.type, a.id) });
    });
    r.get('/dms/unread', (req, res) => {
        const a = policy.actorOfReq(req);
        if (a.type === 'anonymous') return res.status(401).json({ error: 'auth required' });
        res.json(model.getDmUnreadSummary(a.type, a.id));
    });
    r.post('/dms', json, (req, res) => {
        const a = policy.actorOfReq(req);
        if (a.type === 'anonymous') return res.status(401).json({ error: 'auth required' });
        const b = req.body || {};
        if (!b.target_actor_type || !b.target_actor_id) {
            return res.status(400).json({ error: 'target_actor_type + target_actor_id required' });
        }
        const room = model.findOrCreateDmRoom(
            { actor_type: a.type, actor_id: a.id },
            { actor_type: b.target_actor_type, actor_id: String(b.target_actor_id) }
        );
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.DM_CREATED, { room_id: room.id }, { actor_type: a.type, actor_id: a.id });
        res.status(201).json({ room });
    });
    r.get('/dms/:roomId/messages', (req, res) => {
        const room = model.getRoom(req.params.roomId);
        if (!room || room.room_type !== 'dm') return res.status(404).json({ error: 'dm not found' });
        try { policy.assert(policy.decideRead({ req, room, model }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const a = actorMeta(req);
        const items = model.listMessages({ room_id: room.id, limit: req.query.limit });
        const readState = syncDmReadState(room, a);
        res.json({ items, unread: readState ? readState.unread : model.getDmUnreadSummary(a.actor_type, a.actor_id) });
    });
    r.post('/dms/:roomId/messages', json, (req, res) => {
        const room = model.getRoom(req.params.roomId);
        if (!room || room.room_type !== 'dm') return res.status(404).json({ error: 'dm not found' });
        try { policy.assert(policy.decideSend({ req, room, model }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const a = actorMeta(req);
        const b = req.body || {};
        const msg = model.createMessage({
            room_id: room.id, sender_type: a.actor_type, sender_id: a.actor_id,
            message_type: 'text', body: b.body, rich_payload: b.rich_payload,
        });
        const readState = syncDmReadState(room, a);
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.MESSAGE_CREATED, { room_id: room.id, message_id: msg.id, room_type: 'dm' }, a);
        res.status(201).json({ message: msg, unread: readState ? readState.unread : model.getDmUnreadSummary(a.actor_type, a.actor_id) });
    });
    r.post('/dms/:roomId/read', (req, res) => {
        const room = model.getRoom(req.params.roomId);
        if (!room || room.room_type !== 'dm') return res.status(404).json({ error: 'dm not found' });
        try { policy.assert(policy.decideRead({ req, room, model }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const a = actorMeta(req);
        const readState = syncDmReadState(room, a);
        if (!readState) return res.status(400).json({ error: 'read state unavailable for actor' });
        res.json(readState.unread);
    });

    // ── Calls ────────────────────────────────────────────
    r.post('/calls', json, (req, res) => {
        const a = policy.actorOfReq(req);
        if (a.type === 'anonymous') return res.status(401).json({ error: 'auth required' });
        const b = req.body || {};
        let room = b.room_id ? model.getRoom(b.room_id) : null;
        if (!room) {
            room = model.createRoom({
                room_type: 'call', visibility: 'private',
                owner_type: a.type, owner_id: a.id,
                created_by_actor_type: a.type, created_by_actor_id: a.id,
                title: `Call from ${a.type}:${a.id}`,
            });
            model.upsertParticipant({ room_id: room.id, actor_type: a.type, actor_id: a.id, role: 'owner' });
            if (b.target_actor_type && b.target_actor_id) {
                model.upsertParticipant({ room_id: room.id, actor_type: b.target_actor_type, actor_id: String(b.target_actor_id), role: 'participant' });
            }
        }
        const call = model.createCall({
            room_id: room.id,
            call_type: b.call_type || 'voice',
            status: 'ringing',
            started_by_actor_type: a.type, started_by_actor_id: a.id,
            target_actor_type: b.target_actor_type || null,
            target_actor_id: b.target_actor_id || null,
            metadata: b.metadata || {},
        });
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.CALL_STARTED,
            { call_id: call.id, room_id: room.id, call_type: call.call_type, target_actor_type: call.target_actor_type, target_actor_id: call.target_actor_id }, { actor_type: a.type, actor_id: a.id });
        res.status(201).json({ call, room });
    });

    r.get('/calls/:callId', (req, res) => {
        const c = model.getCall(req.params.callId);
        if (!c) return res.status(404).json({ error: 'call not found' });
        try { policy.assert(policy.decideCallParticipant({ req, call: c }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        res.json({ call: c });
    });

    function transitionCall(eventName, status) {
        return (req, res) => {
            const c = model.getCall(req.params.callId);
            if (!c) return res.status(404).json({ error: 'call not found' });
            try { policy.assert(policy.decideCallParticipant({ req, call: c }), actorMeta(req)); }
            catch (err) { return denied(res, err); }
            const updated = model.updateCallStatus(c.id, status);
            eventBus.publishChatEvent(eventName, { call_id: c.id, room_id: c.room_id, status }, actorMeta(req));
            res.json({ call: updated });
        };
    }
    r.post('/calls/:callId/accept',  transitionCall(CHAT_EVENT_TYPES.CALL_ACCEPTED,  'active'));
    r.post('/calls/:callId/decline', transitionCall(CHAT_EVENT_TYPES.CALL_DECLINED, 'declined'));
    r.post('/calls/:callId/end',     transitionCall(CHAT_EVENT_TYPES.CALL_ENDED,    'ended'));

    r.post('/calls/:callId/signal', json, (req, res) => {
        const c = model.getCall(req.params.callId);
        if (!c) return res.status(404).json({ error: 'call not found' });
        try { policy.assert(policy.decideCallParticipant({ req, call: c }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        if (!b.signal_type) return res.status(400).json({ error: 'signal_type required' });
        const sig = model.recordCallSignal({
            call_id: c.id, from_actor_type: a.type, from_actor_id: a.id,
            signal_type: b.signal_type, payload: b.payload || {},
        });
        res.status(201).json({ signal: sig });
    });

    r.get('/calls/:callId/signals', (req, res) => {
        const c = model.getCall(req.params.callId);
        if (!c) return res.status(404).json({ error: 'call not found' });
        try { policy.assert(policy.decideCallParticipant({ req, call: c }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        res.json({ items: model.listCallSignals(c.id, req.query.since_id) });
    });

    // ── TTS ──────────────────────────────────────────────
    r.get('/tts/settings', (req, res) => {
        const a = policy.actorOfReq(req);
        const ot = req.query.owner_type || a.type;
        const oid = req.query.owner_id != null ? String(req.query.owner_id) : a.id;
        if (!oid) return res.status(400).json({ error: 'owner_id required' });
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        res.json({ settings: model.getTtsSettings(ot, oid) });
    });
    r.put('/tts/settings', json, (req, res) => {
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        const ot = b.owner_type || a.type;
        const oid = b.owner_id != null ? String(b.owner_id) : a.id;
        if (!oid) return res.status(400).json({ error: 'owner_id required' });
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        const settings = model.upsertTtsSettings(Object.assign({}, b, { owner_type: ot, owner_id: oid }));
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.TTS_SETTINGS_UPDATED, { owner_type: ot, owner_id: oid }, actorMeta(req));
        res.json({ settings });
    });

    r.get('/tts/queue', (req, res) => {
        const a = policy.actorOfReq(req);
        const ot = req.query.owner_type || a.type;
        const oid = req.query.owner_id != null ? String(req.query.owner_id) : a.id;
        if (!oid) return res.status(400).json({ error: 'owner_id required' });
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        res.json({ items: model.listAudio({ owner_type: ot, owner_id: oid, queue_type: 'tts' }) });
    });

    r.post('/tts/queue', json, (req, res) => {
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        const ot = b.owner_type || a.type;
        const oid = b.owner_id != null ? String(b.owner_id) : a.id;
        if (!oid) return res.status(400).json({ error: 'owner_id required' });
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        const item = model.enqueueAudio({
            owner_type: ot, owner_id: oid, queue_type: 'tts',
            text: b.text, source_type: b.source_type || 'manual',
            source_id: b.source_id, requested_by_actor_type: a.type, requested_by_actor_id: a.id,
            metadata: b.metadata, priority: b.priority,
        });
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.TTS_QUEUED, { queue_id: item.id, owner_type: ot, owner_id: oid }, actorMeta(req));
        res.status(201).json({ item });
    });
    r.post('/tts/speak', json, (req, res) => {
        // Same shape as POST /tts/queue with priority bumped to 100 (immediate).
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        const ot = b.owner_type || a.type;
        const oid = b.owner_id != null ? String(b.owner_id) : a.id;
        if (!oid) return res.status(400).json({ error: 'owner_id required' });
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        const item = model.enqueueAudio({
            owner_type: ot, owner_id: oid, queue_type: 'tts',
            text: b.text, source_type: b.source_type || 'manual',
            source_id: b.source_id, requested_by_actor_type: a.type, requested_by_actor_id: a.id,
            metadata: b.metadata, priority: 100,
        });
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.TTS_QUEUED, { queue_id: item.id, owner_type: ot, owner_id: oid, immediate: true }, actorMeta(req));
        res.status(201).json({ item });
    });
    r.post('/tts/skip', json, (req, res) => {
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        const ot = b.owner_type || a.type;
        const oid = b.owner_id != null ? String(b.owner_id) : a.id;
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        if (b.id) {
            const it = model.setAudioStatus(b.id, 'skipped');
            eventBus.publishChatEvent(CHAT_EVENT_TYPES.TTS_SKIPPED, { queue_id: b.id }, actorMeta(req));
            return res.json({ item: it });
        }
        // Skip the head item.
        const list = model.listAudio({ owner_type: ot, owner_id: oid, queue_type: 'tts', status: 'queued', limit: 1 });
        const head = list[0];
        if (!head) return res.json({ item: null });
        const it = model.setAudioStatus(head.id, 'skipped');
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.TTS_SKIPPED, { queue_id: head.id }, actorMeta(req));
        res.json({ item: it });
    });
    r.post('/tts/clear', json, (req, res) => {
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        const ot = b.owner_type || a.type;
        const oid = b.owner_id != null ? String(b.owner_id) : a.id;
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        const result = model.clearAudioQueue({ owner_type: ot, owner_id: oid, queue_type: 'tts' });
        res.json(result);
    });

    // ── audio queue (soundboard / media-request / alerts) ─
    r.get('/audio/queue', (req, res) => {
        const a = policy.actorOfReq(req);
        const ot = req.query.owner_type || a.type;
        const oid = req.query.owner_id != null ? String(req.query.owner_id) : a.id;
        if (!oid) return res.status(400).json({ error: 'owner_id required' });
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        res.json({ items: model.listAudio({ owner_type: ot, owner_id: oid, queue_type: req.query.queue_type, status: req.query.status, limit: req.query.limit }) });
    });
    r.post('/audio/queue', json, (req, res) => {
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        const ot = b.owner_type || a.type;
        const oid = b.owner_id != null ? String(b.owner_id) : a.id;
        if (!oid) return res.status(400).json({ error: 'owner_id required' });
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        const item = model.enqueueAudio({
            owner_type: ot, owner_id: oid,
            queue_type: b.queue_type || 'soundboard',
            source_type: b.source_type || 'manual', source_id: b.source_id,
            requested_by_actor_type: a.type, requested_by_actor_id: a.id,
            text: b.text, audio_url: b.audio_url, media_id: b.media_id,
            external_provider: b.external_provider, external_url: b.external_url,
            playback: b.playback, metadata: b.metadata, priority: b.priority,
        });
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.AUDIO_QUEUED, { queue_id: item.id, queue_type: item.queue_type }, actorMeta(req));
        res.status(201).json({ item });
    });
    r.post('/audio/skip', json, (req, res) => {
        const b = req.body || {};
        if (!b.id) return res.status(400).json({ error: 'id required' });
        const it = model.setAudioStatus(b.id, 'skipped');
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.AUDIO_COMPLETED, { queue_id: b.id, status: 'skipped' }, actorMeta(req));
        res.json({ item: it });
    });
    r.post('/audio/clear', json, (req, res) => {
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        const ot = b.owner_type || a.type;
        const oid = b.owner_id != null ? String(b.owner_id) : a.id;
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        const result = model.clearAudioQueue({ owner_type: ot, owner_id: oid, queue_type: b.queue_type });
        res.json(result);
    });

    // External audio resolution seam (101soundboards, etc).
    // Stays a stub seam: we accept the URL and enqueue a queued audio item
    // that downstream players resolve. Real external fetch lives behind
    // pluggable providers in future.
    r.post('/audio/resolve-external', json, (req, res) => {
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        if (!b.external_url) return res.status(400).json({ error: 'external_url required' });
        const ot = b.owner_type || a.type;
        const oid = b.owner_id != null ? String(b.owner_id) : a.id;
        if (!oid) return res.status(400).json({ error: 'owner_id required' });
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        const item = model.enqueueAudio({
            owner_type: ot, owner_id: oid,
            queue_type: 'soundboard', source_type: 'external_url',
            external_provider: b.provider || providerOf(b.external_url),
            external_url: b.external_url,
            requested_by_actor_type: a.type, requested_by_actor_id: a.id,
            metadata: b.metadata, priority: b.priority,
        });
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.AUDIO_QUEUED, { queue_id: item.id, source_type: 'external_url' }, actorMeta(req));
        res.status(201).json({ item });
    });

    // ── admin diagnostics (lightweight) ─────────────────
    r.get('/admin/active-calls', (_req, res) => {
        res.json({ items: model.listActiveCalls() });
    });

    // ── Phase 16: call participant lifecycle ────────────
    r.post('/calls/:callId/join', json, (req, res) => {
        const c = model.getCall(req.params.callId);
        if (!c) return res.status(404).json({ error: 'call not found' });
        try { policy.assert(policy.decideCallParticipant({ req, call: c }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        const participant = model.addCallParticipant({
            call_id: c.id,
            actor_type: b.actor_type || a.type,
            actor_id: b.actor_id != null ? String(b.actor_id) : a.id,
            role: b.role || 'participant',
            metadata: b.metadata,
        });
        if (c.status === 'ringing' || c.status === 'pending') {
            model.updateCallStatus(c.id, 'active');
        }
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.CALL_PARTICIPANT_JOINED, {
            call_id: c.id, room_id: c.room_id,
            actor_type: participant.actor_type, actor_id: participant.actor_id,
        }, actorMeta(req));
        res.status(201).json({ participant });
    });

    r.post('/calls/:callId/leave', json, (req, res) => {
        const c = model.getCall(req.params.callId);
        if (!c) return res.status(404).json({ error: 'call not found' });
        try { policy.assert(policy.decideCallParticipant({ req, call: c }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        const actorType = b.actor_type || a.type;
        const actorId = b.actor_id != null ? String(b.actor_id) : a.id;
        const participant = model.leaveCallParticipant(c.id, actorType, actorId);
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.CALL_PARTICIPANT_LEFT, {
            call_id: c.id, room_id: c.room_id,
            actor_type: actorType, actor_id: actorId,
        }, actorMeta(req));
        // Auto-end the call when no active participants remain.
        const remaining = model.listCallParticipants(c.id);
        if (!remaining.length && c.status === 'active') {
            model.updateCallStatus(c.id, 'ended');
            eventBus.publishChatEvent(CHAT_EVENT_TYPES.CALL_ENDED, { call_id: c.id, room_id: c.room_id, reason: 'all_left' }, actorMeta(req));
        }
        res.json({ participant: participant || null });
    });

    r.get('/calls/:callId/participants', (req, res) => {
        const c = model.getCall(req.params.callId);
        if (!c) return res.status(404).json({ error: 'call not found' });
        try { policy.assert(policy.decideCallParticipant({ req, call: c }), actorMeta(req)); }
        catch (err) { return denied(res, err); }
        const include_left = String(req.query.include_left || '').toLowerCase() === 'true';
        res.json({ items: model.listCallParticipants(c.id, { include_left }) });
    });

    // ── Phase 16: stream-room binding ───────────────────
    r.post('/stream-bindings', json, (req, res) => {
        const a = policy.actorOfReq(req);
        if (a.type !== 'service' && a.type !== 'admin' && (!req.user || req.user.role !== 'admin')) {
            return res.status(403).json({ error: 'service or admin required' });
        }
        const b = req.body || {};
        if (!b.stream_ref_id || !b.room_id) {
            return res.status(400).json({ error: 'stream_ref_id + room_id required' });
        }
        const room = model.getRoom(b.room_id);
        if (!room) return res.status(404).json({ error: 'room not found' });
        const binding = model.upsertStreamBinding(b);
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.STREAM_ROOM_BOUND, {
            binding_id: binding.id,
            stream_ref_type: binding.stream_ref_type,
            stream_ref_id: binding.stream_ref_id,
            room_id: binding.room_id,
        }, actorMeta(req));
        res.status(201).json({ binding });
    });
    r.get('/stream-bindings', (req, res) => {
        res.json({ items: model.listStreamBindings({ limit: req.query.limit }) });
    });
    r.get('/stream-bindings/:streamId', (req, res) => {
        const refType = String(req.query.stream_ref_type || 'stream');
        const binding = model.getStreamBinding(refType, req.params.streamId);
        if (!binding) return res.status(404).json({ error: 'binding not found' });
        res.json({ binding });
    });

    // ── Phase 16: overlay/dashboard queue read + status update ─
    r.get('/tts/overlay/:ownerType/:ownerId', (req, res) => {
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: req.params.ownerType, owner_id: req.params.ownerId })); }
        catch (err) { return denied(res, err); }
        const queue = model.listAudio({ owner_type: req.params.ownerType, owner_id: req.params.ownerId, queue_type: 'tts' });
        res.json({
            owner_type: req.params.ownerType,
            owner_id: req.params.ownerId,
            settings: model.getTtsSettings(req.params.ownerType, req.params.ownerId),
            items: queue,
        });
    });
    r.post('/tts/queue/:itemId/status', json, (req, res) => {
        const b = req.body || {};
        if (!b.status) return res.status(400).json({ error: 'status required' });
        const item = model.setAudioStatus(req.params.itemId, b.status);
        if (!item) return res.status(404).json({ error: 'item not found' });
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.TTS_ITEM_STATUS_UPDATED, {
            queue_id: item.id, status: item.status,
            owner_type: item.owner_type, owner_id: item.owner_id,
        }, actorMeta(req));
        res.json({ item });
    });
    r.get('/audio/overlay/:ownerType/:ownerId', (req, res) => {
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: req.params.ownerType, owner_id: req.params.ownerId })); }
        catch (err) { return denied(res, err); }
        const items = model.listAudio({
            owner_type: req.params.ownerType, owner_id: req.params.ownerId,
            queue_type: req.query.queue_type,
        });
        res.json({
            owner_type: req.params.ownerType,
            owner_id: req.params.ownerId,
            items,
        });
    });
    r.post('/audio/queue/:itemId/status', json, (req, res) => {
        const b = req.body || {};
        if (!b.status) return res.status(400).json({ error: 'status required' });
        const item = model.setAudioStatus(req.params.itemId, b.status);
        if (!item) return res.status(404).json({ error: 'item not found' });
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.AUDIO_ITEM_STATUS_UPDATED, {
            queue_id: item.id, status: item.status,
            owner_type: item.owner_type, owner_id: item.owner_id,
        }, actorMeta(req));
        res.json({ item });
    });

    // ── Phase 16: durable audio integrations ─────────────
    r.get('/audio/integrations', (req, res) => {
        const a = policy.actorOfReq(req);
        const ot = req.query.owner_type || a.type;
        const oid = req.query.owner_id != null ? String(req.query.owner_id) : a.id;
        if (!oid) return res.status(400).json({ error: 'owner_id required' });
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        res.json({ items: model.listAudioIntegrations({ owner_type: ot, owner_id: oid }) });
    });
    r.post('/audio/integrations', json, (req, res) => {
        const a = policy.actorOfReq(req);
        const b = req.body || {};
        const ot = b.owner_type || a.type;
        const oid = b.owner_id != null ? String(b.owner_id) : a.id;
        if (!oid) return res.status(400).json({ error: 'owner_id required' });
        if (!b.provider) return res.status(400).json({ error: 'provider required' });
        try { policy.assert(policy.decideTtsOwnership({ req, owner_type: ot, owner_id: oid })); }
        catch (err) { return denied(res, err); }
        const integration = model.createAudioIntegration({
            owner_type: ot, owner_id: oid,
            provider: b.provider, label: b.label,
            enabled: b.enabled,
            config: b.config,
            credential_ref: b.credential_ref,
        });
        eventBus.publishChatEvent(CHAT_EVENT_TYPES.AUDIO_INTEGRATION_CREATED, {
            integration_id: integration.id, provider: integration.provider,
            owner_type: integration.owner_type, owner_id: integration.owner_id,
        }, actorMeta(req));
        res.status(201).json({ integration });
    });
    r.delete('/audio/integrations/:id', (req, res) => {
        const a = policy.actorOfReq(req);
        if (a.type === 'anonymous') return res.status(401).json({ error: 'auth required' });
        model.deleteAudioIntegration(req.params.id);
        res.json({ ok: true });
    });

    // Phase 16 — minimum-viable product/status surface for chat workflow.
    r.get('/product/status', (_req, res) => {
        try {
            res.json(model.summarizeProduct());
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message || 'chat_product_status_failed' });
        }
    });

    return r;
}

function providerOf(url) {
    try {
        const u = new URL(String(url));
        return u.hostname;
    } catch { return 'unknown'; }
}

module.exports = { buildRouter };
