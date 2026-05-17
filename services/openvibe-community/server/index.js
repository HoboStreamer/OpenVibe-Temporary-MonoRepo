'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { attachIconAssets } = require('@openvibe/icons/express');
const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const db = require('./db');
const { buildEventBus } = require('./events');
const { buildRouter } = require('./routes');
const { buildAuthClient, optionalOpenVibeAuth, serviceActorMiddleware } = require('./middleware');
const communitySSR = require('./ssr');

function buildApp() {
    db.init(config.db.path);
    const eventBus = buildEventBus(config);
    const authClient = buildAuthClient(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId || 'openvibe-community',
        getHealth: () => ({
            persistence: db.describePersistence(),
            auth_issuer: config.auth && config.auth.issuer || null,
            discord_webhook: !!(config.discord && config.discord.webhookSecret),
        }),
        getReadiness: () => ({
            persistence: db.describePersistence(),
            checks: [
                {
                    name: 'events_url_configured',
                    ok: !!(config.events && config.events.url),
                    critical: true,
                    details: { url: config.events && config.events.url || null },
                },
                {
                    name: 'auth_issuer_configured',
                    ok: !!(config.auth && config.auth.issuer),
                    critical: true,
                    details: { issuer: config.auth && config.auth.issuer || null },
                },
                {
                    name: 'discord_relay_secret',
                    ok: !!(config.discord && config.discord.webhookSecret),
                    critical: false,
                    details: { configured: !!(config.discord && config.discord.webhookSecret) },
                    message: (config.discord && config.discord.webhookSecret) ? null : 'Discord relay webhook secret is not configured in this runtime.',
                },
            ],
        }),
    });
    runtime.attach(app);

    attachIconAssets(app, { routePrefix: '/assets' });
    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.use(optionalOpenVibeAuth(authClient));

    const apiRouter = buildRouter({ eventBus, config });

    // Canonical API surface.
    app.use('/api/community', serviceActorMiddleware(config.internalKey), apiRouter);

    // Legacy paste compatibility — `/api/pastes/*` reroutes into community pastes.
    app.use('/api/pastes', serviceActorMiddleware(config.internalKey), (req, _res, next) => {
        const sub = req.url === '/' ? '' : req.url;
        req.url = `/pastes${sub}`;
        return apiRouter(req, _res, next);
    });

    // /p/:slug — paste viewer (HTML for browser requests, JSON for API clients).
    app.get('/p/:slug', (req, res) => {
        const m = require('./model');
        const paste = m.getPasteBySlug(req.params.slug);
        if (!paste) {
            const acceptsHtml = req.accepts(['html', 'json']) === 'html';
            if (acceptsHtml) {
                return res.status(404).send(communitySSR.renderPasteViewPage(null));
            }
            return res.status(404).json({ error: 'paste not found' });
        }
        m.bumpPasteView(paste.slug);
        const acceptsHtml = req.accepts(['html', 'json']) === 'html';
        if (acceptsHtml) {
            return res.send(communitySSR.renderPasteViewPage(paste));
        }
        return res.json({ paste });
    });

    // /pulse, /threads, /pastes — SSR product pages.
    app.get('/pulse', (req, res) => {
        const m = require('./model');
        const threads = m.listThreads({ limit: 12, status: 'open' });
        const pastes  = m.listPastes({ visibility: 'public', limit: 12 });
        res.send(communitySSR.renderPulsePage(threads, pastes));
    });

    app.get('/threads', (req, res) => {
        const m = require('./model');
        const threads = m.listThreads({ limit: 60, status: 'open' });
        res.send(communitySSR.renderThreadsPage(threads));
    });

    app.get('/pastes', (req, res) => {
        const m = require('./model');
        const pastes = m.listPastes({ visibility: 'public', limit: 80 });
        res.send(communitySSR.renderPastesPage(pastes));
    });

    app.get('/chat', (_req, res) => {
        const m = require('./model');
        const messages = m.listDiscordMessages({ limit: 50 });
        res.send(communitySSR.renderChatPage(messages));
    });

    // Forum surface — served at /forum/* (also used by openvibe.forum domain via nginx)
    app.get('/forum', (_req, res) => {
        const m = require('./model');
        const spaces = m.listSpaces({ visibility: 'public', limit: 40 });
        const recentThreads = m.listThreads({ limit: 20, status: 'open' });
        // Annotate spaces with thread counts
        const spacesAnnotated = spaces.map((s) => {
            try {
                const count = require('./db').get().prepare(`SELECT COUNT(*) AS c FROM community_threads WHERE space_id = ? AND status != 'archived'`).get(s.id);
                return Object.assign({}, s, { thread_count: count && count.c || 0 });
            } catch {
                return Object.assign({}, s, { thread_count: 0 });
            }
        });
        res.send(communitySSR.renderForumHomePage(spacesAnnotated, recentThreads));
    });
    app.get('/forum/s/:slug', (req, res) => {
        const m = require('./model');
        const space = m.getSpace(req.params.slug);
        // Threads are stored with community_id = space.id in this data model
        const threads = space ? m.listThreads({ community_id: space.id, limit: 60, status: 'open' }) : [];
        res.send(communitySSR.renderForumSpacePage(space, threads));
    });
    app.get('/forum/t/:id', (req, res) => {
        const m = require('./model');
        const thread = m.getThread(req.params.id);
        const posts = thread ? m.listPosts({ thread_id: thread.id, limit: 200 }) : [];
        res.send(communitySSR.renderForumThreadPage(thread, posts));
    });

    // /threads/:idOrSlug — HTML thread detail page (before API mounts so it only
    // fires for browser Accept: text/html requests; API clients hit /api/community/threads/:id)
    app.get('/threads/:idOrSlug', (req, res) => {
        const m = require('./model');
        const thread = m.getThread(req.params.idOrSlug);
        if (!thread) return res.status(404).send(communitySSR.renderThreadDetailPage(null, []));
        const posts = m.listPosts({ thread_id: thread.id, limit: 200 });
        res.send(communitySSR.renderThreadDetailPage(thread, posts));
    });

    app.use((err, _req, res, _next) => {
        console.error('[community] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    return { app };
}

function start() {
    const { app } = buildApp();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-community] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => { console.log('[openvibe-community] shutting down'); server.close(() => process.exit(0)); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = { buildApp, start };
