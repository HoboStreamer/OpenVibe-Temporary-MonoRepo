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
            { id: 'u1', username: 'alice', role: 'user' },
            { id: 'u2', username: 'bob', role: 'streamer' },
        ]);
        ensure('themes/catalog.ndjson', [{ id: 't1', name: 'OpenVibe Default' }]);
        ensure('control-plane/url-registry.ndjson', [{ key: 'support', value: 'https://example.com' }]);
        ensure('media/objects.ndjson', [{ id: 'm1', namespace: 'live.vods', media_type: 'video' }]);
        ensure('games/players.ndjson', [{ user_id: 'u1', class_name: 'ranger', zone: 'forest', coins: 77 }]);
        ensure('games/canvas-tiles.ndjson', [{ x: 3, y: 5, color_index: 7, user_id: 'u1', username: 'alice' }]);
        ensure('loyalty/accounts.ndjson', [{ user_id: 'u1', coins_balance: 100, nickels_balance: 25 }]);

        const client = createMockClient();
        await applySchema({ client });
        assert.ok(client._tables.has('identity_users'), 'schema applied');
        assert.ok(client._tables.has('legacy_finance_archive'), 'finance archive present');
        assert.ok(client._tables.has('game_players'), 'games schema present');
        assert.ok(client._tables.has('canvas_tiles'), 'canvas schema present');

        const report = await loadBundle({ client, bundleDir: bundle, runId: 'test', dryRun: false, batchSize: 10 });
        assert.strictEqual(report.hobo_bucks_excluded, true);
        assert.strictEqual(report.loyalty_imported_as_progression, true);
        assert.strictEqual(report.datasets['identity/users'].count, 2);
        assert.strictEqual(report.datasets['themes/catalog'].count, 1);
        assert.strictEqual(report.datasets['media/objects'].count, 1);
        assert.strictEqual(report.datasets['games/players'].count, 1);
        assert.strictEqual(report.datasets['games/canvas-tiles'].count, 1);

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
        'chat/messages', 'community/pastes', 'media/objects', 'games/players', 'games/canvas-tiles', 'loyalty/accounts', 'loyalty/transactions',
    ]) {
        assert.ok(datasets.includes(required), `plan missing ${required}`);
    }
})();
