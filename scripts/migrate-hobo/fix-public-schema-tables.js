#!/usr/bin/env node
'use strict';

/**
 * fix-public-schema-tables.js
 *
 * Reads the openvibe-target bundle and inserts/upserts new records directly
 * into the public.* postgres tables used by the running services.
 *
 * This is needed because load-postgres.js inserts into the openvibe.* schema
 * (the migration staging schema), but the services query public.*.
 *
 * Usage:
 *   node scripts/migrate-hobo/fix-public-schema-tables.js \
 *     --bundle data/migrations/hobo-cutover-refresh/openvibe-target \
 *     --database-url "$OPENVIBE_DATABASE_URL"
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function loadPg() {
    try { return require('pg'); }
    catch (err) { throw new Error('pg driver not installed: ' + err.message); }
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
        }
    }
    return args;
}

async function readNdjson(file) {
    if (!fs.existsSync(file)) return [];
    const rows = [];
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed) {
            try { rows.push(JSON.parse(trimmed)); } catch {}
        }
    }
    return rows;
}

async function upsertBatch(client, table, rows, conflictCols) {
    if (!rows.length) return 0;
    const cols = Object.keys(rows[0]);
    let inserted = 0;
    for (const row of rows) {
        const vals = cols.map(c => row[c]);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const updateSets = cols
            .filter(c => !conflictCols.includes(c))
            .map(c => `${c} = EXCLUDED.${c}`)
            .join(', ');
        const sql = `
            INSERT INTO public.${table} (${cols.join(', ')})
            VALUES (${placeholders.join(', ')})
            ON CONFLICT (${conflictCols.join(', ')})
            ${updateSets ? 'DO UPDATE SET ' + updateSets : 'DO NOTHING'}
        `;
        try {
            await client.query(sql, vals);
            inserted++;
        } catch (err) {
            console.error(`[fix-public] WARN: row ${row.id || '?'} in ${table}: ${err.message}`);
        }
    }
    return inserted;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const databaseUrl = args.databaseUrl || process.env.OPENVIBE_DATABASE_URL;
    if (!databaseUrl) throw new Error('--database-url or OPENVIBE_DATABASE_URL required');
    if (!args.bundle) throw new Error('--bundle <openvibe-target dir> required');
    const bundleDir = path.resolve(args.bundle);

    const { Client } = loadPg();
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    try {
        // ── 1. public.live_channels ──────────────────────────────────────────
        console.log('[fix-public] Loading live/channels.ndjson → public.live_channels ...');
        const channelRows = await readNdjson(path.join(bundleDir, 'live', 'channels.ndjson'));
        const channelMapped = channelRows.map(r => ({
            id: r.id,
            slug: r.slug || r.id,
            display_name: r.title || r.display_name || r.slug || r.id,
            owner_user_id: r.owner_user_id || r.owner_id || null,
            description: r.description || null,
            avatar_url: r.avatar_url || null,
            metadata_json: JSON.stringify(r.metadata || {}),
            created_at: r.created_at || null,
            updated_at: r.updated_at || r.created_at || null,
        }));
        const chInserted = await upsertBatch(client, 'live_channels', channelMapped, ['id']);
        console.log(`[fix-public] live_channels: processed ${chInserted}/${channelMapped.length}`);

        // Also sync to public.channels table (mirrors live_channels in the service)
        const channelsMapped = channelRows.map(r => ({
            id: r.id,
            slug: r.slug || r.id,
            display_name: r.title || r.display_name || r.slug || r.id,
            owner_user_id: r.owner_user_id || r.owner_id || null,
            description: r.description || null,
            avatar_url: r.avatar_url || null,
            metadata_json: JSON.stringify(r.metadata || {}),
            created_at: r.created_at || null,
            updated_at: r.updated_at || r.created_at || null,
        }));
        // Check if public.channels has same columns as live_channels
        const { rows: colRows } = await client.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='channels' ORDER BY ordinal_position`
        );
        const channelsCols = colRows.map(r => r.column_name);
        if (channelsCols.includes('slug') && channelsCols.includes('display_name')) {
            const chInserted2 = await upsertBatch(client, 'channels', channelsMapped, ['id']);
            console.log(`[fix-public] channels: processed ${chInserted2}/${channelsMapped.length}`);
        } else {
            console.log(`[fix-public] channels table schema differs, skipping`);
        }

        // ── 2. public.live_streams ───────────────────────────────────────────
        console.log('[fix-public] Loading live/stream-sessions.ndjson → public.live_streams ...');
        const streamRows = await readNdjson(path.join(bundleDir, 'live', 'stream-sessions.ndjson'));

        // Build slug lookup from channels
        const slugById = {};
        for (const ch of channelRows) {
            slugById[ch.id] = ch.slug || ch.id;
        }

        // Get public.live_streams columns
        const { rows: lsCols } = await client.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='live_streams' ORDER BY ordinal_position`
        );
        const lsColNames = lsCols.map(r => r.column_name);
        console.log(`[fix-public] public.live_streams columns: ${lsColNames.join(', ')}`);

        const streamMapped = streamRows.map(r => {
            const base = {
                id: r.id,
                channel_id: r.channel_id || null,
                status: r.status || (r.ended_at ? 'ended' : 'unknown'),
                title: r.title || null,
                started_at: r.started_at || null,
                ended_at: r.ended_at || r.endedAt || null,
                metadata_json: JSON.stringify(r.metadata || {}),
                created_at: r.started_at || r.created_at || null,
                updated_at: r.ended_at || r.updated_at || r.started_at || null,
            };
            // Optional columns
            if (lsColNames.includes('channel_slug')) {
                base.channel_slug = slugById[r.channel_id] || (r.channel_id ? r.channel_id.split(':').pop() : null);
            }
            if (lsColNames.includes('category')) base.category = r.category || null;
            if (lsColNames.includes('thumbnail_url')) base.thumbnail_url = r.thumbnail_url || null;
            if (lsColNames.includes('embed_url')) base.embed_url = r.embed_url || null;
            if (lsColNames.includes('vod_media_id')) base.vod_media_id = r.vod_media_id || null;
            return base;
        });
        const lsInserted = await upsertBatch(client, 'live_streams', streamMapped, ['id']);
        console.log(`[fix-public] live_streams: processed ${lsInserted}/${streamMapped.length}`);

        // ── 3. Verify counts ─────────────────────────────────────────────────
        const { rows: counts } = await client.query(`
            SELECT 'live_channels' as tbl, count(*)::int as n FROM public.live_channels
            UNION ALL SELECT 'channels', count(*)::int FROM public.channels
            UNION ALL SELECT 'live_streams', count(*)::int FROM public.live_streams
        `);
        console.log('[fix-public] Final counts:');
        for (const row of counts) {
            console.log(`  public.${row.tbl}: ${row.n}`);
        }
    } finally {
        await client.end();
    }
}

main().catch(err => { console.error('[fix-public] ERROR:', err.message); process.exit(1); });
