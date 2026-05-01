'use strict';

const assert = require('assert');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const { ensureDir, writeJson } = require('../lib/common');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_NETWORK_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_MEDIA_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_BILLING_DATABASE_URL = '';
process.env.OPENVIBE_OPENRE_STREAM_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_LIVE_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_CHAT_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_COMMUNITY_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_GAMES_DATABASE_URL = '';

const { loadStagingBundle, __test } = require('../lib/staging-loader');

(function hasTableSupportsPostgresCompat() {
    const postgresCalls = [];
    const postgresDb = {
        getStatus() {
            return { adapter: 'postgres' };
        },
        prepare(sql) {
            postgresCalls.push(sql);
            return {
                get(tableName) {
                    return tableName === 'legacy_id_map' ? { present: 1 } : undefined;
                },
            };
        },
    };
    assert.strictEqual(__test.isPostgresCompatDb(postgresDb), true);
    assert.strictEqual(__test.hasTable(postgresDb, 'legacy_id_map'), true);
    assert.match(postgresCalls[0], /information_schema\.tables/);

    const sqliteCalls = [];
    const sqliteDb = {
        prepare(sql) {
            sqliteCalls.push(sql);
            return {
                get(tableName) {
                    return tableName === 'legacy_id_map' ? { name: tableName } : undefined;
                },
            };
        },
    };
    assert.strictEqual(__test.isPostgresCompatDb(sqliteDb), false);
    assert.strictEqual(__test.hasTable(sqliteDb, 'legacy_id_map'), true);
    assert.match(sqliteCalls[0], /sqlite_master/);
})();

(function battleStatsSchemaSupportsFractionalTotals() {
    const sqliteSchema = fs.readFileSync(path.join(repoRoot, 'services', 'openvibe-games', 'server', 'db.js'), 'utf8');
    const postgresSchema = fs.readFileSync(path.join(repoRoot, 'services', 'openvibe-games', 'server', 'migrations', 'postgres', '001_init.sql'), 'utf8');
    assert.match(sqliteSchema, /total_stolen REAL NOT NULL DEFAULT 0/);
    assert.match(sqliteSchema, /total_lost REAL NOT NULL DEFAULT 0/);
    assert.match(postgresSchema, /total_stolen REAL NOT NULL DEFAULT 0/);
    assert.match(postgresSchema, /total_lost REAL NOT NULL DEFAULT 0/);
})();

(function mediaSchemaSupportsLargeByteValues() {
    const sqliteSchema = fs.readFileSync(path.join(repoRoot, 'services', 'openvibe-media', 'server', 'db.js'), 'utf8');
    const postgresSchema = fs.readFileSync(path.join(repoRoot, 'services', 'openvibe-media', 'server', 'migrations', 'postgres', '001_init.sql'), 'utf8');
    const postgresEvolution = fs.readFileSync(path.join(repoRoot, 'services', 'openvibe-media', 'server', 'migrations', 'postgres', '003_widen_byte_columns.sql'), 'utf8');
    assert.match(sqliteSchema, /CREATE TABLE IF NOT EXISTS media_objects \([\s\S]*?size_bytes\s+BIGINT NOT NULL DEFAULT 0/);
    assert.match(sqliteSchema, /CREATE TABLE IF NOT EXISTS media_object_locations \([\s\S]*?size_bytes\s+BIGINT NOT NULL DEFAULT 0/);
    assert.match(postgresSchema, /CREATE TABLE IF NOT EXISTS media_objects \([\s\S]*?size_bytes BIGINT NOT NULL DEFAULT 0/);
    assert.match(postgresSchema, /CREATE TABLE IF NOT EXISTS media_object_locations \([\s\S]*?size_bytes BIGINT NOT NULL DEFAULT 0/);
    assert.match(postgresEvolution, /ALTER TABLE media_objects[\s\S]*?ALTER COLUMN size_bytes TYPE BIGINT/);
    assert.match(postgresEvolution, /ALTER TABLE media_object_locations[\s\S]*?ALTER COLUMN size_bytes TYPE BIGINT/);
})();

function writeNdjson(filePath, rows) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-staging-loader-test-'));
    const bundleDir = path.join(root, 'bundle');
    const dbPaths = {
        network: path.join(root, 'db', 'openvibe-network.db'),
        media: path.join(root, 'db', 'openvibe-media.db'),
        billing: path.join(root, 'db', 'openvibe-billing.db'),
        restream: path.join(root, 'db', 'openre-stream.db'),
        live: path.join(root, 'db', 'openvibe-live.db'),
        chat: path.join(root, 'db', 'openvibe-chat.db'),
        community: path.join(root, 'db', 'openvibe-community.db'),
        games: path.join(root, 'db', 'openvibe-games.db'),
    };

    writeNdjson(path.join(bundleDir, 'identity', 'users.ndjson'), [
        {
            id: 'user:hobotools:1',
            username: 'alice',
            display_name: 'Alice Example',
            email: 'alice@example.com',
            password_hash: bcrypt.hashSync('TopSecret123!', 10),
            primary_source: 'hobotools',
            source_profiles: {
                hobotools: { legacy_id: '1' },
                hobostreamer: { legacy_id: '42' },
            },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'identity', 'anon-users.ndjson'), [
        {
            id: 'anon-user:hobotools:7',
            source: 'hobotools',
            anon_number: 7,
            session_token: 'anon-session-token-7',
            display_name: 'should not survive',
            preferences: { color: 'green' },
            total_messages: 12,
            total_commands: 3,
            first_seen: '2026-01-01T00:00:00Z',
            last_seen: '2026-01-02T00:00:00Z',
            legacy_ref: { source: 'hobotools', legacy_id: '7' },
        },
        {
            id: 'anon-user:hoboquest:-7',
            source: 'hoboquest',
            anon_number: null,
            session_token: null,
            display_name: 'hobo_anon7',
            preferences: { username: 'hobo_anon7', legacy_game_user_id: '-7' },
            total_messages: 99,
            total_commands: 8,
            first_seen: '2026-01-03T00:00:00Z',
            last_seen: '2026-01-04T00:00:00Z',
            legacy_ref: { source: 'hoboquest', legacy_id: '-7' },
        },
        {
            id: 'anon-user:hoboquest:-4242',
            source: 'hoboquest',
            anon_number: null,
            session_token: null,
            display_name: 'hobo_anon4242',
            preferences: { username: 'hobo_anon4242', legacy_game_user_id: '-4242' },
            total_messages: 4,
            total_commands: 1,
            first_seen: '2026-01-05T00:00:00Z',
            last_seen: '2026-01-06T00:00:00Z',
            legacy_ref: { source: 'hoboquest', legacy_id: '-4242' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'identity', 'linked-accounts.ndjson'), [
        { id: 'linked-account:hobotools:10', user_id: 'user:hobotools:1', service: 'hobostreamer', service_user_id: '42' },
    ]);
    writeNdjson(path.join(bundleDir, 'control-plane', 'oauth-clients.ndjson'), [
        {
            id: 'oauth-client:hobostreamer:openvibe-web',
            source: 'hobostreamer',
            client_id: 'openvibe-web',
            name: 'OpenVibe Web',
            redirect_uris: ['http://localhost/callback', 'https://hobo.quest/auth/callback'],
            is_first_party: true,
            client_secret_redacted: true,
            legacy_ref: { source: 'hobostreamer', legacy_id: 'openvibe-web' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'control-plane', 'notifications.ndjson'), [
        {
            id: 'notification:hobostreamer:501',
            source: 'hobostreamer',
            user_id: 'user:hobotools:1',
            sender_user_id: 'user:hobotools:1',
            type: 'follow.created',
            category: 'social',
            priority: 'normal',
            title: 'Alice followed you',
            message: 'Alice is now following you',
            service: 'openvibe-network',
            url: '/u/alice',
            rich_content: { follower_user_id: 'user:hobotools:1' },
            is_read: false,
            is_dismissed: false,
            is_emailed: false,
            created_at: '2026-01-02T12:00:00Z',
            legacy_ref: { source: 'hobostreamer', legacy_id: '501' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'control-plane', 'notification-preferences.ndjson'), [
        {
            id: 'notification-preference:hobostreamer:mentions',
            source: 'hobostreamer',
            user_id: 'user:hobotools:1',
            category: 'mentions',
            enabled: true,
            email: true,
            browser: true,
            sound: false,
            created_at: '2026-01-03T12:00:00Z',
            legacy_ref: { source: 'hobostreamer', legacy_id: 'mentions' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'social', 'follows.ndjson'), [
        {
            id: 'follow:hobostreamer:601',
            source: 'hobostreamer',
            scope: 'network',
            follower_user_id: 'user:hobotools:1',
            followed_user_id: 'user:hobotools:2',
            email_notify: true,
            push_notify: false,
            created_at: '2026-01-04T12:00:00Z',
            legacy_ref: { source: 'hobostreamer', legacy_id: '601' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'live', 'channels.ndjson'), [
        {
            id: 'channel:hobostreamer:11',
            source: 'hobostreamer',
            owner_user_id: 'user:hobotools:1',
            slug: 'alice',
            title: 'Alice Channel',
            description: 'hello',
            category: 'irl',
            protocol: 'webrtc',
            metadata: {},
            legacy_ref: { source: 'hobostreamer', legacy_id: '11' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'live', 'stream-sessions.ndjson'), [
        {
            id: 'stream-session:hobostreamer:31',
            source: 'hobostreamer',
            owner_user_id: 'user:hobotools:1',
            channel_id: 'channel:hobostreamer:11',
            title: 'Live Now',
            category: 'irl',
            protocol: 'webrtc',
            status: 'live',
            is_live: true,
            metadata: {},
            legacy_ref: { source: 'hobostreamer', legacy_id: '31' },
        },
        {
            id: 'stream-session:hobostreamer:32',
            source: 'hobostreamer',
            owner_user_id: 'user:hobotools:1',
            channel_id: null,
            title: 'Recovered Channel Stream',
            category: 'irl',
            protocol: 'rtmp',
            status: 'ended',
            is_live: false,
            metadata: {},
            legacy_ref: { source: 'hobostreamer', legacy_id: '32' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'chat', 'messages.ndjson'), [
        {
            id: 'chat-message:hobostreamer:41',
            source: 'hobostreamer',
            room_type: 'global',
            room_ref: 'global',
            sender_type: 'user',
            sender_id: 'user:hobotools:1',
            message_type: 'chat',
            body: 'hello world',
            legacy_ref: { source: 'hobostreamer', legacy_id: '41' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'community', 'pastes.ndjson'), [
        {
            id: 'paste:hobostreamer:71',
            source: 'hobostreamer',
            slug: 'hello',
            title: 'Hello',
            body: 'world',
            language: 'text',
            visibility: 'public',
            author_user_id: 'user:hobotools:1',
            metadata: {},
            legacy_ref: { source: 'hobostreamer', legacy_id: '71' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'community', 'comments.ndjson'), [
        {
            id: 'comment:hobostreamer:81',
            source: 'hobostreamer',
            ref_type: 'vod',
            ref_id: 'media:hobostreamer-vod:51',
            author_user_id: 'user:hobotools:1',
            body: 'nice vod',
            is_deleted: false,
            legacy_ref: { source: 'hobostreamer', legacy_id: '81' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'media', 'objects.ndjson'), [
        {
            id: 'media:hobostreamer-vod:51',
            source: 'hobostreamer',
            legacy_table: 'vods',
            owner_user_id: 'user:hobotools:1',
            namespace: 'live.vods',
            media_type: 'vod',
            visibility: 'public',
            title: 'VOD 1',
            file_path: './data/vods/vod1.mp4',
            size_bytes: 3063137389,
            created_at: '2026-01-01T00:00:00Z',
            legacy_ref: { source: 'hobostreamer', legacy_id: '51' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'billing', 'subscriptions.ndjson'), [
        {
            id: 'subscription:hobostreamer:91',
            source: 'hobostreamer',
            subscriber_user_id: 'user:hobotools:1',
            creator_user_id: 'user:hobotools:1',
            tier: 1,
            is_active: true,
            legacy_ref: { source: 'hobostreamer', legacy_id: '91' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'loyalty', 'coin-transactions.ndjson'), [
        {
            id: 'coin_transactions:hobostreamer:101',
            source: 'hobostreamer',
            user_id: 'user:hobotools:1',
            payload: { amount: 25 },
            legacy_ref: { source: 'hobostreamer', legacy_id: '101' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'games', 'players.ndjson'), [
        {
            id: 'game-player:hoboquest:1',
            source: 'hoboquest',
            user_id: 'user:hobotools:1',
            display_name: 'Alice Quest',
            class_name: 'ranger',
            zone: 'forest',
            coins: 77,
            combat_xp: 15,
            metadata: { legacy_user_id: '1' },
            legacy_ref: { source: 'hoboquest', legacy_id: '1' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'games', 'inventory.ndjson'), [
        {
            id: 'game_inventory:hoboquest:1:oak_log',
            source: 'hoboquest',
            user_id: 'user:hobotools:1',
            item_id: 'oak_log',
            quantity: 12,
            metadata: { legacy_user_id: '1' },
            legacy_ref: { source: 'hoboquest', legacy_id: '1:oak_log' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'games', 'canvas-tiles.ndjson'), [
        {
            id: 'canvas-tile:hoboquest:3:5',
            source: 'hoboquest',
            x: 3,
            y: 5,
            color_index: 7,
            user_id: 'user:hobotools:1',
            username: 'alice',
            legacy_ref: { source: 'hoboquest', legacy_id: '3:5' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'games', 'daily-quests.ndjson'), [
        {
            id: 'daily-quest:hoboquest:1',
            source: 'hoboquest',
            user_id: 'user:hobotools:1',
            quest_date: '2026-01-04',
            quest_id: 'daily_gather_wood',
            title: 'Gather wood',
            description: 'Collect 10 logs',
            progress: 4,
            goal: 10,
            reward: { coins: 25 },
            legacy_ref: { source: 'hoboquest', legacy_id: '1:2026-01-04:daily_gather_wood' },
        },
    ]);
    writeNdjson(path.join(bundleDir, 'games', 'battle-stats.ndjson'), [
        {
            id: 'battle-stats:hoboquest:1',
            source: 'hoboquest',
            user_id: 'user:hobotools:1',
            battles_won: 1,
            battles_lost: 0,
            total_stolen: 4.7,
            total_lost: 0,
            kill_streak: 1,
            best_streak: 1,
            fatalities: 0,
            kills: 2,
            deaths: 5,
            metadata: { legacy_user_id: '1' },
            legacy_ref: { source: 'hoboquest', legacy_id: '1' },
        },
    ]);

    writeJson(path.join(bundleDir, 'audit', 'import-report.json'), {
        exclusions: [
            { entity: 'users.hobo_bucks_balance', reason: 'excluded' },
            { entity: 'transactions', reason: 'excluded' },
        ],
        datasets: {
            'identity/users': {},
            'identity/anon-users': {},
            'identity/linked-accounts': {},
            'control-plane/oauth-clients': {},
            'control-plane/notifications': {},
            'control-plane/notification-preferences': {},
            'social/follows': {},
            'live/channels': {},
            'live/stream-sessions': {},
            'chat/messages': {},
            'community/pastes': {},
            'community/comments': {},
            'media/objects': {},
            'billing/subscriptions': {},
            'loyalty/coin-transactions': {},
            'games/players': {},
            'games/inventory': {},
            'games/canvas-tiles': {},
            'games/daily-quests': {},
            'games/battle-stats': {},
        },
    });

    let gatedError = null;
    try {
        await loadStagingBundle({ bundleDir, dbPaths, logger: { info() {}, warn() {}, error() {} } });
    } catch (error) {
        gatedError = error;
    }
    assert.ok(gatedError, 'expected staging load to require explicit confirmation');
    assert.match(gatedError.message, /OPENVIBE_ALLOW_STAGING_LOAD=true/);

    const previousAllow = process.env.OPENVIBE_ALLOW_STAGING_LOAD;
    const previousConfirm = process.env.OPENVIBE_STAGING_CONFIRM;
    process.env.OPENVIBE_ALLOW_STAGING_LOAD = 'true';
    process.env.OPENVIBE_STAGING_CONFIRM = 'true';

    let report;
    try {
        report = await loadStagingBundle({
            bundleDir,
            dbPaths,
            confirmLoad: true,
            runId: 'staging-loader-test',
            logger: { info() {}, warn() {}, error() {} },
        });
        await loadStagingBundle({
            bundleDir,
            dbPaths,
            confirmLoad: true,
            runId: 'staging-loader-test-repeat',
            logger: { info() {}, warn() {}, error() {} },
        });

        assert.strictEqual(report.run_id, 'staging-loader-test');
        assert.strictEqual(report.effective_mode, 'sqlite-staging');
        assert.strictEqual(report.dry_run, false);
        assert.strictEqual(report.service_persistence.network.mode, 'sqlite');

        const dryRunDbPaths = {
            network: path.join(root, 'dry-run', 'openvibe-network.db'),
            media: path.join(root, 'dry-run', 'openvibe-media.db'),
            billing: path.join(root, 'dry-run', 'openvibe-billing.db'),
            restream: path.join(root, 'dry-run', 'openre-stream.db'),
            live: path.join(root, 'dry-run', 'openvibe-live.db'),
            chat: path.join(root, 'dry-run', 'openvibe-chat.db'),
            community: path.join(root, 'dry-run', 'openvibe-community.db'),
            games: path.join(root, 'dry-run', 'openvibe-games.db'),
        };
        const dryRunReport = await loadStagingBundle({
            bundleDir,
            dbPaths: dryRunDbPaths,
            dryRun: true,
            services: 'chat',
            datasets: 'chat/messages',
            runId: 'staging-loader-dry-run',
            logger: { info() {}, warn() {}, error() {} },
        });
        assert.strictEqual(dryRunReport.dry_run, true);
        assert.deepStrictEqual(dryRunReport.selected_services, ['chat']);
        assert.deepStrictEqual(dryRunReport.selected_datasets, ['chat/messages']);
        assert.deepStrictEqual(Object.keys(dryRunReport.datasets), ['chat/messages']);
        assert.strictEqual(path.basename(dryRunReport.effective_service_db_paths.chat), 'openvibe-chat.db');
        assert.strictEqual(fs.existsSync(dryRunDbPaths.chat), false);
    } finally {
        if (previousAllow == null) delete process.env.OPENVIBE_ALLOW_STAGING_LOAD;
        else process.env.OPENVIBE_ALLOW_STAGING_LOAD = previousAllow;
        if (previousConfirm == null) delete process.env.OPENVIBE_STAGING_CONFIRM;
        else process.env.OPENVIBE_STAGING_CONFIRM = previousConfirm;
    }

    const networkDb = new Database(dbPaths.network, { readonly: true });
    const restreamDb = new Database(dbPaths.restream, { readonly: true });
    const liveDb = new Database(dbPaths.live, { readonly: true });
    const chatDb = new Database(dbPaths.chat, { readonly: true });
    const communityDb = new Database(dbPaths.community, { readonly: true });
    const mediaDb = new Database(dbPaths.media, { readonly: true });
    const billingDb = new Database(dbPaths.billing, { readonly: true });
    const gamesDb = new Database(dbPaths.games, { readonly: true });

    try {
        assert.strictEqual(networkDb.prepare("SELECT COUNT(*) AS count FROM staging_import_records WHERE dataset = 'identity/users'").get().count, 1);
        assert.strictEqual(networkDb.prepare("SELECT COUNT(*) AS count FROM staging_import_records WHERE dataset = 'identity/anon-users'").get().count, 3);
        const authUser = networkDb.prepare("SELECT username, email, password_hash, password_algorithm, metadata_json FROM auth_users WHERE id = 'user:hobotools:1'").get();
        assert.ok(authUser, 'expected canonical identity to project into auth_users');
        assert.strictEqual(authUser.username, 'alice');
        assert.strictEqual(authUser.email, 'alice@example.com');
        assert.ok(authUser.password_hash && authUser.password_hash.startsWith('$2'), 'expected migrated bcrypt password hash to be stored');
        assert.strictEqual(authUser.password_algorithm, 'bcrypt');
        assert.strictEqual(networkDb.prepare("SELECT COUNT(*) AS count FROM auth_anon_users").get().count, 2);
        assert.deepStrictEqual(
            networkDb.prepare("SELECT anon_number, session_token, display_name, total_messages, total_commands FROM auth_anon_users WHERE id = 'anon-user:hobotools:7'").get(),
            {
                anon_number: 7,
                session_token: 'anon-session-token-7',
                display_name: 'Anonymous #7',
                total_messages: 99,
                total_commands: 8,
            }
        );
        assert.deepStrictEqual(
            networkDb.prepare("SELECT anon_number, session_token, display_name, total_messages, total_commands FROM auth_anon_users WHERE id = 'anon-user:hoboquest:-4242'").get(),
            {
                anon_number: 4242,
                session_token: null,
                display_name: 'Anonymous #4242',
                total_messages: 4,
                total_commands: 1,
            }
        );
        const authMetadata = JSON.parse(authUser.metadata_json);
        assert.ok(Array.isArray(authMetadata.linked_accounts), 'expected linked accounts to be merged into auth user metadata');
        assert.deepStrictEqual(authMetadata.linked_accounts[0].service, 'hobostreamer');
        assert.deepStrictEqual(authMetadata.source_profiles.hobostreamer.legacy_id, '42');
        assert.deepStrictEqual(
            networkDb.prepare("SELECT client_id, name, is_first_party, client_secret_redacted FROM control_oauth_clients WHERE client_id = 'openvibe-web'").get(),
            { client_id: 'openvibe-web', name: 'OpenVibe Web', is_first_party: 1, client_secret_redacted: 1 }
        );
        assert.deepStrictEqual(
            networkDb.prepare("SELECT type, category, title, is_read FROM control_notifications WHERE id = 'notification:hobostreamer:501'").get(),
            { type: 'follow.created', category: 'social', title: 'Alice followed you', is_read: 0 }
        );
        assert.deepStrictEqual(
            networkDb.prepare("SELECT follower_user_id, followed_user_id, email_notify, push_notify FROM social_follows WHERE id = 'follow:hobostreamer:601'").get(),
            {
                follower_user_id: 'user:hobotools:1',
                followed_user_id: 'user:hobotools:2',
                email_notify: 1,
                push_notify: 0,
            }
        );
        const notificationPrefs = JSON.parse(
            networkDb.prepare("SELECT data_json FROM user_modules WHERE user_id = 'user:hobotools:1' AND namespace = 'control.notification_preferences'").get().data_json
        );
        assert.strictEqual(notificationPrefs.mentions, true);
        assert.strictEqual(notificationPrefs.channels.mentions.email, true);
        assert.strictEqual(notificationPrefs.channels.mentions.browser, true);
        assert.strictEqual(restreamDb.prepare('SELECT COUNT(*) AS count FROM channels').get().count, 1);
        assert.strictEqual(restreamDb.prepare('SELECT COUNT(*) AS count FROM streams').get().count, 2);
        assert.strictEqual(
            restreamDb.prepare("SELECT channel_id FROM streams WHERE id = 'stream-session:hobostreamer:32'").get().channel_id,
            'channel:hobostreamer:11'
        );
        assert.strictEqual(liveDb.prepare('SELECT COUNT(*) AS count FROM live_channels').get().count, 1);
        assert.strictEqual(liveDb.prepare('SELECT COUNT(*) AS count FROM live_streams').get().count, 2);
        assert.deepStrictEqual(
            liveDb.prepare("SELECT channel_id, channel_slug FROM live_streams WHERE id = 'stream-session:hobostreamer:32'").get(),
            { channel_id: 'channel:hobostreamer:11', channel_slug: 'alice' }
        );
        assert.strictEqual(chatDb.prepare('SELECT COUNT(*) AS count FROM chat_messages').get().count, 1);
        assert.strictEqual(communityDb.prepare('SELECT COUNT(*) AS count FROM community_pastes').get().count, 1);
        assert.strictEqual(communityDb.prepare('SELECT COUNT(*) AS count FROM community_posts').get().count, 1);
        assert.strictEqual(mediaDb.prepare('SELECT COUNT(*) AS count FROM media_objects').get().count, 1);
        assert.deepStrictEqual(
            mediaDb.prepare("SELECT size_bytes, storage_provider, status FROM media_objects WHERE id = 'media:hobostreamer-vod:51'").get(),
            { size_bytes: 3063137389, storage_provider: 'local', status: 'initialized' }
        );
        assert.strictEqual(billingDb.prepare("SELECT COUNT(*) AS count FROM staging_import_records WHERE dataset = 'billing/subscriptions'").get().count, 1);
        assert.strictEqual(billingDb.prepare("SELECT COUNT(*) AS count FROM staging_import_records WHERE dataset = 'loyalty/coin-transactions'").get().count, 1);
        assert.strictEqual(gamesDb.prepare('SELECT COUNT(*) AS count FROM game_players').get().count, 1);
        assert.strictEqual(gamesDb.prepare('SELECT COUNT(*) AS count FROM game_inventory').get().count, 1);
        assert.strictEqual(gamesDb.prepare('SELECT COUNT(*) AS count FROM canvas_tiles').get().count, 1);
        assert.deepStrictEqual(
            gamesDb.prepare("SELECT class_name, zone, coins FROM game_players WHERE user_id = 'user:hobotools:1'").get(),
            { class_name: 'ranger', zone: 'forest', coins: 77 }
        );
        assert.deepStrictEqual(
            gamesDb.prepare("SELECT progress, goal FROM game_daily_quests WHERE user_id = 'user:hobotools:1' AND quest_id = 'daily_gather_wood'").get(),
            { progress: 4, goal: 10 }
        );
        assert.deepStrictEqual(
            gamesDb.prepare("SELECT total_stolen, total_lost FROM game_battle_stats WHERE user_id = 'user:hobotools:1'").get(),
            { total_stolen: 4.7, total_lost: 0 }
        );
    } finally {
        networkDb.close();
        restreamDb.close();
        liveDb.close();
        chatDb.close();
        communityDb.close();
        mediaDb.close();
        billingDb.close();
        gamesDb.close();
    }

    console.log('staging loader test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
