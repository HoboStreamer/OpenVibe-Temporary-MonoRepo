'use strict';

const assert = require('assert');
const bcrypt = require('bcryptjs');
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

function readNdjson(filePath) {
    return fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-migrate-test-'));
    const sourceDir = path.join(root, 'source');
    const outDir = path.join(root, 'out');

    ensureDir(path.join(sourceDir, 'hobotools', 'tables'));
    ensureDir(path.join(sourceDir, 'hobostreamer', 'tables'));
    ensureDir(path.join(sourceDir, 'hoboquest', 'tables'));

    writeNdjson(path.join(sourceDir, 'hobotools', 'tables', 'users.ndjson'), [
        {
            id: 1,
            username: 'alice',
            email: 'alice@example.com',
            password_hash: bcrypt.hashSync('TopSecret123!', 10),
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
            password_hash: bcrypt.hashSync('TopSecret123!', 10),
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
    writeNdjson(path.join(sourceDir, 'hobostreamer', 'tables', 'canvas_user_overrides.ndjson'), [
        { user_id: 42, note: 'legacy artist', updated_at: '2026-01-05T00:00:00Z' },
    ]);

    writeJson(path.join(sourceDir, 'hobostreamer', 'manifest.json'), {
        source: 'hobostreamer',
        exclusions: [
            { entity: 'users.hobo_bucks_balance', reason: 'excluded' },
            { entity: 'transactions', reason: 'excluded' },
        ],
    });

    writeNdjson(path.join(sourceDir, 'hoboquest', 'tables', 'game_players.ndjson'), [
        {
            user_id: 1,
            display_name: 'Alice Quest',
            class_name: 'ranger',
            zone: 'forest',
            coins: 77,
            combat_xp: 15,
            updated_at: '2026-01-04T00:00:00Z',
        },
        {
            user_id: -101001001,
            display_name: 'hobo_anon4242',
            zone: 'caves',
            coins: 9,
            updated_at: '2026-01-04T06:00:00Z',
        },
        {
            user_id: -202002002,
            display_name: 'hobo_anon5',
            zone: 'ruins',
            coins: 3,
            updated_at: '2026-01-04T06:15:00Z',
        },
    ]);
    writeNdjson(path.join(sourceDir, 'hoboquest', 'tables', 'game_inventory.ndjson'), [
        { user_id: 1, item_id: 'oak_log', quantity: 12, updated_at: '2026-01-04T00:00:00Z' },
        { user_id: -101001001, item_id: 'stone', quantity: 3, updated_at: '2026-01-04T06:05:00Z' },
        { user_id: -202002002, item_id: 'berry', quantity: 1, updated_at: '2026-01-04T06:20:00Z' },
    ]);
    writeNdjson(path.join(sourceDir, 'hoboquest', 'tables', 'game_daily_quest_progress.ndjson'), [
        { user_id: 1, quest_date: '2026-01-04', quest_id: 'daily_gather_wood', value: 4, goal: 10, updated_at: '2026-01-04T10:00:00Z' },
    ]);
    writeNdjson(path.join(sourceDir, 'hoboquest', 'tables', 'canvas_settings.ndjson'), [
        { key: 'board:mode', value: '"classic"', updated_at: '2026-01-04T00:00:00Z' },
    ]);
    writeNdjson(path.join(sourceDir, 'hoboquest', 'tables', 'canvas_tiles.ndjson'), [
        { x: 3, y: 5, color_index: 7, user_id: 1, username: 'alice', placed_at: '2026-01-04T00:00:00Z' },
        { x: 4, y: 6, color_index: 2, user_id: -101001001, username: 'Anonymous #4242', placed_at: '2026-01-04T06:10:00Z' },
        { x: 5, y: 7, color_index: 3, user_id: -202002002, username: 'Anonymous #5', placed_at: '2026-01-04T06:25:00Z' },
    ]);
    writeNdjson(path.join(sourceDir, 'hoboquest', 'tables', 'canvas_user_overrides.ndjson'), [
        { user_id: 1, placements_per_minute: 12, updated_at: '2026-01-04T00:00:00Z' },
    ]);
    writeNdjson(path.join(sourceDir, 'hoboquest', 'tables', 'user_equipped.ndjson'), [
        { user_id: 1, slot: 'hat', item_id: 'straw-hat', updated_at: '2026-01-04T00:00:00Z' },
    ]);

    writeJson(path.join(sourceDir, 'hoboquest', 'manifest.json'), {
        source: 'hoboquest',
        exclusions: [
            { entity: 'canvas_pixels', reason: 'consolidated into canvas_tiles' },
            { entity: 'canvas_cooldowns', reason: 'consolidated into canvas_user_overrides' },
        ],
    });

    const report = await importCanonicalBundle({ sourceDir, outDir, logger: { info() {}, warn() {}, error() {} } });
    assert.strictEqual(report.user_merge.canonical_users, 1, 'expected HoboStreamer user to merge into hobo-tools canonical user');
    assert.strictEqual(report.datasets['identity/users'].written_records, 1, 'expected one canonical user');
    assert.strictEqual(report.datasets['identity/anon-users'].written_records, 2, 'expected anon bundle to include hobo.tools and HoboQuest anonymous identities');
    assert.strictEqual(report.datasets['loyalty/coin-transactions'].written_records, 1, 'expected one loyalty transaction');
    assert.strictEqual(report.datasets['games/players'].written_records, 3, 'expected canonical game players to preserve the native user plus both anonymous HoboQuest users');
    assert.strictEqual(report.datasets['games/canvas-tiles'].written_records, 3, 'expected canonical canvas tiles to preserve the native user plus both anonymous HoboQuest placements');
    assert.strictEqual(report.datasets['games/cosmetics'].written_records, 1, 'expected synthesized equipped-only cosmetics to count once');
    assert.ok(report.exclusions.some((entry) => entry.entity === 'users.hobo_bucks_balance'));
    assert.ok(report.exclusions.some((entry) => entry.entity === 'canvas_pixels'));
    assert.ok(fs.existsSync(path.join(report.bundle_dir, 'audit', 'import-report.json')));

    const importedAnonUsers = readNdjson(path.join(report.bundle_dir, 'identity', 'anon-users.ndjson'));
    const importedCosmetics = readNdjson(path.join(report.bundle_dir, 'games', 'cosmetics.ndjson'));
    const importedPlayers = readNdjson(path.join(report.bundle_dir, 'games', 'players.ndjson'));
    const importedInventory = readNdjson(path.join(report.bundle_dir, 'games', 'inventory.ndjson'));
    const importedOverrides = readNdjson(path.join(report.bundle_dir, 'games', 'canvas-user-overrides.ndjson'));
    const importedAnonUser = importedAnonUsers.find((row) => row.source === 'hoboquest');
    assert.ok(importedAnonUser, 'expected a HoboQuest anonymous identity record');
    assert.strictEqual(importedAnonUsers.length, 2, 'expected colliding HoboQuest anon identities to reuse the existing hobo.tools anon record');
    assert.strictEqual(importedAnonUser.anon_number, 4242);
    assert.strictEqual(importedAnonUser.display_name, 'Anonymous #4242');
    assert.strictEqual(importedAnonUser.preferences.legacy_game_user_id, '-101001001');
    assert.ok(importedPlayers.some((row) => row.user_id === importedAnonUser.id), 'expected anonymous HoboQuest player rows to reference canonical anon identities');
    assert.ok(importedInventory.some((row) => row.user_id === importedAnonUser.id && row.item_id === 'stone'), 'expected anonymous HoboQuest inventory to survive canonical import');
    assert.ok(importedPlayers.some((row) => row.user_id === 'anon-user:hobotools:5' && row.zone === 'ruins'), 'expected HoboQuest anon identities that expose an existing anon number to collapse onto the matching hobo.tools anon user');
    assert.ok(importedInventory.some((row) => row.user_id === 'anon-user:hobotools:5' && row.item_id === 'berry'), 'expected merged HoboQuest anon inventory to follow the reused canonical anon identity');
    assert.strictEqual(importedCosmetics.length, 1, 'expected one cosmetic row in canonical bundle');
    assert.strictEqual(importedCosmetics[0].equipped, true);
    assert.strictEqual(importedOverrides.length, 1, 'expected one canvas override row in canonical bundle');
    assert.strictEqual(importedOverrides[0].cooldown_seconds, null, 'null legacy cooldowns should stay null, not coerce to zero');
    assert.strictEqual(importedOverrides[0].placements_per_minute, 12);

    const summary = await validateBundle({ bundleDir: report.bundle_dir });
    assert.strictEqual(summary.ok, true, `expected validation to pass: ${JSON.stringify(summary, null, 2)}`);

    console.log('migration foundation test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
