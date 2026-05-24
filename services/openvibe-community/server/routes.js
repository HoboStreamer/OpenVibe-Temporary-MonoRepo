'use strict';

const express = require('express');
const path = require('path');
const model = require('./model');
const policy = require('./policy');
const { COMMUNITY_EVENT_TYPES } = require('@openvibe/contracts');

function loadPagesRegistry() {
    try {
        return JSON.parse(require('fs').readFileSync(path.join(__dirname, 'pages-registry.json'), 'utf8'));
    } catch {
        return [];
    }
}

function bumpPageView(slug) {
    try {
        const db = require('./db').get();
        db.prepare(`
            INSERT INTO community_page_views (slug, view_count, last_viewed_at)
            VALUES (?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(slug) DO UPDATE SET
                view_count = view_count + 1,
                last_viewed_at = CURRENT_TIMESTAMP
        `).run(String(slug));
    } catch {}
}

function getPageViews(slug) {
    try {
        const db = require('./db').get();
        const row = db.prepare(`SELECT view_count, last_viewed_at FROM community_page_views WHERE slug = ?`).get(String(slug));
        return row ? { view_count: row.view_count, last_viewed_at: row.last_viewed_at } : { view_count: 0, last_viewed_at: null };
    } catch { return { view_count: 0, last_viewed_at: null }; }
}

function injectPasteImageUrl(paste) {
    // image_url is already injected by model.hydratePaste; this is a no-op passthrough
    return paste;
}

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

    r.post('/threads/:idOrSlug/vote', json, (req, res) => {
        const thread = model.getThread(req.params.idOrSlug);
        if (!thread) return res.status(404).json({ error: 'thread not found' });
        const a = actorMeta(req);
        if (!a.actor_id) return res.status(401).json({ error: 'authentication required' });
        const b = req.body || {};
        const dir = Number(b.direction);
        if (dir !== 1 && dir !== -1 && dir !== 0) {
            return res.status(400).json({ error: 'direction must be 1, -1, or 0' });
        }
        const result = model.voteThread(thread.id, a.actor_id, dir);
        res.json({ ok: true, thread_id: thread.id, ...result });
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
        const items = model.listPastes({ visibility: 'public', limit: req.query.limit });
        res.json({ items: items.map(injectPasteImageUrl) });
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
        res.status(201).json({ paste: injectPasteImageUrl(paste), url });
    });
    r.get('/pastes/:slug', (req, res) => {
        const paste = model.getPasteBySlug(req.params.slug);
        if (!paste) return res.status(404).json({ error: 'paste not found' });
        try { policy.assert(policy.decideRead({ req, target: { visibility: paste.visibility, created_by_actor_type: paste.created_by_actor_type, created_by_actor_id: paste.created_by_actor_id } })); }
        catch (err) { return denied(res, err); }
        model.bumpPasteView(paste.slug);
        res.json({ paste: injectPasteImageUrl(paste) });
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
                model.recordRelayAudit({ relay_direction: 'discord_to_openvibe', outcome: 'auth_failed' });
                return res.status(401).json({ error: 'invalid relay secret' });
            }
        }
        const b = req.body || {};
        if (!b.discord_channel_id || !b.discord_message_id) {
            model.recordRelayAudit({ relay_direction: 'discord_to_openvibe', outcome: 'invalid_request' });
            return res.status(400).json({ error: 'discord_channel_id + discord_message_id required' });
        }
        // loop prevention — drop messages we've already imported
        if (model.findDiscordMessage(b.discord_message_id)) {
            model.recordRelayAudit({
                relay_direction: 'discord_to_openvibe', outcome: 'deduped',
                discord_channel_id: b.discord_channel_id,
                discord_message_id: b.discord_message_id,
            });
            return res.json({ ok: true, deduped: true });
        }
        const relay = model.findRelayByChannel(b.discord_channel_id);
        if (!relay || !relay.enabled) {
            model.recordRelayAudit({
                relay_direction: 'discord_to_openvibe', outcome: 'skipped_no_relay',
                discord_channel_id: b.discord_channel_id,
                discord_message_id: b.discord_message_id,
            });
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
        model.recordRelayAudit({
            relay_direction: 'discord_to_openvibe', outcome: 'imported',
            relay_id: relay.id,
            discord_channel_id: b.discord_channel_id,
            discord_message_id: b.discord_message_id,
            openvibe_post_id: post.id,
            openvibe_thread_id: thread.id,
        });
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.DISCORD_MESSAGE_IMPORTED,
            { post_id: post.id, thread_id: thread.id, discord_message_id: b.discord_message_id }, { actor_type: 'service', actor_id: 'openvibe-community' });
        res.status(201).json({ post, thread });
    });

    r.get('/discord/status', (req, res) => {
        try { policy.assert(policy.decideRelayManage({ req })); }
        catch (err) { return denied(res, err); }
        const relays = model.listRelays();
        const audit = model.getRelayAuditSummary();
        res.json({
            relay_count: relays.length,
            enabled_count: relays.filter(r => r.enabled).length,
            inbound_secret_configured: !!(config.discord && config.discord.webhookSecret),
            outbound_adapter_configured: !!(config.discord && config.discord.outboundWebhookUrl),
            audit_summary: audit,
            relays,
        });
    });

    r.get('/discord/messages', (req, res) => {
        const limit  = Math.min(parseInt(req.query.limit, 10)  || 50, 200);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const relay_id = req.query.relay_id || null;
        const messages = model.listDiscordMessages({ relay_id, limit, offset });
        res.json({ items: messages, limit, offset });
    });

    // ── promote paste → paste_thread ────────────────────
    r.post('/pastes/:slug/promote', json, (req, res) => {
        const a = actorMeta(req);
        const paste = model.getPasteBySlug(req.params.slug);
        if (!paste) return res.status(404).json({ error: 'paste not found' });
        let thread = model.findPasteThread(paste.id);
        let created = false;
        if (!thread) {
            thread = model.createThread({
                title: paste.title || `Paste: ${paste.slug}`,
                thread_type: 'paste_thread',
                ref_type: 'paste',
                ref_id: paste.id,
                visibility: paste.visibility || 'public',
                status: 'open',
                created_by_actor_type: a.actor_type,
                created_by_actor_id: a.actor_id,
                metadata: {
                    paste_slug: paste.slug,
                    paste_id: paste.id,
                    paste_language: paste.language || null,
                    paste_image_url: (paste.metadata && paste.metadata.image_url) || null,
                },
            });
            created = true;
        }
        res.status(created ? 201 : 200).json({ thread, created });
    });

    // ── Phase 16: paste versions ─────────────────────────
    r.get('/pastes/:slug/versions', (req, res) => {
        const paste = model.getPasteBySlug(req.params.slug);
        if (!paste) return res.status(404).json({ error: 'paste not found' });
        try { policy.assert(policy.decideRead({ req, target: { visibility: paste.visibility, created_by_actor_type: paste.created_by_actor_type, created_by_actor_id: paste.created_by_actor_id } })); }
        catch (err) { return denied(res, err); }
        res.json({ items: model.listPasteVersions(paste.id, { limit: req.query.limit }) });
    });
    r.get('/pastes/:slug/versions/:version', (req, res) => {
        const paste = model.getPasteBySlug(req.params.slug);
        if (!paste) return res.status(404).json({ error: 'paste not found' });
        try { policy.assert(policy.decideRead({ req, target: { visibility: paste.visibility, created_by_actor_type: paste.created_by_actor_type, created_by_actor_id: paste.created_by_actor_id } })); }
        catch (err) { return denied(res, err); }
        const version = model.getPasteVersion(paste.id, req.params.version);
        if (!version) return res.status(404).json({ error: 'version not found' });
        res.json({ version });
    });

    // ── Phase 16: paste comments wrapper (uses generic comments) ─
    r.get('/pastes/:slug/comments', (req, res) => {
        const paste = model.getPasteBySlug(req.params.slug);
        if (!paste) return res.status(404).json({ error: 'paste not found' });
        try { policy.assert(policy.decideRead({ req, target: { visibility: paste.visibility, created_by_actor_type: paste.created_by_actor_type, created_by_actor_id: paste.created_by_actor_id } })); }
        catch (err) { return denied(res, err); }
        const thread = model.findThreadByRef('paste', paste.id);
        if (!thread) return res.json({ items: [] });
        res.json({ items: model.listPosts(thread.id, { limit: req.query.limit }) });
    });
    r.post('/pastes/:slug/comments', json, (req, res) => {
        const paste = model.getPasteBySlug(req.params.slug);
        if (!paste) return res.status(404).json({ error: 'paste not found' });
        const a = actorMeta(req);
        if (a.actor_type === 'anonymous') return res.status(401).json({ error: 'auth required' });
        const b = req.body || {};
        if (!b.body) return res.status(400).json({ error: 'body required' });
        const thread = model.ensureThreadForRef('paste', paste.id, {
            title: paste.title || `paste:${paste.slug}`,
            thread_type: 'paste',
            visibility: paste.visibility,
            community_id: null,
            category_id: null,
        });
        const post = model.createPost({
            thread_id: thread.id,
            author_type: a.actor_type, author_id: a.actor_id,
            body: String(b.body), body_format: b.body_format || 'markdown',
            metadata: b.metadata || {},
        });
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.COMMENT_CREATED,
            { post_id: post.id, thread_id: thread.id, ref_type: 'paste', ref_id: paste.id }, a);
        res.status(201).json({ post, thread });
    });

    // ── Phase 16: discord audit and outbound mock ────────
    r.get('/discord/audit', (req, res) => {
        try { policy.assert(policy.decideRelayManage({ req })); }
        catch (err) { return denied(res, err); }
        res.json({
            items: model.listRelayAudit({
                relay_direction: req.query.relay_direction,
                outcome: req.query.outcome,
                limit: req.query.limit,
            }),
            summary: model.getRelayAuditSummary(),
        });
    });
    r.post('/discord/outbound', json, (req, res) => {
        try { policy.assert(policy.decideRelayManage({ req })); }
        catch (err) { return denied(res, err); }
        const b = req.body || {};
        if (!b.discord_channel_id || !b.body) {
            return res.status(400).json({ error: 'discord_channel_id + body required' });
        }
        const idempotencyKey = req.headers['x-idempotency-key'] || b.idempotency_key || null;
        if (!idempotencyKey) {
            return res.status(400).json({ error: 'idempotency required (X-Idempotency-Key header or idempotency_key)' });
        }
        // Idempotency: dedupe on idempotency_key already audited
        const dedupe = model.listRelayAudit({ relay_direction: 'openvibe_to_discord', limit: 200 })
            .find((row) => row.idempotency_key === idempotencyKey && row.outcome === 'sent');
        if (dedupe) {
            model.recordRelayAudit({
                relay_direction: 'openvibe_to_discord', outcome: 'deduped',
                discord_channel_id: b.discord_channel_id, idempotency_key: idempotencyKey,
            });
            return res.json({ ok: true, deduped: true });
        }
        const relay = model.findRelayByChannel(b.discord_channel_id);
        if (!relay || !relay.enabled) {
            model.recordRelayAudit({
                relay_direction: 'openvibe_to_discord', outcome: 'skipped_no_relay',
                discord_channel_id: b.discord_channel_id, idempotency_key: idempotencyKey,
            });
            return res.json({ ok: false, reason: 'no enabled relay for channel' });
        }
        // Phase 16 — outbound is intentionally a mock seam: real Discord
        // delivery requires a configured webhook adapter and credentials.
        const outboundConfigured = !!(config.discord && config.discord.outboundWebhookUrl);
        const outcome = outboundConfigured ? 'sent' : 'mock_delivered';
        // Synthesize a fake discord_message_id for loop prevention symmetry.
        const synthMessageId = `mock_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        model.recordDiscordMessage({
            discord_message_id: synthMessageId,
            discord_channel_id: b.discord_channel_id,
            openvibe_post_id: b.source_post_id || null,
            openvibe_thread_id: relay.openvibe_thread_id || null,
            relay_direction: 'openvibe_to_discord',
            metadata: { mock: !outboundConfigured, idempotency_key: idempotencyKey },
        });
        model.recordRelayAudit({
            relay_direction: 'openvibe_to_discord', outcome,
            relay_id: relay.id,
            discord_channel_id: b.discord_channel_id,
            discord_message_id: synthMessageId,
            openvibe_post_id: b.source_post_id || null,
            idempotency_key: idempotencyKey,
            metadata: { configured: outboundConfigured },
        });
        eventBus.publishCommunityEvent(COMMUNITY_EVENT_TYPES.DISCORD_MESSAGE_RELAYED,
            { discord_message_id: synthMessageId, discord_channel_id: b.discord_channel_id, outcome },
            { actor_type: 'service', actor_id: 'openvibe-community' });
        res.status(201).json({ ok: true, outcome, discord_message_id: synthMessageId });
    });

    // ── community pages ──────────────────────────────────────────────────────
    r.get('/pages', (_req, res) => {
        const registry = loadPagesRegistry();
        const items = registry.map((page) => {
            const views = getPageViews(page.slug);
            return Object.assign({}, page, views);
        }).sort((a, b) => b.view_count - a.view_count);
        res.json({ items });
    });

    // Phase 16 — minimum-viable product/status surface for community workflow.
    r.get('/product/status', (_req, res) => {
        try {
            res.json(model.summarizeProduct());
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message || 'community_product_status_failed' });
        }
    });

    return r;
}

module.exports = { buildRouter, loadPagesRegistry, bumpPageView };
