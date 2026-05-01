'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-runtime-parity-'));

function request({ port, hostHeader, method = 'GET', requestPath = '/', headers, body, formEncoded = false }) {
    return new Promise((resolve, reject) => {
        let payload = null;
        if (body != null) {
            payload = typeof body === 'string' ? body : (formEncoded ? body : JSON.stringify(body));
        }
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: requestPath,
            method,
            agent: false,
            headers: Object.assign({ host: hostHeader, connection: 'close' }, headers || {}, payload ? {
                'content-length': Buffer.byteLength(payload),
            } : {}),
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                let parsed = raw;
                try { parsed = raw ? JSON.parse(raw) : null; } catch {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function registerUser({ port, username, displayName, email }) {
    const signIn = await request({
        port,
        hostHeader: 'auth.openvibe.network',
        method: 'POST',
        requestPath: '/oauth/authorize',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: [
            'mode=register',
            `username=${encodeURIComponent(username)}`,
            `display_name=${encodeURIComponent(displayName)}`,
            `email=${encodeURIComponent(email)}`,
            'password=' + encodeURIComponent('TopSecret123!'),
            'confirm_password=' + encodeURIComponent('TopSecret123!'),
            'return_to=' + encodeURIComponent('http://my.openvibe.network/account'),
        ].join('&'),
        formEncoded: true,
    });
    assert.strictEqual(signIn.status, 302);
    const setCookies = Array.isArray(signIn.headers['set-cookie']) ? signIn.headers['set-cookie'] : [signIn.headers['set-cookie']];
    const authCookie = setCookies[0].split(';')[0];

    const session = await request({
        port,
        hostHeader: 'my.openvibe.network',
        requestPath: '/api/v1/session',
        headers: { cookie: authCookie },
    });
    assert.strictEqual(session.status, 200);
    const userId = String(session.body.user.sub || session.body.user.id);
    return { authCookie, userId };
}

(async () => {
    const stubServer = http.createServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
    });
    await new Promise((resolve) => stubServer.listen(0, '127.0.0.1', resolve));
    const stubPort = stubServer.address().port;
    const stubBase = `http://127.0.0.1:${stubPort}`;

    process.env.NODE_ENV = 'development';
    process.env.DB_PATH = path.join(tmp, 'network.db');
    process.env.OPENVIBE_PRIVATE_KEY = path.join(tmp, 'keys', 'openvibe-private.pem');
    process.env.OPENVIBE_PUBLIC_KEY = path.join(tmp, 'keys', 'openvibe-public.pem');
    process.env.OPENVIBE_NETWORK_URL = 'http://openvibe.network';
    process.env.OPENVIBE_AUTH_URL = 'http://auth.openvibe.network';
    process.env.OPENVIBE_API_URL = 'http://api.openvibe.network';
    process.env.OPENVIBE_MY_URL = 'http://my.openvibe.network';
    process.env.OPENVIBE_THEMES_URL = 'http://themes.openvibe.network';
    process.env.OPENVIBE_ADMIN_URL = 'http://admin.openvibe.network';
    process.env.OPENVIBE_CHAT_INTERNAL_URL = stubBase;
    process.env.OPENVIBE_COMMUNITY_INTERNAL_URL = stubBase;
    process.env.OPENVIBE_BILLING_INTERNAL_URL = stubBase;
    process.env.OPENVIBE_MEDIA_INTERNAL_URL = stubBase;
    process.env.OPENVIBE_AI_INTERNAL_URL = stubBase;
    process.env.OPENVIBE_EVENTS_URL = stubBase;
    process.env.OPENRE_STREAM_INTERNAL_URL = stubBase;
    process.env.HOBO_TOOLS_URL = '';
    process.env.HOBO_TOOLS_PUBLIC_KEY = '';
    process.env.INTERNAL_API_KEY = 'change-me-in-production';
    process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_OPENVIBE_NETWORK_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_DATABASE_URL = '';
    process.env.OPENVIBE_STAGING_DATABASE_URL = '';
    process.env.OPENVIBE_OPENVIBE_NETWORK_DATABASE_URL = '';

    const { buildApp } = require('../server/index');
    const db = require('../server/db');
    const { app } = buildApp();
    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve) => server.once('listening', resolve));
        const port = server.address().port;
        const serviceHeaders = {
            'x-internal-key': 'change-me-in-production',
            'x-openvibe-service': 'openvibe-network',
            'content-type': 'application/json',
        };

        const alice = await registerUser({ port, username: 'alice', displayName: 'Alice Example', email: 'alice@example.com' });
        const bob = await registerUser({ port, username: 'bob', displayName: 'Bob Example', email: 'bob@example.com' });

        const createdNotification = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/internal/notifications',
            headers: serviceHeaders,
            body: {
                user_id: alice.userId,
                sender_user_id: bob.userId,
                type: 'follow.created',
                category: 'social',
                title: 'Bob followed you',
                message: 'Bob is now following you',
                url: '/u/bob',
                rich_content: { follower_user_id: bob.userId },
            },
        });
        assert.strictEqual(createdNotification.status, 201);
        assert.strictEqual(createdNotification.body.type, 'follow.created');

        const notificationList = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/notifications',
            headers: { cookie: alice.authCookie },
        });
        assert.strictEqual(notificationList.status, 200);
        assert.strictEqual(notificationList.body.unread_count, 1);
        assert.strictEqual(notificationList.body.items[0].title, 'Bob followed you');

        const markedRead = await request({
            port,
            hostHeader: 'my.openvibe.network',
            method: 'PATCH',
            requestPath: `/api/v1/notifications/${encodeURIComponent(createdNotification.body.id)}`,
            headers: { cookie: alice.authCookie, 'content-type': 'application/json' },
            body: { is_read: true },
        });
        assert.strictEqual(markedRead.status, 200);
        assert.strictEqual(markedRead.body.is_read, true);
        assert.ok(markedRead.body.read_at);

        const followCreated = await request({
            port,
            hostHeader: 'my.openvibe.network',
            method: 'POST',
            requestPath: `/api/v1/follows/${encodeURIComponent(bob.userId)}`,
            headers: { cookie: alice.authCookie, 'content-type': 'application/json' },
            body: { scope: 'network', email_notify: true },
        });
        assert.strictEqual(followCreated.status, 201);
        assert.strictEqual(followCreated.body.followed_user_id, bob.userId);
        assert.strictEqual(followCreated.body.email_notify, true);

        const followingList = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/follows?direction=following',
            headers: { cookie: alice.authCookie },
        });
        assert.strictEqual(followingList.status, 200);
        assert.strictEqual(followingList.body.items.length, 1);
        assert.strictEqual(followingList.body.items[0].followed_user_id, bob.userId);

        const bobStats = await request({
            port,
            hostHeader: 'openvibe.network',
            requestPath: `/api/v1/follows/stats/${encodeURIComponent(bob.userId)}`,
        });
        assert.strictEqual(bobStats.status, 200);
        assert.strictEqual(bobStats.body.follower_count, 1);

        db.get().prepare(`
            INSERT INTO control_oauth_clients (
                id, client_id, name, redirect_uris_json, is_first_party,
                client_secret_redacted, metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
            'oauth-client:legacy:hobo-quest',
            'hobo-quest',
            'Hobo Quest',
            JSON.stringify(['https://hobo.quest/auth/callback']),
            1,
            1,
            JSON.stringify({ source: 'runtime-parity-test' })
        );

        const oauthManifest = await request({
            port,
            hostHeader: 'openvibe.network',
            requestPath: '/api/v1/oauth-clients/hobo-quest',
            headers: serviceHeaders,
        });
        assert.strictEqual(oauthManifest.status, 200);
        assert.deepStrictEqual(oauthManifest.body.redirect_uris, ['https://hobo.quest/auth/callback']);

        const verifier = 'pkce-' + crypto.randomBytes(18).toString('hex');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        const allowedAuthorize = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            requestPath: '/oauth/authorize?client_id=hobo-quest&redirect_uri=' + encodeURIComponent('https://hobo.quest/auth/callback') + '&response_type=code&state=abc&code_challenge=' + encodeURIComponent(challenge) + '&code_challenge_method=S256',
            headers: { cookie: alice.authCookie },
        });
        assert.strictEqual(allowedAuthorize.status, 302);

        const deniedAuthorize = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            requestPath: '/oauth/authorize?client_id=hobo-quest&redirect_uri=' + encodeURIComponent('https://evil.example/callback') + '&response_type=code&state=abc&code_challenge=' + encodeURIComponent(challenge) + '&code_challenge_method=S256',
            headers: { cookie: alice.authCookie },
        });
        assert.strictEqual(deniedAuthorize.status, 400);
        assert.match(String(deniedAuthorize.body), /not allowed/i);

        console.log('runtime parity: OK');
    } finally {
        server.closeAllConnections && server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        stubServer.closeAllConnections && stubServer.closeAllConnections();
        await new Promise((resolve) => stubServer.close(resolve));
        fs.rmSync(tmp, { recursive: true, force: true });
    }
})().catch((err) => {
    console.error(err);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exitCode = 1;
});
