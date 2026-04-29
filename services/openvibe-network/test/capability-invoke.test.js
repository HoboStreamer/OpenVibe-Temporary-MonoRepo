'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-capability-invoke-'));

function request({ port, hostHeader, method = 'GET', requestPath = '/', headers, body }) {
    return new Promise((resolve, reject) => {
        const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: requestPath,
            method,
            headers: Object.assign({ host: hostHeader }, headers || {}, payload ? {
                'content-type': 'application/json',
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
    const stubState = { chatRoomCreates: 0 };
    const stubServer = http.createServer((req, res) => {
        let raw = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            const send = (status, body) => {
                res.statusCode = status;
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify(body));
            };
            let parsed = {};
            try { parsed = raw ? JSON.parse(raw) : {}; } catch {}

            if (req.method === 'POST' && req.url === '/api/chat/rooms') {
                stubState.chatRoomCreates += 1;
                return send(200, { room_id: 'room-1', name: parsed.name || 'General', created_by: 'stub' });
            }

            return send(200, { ok: true, method: req.method, path: req.url, body: parsed });
        });
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
            'x-openvibe-service': 'test-service',
        };

        const firstInvoke = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/capabilities/chat.room.create/invoke',
            headers: serviceHeaders,
            body: { idempotency_key: 'chat-room-1', name: 'General' },
        });
        assert.strictEqual(firstInvoke.status, 200);
        assert.strictEqual(firstInvoke.body.status, 'succeeded');
        assert.strictEqual(firstInvoke.body.result.room_id, 'room-1');
        assert.strictEqual(firstInvoke.body.target_service, 'openvibe-chat');
        assert.strictEqual(stubState.chatRoomCreates, 1);

        const secondInvoke = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/capabilities/chat.room.create/invoke',
            headers: serviceHeaders,
            body: { idempotency_key: 'chat-room-1', name: 'General' },
        });
        assert.strictEqual(secondInvoke.status, 200);
        assert.strictEqual(secondInvoke.body.invocation_id, firstInvoke.body.invocation_id);
        assert.strictEqual(stubState.chatRoomCreates, 1);

        const invocation = await request({
            port,
            hostHeader: 'openvibe.network',
            requestPath: `/api/v1/capability-invocations/${encodeURIComponent(firstInvoke.body.invocation_id)}`,
            headers: serviceHeaders,
        });
        assert.strictEqual(invocation.status, 200);
        assert.strictEqual(invocation.body.status, 'succeeded');
        assert.strictEqual(invocation.body.response.result.room_id, 'room-1');

        const registerCapability = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/capabilities',
            headers: serviceHeaders,
            body: {
                capability_id: 'test.echo',
                owner_service: 'openvibe-network',
                input_schema: {
                    type: 'object',
                    required: ['message'],
                    additionalProperties: false,
                    properties: { message: { type: 'string' } },
                },
                policy: { access: 'service' },
            },
        });
        assert.strictEqual(registerCapability.status, 201);

        const validate = await request({
            port,
            hostHeader: 'openvibe.network',
            method: 'POST',
            requestPath: '/api/v1/capabilities/test.echo/validate',
            headers: serviceHeaders,
            body: {},
        });
        assert.strictEqual(validate.status, 200);
        assert.strictEqual(validate.body.ok, false);
        assert.ok(Array.isArray(validate.body.errors));
        assert.ok(validate.body.errors.some((message) => String(message).includes('message')));

        console.log('capability-invoke: OK');
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
