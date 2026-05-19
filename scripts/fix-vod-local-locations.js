'use strict';

/**
 * Inserts local provider location records for VOD files present on disk.
 * Run once to fix VOD playback when canonical provider is switched to 'local'.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('/opt/openvibe/node_modules/pg');

const HOT_VODS_DIR = '/opt/openvibe/services/openvibe-media/data/storage/hot/vods';
const PUBLIC_BASE_URL = 'https://openvibe.media';

async function run() {
    const client = new Client({
        host: '127.0.0.1',
        user: 'openvibe',
        password: 'LuZkHuM9s6bQrtA2YE8DOkSig9hRiW9d',
        database: 'openvibe',
    });
    await client.connect();

    const files = fs.readdirSync(HOT_VODS_DIR).filter(f => f.endsWith('.webm'));
    console.log(`Found ${files.length} VOD files on disk`);

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const filename of files) {
        // filename format: vod-NNN-TIMESTAMP.webm
        const match = /^vod-(\d+)-\d+\.webm$/.exec(filename);
        if (!match) {
            console.log(`  Skipping unrecognized filename: ${filename}`);
            skipped++;
            continue;
        }

        const hoboId = match[1];
        const mediaId = `media:hobostreamer-vod:${hoboId}`;
        const storageKey = `vods/${filename}`;
        const fullPath = path.join(HOT_VODS_DIR, filename);
        const sizeBytes = fs.statSync(fullPath).size;
        const publicUrl = `${PUBLIC_BASE_URL}/files/${encodeURIComponent(mediaId)}`;

        // Check if media_object exists
        const mo = await client.query('SELECT id FROM media_objects WHERE id=$1', [mediaId]);
        if (!mo.rowCount) {
            console.log(`  No media_object for ${mediaId}, skipping`);
            skipped++;
            continue;
        }

        // Upsert local location
        try {
            const result = await client.query(`
                INSERT INTO media_object_locations
                    (media_id, provider_name, role, storage_key, size_bytes, public_url, status)
                VALUES ($1, 'local', 'canonical', $2, $3, $4, 'active')
                ON CONFLICT (media_id, provider_name, role, storage_key) DO UPDATE
                    SET size_bytes=$3, public_url=$4, status='active', updated_at=NOW()
            `, [mediaId, storageKey, sizeBytes, publicUrl]);
            inserted += result.rowCount;
            if (inserted <= 5 || inserted % 20 === 0) {
                console.log(`  [${inserted}] ${mediaId} → ${storageKey} (${(sizeBytes / 1e6).toFixed(1)} MB)`);
            }
        } catch (err) {
            console.error(`  ERROR for ${mediaId}: ${err.message}`);
            errors++;
        }
    }

    // Also update existing 'b2' canonical locations to 'asset-origin' role
    // so playback prefers local when both exist
    const demote = await client.query(`
        UPDATE media_object_locations
        SET role='asset-origin'
        WHERE provider_name='b2'
          AND role='canonical'
          AND media_id IN (
            SELECT media_id FROM media_object_locations WHERE provider_name='local' AND role='canonical'
          )
    `);
    console.log(`\nDemoted ${demote.rowCount} B2 canonical locations to asset-origin`);

    await client.end();
    console.log(`\nDone: inserted/updated=${inserted}, skipped=${skipped}, errors=${errors}`);
}

run().catch(err => { console.error(err.message); process.exit(1); });
