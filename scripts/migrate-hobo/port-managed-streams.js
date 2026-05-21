'use strict';
/**
 * port-managed-streams.js
 *
 * One-time migration: ports HoboStreamer managed stream slots (printer, irl-pro)
 * as separate channel slots in openre-stream and openvibe-live, then reassigns
 * streams to their original slots.
 *
 * Usage: node scripts/migrate-hobo/port-managed-streams.js [--dry-run]
 */

const Database = require('better-sqlite3');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const OPENRE_DB  = path.resolve(__dirname, '../../services/openre-stream/data/openre-stream.db');
const LIVE_DB    = path.resolve(__dirname, '../../services/openvibe-live/data/openvibe-live.db');
const HOBO_DB    = '/opt/openvibe-old/OpenVibe-Temporary-MonoRepo/data/migrations/hobo-production-staging/production-source/hobostreamer/data/hobostreamer.db';

// Managed streams to port as new channels (id = HoboStreamer managed_stream.id)
// The "whip" slot (id=1) already maps to the existing "goosely" channel.
const MANAGED_STREAM_SLOTS = [
    { id: 50, slug: 'goosely-printer', display_name: '3D Printer', description: "goosely's 3D Printer stream", protocol: 'jsmpeg' },
    { id: 52, slug: 'goosely-irl-pro', display_name: 'IRL Pro',    description: "goosely's IRL Pro stream",    protocol: 'rtmp'   },
];

const OWNER_USER_ID = 'user:hobotools:1';

function buildChannelId(managedStreamId) {
    return `channel:hobostreamer-ms:${managedStreamId}`;
}

function buildStreamIdFromHoboId(hoboStreamId) {
    return `stream-session:hobostreamer:${hoboStreamId}`;
}

function main() {
    const hobo    = new Database(HOBO_DB, { readonly: true });
    const openre  = new Database(OPENRE_DB, { readonly: DRY_RUN });
    const live    = new Database(LIVE_DB,   { readonly: DRY_RUN });

    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

    for (const slot of MANAGED_STREAM_SLOTS) {
        const channelId = buildChannelId(slot.id);
        const now = new Date().toISOString();

        // Get stream IDs from HoboStreamer for this managed_stream
        const hoboStreams = hobo.prepare(
            'SELECT id FROM streams WHERE managed_stream_id = ? AND user_id = 1 ORDER BY id'
        ).all(slot.id);

        console.log(`\nSlot: ${slot.slug} (managed_stream_id=${slot.id})`);
        console.log(`  Channel ID: ${channelId}`);
        console.log(`  Streams to reassign: ${hoboStreams.length}`);

        if (!DRY_RUN) {
            // Insert into openre-stream channels
            const existingOpenre = openre.prepare('SELECT id FROM channels WHERE id = ? OR slug = ?').get(channelId, slot.slug);
            if (existingOpenre) {
                console.log(`  [openre] Channel already exists: ${existingOpenre.id} — skipping insert`);
            } else {
                openre.prepare(`
                    INSERT INTO channels (id, slug, owner_user_id, display_name, metadata_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    channelId, slot.slug, OWNER_USER_ID, slot.display_name,
                    JSON.stringify({ source: 'hobostreamer-managed-stream', managed_stream_id: slot.id, protocol: slot.protocol }),
                    now, now
                );
                console.log(`  [openre] Created channel: ${channelId} (${slot.slug})`);
            }

            // Insert into openvibe-live live_channels
            const existingLive = live.prepare('SELECT id FROM live_channels WHERE id = ? OR slug = ?').get(channelId, slot.slug);
            if (existingLive) {
                console.log(`  [live] Channel already exists: ${existingLive.id} — skipping insert`);
            } else {
                live.prepare(`
                    INSERT INTO live_channels (id, slug, display_name, owner_user_id, description, metadata_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    channelId, slot.slug, slot.display_name, OWNER_USER_ID,
                    slot.description || '',
                    JSON.stringify({ source: 'hobostreamer-managed-stream', managed_stream_id: slot.id }),
                    now, now
                );
                console.log(`  [live] Created channel: ${channelId} (${slot.slug})`);
            }

            // Reassign streams in openre-stream
            for (const { id: hoboId } of hoboStreams) {
                const streamId = buildStreamIdFromHoboId(hoboId);
                const r = openre.prepare(
                    'UPDATE streams SET channel_id = ? WHERE id = ?'
                ).run(channelId, streamId);
                if (r.changes > 0) {
                    console.log(`  [openre] Moved stream ${streamId} → ${channelId}`);
                } else {
                    console.log(`  [openre] WARN: stream ${streamId} not found`);
                }
            }

            // Reassign streams in openvibe-live
            for (const { id: hoboId } of hoboStreams) {
                const streamId = buildStreamIdFromHoboId(hoboId);
                const r = live.prepare(
                    'UPDATE live_streams SET channel_slug = ?, channel_id = ? WHERE id = ?'
                ).run(slot.slug, channelId, streamId);
                if (r.changes > 0) {
                    console.log(`  [live] Moved stream ${streamId} → ${slot.slug}`);
                } else {
                    console.log(`  [live] WARN: stream ${streamId} not found`);
                }
            }
        } else {
            console.log(`  [DRY RUN] Would create channel ${channelId} (${slot.slug}) in openre + live`);
            hoboStreams.slice(0, 3).forEach(({ id }) =>
                console.log(`  [DRY RUN] Would move stream-session:hobostreamer:${id} → ${channelId}`)
            );
            if (hoboStreams.length > 3) console.log(`  [DRY RUN] ... and ${hoboStreams.length - 3} more`);
        }
    }

    // Verify counts after migration
    console.log('\n--- Verification ---');
    if (!DRY_RUN) {
        const channels = openre.prepare("SELECT slug, COUNT(*) as cnt FROM streams GROUP BY channel_id").all();
        // Better: join with channels table
        const channelStats = openre.prepare(`
            SELECT c.slug, c.display_name, COUNT(s.id) as stream_count
            FROM channels c
            LEFT JOIN streams s ON s.channel_id = c.id
            WHERE c.owner_user_id = ?
            GROUP BY c.id
            ORDER BY c.slug
        `).all(OWNER_USER_ID);
        console.log('Channels and stream counts (openre-stream):');
        channelStats.forEach(r => console.log(`  ${r.slug} (${r.display_name}): ${r.stream_count} streams`));
    }

    hobo.close();
    openre.close();
    live.close();
    console.log('\nDone.');
}

main();
