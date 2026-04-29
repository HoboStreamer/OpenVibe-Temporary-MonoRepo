'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-user-modules-'));

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
            headers: Object.assign({ host: hostHeader }, headers || {}, payload ? {
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

(async () => {
    const stubServer = http.createServer((req, res) => {
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

    const { buildApp } = require('../server/index');
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

        const signIn = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            method: 'POST',
            requestPath: '/oauth/authorize',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: [
                'username=alice',
                'display_name=Alice%20Example',
                'email=alice%40example.com',
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
        assert.strictEqual(session.body.authenticated, true);
        const userId = String(session.body.user.sub || session.body.user.id);

        const registerContract = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/contracts',
            headers: serviceHeaders,
            body: {
                contract_id: 'module:identity.profile',
                kind: 'user_module',
                owner_service: 'openvibe-network',
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['display_name'],
                    properties: {
                        display_name: { type: 'string', minLength: 1 },
                        bio: { type: 'string' },
                        public_tagline: { type: 'string', read_scope: 'public' },
                        admin_secret: { type: 'string', read_scope: 'service', write_scope: 'service' },
                        locked_note: { type: 'string', readOnly: true },
                    },
                },
            },
        });
        assert.strictEqual(registerContract.status, 201);

        const putProfile = await request({
            port,
            hostHeader: 'my.openvibe.network',
            method: 'PUT',
            requestPath: '/api/v1/user-modules/me/identity.profile',
            headers: { cookie: authCookie, 'content-type': 'application/json' },
            body: { data: { display_name: 'Alice', public_tagline: 'Signal first' } },
        });
        assert.strictEqual(putProfile.status, 200);
        assert.strictEqual(putProfile.body.data.display_name, 'Alice');

        const patchProfile = await request({
            port,
            hostHeader: 'my.openvibe.network',
            method: 'PATCH',
            requestPath: '/api/v1/user-modules/me/identity.profile',
            headers: { cookie: authCookie, 'content-type': 'application/json' },
            body: { patch: { bio: 'Builder of kernels' } },
        });
        assert.strictEqual(patchProfile.status, 200);
        assert.strictEqual(patchProfile.body.data.bio, 'Builder of kernels');

        const serviceWrite = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'PUT',
            requestPath: `/api/v1/user-modules/${encodeURIComponent(userId)}/identity.profile`,
            headers: serviceHeaders,
            body: { data: { display_name: 'Alice', public_tagline: 'Signal first', bio: 'Builder of kernels', admin_secret: 'kernel' } },
        });
        assert.strictEqual(serviceWrite.status, 200);

        const readProfile = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/user-modules/me/identity.profile',
            headers: { cookie: authCookie },
        });
        assert.strictEqual(readProfile.status, 200);
        assert.strictEqual(readProfile.body.data.admin_secret, undefined);
        assert.strictEqual(readProfile.body.data.public_tagline, 'Signal first');
        assert.strictEqual(readProfile.body.data.bio, 'Builder of kernels');

        const publicProjection = await request({
            port,
            hostHeader: 'openvibe.network',
            requestPath: `/api/v1/user-modules/${encodeURIComponent(userId)}/identity.profile/public`,
        });
        assert.strictEqual(publicProjection.status, 200);
        assert.strictEqual(publicProjection.body.data.public_tagline, 'Signal first');
        assert.strictEqual(publicProjection.body.data.admin_secret, undefined);

        const batch = await request({
            port,
            hostHeader: 'my.openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/user-modules/me/batch',
            headers: { cookie: authCookie, 'content-type': 'application/json' },
            body: { namespaces: ['identity.profile', 'missing.ns'] },
        });
        assert.strictEqual(batch.status, 200);
        assert.strictEqual(batch.body.items.length, 1);
        assert.ok(batch.body.missing.includes('missing.ns'));

        const lockedPatch = await request({
            port,
            hostHeader: 'my.openvibe.network',
            method: 'PATCH',
            requestPath: '/api/v1/user-modules/me/identity.profile',
            headers: { cookie: authCookie, 'content-type': 'application/json' },
            body: { patch: { locked_note: 'nope' } },
        });
        assert.strictEqual(lockedPatch.status, 400);
        assert.ok(lockedPatch.body.errors.some((message) => String(message).includes('locked_note')));

        const hugeProfile = await request({
            port,
            hostHeader: 'my.openvibe.network',
            method: 'PUT',
            requestPath: '/api/v1/user-modules/me/identity.profile',
            headers: { cookie: authCookie, 'content-type': 'application/json' },
            body: { data: { display_name: 'A'.repeat(70 * 1024) } },
        });
        assert.strictEqual(hugeProfile.status, 413);

        const history = await request({
            port,
            hostHeader: 'openvibe.network',
            requestPath: `/api/v1/user-modules/${encodeURIComponent(userId)}/identity.profile/history`,
            headers: serviceHeaders,
        });
        assert.strictEqual(history.status, 200);
        assert.ok(history.body.items.length >= 3);

        const modWriteOk = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'PUT',
            requestPath: `/api/v1/user-modules/${encodeURIComponent(userId)}/mod.mod-echo.profile`,
            headers: {
                'x-internal-key': 'change-me-in-production',
                'x-openvibe-service': 'mod-echo',
                'content-type': 'application/json',
            },
            body: { data: { enabled: true } },
        });
        assert.strictEqual(modWriteOk.status, 200);

        const modWriteDenied = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'PUT',
            requestPath: `/api/v1/user-modules/${encodeURIComponent(userId)}/mod.mod-echo.profile`,
            headers: {
                'x-internal-key': 'change-me-in-production',
                'x-openvibe-service': 'different-service',
                'content-type': 'application/json',
            },
            body: { data: { enabled: false } },
        });
        assert.strictEqual(modWriteDenied.status, 403);

        console.log('user-modules: OK');
    } finally {
        server.close();
        stubServer.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
})().catch((err) => {
    console.error(err);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exitCode = 1;
});
