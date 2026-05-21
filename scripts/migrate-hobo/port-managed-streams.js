'use strict';
/**
 * port-managed-streams.js
 *
 * Ports ALL HoboStreamer managed stream slots for ALL users as separate channel
 * slots in openre-stream and openvibe-live, then reassigns streams to their
 * original slots.
 *
 * Each user's PRIMARY managed stream (lowest id) already maps to their existing
 * channel:hobostreamer:N. Only ADDITIONAL managed streams need new channels.
 *
 * Usage: node scripts/migrate-hobo/port-managed-streams.js [--dry-run]
 */

const Database = require('better-sqlite3');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const OPENRE_DB = path.resolve(__dirname, '../../services/openre-stream/data/openre-stream.db');
const LIVE_DB   = path.resolve(__dirname, '../../services/openvibe-live/data/openvibe-live.db');
const HOBO_DB   = '/opt/openvibe-old/OpenVibe-Temporary-MonoRepo/data/migrations/hobo-production-staging/production-source/hobostreamer/data/hobostreamer.db';

/** channel:hobostreamer-ms:{managedStreamId} */
function buildChannelId(msId) {
    return `channel:hobostreamer-ms:${msId}`;
}

/** stream-session:hobostreamer:{hoboStreamId} */
function buildStreamId(hoboId) {
    return `stream-session:hobostreamer:${hoboId}`;
}

/** Build a URL-safe channel slug from a username + managed stream title/slug */
function buildSlug(username, ms) {
    const suffix = ms.slug
        ? ms.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        : (ms.title && !/untitled/i.test(ms.title)
            ? ms.title.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
            : `slot-${ms.id}`);
    return `${username.toLowerCase()}-${suffix}`;
}

function main() {
    const hobo   = new Database(HOBO_DB,    { readonly: true });
    const openre = new Database(OPENRE_DB,  { readonly: DRY_RUN });
    const live   = new Database(LIVE_DB,    { readonly: DRY_RUN });

    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

    // For every user, get all their managed streams ordered by id (primary = lowest id)
    const allManagedStreams = hobo.prepare(`
        SELECT ms.id, ms.user_id, ms.slug, ms.title, ms.protocol, ms.sort_order,
               u.username,
               c.id AS hobo_channel_id
        FROM managed_streams ms
        JOIN users u ON ms.user_id = u.id
        LEFT JOIN channels c ON c.user_id = u.id
        ORDER BY ms.user_id, ms.id
    `).all();

    // Group by user_id
    const byUser = new Map();
    for (const row of allManagedStreams) {
        const key = String(row.user_id);
        if (!byUser.has(key)) byUser.set(key, []);
        byUser.get(key).push(row);
    }

    let totalCreated = 0, totalMoved = 0;

    for (const [, slots] of byUser) {
        if (slots.length <= 1) continue; // single slot: already fully migrated

        const primaryMsId = slots[0].id; // lowest id = primary → already in main channel
        const extraSlots  = slots.slice(1);
        const username    = slots[0].username;

        console.log(`User: ${username} — ${slots.length} managed streams, ${extraSlots.length} extra(s)`);

        for (const ms of extraSlots) {
            const channelId   = buildChannelId(ms.id);
            const channelSlug = buildSlug(username, ms);
            const displayName = ms.title && !/untitled/i.test(ms.title) ? ms.title : `${username}'s Stream`;
            const description = `${username}'s ${displayName} stream slot`;
            const now         = new Date().toISOString();

            // Look up owner_user_id from the existing primary channel
            const primaryChannelId = `channel:hobostreamer:${ms.hobo_channel_id}`;
            const primaryChannel   = openre.prepare('SELECT owner_user_id FROM channels WHERE id = ?').get(primaryChannelId);
            if (!primaryChannel) {
                console.log(`  WARN: primary channel ${primaryChannelId} not found in openre — skipping ms ${ms.id}`);
                continue;
            }
            const ownerUserId = primaryChannel.owner_user_id;

            const hoboStreams = hobo.prepare(
                'SELECT id FROM streams WHERE managed_stream_id = ? ORDER BY id'
            ).all(ms.id);

            console.log(`  Slot ms_id=${ms.id} slug=${channelSlug} "${displayName}" streams=${hoboStreams.length}`);

            if (DRY_RUN) {
                console.log(`    [DRY RUN] Would create ${channelId} (${channelSlug}) owner=${ownerUserId}`);
                hoboStreams.slice(0, 2).forEach(({ id }) =>
                    console.log(`    [DRY RUN] Would move ${buildStreamId(id)} → ${channelId}`)
                );
                if (hoboStreams.length > 2) console.log(`    [DRY RUN] ... and ${hoboStreams.length - 2} more`);
                continue;
            }

            // ── openre-stream: create channel ─────────────────────────────
            const existingOpenre = openre.prepare('SELECT id FROM channels WHERE id = ? OR slug = ?').get(channelId, channelSlug);
            if (existingOpenre) {
                console.log(`    [openre] Channel already exists (${existingOpenre.id}) — skipping`);
            } else {
                openre.prepare(`
                    INSERT INTO channels (id, slug, owner_user_id, display_name, metadata_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(channelId, channelSlug, ownerUserId, displayName,
                    JSON.stringify({ source: 'hobostreamer-managed-stream', managed_stream_id: ms.id, protocol: ms.protocol || 'webrtc' }),
                    now, now);
                console.log(`    [openre] Created channel ${channelId} (${channelSlug})`);
                totalCreated++;
            }

            // ── openvibe-live: create live_channel ────────────────────────
            const existingLive = live.prepare('SELECT id FROM live_channels WHERE id = ? OR slug = ?').get(channelId, channelSlug);
            if (existingLive) {
                console.log(`    [live] Channel already exists (${existingLive.id}) — skipping`);
            } else {
                live.prepare(`
                    INSERT INTO live_channels (id, slug, display_name, owner_user_id, description, metadata_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(channelId, channelSlug, displayName, ownerUserId, description,
                    JSON.stringify({ source: 'hobostreamer-managed-stream', managed_stream_id: ms.id }),
                    now, now);
                console.log(`    [live] Created live_channel ${channelId} (${channelSlug})`);
            }

            // ── reassign streams in openre-stream ─────────────────────────
            for (const { id: hoboId } of hoboStreams) {
                const streamId = buildStreamId(hoboId);
                const r = openre.prepare('UPDATE streams SET channel_id = ? WHERE id = ?').run(channelId, streamId);
                if (r.changes > 0) totalMoved++;
                else console.log(`    [openre] WARN: stream ${streamId} not found`);
            }
            if (hoboStreams.length) console.log(`    [openre] Moved ${hoboStreams.length} streams → ${channelId}`);

            // ── reassign streams in openvibe-live ─────────────────────────
            for (const { id: hoboId } of hoboStreams) {
                const streamId = buildStreamId(hoboId);
                live.prepare('UPDATE live_streams SET channel_slug = ?, channel_id = ? WHERE id = ?')
                    .run(channelSlug, channelId, streamId);
            }
            if (hoboStreams.length) console.log(`    [live] Moved ${hoboStreams.length} streams → ${channelSlug}`);
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Channels created: ${totalCreated}`);
    console.log(`Streams reassigned: ${totalMoved}`);

    // Show final per-user channel breakdown
    console.log('\nChannel breakdown (openre-stream, multi-slot users):');
    const stats = openre.prepare(`
        SELECT c.slug, c.display_name, c.owner_user_id, COUNT(s.id) as cnt
        FROM channels c
        LEFT JOIN streams s ON s.channel_id = c.id
        WHERE c.owner_user_id IN (
            SELECT DISTINCT owner_user_id FROM channels
            WHERE id LIKE 'channel:hobostreamer-ms:%'
        )
        GROUP BY c.id ORDER BY c.owner_user_id, c.slug
    `).all();
    stats.forEach(r => console.log(`  ${r.owner_user_id}  ${r.slug} (${r.display_name}): ${r.cnt} streams`));

    hobo.close();
    openre.close();
    live.close();
    console.log('\nDone.');
}

main();
