'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDir, writeJson } = require('../lib/common');
const { importCanonicalBundle } = require('../lib/importer');
const { validateBundle } = require('../lib/validator');

function writeNdjson(filePath, rows) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-migrate-test-'));
    const sourceDir = path.join(root, 'source');
    const outDir = path.join(root, 'out');

    ensureDir(path.join(sourceDir, 'hobotools', 'tables'));
    ensureDir(path.join(sourceDir, 'hobostreamer', 'tables'));

    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'users.ndjson'), [
        {
            id: 1,
            username: 'alice',
            email: 'alice@example.com',
            password_hash: 'hash-1',
            display_name: 'Alice',
            role: 'user',
            created_at: '2026-01-01T00:00:00Z',
        },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'linked_accounts.ndjson'), [
        {
            id: 10,
            user_id: 1,
            service: 'hobostreamer',
            service_user_id: '42',
            service_username: 'alice-stream',
            linked_at: '2026-01-01T00:00:00Z',
        },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'user_preferences.ndjson'), [
        { user_id: 1, theme_id: 'campfire', custom_theme_variables: '{}', language: 'en', notifications_enabled: 1 },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'themes.ndjson'), [
        { id: 'campfire', slug: 'campfire', name: 'Campfire', variables: '{}', preview_colors: '{}', is_builtin: 1, is_public: 1, tags: '[]' },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'url_registry.ndjson'), [
        { key: 'OPENVIBE_NETWORK_URL', label: 'Network', category: 'openvibe', service: 'network', scope: 'public', type: 'url', value: 'https://openvibe.network' },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'notifications.ndjson'), [
        { id: 'n1', user_id: 1, type: 'follow', category: 'social', priority: 'normal', title: 'Welcome', created_at: '2026-01-01T00:00:00Z' },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'notification_preferences.ndjson'), [
        { user_id: 1, category: '*', enabled: 1, sound: 1, toasts: 1, email: 0 },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'anon_users.ndjson'), [
        { id: 5, anon_number: 5, session_token: 'anon-token', display_name: 'Anonymous #5', preferences: '{}', total_messages: 2, total_commands: 0 },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'user_effects.ndjson'), [
        { user_id: 1, effect_type: 'name', effect_id: 'rainbow', is_active: 1 },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'follows.ndjson'), [
        { follower_id: 1, followed_id: 1, created_at: '2026-01-02T00:00:00Z' },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'verification_keys.ndjson'), [
        { id: 7, key: 'verify-1', target_username: 'alice', status: 'active', created_by: 1 },
    ]);
    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'oauth_clients.ndjson'), [
        { client_id: 'hobostreamer', name: 'HoboStreamer', redirect_uris: '["https://hobostreamer.com/auth/callback"]', is_first_party: 1, client_secret_redacted: true },
    ]);

    writeJson(path.join(sourceDir, 'hobotools', 'manifest.json'), {
        source: 'hobotools',
        exclusions: [{ entity: 'oauth_tokens', reason: 'ephemeral' }],
    });

    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'users.ndjson'), [
        {
            id: 42,
            username: 'alice-stream',
            email: null,
            password_hash: 'hash-legacy',
            display_name: 'Alice Stream',
            role: 'streamer',
            created_at: '2025-12-01T00:00:00Z',
        },
    ]);
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'linked_accounts.ndjson'), [
        {
            id: 3,
            user_id: 42,
            service: 'hobo.tools',
            service_user_id: '1',
            service_username: 'alice',
            linked_at: '2026-01-01T00:00:00Z',
        },
    ]);
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'channels.ndjson'), [
        { id: 11, user_id: 42, title: 'Alice Channel', description: 'hello', tags: '[]', protocol: 'webrtc', created_at: '2026-01-01T00:00:00Z' },
    ]);
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'managed_streams.ndjson'), [
        { id: 21, user_id: 42, channel_id: 11, slug: 'alice-main', title: 'Main Stream', tags: '[]', protocol: 'webrtc' },
    ]);
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'streams.ndjson'), [
        { id: 31, user_id: 42, channel_id: 11, managed_stream_id: 21, title: 'Live Now', tags: '[]', protocol: 'webrtc', is_live: 1 },
    ]);
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'chat_messages.ndjson'), [
        { id: 41, stream_id: 31, user_id: 42, username: 'alice-stream', message: 'hello world', message_type: 'chat', is_global: 0, timestamp: '2026-01-01T01:00:00Z' },
    ]);
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'vods.ndjson'), [
        { id: 51, stream_id: 31, user_id: 42, title: 'VOD 1', description: 'desc', file_path: './data/vods/vod1.mp4', file_size: 123, duration_seconds: 45, is_public: 1 },
    ]);
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'clips.ndjson'), [
        { id: 61, vod_id: 51, stream_id: 31, user_id: 42, title: 'Clip 1', file_path: './data/clips/clip1.mp4', duration_seconds: 12, is_public: 1 },
    ]);
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'pastes.ndjson'), [
        { id: 71, slug: 'hello', user_id: 42, type: 'paste', title: 'Hello', content: 'world', language: 'text', visibility: 'public', created_at: '2026-01-03T00:00:00Z' },
    ]);
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'subscriptions.ndjson'), [
        { id: 81, subscriber_id: 42, streamer_id: 42, tier: 1, is_active: 1 },
    ]);
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'coin_transactions.ndjson'), [
        { id: 91, user_id: 42, amount: 25, reason: 'watch', created_at: '2026-01-03T01:00:00Z' },
    ]);

    writeJson(path.join(sourceDir, 'hobostreamer', 'manifest.json'), {
        source: 'hobostreamer',
        exclusions: [
            { entity: 'users.hobo_bucks_balance', reason: 'excluded' },
            { entity: 'transactions', reason: 'excluded' },
        ],
    });

    const report = await importCanonicalBundle({ sourceDir, outDir, logger: { info() {}, warn() {}, error() {} } });
    assert.strictEqual(report.user_merge.canonical_users, 1, 'expected HoboStreamer user to merge into hobo-tools canonical user');
    assert.strictEqual(report.datasets['identity/users'].written_records, 1, 'expected one canonical user');
    assert.strictEqual(report.datasets['loyalty/coin-transactions'].written_records, 1, 'expected one loyalty transaction');
    assert.ok(report.exclusions.some((entry) => entry.entity === 'users.hobo_bucks_balance'));
    assert.ok(fs.existsSync(path.join(report.bundle_dir, 'audit', 'import-report.json')));

    const summary = await validateBundle({ bundleDir: report.bundle_dir });
    assert.strictEqual(summary.ok, true, `expected validation to pass: ${JSON.stringify(summary, null, 2)}`);

    console.log('migration foundation test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
