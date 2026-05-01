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
const { buildStorage } = require('./storage');
const { buildEventBus } = require('./events');
const { buildRouter, buildFilesRouter } = require('./routes');
const { ProcessingWorker, configureExternalQueue, describeProcessingMode, hasExternalQueue } = require('./processing');
const { buildAuthClient, optionalOpenVibeAuth, serviceActorMiddleware } = require('./middleware');

function buildApp() {
    db.init(config.db.path);
    configureExternalQueue(config.processing);

    const storage = buildStorage(config.storage);
    const eventBus = buildEventBus(config);
    const authClient = buildAuthClient(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId,
        getHealth: () => ({
            auth_issuer: config.auth && config.auth.issuer || null,
            persistence: db.describePersistence(),
            storage: storage.describePlan ? storage.describePlan() : { write_provider: storage.name() },
            processing: {
                interval_ms: config.processing.intervalMs,
                max_attempts: config.processing.maxAttempts,
                ...describeProcessingMode(),
            },
        }),
        getReadiness: () => ({
            persistence: db.describePersistence(),
            checks: [
                {
                    name: 'events_url_configured',
                    ok: !!config.events.url,
                    critical: true,
                    details: { url: config.events.url || null },
                },
                {
                    name: 'auth_issuer_configured',
                    ok: !!(config.auth && config.auth.issuer),
                    critical: true,
                    details: { issuer: config.auth && config.auth.issuer || null },
                },
                {
                    name: 'canonical_storage_provider',
                    ok: !!(config.storage && config.storage.canonicalProvider),
                    critical: true,
                    details: { provider: config.storage && config.storage.canonicalProvider || null },
                },
                {
                    name: 'hot_storage_provider',
                    ok: !!(config.storage && config.storage.hotProvider),
                    critical: false,
                    details: { provider: config.storage && config.storage.hotProvider || null },
                },
                {
                    name: 'multipart_root',
                    ok: !!(config.storage && config.storage.multipartRoot),
                    critical: true,
                    details: { multipart_root: config.storage && config.storage.multipartRoot || null },
                },
                {
                    name: 'processing_queue_mode',
                    ok: !config.processing.useExternalQueue || !!config.processing.redisUrl,
                    critical: false,
                    details: describeProcessingMode(),
                    message: config.processing.useExternalQueue && !config.processing.redisUrl
                        ? 'External media workers requested but OPENVIBE_REDIS_URL is not configured; using local processing worker.'
                        : null,
                },
            ],
            extra: {
                public_base_url: config.storage && config.storage.publicBaseUrl || null,
                provider_names: storage.providerNames ? storage.providerNames() : [storage.name()],
            },
        }),
    });
    runtime.attach(app);

    // Static admin shell (read-only landing page).
    attachIconAssets(app, { routePrefix: '/assets' });
    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.use(optionalOpenVibeAuth(authClient));

    // Mount API. service-actor middleware MUST run before policy decisions.
    app.use('/api/v1', serviceActorMiddleware(config.internalKey), buildRouter({
        storage, eventBus, internalKey: config.internalKey,
    }));

    // The /files/:id endpoint also needs service-actor + auth middleware so
    // private/restricted reads work for owner-services and owning users.
    app.use('/files', serviceActorMiddleware(config.internalKey), buildFilesRouter({ storage }));

    app.use((err, _req, res, _next) => {
        console.error('[media] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    const worker = new ProcessingWorker({
        intervalMs: config.processing.intervalMs,
        storage,
        publishMediaEvent: eventBus.publishMediaEvent,
    });

    return { app, worker };
}

function start() {
    const { app, worker } = buildApp();
    if (!hasExternalQueue()) worker.start();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-media] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => {
        console.log('[openvibe-media] shutting down');
        worker.stop();
        server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server, worker };
}

if (require.main === module) {
    start();
}

module.exports = { buildApp, start };
