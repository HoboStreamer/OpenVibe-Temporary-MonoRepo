'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-chat-auth-'));
const dbPath = path.join(tmp, 'chat.db');
const publicKeyPath = path.join(tmp, 'openvibe-public.pem');

const keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

fs.writeFileSync(publicKeyPath, keyPair.publicKey, 'utf8');

process.env.DB_PATH = dbPath;
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_AUTH_ISSUER = 'http://auth.openvibe.network.localhost:4100';
process.env.OPENVIBE_AUTH_PUBLIC_KEY = publicKeyPath;

const { buildApp } = require('../server/index');

function request({ port, method = 'GET', requestPath = '/', headers, body }) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: requestPath,
            method,
            headers: Object.assign({}, headers || {}, body ? { 'content-length': Buffer.byteLength(body) } : {}),
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
    const { app } = buildApp();
    const server = app.listen(0, '127.0.0.1');
    try {
        await new Promise((resolve) => server.once('listening', resolve));
        const port = server.address().port;

        const anonSession = await request({ port, requestPath: '/api/chat/session' });
        assert.strictEqual(anonSession.status, 200);
        assert.strictEqual(JSON.parse(anonSession.body).authenticated, false);

        const token = jwt.sign({
            sub: 'usr_chat_auth',
            id: 'usr_chat_auth',
            username: 'chatalice',
            display_name: 'Chat Alice',
            role: 'user',
            scope: 'openid profile email theme',
        }, keyPair.privateKey, {
            algorithm: 'RS256',
            issuer: process.env.OPENVIBE_AUTH_ISSUER,
            audience: 'openvibe',
            expiresIn: '1h',
        });

        const authedSession = await request({
            port,
            requestPath: '/api/chat/session',
            headers: { authorization: `Bearer ${token}` },
        });
        assert.strictEqual(authedSession.status, 200);
        const authed = JSON.parse(authedSession.body);
        assert.strictEqual(authed.authenticated, true);
        assert.strictEqual(authed.user.username, 'chatalice');

        const dms = await request({
            port,
            requestPath: '/api/chat/dms',
            headers: { authorization: `Bearer ${token}` },
        });
        assert.strictEqual(dms.status, 200);
        assert.deepStrictEqual(JSON.parse(dms.body).items, []);

        console.log('openvibe-chat auth OK');
    } finally {
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
})().catch((error) => {
    console.error(error);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exitCode = 1;
});
