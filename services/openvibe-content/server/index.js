'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const { attachHostRouter } = require('./host-router');
const { buildRouter } = require('./routes');
const { hostStatuses } = require('./ssr');

function buildApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId,
        getHealth: () => ({
            ai_url_configured: !!config.aiUrl,
            network_url_configured: !!config.networkUrl,
            surfaces: hostStatuses(config),
            limits: config.limits,
        }),
        getReadiness: () => ({
            checks: [
                {
                    name: 'wave_one_hosts_online',
                    ok: true,
                    status: 'green',
                    critical: true,
                    details: hostStatuses(config).filter((surface) => surface.implemented),
                },
                {
                    name: 'draft_hosts_honest_noindex',
                    ok: true,
                    status: 'yellow',
                    critical: false,
                    details: hostStatuses(config).filter((surface) => surface.implemented && !surface.indexable),
                    message: 'News/reviews/deals/coupons/trade now render as honest draft/noindex hosts until their publication seams are ready.',
                },
                {
                    name: 'ai_control_plane_url',
                    ok: !!config.aiUrl,
                    status: config.aiUrl ? 'green' : 'yellow',
                    critical: false,
                    details: { configured: !!config.aiUrl, url: config.aiUrl || null },
                    message: config.aiUrl ? null : 'OPENVIBE_AI_URL is not configured; the content service is serving static-first pages only.',
                },
            ],
            extra: {
                surfaces: hostStatuses(config),
                limits: config.limits,
            },
        }),
    });
    runtime.attach(app);

    attachHostRouter({ app, config });
    app.use('/assets', express.static(path.join(__dirname, '..', 'public')));
    app.use(buildRouter({ config }));

    app.use((err, _req, res, _next) => {
        console.error('[openvibe-content] unhandled:', err && err.stack || err);
        res.status(500).json({ error: 'internal error' });
    });

    return { app };
}

function start() {
    const { app } = buildApp();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-content] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = {
    buildApp,
    start,
};
