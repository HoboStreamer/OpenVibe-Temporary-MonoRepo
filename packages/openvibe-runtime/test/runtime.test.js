'use strict';

const assert = require('assert');

const {
    asyncRoute,
    buildReadinessReport,
    createServiceRuntime,
    rateLimit,
} = require('..');

(function readinessAggregatesPersistenceAndChecks() {
    const report = buildReadinessReport({
        serviceName: 'openvibe-runtime-test',
        persistence: {
            requested_mode: 'postgres',
            effective_mode: 'sqlite-fallback',
            adapter_status: 'not-implemented',
            database_url_configured: true,
            readiness: 'red',
        },
        checks: [
            { name: 'redis', ok: false, critical: false },
        ],
    });

    assert.strictEqual(report.status, 'red');
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.summary.red, 1);
    assert.strictEqual(report.summary.yellow, 1);
})();

(function serviceRuntimeBuildsHealthAndReadinessHandlers() {
    const runtime = createServiceRuntime({
        serviceName: 'openvibe-runtime-test',
        collectDefaultMetrics: false,
        getHealth: () => ({ persistence: { mode: 'sqlite' }, feature: 'demo' }),
        getReadiness: () => ({
            persistence: {
                requested_mode: 'sqlite',
                effective_mode: 'sqlite',
                adapter_status: 'local-bootstrap',
                database_url_configured: false,
                readiness: 'green',
            },
            checks: [{ name: 'events_url', ok: true, critical: true }],
        }),
    });

    const health = runtime.resolveHealth();
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.feature, 'demo');

    const readiness = runtime.resolveReadiness();
    assert.strictEqual(readiness.status, 'green');
    assert.strictEqual(readiness.ok, true);

    let statusCode = 0;
    let payload = null;
    runtime.readinessHandler({}, {
        status(code) { statusCode = code; return this; },
        json(body) { payload = body; return this; },
    });

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(payload.status, 'green');
})();

(function versionEndpointIsAvailable() {
    const runtime = createServiceRuntime({
        serviceName: 'openvibe-runtime-test',
        collectDefaultMetrics: false,
        version: '9.9.9-test',
    });

    let versionPayload = null;
    const app = {
        middlewares: [],
        routes: {},
        use(pathOrMiddleware, maybeMiddleware) {
            this.middlewares.push({ pathOrMiddleware, maybeMiddleware });
        },
        get(path, handler) {
            this.routes[path] = handler;
        },
    };
    runtime.attach(app);

    const versionMount = app.middlewares.find((entry) => entry.pathOrMiddleware === '/version');
    assert.ok(versionMount, 'version router mounted');

    versionMount.maybeMiddleware.handle({ method: 'GET', url: '/', headers: {} }, {
        json(body) { versionPayload = body; return this; },
        setHeader() {},
    }, () => {});

    assert.strictEqual(versionPayload.version, '9.9.9-test');
})();

(function asyncRouteForwardsErrors() {
    const error = new Error('boom');
    let forwarded = null;
    asyncRoute(async () => { throw error; })({}, {}, (err) => { forwarded = err; });
    setImmediate(() => {
        assert.strictEqual(forwarded, error);
    });
})();

(function inMemoryRateLimitRejectsAfterThreshold() {
    const middleware = rateLimit({ windowMs: 1000, limit: 1, scope: 'runtime-test' });
    const req = { realIp: '127.0.0.1' };
    const first = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status() { return this; }, json(body) { this.body = body; return this; } };
    const second = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };

    let nextCalled = 0;
    middleware(req, first, () => { nextCalled += 1; });
    middleware(req, second, () => { nextCalled += 1; });

    assert.strictEqual(nextCalled, 1);
    assert.strictEqual(second.statusCode, 429);
    assert.strictEqual(second.body.error, 'rate limit exceeded');
})();

console.log('openvibe-runtime: OK');
