'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDir, writeJson } = require('../lib/common');
const { loadStagingBundle } = require('../lib/staging-loader');
const { buildReadinessReport } = require('../lib/readiness');

function writeNdjson(filePath, rows) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-readiness-test-'));
    const bundleDir = path.join(root, 'bundle');
    const dbPaths = {
        network: path.join(root, 'db', 'openvibe-network.db'),
        media: path.join(root, 'db', 'openvibe-media.db'),
        billing: path.join(root, 'db', 'openvibe-billing.db'),
        restream: path.join(root, 'db', 'openre-stream.db'),
        live: path.join(root, 'db', 'openvibe-live.db'),
        chat: path.join(root, 'db', 'openvibe-chat.db'),
        community: path.join(root, 'db', 'openvibe-community.db'),
    };

    writeNdjson(path.join(bundleDir, 'identity', 'users.ndjson'), [
        {
            id: 'user:hobotools:1',
            username: 'alice',
            primary_source: 'hobotools',
            source_profiles: {
                hobotools: { legacy_id: '1' },
                hobostreamer: { legacy_id: '42' },
            },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'identity', 'linked-accounts.ndjson'), [
        { id: 'linked-account:hobotools:10', user_id: 'user:hobotools:1', service: 'hobostreamer', service_user_id: '42' },
    ]);
    writeNdjson(path.join(bundleDir, 'themes', 'catalog.ndjson'), [
        { id: 'theme:hobotools:campfire', source: 'hobotools', slug: 'campfire', name: 'Campfire', legacy_ref: { source: 'hobotools', legacy_id: 'campfire' } },
    ]);
    writeNdjson(path.join(bundleDir, 'themes', 'preferences.ndjson'), [
        { id: 'theme-preference:hobotools:1', user_id: 'user:hobotools:1', source: 'hobotools', scope: 'network', theme_id: 'theme:hobotools:campfire', legacy_ref: { source: 'hobotools', legacy_id: '1' } },
    ]);
    writeNdjson(path.join(bundleDir, 'control-plane', 'url-registry.ndjson'), [
        { id: 'url-registry:hobotools:OPENVIBE_NETWORK_URL', key: 'OPENVIBE_NETWORK_URL', value: 'https://openvibe.network', description: 'network url', legacy_ref: { source: 'hobotools', legacy_id: 'OPENVIBE_NETWORK_URL' } },
    ]);
    writeNdjson(path.join(bundleDir, 'live', 'channels.ndjson'), [
        { id: 'channel:hobostreamer:11', source: 'hobostreamer', owner_user_id: 'user:hobotools:1', slug: 'alice', title: 'Alice Channel', legacy_ref: { source: 'hobostreamer', legacy_id: '11' } },
    ]);
    writeNdjson(path.join(bundleDir, 'live', 'stream-sessions.ndjson'), [
        { id: 'stream-session:hobostreamer:31', source: 'hobostreamer', owner_user_id: 'user:hobotools:1', channel_id: 'channel:hobostreamer:11', title: 'Live Now', status: 'live', is_live: true, legacy_ref: { source: 'hobostreamer', legacy_id: '31' } },
    ]);
    writeNdjson(path.join(bundleDir, 'chat', 'messages.ndjson'), [
        { id: 'chat-message:hobostreamer:41', source: 'hobostreamer', room_type: 'global', room_ref: 'global', sender_type: 'user', sender_id: 'user:hobotools:1', body: 'hello', legacy_ref: { source: 'hobostreamer', legacy_id: '41' } },
    ]);
    writeNdjson(path.join(bundleDir, 'community', 'pastes.ndjson'), [
        { id: 'paste:hobostreamer:71', source: 'hobostreamer', slug: 'hello', title: 'Hello', body: 'world', language: 'text', visibility: 'public', author_user_id: 'user:hobotools:1', metadata: {}, legacy_ref: { source: 'hobostreamer', legacy_id: '71' } },
    ]);
    writeNdjson(path.join(bundleDir, 'community', 'comments.ndjson'), [
        { id: 'comment:hobostreamer:81', source: 'hobostreamer', ref_type: 'vod', ref_id: 'media:hobostreamer-vod:51', author_user_id: 'user:hobotools:1', body: 'nice', legacy_ref: { source: 'hobostreamer', legacy_id: '81' } },
    ]);
    writeNdjson(path.join(bundleDir, 'media', 'objects.ndjson'), [
        { id: 'media:hobostreamer-vod:51', source: 'hobostreamer', legacy_table: 'vods', owner_user_id: 'user:hobotools:1', namespace: 'live.vods', media_type: 'vod', visibility: 'public', file_path: './data/vods/vod1.mp4', legacy_ref: { source: 'hobostreamer', legacy_id: '51' } },
    ]);
    writeNdjson(path.join(bundleDir, 'billing', 'subscriptions.ndjson'), [
        { id: 'subscription:hobostreamer:91', source: 'hobostreamer', subscriber_user_id: 'user:hobotools:1', creator_user_id: 'user:hobotools:1', tier: 1, legacy_ref: { source: 'hobostreamer', legacy_id: '91' } },
    ]);

    writeJson(path.join(bundleDir, 'audit', 'import-report.json'), {
        exclusions: [
            { entity: 'users.hobo_bucks_balance', reason: 'excluded' },
            { entity: 'transactions', reason: 'excluded' },
        ],
        datasets: {
            'identity/users': {},
            'identity/linked-accounts': {},
            'themes/catalog': {},
            'themes/preferences': {},
            'control-plane/url-registry': {},
            'live/channels': {},
            'live/stream-sessions': {},
            'chat/messages': {},
            'community/pastes': {},
            'community/comments': {},
            'media/objects': {},
            'billing/subscriptions': {},
        },
    });
    writeJson(path.join(bundleDir, 'audit', 'media-backfill-report.json'), {
        missing_files: [{ media_id: 'media:hobostreamer-vod:51', source_path: './data/vods/vod1.mp4' }],
    });

    const previousAllow = process.env.OPENVIBE_ALLOW_STAGING_LOAD;
    const previousConfirm = process.env.OPENVIBE_STAGING_CONFIRM;
    process.env.OPENVIBE_ALLOW_STAGING_LOAD = 'true';
    process.env.OPENVIBE_STAGING_CONFIRM = 'true';

    try {
        await loadStagingBundle({
            bundleDir,
            dbPaths,
            confirmLoad: true,
            runId: 'readiness-test',
            logger: { info() {}, warn() {}, error() {} },
        });
    } finally {
        if (previousAllow == null) delete process.env.OPENVIBE_ALLOW_STAGING_LOAD;
        else process.env.OPENVIBE_ALLOW_STAGING_LOAD = previousAllow;
        if (previousConfirm == null) delete process.env.OPENVIBE_STAGING_CONFIRM;
        else process.env.OPENVIBE_STAGING_CONFIRM = previousConfirm;
    }

    const report = await buildReadinessReport({
        bundleDir,
        dbPaths,
        requester: async (request) => {
            if (request.headers && request.headers.Host === 'auth.openvibe.network') {
                return {
                    ok: true,
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ openvibe: { federation: { mode: 'hobo-tools' } } }),
                };
            }
            if (request.url.includes('/api/v1/session')) {
                return {
                    ok: true,
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ authenticated: false, user: null }),
                };
            }
            if (request.url.includes('/api/v1/admin/migration-status')) {
                return {
                    ok: true,
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ artifacts: [], import: { dataset_count: 12 } }),
                };
            }
            if (request.url.includes('/api/community/pastes')) {
                return { ok: false, status: 503, headers: {}, body: 'unavailable' };
            }
            if (request.url.includes('/health')) {
                return {
                    ok: true,
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ ok: true, persistence: { mode: 'sqlite', legacy_compat_mode: false } }),
                };
            }
            if (request.url.includes('/api/')) {
                return { ok: true, status: 200, headers: { 'content-type': 'application/json' }, body: '{}' };
            }
            if (request.url.endsWith('/')) {
                return { ok: true, status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html><title>ok</title>' };
            }
            return { ok: true, status: 200, headers: {}, body: '' };
        },
    });

    assert.ok(report.summary.green > 0, 'expected at least one green readiness check');
    assert.ok(report.summary.yellow > 0, 'expected at least one yellow readiness check');
    assert.ok(report.summary.red > 0, 'expected at least one red readiness check');
    assert.strictEqual(report.gate, 'red');
    assert.ok(report.manual_actions.some((entry) => entry.includes('community-api')));
    assert.ok(report.checks.some((check) => check.name === 'staging-persistence-descriptors' && check.status === 'green'));
    assert.ok(report.checks.some((check) => check.name === 'session-api' && check.status === 'green'));
    assert.ok(report.checks.some((check) => check.name === 'admin-migration-status' && check.status === 'green'));

    console.log('readiness test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
