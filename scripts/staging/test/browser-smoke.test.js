'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { runBrowserSmoke } = require('../browser-smoke');

function buildHealthyPersistenceDescriptor() {
    return {
        mode: 'postgres',
        requested_mode: 'postgres',
        effective_mode: 'postgres',
        adapter_status: 'implemented',
        legacy_compat_mode: false,
    };
}

function buildReadinessPayload(service, checks) {
    const summary = { green: 0, yellow: 0, red: 0 };
    for (const check of checks) {
        summary[check.status] += 1;
    }
    return {
        ok: summary.red === 0,
        ready: summary.red === 0 && summary.yellow === 0,
        status: summary.red > 0 ? 'red' : summary.yellow > 0 ? 'yellow' : 'green',
        service,
        summary,
        checks,
    };
}

function buildWorkersReadyPayload() {
    return buildReadinessPayload('openvibe-workers', [
        { name: 'redis_url_configured', status: 'green' },
        { name: 'processors_enabled', status: 'green' },
        { name: 'worker_runtime_started', status: 'green' },
        { name: 'worker_heartbeat', status: 'green' },
        { name: 'processor_dependencies', status: 'green' },
    ]);
}

function buildRealtimeReadyPayload() {
    return buildReadinessPayload('openvibe-realtime', [
        { name: 'redis_adapter', status: 'green' },
        { name: 'event_bridge', status: 'green' },
        { name: 'internal_key_overridden', status: 'yellow' },
    ]);
}

function listen(server) {
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function close(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function urlFor(server) {
    return `http://127.0.0.1:${server.address().port}`;
}

function makeNetworkServer(options = {}) {
    const leakProductionOrigin = !!options.leakProductionOrigin;
    const persistence = options.persistence || buildHealthyPersistenceDescriptor();
    return http.createServer((req, res) => {
        const host = String(req.headers.host || '').split(':')[0].toLowerCase();
        if (req.url === '/health') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, service: 'openvibe-network', persistence }));
            return;
        }
        if (host === 'auth.openvibe.network.localhost' && req.url === '/.well-known/openid-configuration') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
                issuer: 'http://auth.openvibe.network.localhost:4100',
                jwks_uri: 'http://auth.openvibe.network.localhost:4100/.well-known/jwks.json',
                authorization_endpoint: 'http://auth.openvibe.network.localhost:4100/oauth/authorize',
            }));
            return;
        }
        if (host === 'my.openvibe.network.localhost' && req.url === '/api/v1/session') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ authenticated: false }));
            return;
        }

        const htmlByHost = {
            'openvibe.network.localhost': '<title>OpenVibe Network — One account. Every OpenVibe service.</title>',
            'openvibe.tools.localhost': '<title>OpenVibe Tools — Search every service</title>',
            'admin.openvibe.network.localhost': '<title>admin.openvibe.network — operator console</title>',
            'my.openvibe.network.localhost': '<title>my.openvibe.network — your account</title>',
            'themes.openvibe.network.localhost': '<title>themes.openvibe.network — themes catalog</title>',
        };

        if (htmlByHost[host]) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            const extra = leakProductionOrigin && host === 'openvibe.network.localhost'
                ? '<a href="https://openvibe.network/leak">bad link</a>'
                : '<a href="http://openvibe.tools.localhost:4100/">local link</a>';
            res.end(`<!doctype html><html><head>${htmlByHost[host]}</head><body>${extra}</body></html>`);
            return;
        }

        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
    });
}

function makeHtmlServer(title, options = {}) {
    const persistence = options.persistence || buildHealthyPersistenceDescriptor();
    const hostMap = options.hostMap || null;
    return http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, persistence }));
            return;
        }
        const host = String(req.headers.host || '').split(':')[0].toLowerCase();
        const effectiveTitle = (hostMap && hostMap[host]) || title;
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html><head><title>${effectiveTitle}</title></head><body><h1>${effectiveTitle}</h1></body></html>`);
    });
}

function makeHealthServer(payload, readyPayload) {
    return http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(payload));
            return;
        }
        if (req.url === '/ready' && readyPayload) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(readyPayload));
            return;
        }
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
    });
}

function makeContentServer() {
    return http.createServer((req, res) => {
        const host = String(req.headers.host || '').split(':')[0].toLowerCase();
        if (req.url === '/health') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                service: 'openvibe-content',
                surfaces: [
                    { surface: 'codes', implemented: true },
                    { surface: 'blog', implemented: true },
                    { surface: 'wiki', implemented: true },
                    { surface: 'news', implemented: false },
                ],
            }));
            return;
        }
        const htmlByHost = {
            'openvibe.codes.localhost': '<title>openvibe.codes — native docs and platform notes</title>',
            'openvibe.blog.localhost': '<title>openvibe.blog — build notes from the native platform cutover</title>',
            'openvibe.wiki.localhost': '<title>openvibe.wiki — platform glossary and migration index</title>',
            'openvibe.news.localhost': '<title>openvibe.news</title>',
            'openvibe.reviews.localhost': '<title>openvibe.reviews</title>',
            'openvibe.deals.localhost': '<title>openvibe.deals</title>',
            'openvibe.coupons.localhost': '<title>openvibe.coupons</title>',
            'openvibe.trade.localhost': '<title>openvibe.trade</title>',
            'openvibe.host.localhost': '<title>openvibe.host</title>',
        };
        if (htmlByHost[host]) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(`<!doctype html><html><head>${htmlByHost[host]}</head><body><h1>${host}</h1></body></html>`);
            return;
        }
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
    });
}

async function withServers(factory, callback) {
    const servers = factory();
    try {
        const started = [];
        for (const server of Object.values(servers)) {
            started.push(await listen(server));
        }
        await callback(servers);
    } finally {
        await Promise.all(Object.values(servers).map((server) => close(server)));
    }
}

async function testGreenSmokeReport() {
    await withServers(() => ({
        network: makeNetworkServer(),
        events: makeHealthServer({ ok: true, service: 'openvibe-events', persistence: buildHealthyPersistenceDescriptor() }),
        live: makeHtmlServer('openvibe.live — native fallback shell'),
        restream: makeHtmlServer('openre.stream'),
        chat: makeHtmlServer('OpenVibe Chat'),
        community: makeHtmlServer('OpenVibe Community'),
        billing: makeHtmlServer('OpenVibe Billing', { hostMap: { 'openvibe.tips.localhost': 'OpenVibe Tips', 'openvibe.vip.localhost': 'OpenVibe VIP' } }),
        media: makeHtmlServer('OpenVibe Media'),
        ai: makeHtmlServer('OpenVibe AI — ai.openvibe.network'),
        games: makeHtmlServer('OpenVibe Games'),
        workers: makeHealthServer({ ok: true, service: 'openvibe-workers' }, buildWorkersReadyPayload()),
        realtime: makeHealthServer({ ok: true, service: 'openvibe-realtime' }, buildRealtimeReadyPayload()),
        content: makeContentServer(),
    }), async (servers) => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-browser-smoke-'));
        const outFile = path.join(tmpDir, 'browser-smoke-report.json');
        const report = await runBrowserSmoke({
            networkUrl: urlFor(servers.network),
            eventsUrl: urlFor(servers.events),
            liveUrl: urlFor(servers.live),
            restreamUrl: urlFor(servers.restream),
            chatUrl: urlFor(servers.chat),
            communityUrl: urlFor(servers.community),
            billingUrl: urlFor(servers.billing),
            mediaUrl: urlFor(servers.media),
            aiUrl: urlFor(servers.ai),
            gamesUrl: urlFor(servers.games),
            workersUrl: urlFor(servers.workers),
            realtimeUrl: urlFor(servers.realtime),
            contentUrl: urlFor(servers.content),
            outFile,
            expectLocalhost: true,
        });

        assert.strictEqual(report.gate, 'green');
        assert.strictEqual(report.summary.red, 0);
        assert.strictEqual(report.checks.length, 41);
        assert.ok(fs.existsSync(outFile), 'expected report file');
    });
}

async function testDetectsProductionLeakInLocalMode() {
    await withServers(() => ({
        network: makeNetworkServer({ leakProductionOrigin: true }),
        events: makeHealthServer({ ok: true, service: 'openvibe-events', persistence: buildHealthyPersistenceDescriptor() }),
        live: makeHtmlServer('openvibe.live — native fallback shell'),
        restream: makeHtmlServer('openre.stream'),
        chat: makeHtmlServer('OpenVibe Chat'),
        community: makeHtmlServer('OpenVibe Community'),
        billing: makeHtmlServer('OpenVibe Billing', { hostMap: { 'openvibe.tips.localhost': 'OpenVibe Tips', 'openvibe.vip.localhost': 'OpenVibe VIP' } }),
        media: makeHtmlServer('OpenVibe Media'),
        ai: makeHtmlServer('OpenVibe AI — ai.openvibe.network'),
        games: makeHtmlServer('OpenVibe Games'),
        workers: makeHealthServer({ ok: true, service: 'openvibe-workers' }, buildWorkersReadyPayload()),
        realtime: makeHealthServer({ ok: true, service: 'openvibe-realtime' }, buildRealtimeReadyPayload()),
        content: makeContentServer(),
    }), async (servers) => {
        const report = await runBrowserSmoke({
            networkUrl: urlFor(servers.network),
            eventsUrl: urlFor(servers.events),
            liveUrl: urlFor(servers.live),
            restreamUrl: urlFor(servers.restream),
            chatUrl: urlFor(servers.chat),
            communityUrl: urlFor(servers.community),
            billingUrl: urlFor(servers.billing),
            mediaUrl: urlFor(servers.media),
            aiUrl: urlFor(servers.ai),
            gamesUrl: urlFor(servers.games),
            workersUrl: urlFor(servers.workers),
            realtimeUrl: urlFor(servers.realtime),
            contentUrl: urlFor(servers.content),
            expectLocalhost: true,
        });

        assert.strictEqual(report.gate, 'red');
        const networkShell = report.checks.find((entry) => entry.id === 'network-shell');
        assert.ok(networkShell, 'expected network-shell check');
        assert.strictEqual(networkShell.status, 'red');
        assert.ok(networkShell.detail.includes('HTML leaked production origins'));
    });
}

async function testDetectsRuntimeFallbackInHealthCheck() {
    await withServers(() => ({
        network: makeNetworkServer(),
        events: makeHealthServer({ ok: true, service: 'openvibe-events', persistence: buildHealthyPersistenceDescriptor() }),
        live: makeHtmlServer('openvibe.live — native fallback shell'),
        restream: makeHtmlServer('openre.stream'),
        chat: makeHtmlServer('OpenVibe Chat'),
        community: makeHtmlServer('OpenVibe Community', {
            persistence: {
                mode: 'postgres',
                requested_mode: 'postgres',
                effective_mode: 'sqlite-fallback',
                adapter_status: 'not-implemented',
                legacy_compat_mode: false,
                warning: 'Requested persistence mode \u0027postgres\u0027 does not have a runtime adapter yet; the service still depends on the SQLite bootstrap path.',
            },
        }),
        billing: makeHtmlServer('OpenVibe Billing', { hostMap: { 'openvibe.tips.localhost': 'OpenVibe Tips', 'openvibe.vip.localhost': 'OpenVibe VIP' } }),
        media: makeHtmlServer('OpenVibe Media'),
        ai: makeHtmlServer('OpenVibe AI — ai.openvibe.network'),
        games: makeHtmlServer('OpenVibe Games'),
        workers: makeHealthServer({ ok: true, service: 'openvibe-workers' }, buildWorkersReadyPayload()),
        realtime: makeHealthServer({ ok: true, service: 'openvibe-realtime' }, buildRealtimeReadyPayload()),
        content: makeContentServer(),
    }), async (servers) => {
        const report = await runBrowserSmoke({
            networkUrl: urlFor(servers.network),
            eventsUrl: urlFor(servers.events),
            liveUrl: urlFor(servers.live),
            restreamUrl: urlFor(servers.restream),
            chatUrl: urlFor(servers.chat),
            communityUrl: urlFor(servers.community),
            billingUrl: urlFor(servers.billing),
            mediaUrl: urlFor(servers.media),
            aiUrl: urlFor(servers.ai),
            gamesUrl: urlFor(servers.games),
            workersUrl: urlFor(servers.workers),
            realtimeUrl: urlFor(servers.realtime),
            contentUrl: urlFor(servers.content),
            expectLocalhost: true,
        });

        assert.strictEqual(report.gate, 'red');
        const communityHealth = report.checks.find((entry) => entry.id === 'community-health');
        assert.ok(communityHealth, 'expected community-health check');
        assert.strictEqual(communityHealth.status, 'red');
        assert.ok(communityHealth.detail.includes('runtime adapter'));
    });
}

async function main() {
    await testGreenSmokeReport();
    await testDetectsProductionLeakInLocalMode();
    await testDetectsRuntimeFallbackInHealthCheck();
    console.log('browser smoke test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});