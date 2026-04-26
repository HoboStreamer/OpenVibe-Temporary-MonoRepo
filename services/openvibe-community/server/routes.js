'use strict';

const express = require('express');
const model = require('./model');
const policy = require('./policy');
const { COMMUNITY_EVENT_TYPES } = require('@openvibe/contracts');

function buildRouter({ eventBus, config }) {
    const r = express.Router();
    const json = express.json({ limit: '1mb' });

    function actorMeta(req) {
        const a = policy.actorOfReq(req);
        return { actor_type: a.type, actor_id: a.id };
    }
    function denied(res, err) {
        return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
    }

    // ── spaces ───────────────────────────────────────────
    r.get('/spaces', (_req, res) => {
        res.json({ items: model.listSpaces({ visibility: 'public' }) });
    });
    r.post('/spaces', json, (req, res) => {
        const a = actorMeta(req);
        const b = req.body || {};
        if (!b.name) return res.status(400).json({ error: 'name required' });
        const space = model.createSpace(Object.assign({}, b, {
            created_by_actor_type: a.actor_type, created_by_actor_id: a.actor_id,
        }));
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.SPACE_CREATED,
            { space_id: space.id, slug: space.slug }, a);
        res.status(201).json({ space });
    });
    r.get('/spaces/:idOrSlug', (req, res) => {
        const space = model.getSpace(req.params.idOrSlug);
        if (!space) return res.status(404).json({ error: 'space not found' });
        try { policy.assert(policy.decideRead({ req, target: space })); }
        catch (err) { return denied(res, err); }
        res.json({ space });
    });
    r.put('/spaces/:idOrSlug', json, (req, res) => {
        const space = model.getSpace(req.params.idOrSlug);
        if (!space) return res.status(404).json({ error: 'space not found' });
        try { policy.assert(policy.decideRelayManage({ req })); }
        catch (err) { return denied(res, err); }
        const updated = model.updateSpace(space.id, req.body || {});
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.SPACE_UPDATED, { space_id: updated.id }, actorMeta(req));
        res.json({ space: updated });
    });

    // ── categories ───────────────────────────────────────
    r.get('/spaces/:spaceId/categories', (req, res) => {
        const space = model.getSpace(req.params.spaceId);
        if (!space) return res.status(404).json({ error: 'space not found' });
        res.json({ items: model.listCategories(space.id) });
    });
    r.post('/spaces/:spaceId/categories', json, (req, res) => {
        const space = model.getSpace(req.params.spaceId);
        if (!space) return res.status(404).json({ error: 'space not found' });
        const b = req.body || {};
        if (!b.name) return res.status(400).json({ error: 'name required' });
        const cat = model.createCategory({ community_id: space.id, name: b.name, slug: b.slug, description: b.description, sort_order: b.sort_order });
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.CATEGORY_CREATED, { space_id: space.id, category_id: cat.id }, actorMeta(req));
        res.status(201).json({ category: cat });
    });

    // ── threads ──────────────────────────────────────────
    r.get('/threads', (req, res) => {
        res.json({ items: model.listThreads({
            community_id: req.query.community_id,
            category_id: req.query.category_id,
            status: req.query.status,
            ref_type: req.query.ref_type,
            ref_id: req.query.ref_id,
            limit: req.query.limit,
        }) });
    });
    r.post('/threads', json, (req, res) => {
        const a = actorMeta(req);
        const b = req.body || {};
        if (!b.title) return res.status(400).json({ error: 'title required' });
        const thread = model.createThread(Object.assign({}, b, {
            created_by_actor_type: a.actor_type, created_by_actor_id: a.actor_id,
        }));
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.THREAD_CREATED,
            { thread_id: thread.id, community_id: thread.community_id, category_id: thread.category_id }, a);
        res.status(201).json({ thread });
    });
    r.get('/threads/:idOrSlug', (req, res) => {
        const thread = model.getThread(req.params.idOrSlug);
        if (!thread) return res.status(404).json({ error: 'thread not found' });
        try { policy.assert(policy.decideRead({ req, target: thread })); }
        catch (err) { return denied(res, err); }
        res.json({ thread });
    });
    r.post('/threads/:idOrSlug/lock', (req, res) => {
        const thread = model.getThread(req.params.idOrSlug);
        if (!thread) return res.status(404).json({ error: 'thread not found' });
        try { policy.assert(policy.decideRelayManage({ req })); }
        catch (err) { return denied(res, err); }
        const updated = model.updateThread(thread.id, { status: 'locked' });
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.THREAD_LOCKED, { thread_id: thread.id }, actorMeta(req));
        res.json({ thread: updated });
    });

    // ── posts ────────────────────────────────────────────
    r.get('/threads/:idOrSlug/posts', (req, res) => {
        const thread = model.getThread(req.params.idOrSlug);
        if (!thread) return res.status(404).json({ error: 'thread not found' });
        try { policy.assert(policy.decideRead({ req, target: thread })); }
        catch (err) { return denied(res, err); }
        res.json({ items: model.listPosts(thread.id, { limit: req.query.limit, since_id: req.query.since_id }) });
    });
    r.post('/threads/:idOrSlug/posts', json, (req, res) => {
        const thread = model.getThread(req.params.idOrSlug);
        if (!thread) return res.status(404).json({ error: 'thread not found' });
        try { policy.assert(policy.decidePost({ req, thread })); }
        catch (err) { return denied(res, err); }
        const a = actorMeta(req);
        const b = req.body || {};
        const post = model.createPost(Object.assign({}, b, {
            thread_id: thread.id,
            author_type: b.author_type || a.actor_type,
            author_id:   b.author_id   || a.actor_id,
        }));
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.POST_CREATED,
            { post_id: post.id, thread_id: thread.id, community_id: thread.community_id }, a);
        res.status(201).json({ post });
    });
    r.put('/posts/:postId', json, (req, res) => {
        const post = model.getPost(req.params.postId);
        if (!post) return res.status(404).json({ error: 'post not found' });
        try { policy.assert(policy.decideEdit({ req, post })); }
        catch (err) { return denied(res, err); }
        const updated = model.updatePost(post.id, req.body || {});
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.POST_UPDATED, { post_id: post.id }, actorMeta(req));
        res.json({ post: updated });
    });
    r.delete('/posts/:postId', (req, res) => {
        const post = model.getPost(req.params.postId);
        if (!post) return res.status(404).json({ error: 'post not found' });
        try { policy.assert(policy.decideDelete({ req, post })); }
        catch (err) { return denied(res, err); }
        const updated = model.deletePost(post.id);
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.POST_DELETED, { post_id: post.id }, actorMeta(req));
        res.json({ post: updated });
    });

    // ── reusable comments (vods, clips, blog posts, etc.) ─
    r.get('/comments', (req, res) => {
        const ref_type = String(req.query.ref_type || '');
        const ref_id   = String(req.query.ref_id || '');
        if (!ref_type || !ref_id) return res.status(400).json({ error: 'ref_type + ref_id required' });
        const thread = model.findThreadByRef(ref_type, ref_id);
        if (!thread) return res.json({ items: [], thread: null });
        res.json({ items: model.listPosts(thread.id, { limit: req.query.limit }), thread });
    });
    r.post('/comments', json, (req, res) => {
        const a = actorMeta(req);
        const b = req.body || {};
        if (!b.ref_type || !b.ref_id) return res.status(400).json({ error: 'ref_type + ref_id required' });
        if (!b.body) return res.status(400).json({ error: 'body required' });
        const thread = model.ensureThreadForRef(b.ref_type, b.ref_id, {
            title: b.title || `${b.ref_type}:${b.ref_id}`,
            thread_type: 'comments',
            visibility: 'public',
            created_by_actor_type: a.actor_type,
            created_by_actor_id: a.actor_id,
        });
        try { policy.assert(policy.decidePost({ req, thread })); }
        catch (err) { return denied(res, err); }
        const post = model.createPost({
            thread_id: thread.id,
            author_type: a.actor_type, author_id: a.actor_id,
            body: b.body, body_format: b.body_format || 'markdown',
        });
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.COMMENT_CREATED,
            { post_id: post.id, thread_id: thread.id, ref_type: b.ref_type, ref_id: b.ref_id }, a);
        res.status(201).json({ post, thread });
    });

    // ── pastes ───────────────────────────────────────────
    r.get('/pastes', (req, res) => {
        res.json({ items: model.listPastes({ visibility: 'public', limit: req.query.limit }) });
    });
    r.post('/pastes', json, (req, res) => {
        const a = actorMeta(req);
        const b = req.body || {};
        if (!b.body) return res.status(400).json({ error: 'body required' });
        const paste = model.createPaste(Object.assign({}, b, {
            created_by_actor_type: a.actor_type, created_by_actor_id: a.actor_id,
        }));
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.PASTE_CREATED,
            { paste_id: paste.id, slug: paste.slug }, a);
        const url = `${config.publicBaseUrl}/p/${encodeURIComponent(paste.slug)}`;
        res.status(201).json({ paste, url });
    });
    r.get('/pastes/:slug', (req, res) => {
        const paste = model.getPasteBySlug(req.params.slug);
        if (!paste) return res.status(404).json({ error: 'paste not found' });
        try { policy.assert(policy.decideRead({ req, target: { visibility: paste.visibility, created_by_actor_type: paste.created_by_actor_type, created_by_actor_id: paste.created_by_actor_id } })); }
        catch (err) { return denied(res, err); }
        model.bumpPasteView(paste.slug);
        res.json({ paste });
    });
    r.put('/pastes/:slug', json, (req, res) => {
        const paste = model.getPasteBySlug(req.params.slug);
        if (!paste) return res.status(404).json({ error: 'paste not found' });
        try { policy.assert(policy.decidePasteOwnership({ req, paste })); }
        catch (err) { return denied(res, err); }
        const updated = model.updatePaste(paste.slug, req.body || {});
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.PASTE_UPDATED, { paste_id: updated.id, slug: updated.slug }, actorMeta(req));
        res.json({ paste: updated });
    });
    r.delete('/pastes/:slug', (req, res) => {
        const paste = model.getPasteBySlug(req.params.slug);
        if (!paste) return res.status(404).json({ error: 'paste not found' });
        try { policy.assert(policy.decidePasteOwnership({ req, paste })); }
        catch (err) { return denied(res, err); }
        model.deletePaste(paste.slug);
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.PASTE_DELETED, { paste_id: paste.id, slug: paste.slug }, actorMeta(req));
        res.json({ ok: true });
    });

    // ── attachments ──────────────────────────────────────
    r.post('/attachments', json, (req, res) => {
        const b = req.body || {};
        if (!b.attached_to_type || !b.attached_to_id || !b.media_id) {
            return res.status(400).json({ error: 'attached_to_type + attached_to_id + media_id required' });
        }
        const att = model.attachMedia(b);
        res.status(201).json({ attachment: att });
    });
    r.get('/attachments', (req, res) => {
        const t = String(req.query.attached_to_type || '');
        const id = String(req.query.attached_to_id || '');
        if (!t || !id) return res.status(400).json({ error: 'attached_to_type + attached_to_id required' });
        res.json({ items: model.listAttachments(t, id) });
    });

    // ── discord relay ────────────────────────────────────
    r.get('/discord/relays', (req, res) => {
        try { policy.assert(policy.decideRelayManage({ req })); }
        catch (err) { return denied(res, err); }
        res.json({ items: model.listRelays() });
    });
    r.post('/discord/relays', json, (req, res) => {
        try { policy.assert(policy.decideRelayManage({ req })); }
        catch (err) { return denied(res, err); }
        const b = req.body || {};
        if (!b.discord_channel_id) return res.status(400).json({ error: 'discord_channel_id required' });
        const ex = model.findRelayByChannel(b.discord_channel_id);
        if (ex) {
            const updated = model.updateRelay(ex.id, b);
            return res.json({ relay: updated });
        }
        const relay = model.createRelay(b);
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.DISCORD_RELAY_CREATED,
            { relay_id: relay.id, discord_channel_id: relay.discord_channel_id }, actorMeta(req));
        res.status(201).json({ relay });
    });
    r.put('/discord/relays/:id', json, (req, res) => {
        try { policy.assert(policy.decideRelayManage({ req })); }
        catch (err) { return denied(res, err); }
        const relay = model.getRelay(req.params.id);
        if (!relay) return res.status(404).json({ error: 'relay not found' });
        const updated = model.updateRelay(relay.id, req.body || {});
        res.json({ relay: updated });
    });

    // Inbound Discord webhook — relays an incoming Discord message into a thread/post.
    // Must verify shared secret if `discord.webhookSecret` is configured.
    r.post('/discord/webhook', json, (req, res) => {
        if (config.discord && config.discord.webhookSecret) {
            const provided = req.headers['x-discord-relay-secret'];
            if (!provided || provided !== config.discord.webhookSecret) {
                return res.status(401).json({ error: 'invalid relay secret' });
            }
        }
        const b = req.body || {};
        if (!b.discord_channel_id || !b.discord_message_id) {
            return res.status(400).json({ error: 'discord_channel_id + discord_message_id required' });
        }
        // loop prevention — drop messages we've already imported
        if (model.findDiscordMessage(b.discord_message_id)) {
            return res.json({ ok: true, deduped: true });
        }
        const relay = model.findRelayByChannel(b.discord_channel_id);
        if (!relay || !relay.enabled) {
            return res.json({ ok: false, reason: 'no enabled relay for channel' });
        }
        let thread = relay.openvibe_thread_id ? model.getThread(relay.openvibe_thread_id) : null;
        if (!thread) {
            thread = model.ensureThreadForRef('discord_channel', b.discord_channel_id, {
                community_id: relay.community_id || null,
                category_id: relay.openvibe_category_id || null,
                title: `#${b.channel_name || b.discord_channel_id}`,
                thread_type: 'discord_relay',
                visibility: 'public',
            });
            model.updateRelay(relay.id, { openvibe_thread_id: thread.id });
        }
        const post = model.createPost({
            thread_id: thread.id,
            author_type: 'discord_user',
            author_id: b.discord_author_id || 'unknown',
            body: String(b.body || ''),
            body_format: 'markdown',
            source_type: 'discord',
            source_id: b.discord_message_id,
            metadata: { discord_author_name: b.discord_author_name || null },
        });
        model.recordDiscordMessage({
            discord_message_id: b.discord_message_id,
            discord_channel_id: b.discord_channel_id,
            openvibe_post_id: post.id,
            openvibe_thread_id: thread.id,
            relay_direction: 'discord_to_openvibe',
            metadata: { author: b.discord_author_name },
        });
        model.updateRelay(relay.id, { last_synced_at: new Date().toISOString() });
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.DISCORD_MESSAGE_IMPORTED,
            { post_id: post.id, thread_id: thread.id, discord_message_id: b.discord_message_id }, { actor_type: 'service', actor_id: 'openvibe-community' });
        res.status(201).json({ post, thread });
    });

    r.get('/discord/status', (req, res) => {
        try { policy.assert(policy.decideRelayManage({ req })); }
        catch (err) { return denied(res, err); }
        const relays = model.listRelays();
        res.json({
            relay_count: relays.length,
            enabled_count: relays.filter(r => r.enabled).length,
            relays,
        });
    });

    return r;
}

module.exports = { buildRouter };
