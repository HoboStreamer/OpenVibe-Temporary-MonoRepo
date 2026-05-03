'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

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

function request(server, requestPath, host) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port: server.address().port,
            path: requestPath,
            method: 'GET',
            headers: { Host: host || 'openvibe.live.localhost' },
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                resolve({ status: res.statusCode, headers: res.headers, body });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

(async function main() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-live-home-feed-'));
    const legacyRoot = path.join(tmpDir, 'legacy-hobostreamer');
    fs.mkdirSync(path.join(legacyRoot, 'data', 'thumbnails'), { recursive: true });
    fs.mkdirSync(path.join(legacyRoot, 'data', 'pastes', 'screenshots'), { recursive: true });
    fs.writeFileSync(path.join(legacyRoot, 'data', 'thumbnails', 'archive-run.webp'), 'thumb-bytes');
    fs.writeFileSync(path.join(legacyRoot, 'data', 'pastes', 'screenshots', 'home-proof.webp'), 'paste-bytes');
    const mediaCounts = { list: 0, get: 0 };
    const communityCounts = { pastes: 0, threads: 0, relays: 0 };

    const mediaItems = {
        'media:hobostreamer-vod:7': {
            id: 'media:hobostreamer-vod:7',
            namespace: 'live.vods',
            type: 'vod',
            status: 'initialized',
            visibility: 'public',
            storage_key: 'legacy/vods/archive-run.webm',
            public_url: 'http://media.test/files/media%3Ahobostreamer-vod%3A7',
            size_bytes: 1024,
            created_at: '2026-01-02T03:00:00Z',
            updated_at: '2026-01-02T03:00:00Z',
            metadata: {
                source: 'hobostreamer',
                title: 'archive run',
                stream_session_id: 'stream-session:hobostreamer:7',
                thumbnail_url: '/api/thumbnails/archive-run.webp',
                duration_seconds: 7200,
                view_count: 42,
            },
        },
        'media:hobostreamer-clip:3': {
            id: 'media:hobostreamer-clip:3',
            namespace: 'live.clips',
            type: 'clip',
            status: 'ready',
            visibility: 'public',
            storage_key: 'legacy/clips/top-deck-glitch.webm',
            public_url: 'http://media.test/files/media%3Ahobostreamer-clip%3A3',
            size_bytes: 512,
            created_at: '2026-01-02T03:30:00Z',
            updated_at: '2026-01-02T03:30:00Z',
            metadata: {
                source: 'hobostreamer',
                title: 'top deck glitch',
                stream_session_id: 'stream-session:hobostreamer:7',
                thumbnail_url: '/api/thumbnails/archive-run.webp',
                duration_seconds: 37,
                view_count: 19,
            },
        },
    };

    const mediaServer = await listen(http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/api/v1/media') {
            mediaCounts.list += 1;
            const namespace = url.searchParams.get('namespace');
            const items = Object.values(mediaItems).filter((item) => !namespace || item.namespace === namespace);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ items }));
            return;
        }
        if (url.pathname.startsWith('/api/v1/media/')) {
            mediaCounts.get += 1;
            const id = decodeURIComponent(url.pathname.replace('/api/v1/media/', ''));
            const media = mediaItems[id];
            if (!media) {
                res.writeHead(404, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ media }));
            return;
        }
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
    }));

    const communityServer = await listen(http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/api/community/pastes') {
            communityCounts.pastes += 1;
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
                items: [{
                    slug: 'migration-screenshot',
                    title: 'Migration screenshot',
                    body: 'Migrated screenshot paste preview.',
                    created_at: '2026-01-02T04:00:00Z',
                    view_count: 11,
                    metadata: {
                        type: 'screenshot',
                        source: 'hobostreamer',
                        screenshot_path: path.join(legacyRoot, 'data', 'pastes', 'screenshots', 'home-proof.webp'),
                    },
                }],
            }));
            return;
        }
        if (url.pathname === '/api/community/threads') {
            communityCounts.threads += 1;
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ items: [] }));
            return;
        }
        if (url.pathname === '/api/community/discord/relays') {
            communityCounts.relays += 1;
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ items: [] }));
            return;
        }
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
    }));

    process.env.NODE_ENV = 'development';
    process.env.OPENVIBE_ENV = 'development';
    process.env.DB_PATH = path.join(tmpDir, 'live.db');
    process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
    process.env.OPENVIBE_MEDIA_URL = `http://127.0.0.1:${mediaServer.address().port}`;
    process.env.OPENVIBE_COMMUNITY_URL = `http://127.0.0.1:${communityServer.address().port}`;
    process.env.OPENVIBE_HOBOSTREAMER_ROOT = legacyRoot;
    process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_OPENVIBE_LIVE_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_DATABASE_URL = '';
    process.env.OPENVIBE_STAGING_DATABASE_URL = '';
    process.env.OPENVIBE_OPENVIBE_LIVE_DATABASE_URL = '';

    const { buildApp } = require('../server/index');
    const model = require('../server/model');
    const { app } = buildApp();

    model.upsertChannel({ slug: 'alice', display_name: 'Alice', description: 'streamer' });
    model.upsertStream({
        id: 'stream-session:hobostreamer:7',
        channel_slug: 'alice',
        status: 'ended',
        title: 'archive stream',
        category: 'Speedrun',
        source: 'hobostreamer',
        started_at: '2026-01-02T00:00:00Z',
        ended_at: '2026-01-02T02:00:00Z',
        thumbnail_url: '/api/thumbnails/archive-run.webp',
    });
    const server = await listen(app);
    try {
        const homeApi = await request(server, '/api/v1/home');
        assert.strictEqual(homeApi.status, 200, 'home api returns 200');
        const parsedHome = JSON.parse(homeApi.body);
        assert.strictEqual(parsedHome.recentVods.length, 1, 'home api returns canonical vod feed');
        assert.strictEqual(parsedHome.recentClips.length, 1, 'home api returns canonical clip feed');
        assert.strictEqual(parsedHome.community.recentPastes.length, 1, 'home api returns canonical paste feed');
        assert.ok(Number(parsedHome.stats.vods) >= 1, 'home api reports canonical vod count');
        assert.ok(Number(parsedHome.stats.clips) >= 1, 'home api reports canonical clip count');

        const homePage = await request(server, '/');
        assert.strictEqual(homePage.status, 200, 'home page returns 200');
        assert.ok(homePage.body.includes('archive run'), 'home page renders canonical vod title');
        assert.ok(homePage.body.includes('top deck glitch'), 'home page renders canonical clip title');
        assert.ok(homePage.body.includes('Recent pastes'), 'home page renders paste section');
        assert.ok(homePage.body.includes('Migration screenshot'), 'home page renders paste card');

        const secondHomePage = await request(server, '/');
        assert.strictEqual(secondHomePage.status, 200, 'second home page request returns 200');
        assert.strictEqual(mediaCounts.list, 2, 'home feed caches media namespace fanout across requests');
        assert.strictEqual(communityCounts.threads, 1, 'home feed caches community thread fanout across requests');
        assert.strictEqual(communityCounts.pastes, 1, 'home feed caches community paste fanout across requests');
        assert.strictEqual(communityCounts.relays, 1, 'home feed caches discord relay fanout across requests');

        const vodPage = await request(server, '/vod/7');
        assert.strictEqual(vodPage.status, 200, 'vod detail route returns 200');
        assert.ok(vodPage.body.includes('archive run'), 'vod detail renders canonical media title');
        assert.ok(vodPage.body.includes('openvibe.media playback'), 'vod detail links to canonical playback');
        assert.ok(vodPage.body.includes('Playback ready'), 'vod detail treats storage-backed media as playable even when status lags');
        assert.ok(vodPage.body.includes('data-ov-player'), 'vod detail renders custom player shell');
        assert.ok(vodPage.body.includes('/files/media%3Ahobostreamer-vod%3A7'), 'vod detail uses direct file playback source');
        assert.strictEqual(mediaCounts.get, 1, 'detail route fetches the canonical media object once');

        const thumb = await request(server, '/api/thumbnails/archive-run.webp');
        assert.strictEqual(thumb.status, 200, 'legacy thumbnail proxy returns 200');
        assert.strictEqual(thumb.body, 'thumb-bytes', 'legacy thumbnail proxy serves archived bytes');

        const pasteAsset = await request(server, '/api/community-assets/home-proof.webp');
        assert.strictEqual(pasteAsset.status, 200, 'legacy paste asset proxy returns 200');
        assert.strictEqual(pasteAsset.body, 'paste-bytes', 'legacy paste asset proxy serves archived bytes');

        console.log('openvibe-live canonical home feed test passed');
    } finally {
        await close(server);
        await close(mediaServer);
        await close(communityServer);
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
