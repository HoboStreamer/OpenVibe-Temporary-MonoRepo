'use strict';

const express = require('express');

const {
    attachTraceHeaders,
    createHttpMetricsMiddleware,
    createLogger,
    createRequestLoggerMiddleware,
    createServiceMetrics,
    renderMetrics,
    updateReadinessMetrics,
} = require('@openvibe/observability');

const { buildHealthPayload } = require('./health');
const { buildReadinessReport } = require('./readiness');
const {
    createRequestContextMiddleware,
    realIpMiddleware,
} = require('./middleware');

function resolveVersion(options) {
    const opts = options || {};
    return String(
        opts.version
        || process.env.OPENVIBE_BUILD_VERSION
        || process.env.npm_package_version
        || '0.1.0',
    );
}

function createHealthRouter(handler) {
    const router = express.Router();
    router.get('/', handler);
    return router;
}

function createReadinessRouter(handler) {
    const router = express.Router();
    router.get('/', handler);
    return router;
}

function createMetricsRouter(handler) {
    const router = express.Router();
    router.get('/', handler);
    return router;
}

function createVersionRouter(version) {
    const router = express.Router();
    router.get('/', (_req, res) => {
        res.json({
            ok: true,
            version,
            checked_at: new Date().toISOString(),
        });
    });
    return router;
}

function structuredLogger(serviceName, options) {
    return createLogger(serviceName, options);
}

function createServiceRuntime(options) {
    const opts = options || {};
    const serviceName = String(opts.serviceName || 'openvibe-service');
    const logger = opts.logger || createLogger(serviceName, opts.logging);
    const version = resolveVersion(opts);
    const metrics = createServiceMetrics({
        serviceName,
        collectDefaultMetrics: opts.collectDefaultMetrics !== false,
    });

    function resolveHealth() {
        return buildHealthPayload({
            serviceName,
            extra: typeof opts.getHealth === 'function' ? opts.getHealth() : {},
        });
    }

    function resolveReadiness() {
        const raw = typeof opts.getReadiness === 'function' ? opts.getReadiness() : {};
        return buildReadinessReport(Object.assign({ serviceName }, raw || {}));
    }

    function healthHandler(_req, res) {
        res.json(resolveHealth());
    }

    function readinessHandler(_req, res) {
        const report = updateReadinessMetrics(metrics, resolveReadiness());
        res.status(report.ok ? 200 : 503).json(report);
    }

    async function metricsHandler(_req, res) {
        updateReadinessMetrics(metrics, resolveReadiness());
        res.set('Content-Type', metrics.registry.contentType);
        res.end(await renderMetrics(metrics));
    }

    const requestContextMiddleware = createRequestContextMiddleware({ serviceName });
    const assignRealIp = realIpMiddleware({ serviceName });
    const requestMetricsMiddleware = createHttpMetricsMiddleware(metrics);
    const requestLoggerMiddleware = createRequestLoggerMiddleware({ logger, serviceName, skipPaths: opts.skipPaths });

    return {
        logger,
        metrics,
        healthHandler,
        metricsHandler,
        readinessHandler,
        requestContextMiddleware,
        requestLoggerMiddleware,
        requestMetricsMiddleware,
        version,
        resolveHealth,
        resolveReadiness,
        attach(app) {
            if (!app || typeof app.use !== 'function' || typeof app.get !== 'function') {
                throw new Error('Express app is required to attach runtime endpoints');
            }
            app.use(requestContextMiddleware);
            app.use(assignRealIp);
            app.use(attachTraceHeaders);
            app.use(requestMetricsMiddleware);
            app.use(requestLoggerMiddleware);
            app.use('/health', createHealthRouter(healthHandler));
            app.use('/ready', createReadinessRouter(readinessHandler));
            app.use('/metrics', createMetricsRouter(metricsHandler));
            app.use('/version', createVersionRouter(version));
            return app;
        },
    };
}

module.exports = {
    createHealthRouter,
    createMetricsRouter,
    createReadinessRouter,
    createServiceRuntime,
    createVersionRouter,
    resolveVersion,
    structuredLogger,
};
