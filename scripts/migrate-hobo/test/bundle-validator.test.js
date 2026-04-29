'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDir, writeJson } = require('../lib/common');
const { validateBundle } = require('../lib/validator');

function writeNdjson(filePath, rows) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-validate-test-'));
    const bundleDir = path.join(root, 'openvibe-target');

    writeNdjson(path.join(bundleDir, 'identity', 'users.ndjson'), [
        { id: 'user:hobotools:1', username: 'alice' },
    ]);
    writeNdjson(path.join(bundleDir, 'identity', 'anon-users.ndjson'), []);
    writeNdjson(path.join(bundleDir, 'themes', 'preferences.ndjson'), [
        { id: 'theme-pref:1', user_id: 'user:hobotools:missing', theme_id: 'theme:hobotools:campfire' },
    ]);
    writeNdjson(path.join(bundleDir, 'control-plane', 'notifications.ndjson'), []);
    writeNdjson(path.join(bundleDir, 'social', 'follows.ndjson'), []);
    writeNdjson(path.join(bundleDir, 'live', 'channels.ndjson'), []);
    writeNdjson(path.join(bundleDir, 'live', 'stream-definitions.ndjson'), []);
    writeNdjson(path.join(bundleDir, 'live', 'stream-sessions.ndjson'), []);
    writeNdjson(path.join(bundleDir, 'chat', 'messages.ndjson'), []);
    writeNdjson(path.join(bundleDir, 'community', 'pastes.ndjson'), []);
    writeNdjson(path.join(bundleDir, 'community', 'comments.ndjson'), []);
    writeNdjson(path.join(bundleDir, 'media', 'objects.ndjson'), []);
    writeNdjson(path.join(bundleDir, 'billing', 'subscriptions.ndjson'), []);

    writeJson(path.join(bundleDir, 'audit', 'import-report.json'), {
        exclusions: [
            { entity: 'users.hobo_bucks_balance', reason: 'excluded' },
            { entity: 'transactions', reason: 'excluded' },
        ],
        datasets: {
            'themes/preferences': { source_records: 1, written_records: 1, merged_records: 0, skipped_records: 0 },
        },
    });

    const summary = await validateBundle({ bundleDir });
    assert.strictEqual(summary.ok, false, 'expected validation to fail on missing user refs');
    assert.strictEqual(summary.gate, 'red');
    assert.ok(summary.missing_refs.length >= 1, 'expected a missing user ref to be reported');

    console.log('bundle validator test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
