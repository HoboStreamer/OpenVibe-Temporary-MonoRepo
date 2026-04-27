'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const { ensureDir, writeJson } = require('../lib/common');
const { loadStagingBundle } = require('../lib/staging-loader');

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
            size_bytes: 123,
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

    writeJson(path.join(bundleDir, 'audit', 'import-report.json'), {
        exclusions: [
            { entity: 'users.hobo_bucks_balance', reason: 'excluded' },
            { entity: 'transactions', reason: 'excluded' },
        ],
        datasets: {
            'identity/users': {},
            'identity/linked-accounts': {},
            'live/channels': {},
            'live/stream-sessions': {},
            'chat/messages': {},
            'community/pastes': {},
            'community/comments': {},
            'media/objects': {},
            'billing/subscriptions': {},
            'loyalty/coin-transactions': {},
        },
    });

    await loadStagingBundle({ bundleDir, dbPaths, logger: { info() {}, warn() {}, error() {} } });
    await loadStagingBundle({ bundleDir, dbPaths, logger: { info() {}, warn() {}, error() {} } });

    const networkDb = new Database(dbPaths.network, { readonly: true });
    const restreamDb = new Database(dbPaths.restream, { readonly: true });
    const liveDb = new Database(dbPaths.live, { readonly: true });
    const chatDb = new Database(dbPaths.chat, { readonly: true });
    const communityDb = new Database(dbPaths.community, { readonly: true });
    const mediaDb = new Database(dbPaths.media, { readonly: true });
    const billingDb = new Database(dbPaths.billing, { readonly: true });

    try {
        assert.strictEqual(networkDb.prepare("SELECT COUNT(*) AS count FROM staging_import_records WHERE dataset = 'identity/users'").get().count, 1);
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
        assert.strictEqual(billingDb.prepare("SELECT COUNT(*) AS count FROM staging_import_records WHERE dataset = 'billing/subscriptions'").get().count, 1);
        assert.strictEqual(billingDb.prepare("SELECT COUNT(*) AS count FROM staging_import_records WHERE dataset = 'loyalty/coin-transactions'").get().count, 1);
    } finally {
        networkDb.close();
        restreamDb.close();
        liveDb.close();
        chatDb.close();
        communityDb.close();
        mediaDb.close();
        billingDb.close();
    }

    console.log('staging loader test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
