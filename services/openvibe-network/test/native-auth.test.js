'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-native-auth-'));
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
process.env.HOBO_TOOLS_URL = '';
process.env.HOBO_TOOLS_PUBLIC_KEY = '';
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.INTERNAL_API_KEY = 'change-me-in-production';
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_OPENVIBE_NETWORK_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_NETWORK_DATABASE_URL = '';

const { buildApp } = require('../server/index');
const { deriveCookieDomain } = require('../server/native-auth');

function request({ port, hostHeader, method = 'GET', requestPath = '/', headers, body }) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: requestPath,
            method,
            agent: false,
            headers: Object.assign({
                host: hostHeader,
                connection: 'close',
            }, headers || {}, body ? { 'content-length': Buffer.byteLength(body) } : {}),
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

(async () => {
    assert.strictEqual(deriveCookieDomain('http://auth.openvibe.network.localhost:4100'), '.network.localhost');
    assert.strictEqual(deriveCookieDomain('http://auth.openvibe.network'), '.openvibe.network');

    const { app } = buildApp();
    const server = app.listen(0, '127.0.0.1');
    try {
        await new Promise((resolve) => server.once('listening', resolve));
        const port = server.address().port;

        const authorizePage = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            requestPath: '/oauth/authorize?return_to=' + encodeURIComponent('http://my.openvibe.network/account'),
        });
        assert.strictEqual(authorizePage.status, 200);
        assert.ok(authorizePage.body.includes('Create an account or sign in'));

        const anonSessionStart = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/session/anonymous',
            headers: {
                'content-type': 'application/json',
                'x-forwarded-for': '203.0.113.10',
            },
            body: JSON.stringify({}),
        });
        assert.strictEqual(anonSessionStart.status, 201);
        const anonSetCookies = Array.isArray(anonSessionStart.headers['set-cookie']) ? anonSessionStart.headers['set-cookie'] : [anonSessionStart.headers['set-cookie']];
        const anonCookie = anonSetCookies[0].split(';')[0];
        const anonSession = JSON.parse(anonSessionStart.body);
        assert.strictEqual(anonSession.authenticated, false);
        assert.strictEqual(anonSession.anonymous, true);
        assert.strictEqual(anonSession.user.username, 'anon1');
        assert.strictEqual(anonSession.user.display_name, 'Anonymous #1');

        const anonSessionRes = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/session',
            headers: { cookie: anonCookie },
        });
        const anonSessionState = JSON.parse(anonSessionRes.body);
        assert.strictEqual(anonSessionRes.status, 200);
        assert.strictEqual(anonSessionState.authenticated, false);
        assert.strictEqual(anonSessionState.anonymous, true);
        assert.strictEqual(anonSessionState.user.display_name, 'Anonymous #1');

        const anonRepeat = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/session/anonymous',
            headers: {
                cookie: anonCookie,
                'content-type': 'application/json',
                'x-forwarded-for': '203.0.113.10',
            },
            body: JSON.stringify({}),
        });
        assert.strictEqual(anonRepeat.status, 200);
        assert.strictEqual(JSON.parse(anonRepeat.body).user.anon_number, 1);

        const anonIpRestore = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/session/anonymous',
            headers: {
                'content-type': 'application/json',
                'x-forwarded-for': '203.0.113.10',
            },
            body: JSON.stringify({}),
        });
        assert.strictEqual(anonIpRestore.status, 200);
        assert.strictEqual(JSON.parse(anonIpRestore.body).user.anon_number, 1);

        const anonSecond = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/session/anonymous',
            headers: {
                'content-type': 'application/json',
                'x-forwarded-for': '203.0.113.10',
            },
            body: JSON.stringify({ force_new: true, fingerprint: 'fingerprint-shared' }),
        });
        assert.strictEqual(anonSecond.status, 201);
        const anonSecondSetCookies = Array.isArray(anonSecond.headers['set-cookie']) ? anonSecond.headers['set-cookie'] : [anonSecond.headers['set-cookie']];
        const anonTwoCookie = anonSecondSetCookies[0].split(';')[0];
        const anonSecondBody = JSON.parse(anonSecond.body);
        assert.strictEqual(anonSecondBody.user.anon_number, 2);
        assert.ok(anonSecondBody.user.session_token, 'expected anon continuity session token to be exposed');

        const anonFingerprintRestore = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/session/anonymous',
            headers: {
                'content-type': 'application/json',
                'x-forwarded-for': '198.51.100.77',
            },
            body: JSON.stringify({ fingerprint: 'fingerprint-shared' }),
        });
        assert.strictEqual(anonFingerprintRestore.status, 200);
        assert.strictEqual(JSON.parse(anonFingerprintRestore.body).user.anon_number, 2);

        const anonIdentities = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/session/anonymous/identities?fingerprint=' + encodeURIComponent('fingerprint-shared'),
            headers: {
                cookie: anonTwoCookie,
                'x-forwarded-for': '203.0.113.10',
            },
        });
        assert.strictEqual(anonIdentities.status, 200);
        const anonIdentityItems = JSON.parse(anonIdentities.body).items;
        assert.deepStrictEqual(anonIdentityItems.map((item) => item.anon_number), [1, 2]);
        assert.ok(anonIdentityItems.find((item) => item.anon_number === 2 && item.current), 'expected current anon identity to be flagged');

        const anonSwitch = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/session/anonymous',
            headers: {
                cookie: anonTwoCookie,
                'content-type': 'application/json',
                'x-forwarded-for': '203.0.113.10',
            },
            body: JSON.stringify({ anon_number: 1, fingerprint: 'fingerprint-shared' }),
        });
        assert.strictEqual(anonSwitch.status, 200);
        assert.strictEqual(JSON.parse(anonSwitch.body).user.anon_number, 1);
        const switchedAnonCookies = Array.isArray(anonSwitch.headers['set-cookie']) ? anonSwitch.headers['set-cookie'] : [anonSwitch.headers['set-cookie']];
        const switchedAnonCookie = switchedAnonCookies[0].split(';')[0];

        const internalResolveAnon = await request({
            port,
            hostHeader: 'api.openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/internal/resolve-anon',
            headers: {
                'content-type': 'application/json',
                'x-internal-key': 'change-me-in-production',
                'x-openvibe-service': 'openvibe-chat',
            },
            body: JSON.stringify({ anon_number: 2, ip: '203.0.113.10' }),
        });
        assert.strictEqual(internalResolveAnon.status, 200);
        const resolvedAnon = JSON.parse(internalResolveAnon.body);
        assert.strictEqual(resolvedAnon.ok, true);
        assert.strictEqual(resolvedAnon.created, false);
        assert.strictEqual(resolvedAnon.user.anon_number, 2);

        const anonMe = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/me',
            headers: { cookie: anonCookie },
        });
        assert.strictEqual(anonMe.status, 401);
        assert.match(anonMe.body, /anonymous token/);

        const anonAuthorize = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            requestPath: '/oauth/authorize?return_to=' + encodeURIComponent('http://my.openvibe.network/account'),
            headers: { cookie: switchedAnonCookie },
        });
        assert.strictEqual(anonAuthorize.status, 200);
        assert.ok(anonAuthorize.body.includes('Create an account or sign in'));

        const anonBridgeRes = await request({
            port,
            hostHeader: 'openvibe.network',
            requestPath: '/api/v1/session/bridge?return_to=' + encodeURIComponent('http://openvibe.chat.localhost:4800/'),
            headers: { cookie: switchedAnonCookie },
        });
        assert.strictEqual(anonBridgeRes.status, 302);
        const anonBridgeUrl = new URL(anonBridgeRes.headers.location);
        const anonBridgeHash = new URLSearchParams(anonBridgeUrl.hash.slice(1));
        assert.ok(anonBridgeHash.get('openvibe_token'), 'anon session bridge should return a bearer token in the URL fragment');

        const anonExchangeRes = await request({
            port,
            hostHeader: 'my.openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/session/exchange',
            headers: {
                cookie: switchedAnonCookie,
                'content-type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        assert.strictEqual(anonExchangeRes.status, 200);
        const anonExchanged = JSON.parse(anonExchangeRes.body);
        assert.ok(anonExchanged.access_token, 'anon exchange should return an access token');
        assert.strictEqual(anonExchanged.scope, 'anonymous');
        assert.strictEqual(anonExchanged.user.anon_number, 1);

        const anonBearerSession = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/session',
            headers: { authorization: `Bearer ${anonExchanged.access_token}` },
        });
        assert.strictEqual(anonBearerSession.status, 200);
        const anonBearerSessionBody = JSON.parse(anonBearerSession.body);
        assert.strictEqual(anonBearerSessionBody.authenticated, false);
        assert.strictEqual(anonBearerSessionBody.anonymous, true);
        assert.strictEqual(anonBearerSessionBody.user.anon_number, 1);

        const reservedAnonUsername = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            method: 'POST',
            requestPath: '/oauth/authorize',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: [
                'mode=register',
                'username=anon123',
                'display_name=Nope',
                'password=' + encodeURIComponent('TopSecret123!'),
                'confirm_password=' + encodeURIComponent('TopSecret123!'),
                'return_to=' + encodeURIComponent('http://my.openvibe.network/account'),
            ].join('&'),
        });
        assert.strictEqual(reservedAnonUsername.status, 400);
        assert.ok(reservedAnonUsername.body.includes('reserved for anonymous identities'));

        const formBody = [
            'mode=register',
            'username=alice',
            'display_name=Alice%20Example',
            'email=alice%40example.com',
            'password=' + encodeURIComponent('TopSecret123!'),
            'confirm_password=' + encodeURIComponent('TopSecret123!'),
            'return_to=' + encodeURIComponent('http://my.openvibe.network/account'),
        ].join('&');
        const signIn = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            method: 'POST',
            requestPath: '/oauth/authorize',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: formBody,
        });
        assert.strictEqual(signIn.status, 302);
        assert.strictEqual(signIn.headers.location, 'http://my.openvibe.network/account');
        const setCookies = Array.isArray(signIn.headers['set-cookie']) ? signIn.headers['set-cookie'] : [signIn.headers['set-cookie']];
        assert.ok(setCookies.some((value) => value && value.includes('Domain=.openvibe.network')), 'auth cookie should cover the configured OpenVibe domain');
        const cookie = setCookies[0];
        assert.ok(cookie && cookie.includes('openvibe_token='), 'auth cookie should be set');
        let authCookie = cookie.split(';')[0];

        const sessionRes = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/session',
            headers: { cookie: authCookie },
        });
        const session = JSON.parse(sessionRes.body);
        assert.strictEqual(sessionRes.status, 200);
        assert.strictEqual(session.authenticated, true);
        assert.strictEqual(session.anonymous, false);
        assert.strictEqual(session.user.username, 'alice');

        const logoutRes = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            requestPath: '/oauth/logout?return_to=' + encodeURIComponent('http://my.openvibe.network/account'),
            headers: { cookie: authCookie },
        });
        assert.strictEqual(logoutRes.status, 302);

        const loginBody = [
            'mode=login',
            'identifier=alice',
            'password=' + encodeURIComponent('TopSecret123!'),
            'return_to=' + encodeURIComponent('http://my.openvibe.network/account'),
        ].join('&');
        const loginRes = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            method: 'POST',
            requestPath: '/oauth/authorize',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: loginBody,
        });
        assert.strictEqual(loginRes.status, 302);
        assert.strictEqual(loginRes.headers.location, 'http://my.openvibe.network/account');
        const loginCookies = Array.isArray(loginRes.headers['set-cookie']) ? loginRes.headers['set-cookie'] : [loginRes.headers['set-cookie']];
        authCookie = loginCookies[0].split(';')[0];

        const bridgeRes = await request({
            port,
            hostHeader: 'openvibe.network',
            requestPath: '/api/v1/session/bridge?return_to=' + encodeURIComponent('http://openvibe.chat.localhost:4800/'),
            headers: { cookie: authCookie },
        });
        assert.strictEqual(bridgeRes.status, 302);
        const bridgedUrl = new URL(bridgeRes.headers.location);
        assert.strictEqual(bridgedUrl.origin, 'http://openvibe.chat.localhost:4800');
        const bridgedHash = new URLSearchParams(bridgedUrl.hash.slice(1));
        assert.ok(bridgedHash.get('openvibe_token'), 'session bridge should return a bearer token in the URL fragment');

        const exchangeRes = await request({
            port,
            hostHeader: 'my.openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/session/exchange',
            headers: {
                cookie: authCookie,
                'content-type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        assert.strictEqual(exchangeRes.status, 200);
        const exchanged = JSON.parse(exchangeRes.body);
        assert.ok(exchanged.access_token, 'session exchange should return an access token');
        assert.strictEqual(exchanged.user.username, 'alice');

        const lookupRes = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/users/lookup?username=alice',
            headers: { authorization: `Bearer ${exchanged.access_token}` },
        });
        assert.strictEqual(lookupRes.status, 200);
        const lookedUp = JSON.parse(lookupRes.body);
        assert.strictEqual(lookedUp.items.length, 1);
        assert.strictEqual(lookedUp.items[0].username, 'alice');

        const themeWrite = await request({
            port,
            hostHeader: 'my.openvibe.network',
            method: 'PUT',
            requestPath: '/api/v1/user-modules/me/openvibe.theme',
            headers: {
                cookie: authCookie,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ data: { theme_id: 'aurora-glow' } }),
        });
        assert.strictEqual(themeWrite.status, 200);
        const themeRead = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/user-modules/me/openvibe.theme',
            headers: { cookie: authCookie },
        });
        assert.strictEqual(JSON.parse(themeRead.body).data.theme_id, 'aurora-glow');

        const verifier = 'pkce-' + crypto.randomBytes(18).toString('hex');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        const oauthAuthorize = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            requestPath: '/oauth/authorize?client_id=openvibe-web&redirect_uri=' + encodeURIComponent('http://localhost/callback') + '&response_type=code&state=xyz&code_challenge=' + encodeURIComponent(challenge) + '&code_challenge_method=S256',
            headers: { cookie: authCookie },
        });
        assert.strictEqual(oauthAuthorize.status, 302);
        const location = new URL(oauthAuthorize.headers.location);
        assert.strictEqual(location.searchParams.get('state'), 'xyz');
        const code = location.searchParams.get('code');
        assert.ok(code, 'authorization code should be returned');

        const tokenBody = [
            'grant_type=authorization_code',
            'client_id=openvibe-web',
            'redirect_uri=' + encodeURIComponent('http://localhost/callback'),
            'code=' + encodeURIComponent(code),
            'code_verifier=' + encodeURIComponent(verifier),
        ].join('&');
        const tokenRes = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            method: 'POST',
            requestPath: '/oauth/token',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: tokenBody,
        });
        assert.strictEqual(tokenRes.status, 200);
        const tokens = JSON.parse(tokenRes.body);
        assert.ok(tokens.access_token, 'access token returned');
        assert.ok(tokens.refresh_token, 'refresh token returned');

        const bearerSession = await request({
            port,
            hostHeader: 'my.openvibe.network',
            requestPath: '/api/v1/session',
            headers: { authorization: `Bearer ${tokens.access_token}` },
        });
        const bearerSessionBody = JSON.parse(bearerSession.body);
        assert.strictEqual(bearerSessionBody.authenticated, true);
        assert.strictEqual(bearerSessionBody.anonymous, false);

        const refreshBody = [
            'grant_type=refresh_token',
            'client_id=openvibe-web',
            'refresh_token=' + encodeURIComponent(tokens.refresh_token),
        ].join('&');
        const refreshRes = await request({
            port,
            hostHeader: 'auth.openvibe.network',
            method: 'POST',
            requestPath: '/oauth/token',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: refreshBody,
        });
        assert.strictEqual(refreshRes.status, 200);
        assert.ok(JSON.parse(refreshRes.body).access_token);

        console.log('native-auth: OK');
    } finally {
        server.closeAllConnections && server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        fs.rmSync(tmp, { recursive: true, force: true });
    }
})().catch((err) => {
    console.error(err);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exitCode = 1;
});
