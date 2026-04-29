'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const registry = require('./registry');
const { createWorkerHost } = require('./processor-runtime');
const { buildWorkerHealth, buildWorkerReadiness } = require('./runtime');

function buildApp() {
    const workerHost = createWorkerHost({ config, registry });
    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(express.json({ limit: '256kb' }));

    app.get('/favicon.ico', (_req, res) => {
        res.status(204).end();
    });

    const runtime = createServiceRuntime({
        serviceName: config.serviceId,
        getHealth: () => buildWorkerHealth(config, workerHost),
        getReadiness: () => buildWorkerReadiness(config, workerHost),
    });
    runtime.attach(app);

    app.get('/api/v1/jobs', (_req, res) => {
        res.json({ items: workerHost.listJobs() });
    });
    app.get('/api/v1/queues', async (_req, res, next) => {
        try {
            res.json({ items: await workerHost.listQueues() });
        } catch (error) {
            next(error);
        }
    });
    app.post('/api/v1/jobs/:name/enqueue', async (req, res, next) => {
        try {
            const result = await workerHost.enqueue(req.params.name, req.body || {}, req.body && req.body.options || {});
            res.status(result.queued ? 202 : 409).json(result);
        } catch (error) {
            next(error);
        }
    });
    app.get('/api/v1/runtime', (_req, res) => {
        res.json(workerHost.summary());
    });

    app.use((err, _req, res, _next) => {
        console.error('[openvibe-workers] unhandled:', err && err.stack || err);
        res.status(500).json({ error: 'internal error' });
    });

    return { app, workerHost };
}

function start() {
    const { app, workerHost } = buildApp();
    workerHost.start().catch((error) => {
        console.error('[openvibe-workers] failed to start processor runtime:', error && error.stack || error);
    });
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-workers] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => {
        workerHost.stop().finally(() => server.close(() => process.exit(0)));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server, workerHost };
}

if (require.main === module) start();

module.exports = { buildApp, start };
