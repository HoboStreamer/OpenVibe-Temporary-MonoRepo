'use strict';

const assert = require('assert');
const http = require('http');

const { buildApp } = require('../server/index');

function listen(server) {
    return new Promise((resolve) => {
        const instance = server.listen(0, '127.0.0.1', () => resolve(instance));
    });
}

function close(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

function request(server, host, requestPath) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port: server.address().port,
            path: requestPath,
            method: 'GET',
            headers: { Host: host },
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    const { app } = buildApp();
    const server = await listen(app);
    try {
        const codes = await request(server, 'openvibe.codes.localhost', '/');
        assert.strictEqual(codes.status, 200);
        assert.ok(codes.body.includes('openvibe.codes — native docs and platform notes'));
        assert.ok(codes.body.includes('<link rel="canonical" href="http://openvibe.codes.localhost:5500/">') || codes.body.includes('<link rel="canonical" href="http://openvibe.codes.localhost/">'));

        const blogPost = await request(server, 'openvibe.blog.localhost', '/posts/native-runtime-before-polish');
        assert.strictEqual(blogPost.status, 200);
        assert.ok(blogPost.body.includes('Ship the native runtime before polishing the wallpaper'));

        const wiki = await request(server, 'openvibe.wiki.localhost', '/concepts/readiness-gates');
        assert.strictEqual(wiki.status, 200);
        assert.ok(wiki.body.includes('readiness gates'));

        const news = await request(server, 'openvibe.news.localhost', '/');
        assert.strictEqual(news.status, 200);
        assert.ok(news.body.includes('noindex,nofollow'));
        assert.ok(news.body.includes('Draft news pages stay reviewed and noindex'));

        const trade = await request(server, 'openvibe.trade.localhost', '/drafts/non-financial-advice-policy');
        assert.strictEqual(trade.status, 200);
        assert.ok(trade.body.includes('Non-financial-advice policy for trade pages'));
        assert.ok(trade.body.includes('noindex,nofollow'));

        const sitemap = await request(server, 'openvibe.codes.localhost', '/sitemap.xml');
        assert.strictEqual(sitemap.status, 200);
        assert.ok(String(sitemap.headers['content-type']).includes('application/xml'));
        assert.ok(sitemap.body.includes('/docs/host-routing-truth'));

        const feed = await request(server, 'openvibe.blog.localhost', '/feed.xml');
        assert.strictEqual(feed.status, 200);
        assert.ok(String(feed.headers['content-type']).includes('application/rss+xml'));
        assert.ok(feed.body.includes('native-runtime-before-polish'));

        const status = await request(server, 'openvibe.codes.localhost', '/api/v1/content/status');
        assert.strictEqual(status.status, 200);
        const parsed = JSON.parse(status.body);
        assert.strictEqual(parsed.service, 'openvibe-content');
        assert.ok(parsed.surfaces.some((surface) => surface.surface === 'codes' && surface.implemented));
        assert.ok(parsed.surfaces.some((surface) => surface.surface === 'trade' && surface.indexable === false));
    } finally {
        await close(server);
    }

    console.log('openvibe-content SSR tests OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
