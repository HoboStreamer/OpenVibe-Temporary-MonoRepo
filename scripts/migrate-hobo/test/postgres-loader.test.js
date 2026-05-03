'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { applySchema, loadBundle, DATASET_PLAN } = require('../lib/postgres-loader');
const { buildUpsert } = require('../lib/postgres');
const { validate } = require('../lib/postgres-validator');

// Mock pg-style client. Records every query for assertions.
function createMockClient() {
    const calls = [];
    const tables = new Set();
    const rowCounts = new Map();
    return {
        async query(sql, params) {
            calls.push({ sql, params });
            const trimmed = sql.trim().toUpperCase();
            if (trimmed.startsWith('CREATE SCHEMA') || trimmed.startsWith('CREATE TABLE') || trimmed.startsWith('CREATE INDEX') || trimmed.startsWith('SET ') || sql.includes('CREATE TABLE')) {
                const tableRe = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)/gi;
                let m;
                while ((m = tableRe.exec(sql)) !== null) tables.add(m[1]);
                return { rows: [] };
            }
            if (trimmed.startsWith('INSERT')) {
                const m = sql.match(/INSERT INTO\s+([a-zA-Z0-9_]+)/i);
                if (m) rowCounts.set(m[1], (rowCounts.get(m[1]) || 0) + 1);
                return { rows: [] };
            }
            if (trimmed.startsWith('UPDATE')) return { rows: [] };
            if (trimmed.startsWith("SELECT TABLE_NAME")) {
                return { rows: [...tables].map((t) => ({ table_name: t })) };
            }
            if (trimmed.startsWith('SELECT COUNT')) {
                const m = sql.match(/FROM\s+openvibe\.([a-zA-Z0-9_]+)/i);
                const t = m ? m[1] : '';
                return { rows: [{ n: rowCounts.get(t) || 0 }] };
            }
            return { rows: [] };
        },
        _calls: calls,
        _tables: tables,
        _rowCounts: rowCounts,
    };
}

(function buildUpsertShape() {
    const sql = buildUpsert('foo', ['id', 'name', 'val'], ['id']);
    assert.match(sql, /INSERT INTO foo \(id, name, val\) VALUES \(\$1, \$2, \$3\)/);
    assert.match(sql, /ON CONFLICT \(id\) DO UPDATE SET name = EXCLUDED.name, val = EXCLUDED.val/);
})();

(async function endToEndMockLoad() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-loader-'));
    try {
        // Build a small canonical bundle.
        const bundle = path.join(tmp, 'openvibe-target');
        const ensure = (rel, lines) => {
            const full = path.join(bundle, rel);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
        };
        ensure('identity/users.ndjson', [
            {
                id: 'user:hobotools:u1',
                username: 'alice',
                role: 'user',
                legacy_refs: [{ source: 'hobostreamer', legacy_id: 'u1' }],
                source_profiles: { hobostreamer: { legacy_id: 'u1' } },
            },
            {
                id: 'user:hobotools:u2',
                username: 'bob',
                role: 'streamer',
                legacy_refs: [{ source: 'hobostreamer', legacy_id: 'u2' }],
                source_profiles: { hobostreamer: { legacy_id: 'u2' } },
            },
        ]);
        ensure('identity/anon-users.ndjson', [
            { id: 'anon1', anon_number: 17, session_token: 'token-17', display_name: 'Anon 17' },
        ]);
        ensure('identity/username-conflicts.ndjson', [
            { canonical_user_id: 'u1', hobotools_username: 'alice', hobostreamer_username: 'alice_tv', legacy_id: '42' },
        ]);
        ensure('identity/verification-keys.ndjson', [
            { id: 'vk1', key: 'verify-1', target_username: 'alice', created_by_user_id: 'u2', used_by_user_id: 'u1' },
        ]);
        ensure('identity/user-effects.ndjson', [
            { user_id: 'u1', effect_type: 'badge', effect_id: 'founder', is_active: true },
        ]);
        ensure('themes/catalog.ndjson', [{ id: 't1', name: 'OpenVibe Default' }]);
        ensure('control-plane/url-registry.ndjson', [{ key: 'support', value: 'https://example.com' }]);
        ensure('control-plane/user-preferences.ndjson', [{ user_id: 'u1', scope: 'network', language: 'en', notifications_enabled: true }]);
        ensure('control-plane/oauth-clients.ndjson', [{ client_id: 'client-1', name: 'Main Web', redirect_uris: ['https://openvibe.live/callback'] }]);
        ensure('control-plane/notifications.ndjson', [{ id: 1, user_id: 'u1', category: 'system', type: 'notice', title: 'Welcome' }]);
        ensure('control-plane/notification-preferences.ndjson', [{ user_id: 'u1', category: 'system', enabled: true }]);
        ensure('social/follows.ndjson', [{ follower_user_id: 'u1', followed_user_id: 'u2', created_at: '2024-01-01T00:00:00Z' }]);
        ensure('chat/moderation-bans.ndjson', [{ id: 'ban1', scope_type: 'global', target_user_id: 'u2', banned_by_user_id: 'u1', reason: 'spam' }]);
        ensure('community/pastes.ndjson', [{ id: 'paste:hobostreamer:p1', owner_id: 'user:hobotools:u1', title: 'hello', body: 'world' }]);
        ensure('community/paste_likes.ndjson', [{ id: 'pl1', source: 'hobostreamer', payload: { paste_id: 'p1', user_id: 'u1', created_at: '2024-01-01T00:00:00Z' } }]);
        ensure('community/paste_comments.ndjson', [{ id: 'pc1', source: 'hobostreamer', payload: { paste_id: 'p1', user_id: 'u2', body: 'nice', created_at: '2024-01-01T00:00:00Z' } }]);
        ensure('community/comments.ndjson', [{ id: 'c1', ref_type: 'vod', ref_id: 'm1', author_user_id: 'u1', body: 'hi' }]);
        ensure('media/objects.ndjson', [{ id: 'm1', namespace: 'live.vods', media_type: 'video' }]);
        ensure('billing/subscriptions.ndjson', [{ id: 'sub1', subscriber_user_id: 'u1', creator_user_id: 'u2', tier: 1, is_active: true }]);
        ensure('games/players.ndjson', [{ user_id: 'u1', class_name: 'ranger', zone: 'forest', coins: 77 }]);
        ensure('games/canvas-tiles.ndjson', [{ x: 3, y: 5, color_index: 7, user_id: 'u1', username: 'alice' }]);
        ensure('loyalty/accounts.ndjson', [{ user_id: 'u1', coins_balance: 100, nickels_balance: 25 }]);

        const client = createMockClient();
        await applySchema({ client });
        assert.ok(client._tables.has('identity_users'), 'schema applied');
        assert.ok(client._tables.has('legacy_finance_archive'), 'finance archive present');
        assert.ok(client._tables.has('game_players'), 'games schema present');
        assert.ok(client._tables.has('canvas_tiles'), 'canvas schema present');
        assert.ok(client._tables.has('identity_anon_users'), 'anon users schema present');
        assert.ok(client._tables.has('identity_username_conflicts'), 'username conflicts schema present');
        assert.ok(client._tables.has('control_oauth_clients'), 'oauth clients schema present');
        assert.ok(client._tables.has('control_notifications'), 'notifications schema present');
        assert.ok(client._tables.has('control_user_preferences'), 'user preferences schema present');
        assert.ok(client._tables.has('community_comments'), 'community comments schema present');
        assert.ok(
            client._calls.some((call) => /ALTER TABLE game_battle_stats[\s\S]*ALTER COLUMN total_stolen TYPE REAL/i.test(call.sql)),
            'battle stats evolution applied'
        );

        const report = await loadBundle({ client, bundleDir: bundle, runId: 'test', dryRun: false, batchSize: 10 });
        assert.strictEqual(report.hobo_bucks_excluded, true);
        assert.strictEqual(report.loyalty_imported_as_progression, true);
        assert.strictEqual(report.datasets['identity/users'].count, 2);
        assert.strictEqual(report.datasets['identity/anon-users'].count, 1);
        assert.strictEqual(report.datasets['identity/username-conflicts'].count, 1);
        assert.strictEqual(report.datasets['identity/verification-keys'].count, 1);
        assert.strictEqual(report.datasets['identity/user-effects'].count, 1);
        assert.strictEqual(report.datasets['themes/catalog'].count, 1);
        assert.strictEqual(report.datasets['control-plane/user-preferences'].count, 1);
        assert.strictEqual(report.datasets['control-plane/oauth-clients'].count, 1);
        assert.strictEqual(report.datasets['control-plane/notifications'].count, 1);
        assert.strictEqual(report.datasets['control-plane/notification-preferences'].count, 1);
        assert.strictEqual(report.datasets['social/follows'].count, 1);
        assert.strictEqual(report.datasets['chat/moderation-bans'].count, 1);
        assert.strictEqual(report.datasets['community/paste_likes'].count, 1);
        assert.strictEqual(report.datasets['community/paste_comments'].count, 1);
        assert.strictEqual(report.datasets['community/comments'].count, 1);
        assert.strictEqual(report.datasets['media/objects'].count, 1);
        assert.strictEqual(report.datasets['billing/subscriptions'].count, 1);
        assert.strictEqual(report.datasets['games/players'].count, 1);
        assert.strictEqual(report.datasets['games/canvas-tiles'].count, 1);

        const oauthInsert = client._calls.find((call) => /INSERT INTO control_oauth_clients/i.test(call.sql));
        assert.ok(oauthInsert, 'oauth client insert recorded');
        assert.strictEqual(oauthInsert.params[2], JSON.stringify(['https://openvibe.live/callback']));
        assert.strictEqual(oauthInsert.params[3], JSON.stringify([]));

        const pasteLikeInsert = client._calls.find((call) => /INSERT INTO community_paste_likes/i.test(call.sql));
        assert.ok(pasteLikeInsert, 'paste like insert recorded');
        assert.strictEqual(pasteLikeInsert.params[0], 'paste:hobostreamer:p1');
        assert.strictEqual(pasteLikeInsert.params[1], 'user:hobotools:u1');

        const pasteCommentInsert = client._calls.find((call) => /INSERT INTO community_paste_comments/i.test(call.sql));
        assert.ok(pasteCommentInsert, 'paste comment insert recorded');
        assert.strictEqual(pasteCommentInsert.params[1], 'paste:hobostreamer:p1');
        assert.strictEqual(pasteCommentInsert.params[2], 'user:hobotools:u2');

        const notificationInsert = client._calls.find((call) => /INSERT INTO control_notifications/i.test(call.sql));
        assert.ok(notificationInsert, 'notification insert recorded');
        assert.strictEqual(typeof notificationInsert.params[4], 'string');
        assert.ok(notificationInsert.params[4].includes('Welcome'));

        const validation = await validate({ client });
        assert.strictEqual(validation.missing_tables.length, 0, `unexpected missing: ${validation.missing_tables}`);
        assert.ok(validation.checks.find((c) => c.name === 'required-tables-present').status === 'green');
        assert.strictEqual(validation.gate, 'green');
        console.log('postgres-loader: OK');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
})().catch((err) => { console.error(err.stack); process.exit(1); });

(function planCovers() {
    const datasets = DATASET_PLAN.map((p) => p.dataset);
    for (const required of [
        'identity/users', 'themes/catalog', 'live/channels', 'live/streams',
        'identity/verification-keys', 'identity/user-effects', 'identity/username-conflicts',
        'identity/anon-users', 'control-plane/oauth-clients', 'control-plane/notifications',
        'control-plane/user-preferences', 'control-plane/notification-preferences',
        'social/follows', 'chat/messages', 'chat/moderation-bans', 'community/pastes',
        'community/paste_likes', 'community/paste_comments',
        'community/comments', 'media/objects', 'billing/subscriptions', 'games/players', 'games/canvas-tiles',
        'loyalty/accounts', 'loyalty/transactions',
    ]) {
        assert.ok(datasets.includes(required), `plan missing ${required}`);
    }
})();
