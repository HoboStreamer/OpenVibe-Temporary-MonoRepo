'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { runBrowserSmoke } = require('../browser-smoke');

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
    return http.createServer((req, res) => {
        const host = String(req.headers.host || '').split(':')[0].toLowerCase();
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

function makeHtmlServer(title) {
    return http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`);
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
        live: makeHtmlServer('openvibe.live — native fallback shell'),
        chat: makeHtmlServer('OpenVibe Chat'),
        community: makeHtmlServer('OpenVibe Community'),
        media: makeHtmlServer('OpenVibe Media'),
    }), async (servers) => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-browser-smoke-'));
        const outFile = path.join(tmpDir, 'browser-smoke-report.json');
        const report = await runBrowserSmoke({
            networkUrl: urlFor(servers.network),
            liveUrl: urlFor(servers.live),
            chatUrl: urlFor(servers.chat),
            communityUrl: urlFor(servers.community),
            mediaUrl: urlFor(servers.media),
            outFile,
            expectLocalhost: true,
        });

        assert.strictEqual(report.gate, 'green');
        assert.strictEqual(report.summary.red, 0);
        assert.strictEqual(report.checks.length, 11);
        assert.ok(fs.existsSync(outFile), 'expected report file');
    });
}

async function testDetectsProductionLeakInLocalMode() {
    await withServers(() => ({
        network: makeNetworkServer({ leakProductionOrigin: true }),
        live: makeHtmlServer('openvibe.live — native fallback shell'),
        chat: makeHtmlServer('OpenVibe Chat'),
        community: makeHtmlServer('OpenVibe Community'),
        media: makeHtmlServer('OpenVibe Media'),
    }), async (servers) => {
        const report = await runBrowserSmoke({
            networkUrl: urlFor(servers.network),
            liveUrl: urlFor(servers.live),
            chatUrl: urlFor(servers.chat),
            communityUrl: urlFor(servers.community),
            mediaUrl: urlFor(servers.media),
            expectLocalhost: true,
        });

        assert.strictEqual(report.gate, 'red');
        const networkShell = report.checks.find((entry) => entry.id === 'network-shell');
        assert.ok(networkShell, 'expected network-shell check');
        assert.strictEqual(networkShell.status, 'red');
        assert.ok(networkShell.detail.includes('HTML leaked production origins'));
    });
}

async function main() {
    await testGreenSmokeReport();
    await testDetectsProductionLeakInLocalMode();
    console.log('browser smoke test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});