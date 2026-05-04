'use strict';

// HoboStreamer → openvibe-community paste migration
//
// Reads the HoboStreamer SQLite backup and imports all public/unlisted pastes
// into the openvibe-community database.
//
// Usage:
//   node services/openvibe-community/server/migrations/hobostreamer-pastes.js [--dry-run] [--limit N]
//
// Options:
//   --dry-run   Print what would be imported without writing anything.
//   --limit N   Only import up to N pastes (default: all).
//
// Idempotent: pastes already imported (matched by legacy_id in metadata) are
// skipped on re-run.

const path      = require('path');
const crypto    = require('crypto');
const Database  = require('better-sqlite3');

// ── config / arg parsing ─────────────────────────────────────────────────────
const ARGS     = process.argv.slice(2);
const DRY_RUN  = ARGS.includes('--dry-run');
const LIMIT_ARG = (() => { const i = ARGS.indexOf('--limit'); return i !== -1 ? parseInt(ARGS[i + 1], 10) : null; })();

const HOBOSTREAMER_DB = process.env.HOBOSTREAMER_DB_PATH
    || path.resolve(__dirname, '../../../../../HoboReposToMigrateFrom/hobostreamer/data/hobostreamer.db')
    // Fallback: check for backup file on this host
    || '/opt/hobostreamer/data/hobostreamer.db.bak.1776371965';

const COMMUNITY_DB = process.env.COMMUNITY_DB_PATH
    || path.resolve(__dirname, '../../../../../../data/openvibe-community.db');

const SCREENSHOTS_SRC = process.env.HOBOSTREAMER_SCREENSHOTS_PATH
    || '/opt/hobostreamer/data/pastes/screenshots';

const SCREENSHOTS_DST = process.env.COMMUNITY_SCREENSHOTS_PATH
    || '/opt/openvibe/data/community/paste-screenshots';

// ── helpers ──────────────────────────────────────────────────────────────────
function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function newId(prefix) {
    return `${prefix || 'p'}_${crypto.randomBytes(8).toString('hex')}`;
}

function safeJson(s) {
    try { return JSON.parse(s); } catch { return {}; }
}

// ── open databases ────────────────────────────────────────────────────────────
function openSource() {
    // Try the explicit env path first, then the compat path, then the backup.
    const candidates = [
        process.env.HOBOSTREAMER_DB_PATH,
        path.resolve(__dirname, '../../../../../HoboReposToMigrateFrom/hobostreamer/data/hobostreamer.db'),
        '/opt/hobostreamer/data/hobostreamer.db',
        '/opt/hobostreamer/data/hobostreamer.db.bak.1776371965',
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const db = new Database(candidate, { readonly: true, fileMustExist: true });
            console.log(`[paste-migration] source DB: ${candidate}`);
            return db;
        } catch { /* try next */ }
    }
    throw new Error('HoboStreamer database not found. Set HOBOSTREAMER_DB_PATH env var.');
}

function openTarget() {
    const dbPath = process.env.COMMUNITY_DB_PATH || (() => {
        const candidates = [
            path.resolve(__dirname, '../../../../../../data/openvibe-community.db'),
            '/opt/openvibe/data/openvibe-community.db',
            path.resolve(process.cwd(), 'data/openvibe-community.db'),
        ];
        for (const c of candidates) {
            const fs = require('fs');
            if (fs.existsSync(c)) return c;
        }
        return null;
    })();

    if (!dbPath) throw new Error('openvibe-community database not found. Set COMMUNITY_DB_PATH env var.');
    const db = new Database(dbPath, { fileMustExist: true });
    console.log(`[paste-migration] target DB: ${dbPath}`);
    return db;
}

// ── ensure community_pastes schema has the columns we need ───────────────────
function ensureTargetSchema(db) {
    // The community DB should already have the table; add a legacy_id column
    // (keyed on hobostreamer paste ID) if missing so we can do idempotent imports.
    try {
        db.exec(`ALTER TABLE community_pastes ADD COLUMN legacy_id TEXT`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_community_pastes_legacy_id ON community_pastes(legacy_id)`);
        console.log('[paste-migration] added legacy_id column');
    } catch { /* column already exists */ }
}

// ── screenshot copy helper ────────────────────────────────────────────────────
function copyScreenshot(screenshotPath) {
    if (!screenshotPath) return null;
    const fs   = require('fs');
    const srcFile = screenshotPath.startsWith('/') ? screenshotPath : path.join(SCREENSHOTS_SRC, path.basename(screenshotPath));
    if (!fs.existsSync(srcFile)) return null;

    const dstDir = SCREENSHOTS_DST;
    if (!fs.existsSync(dstDir)) {
        try { fs.mkdirSync(dstDir, { recursive: true }); } catch { return null; }
    }

    const dstFile = path.join(dstDir, path.basename(srcFile));
    if (!fs.existsSync(dstFile)) {
        try { fs.copyFileSync(srcFile, dstFile); } catch { return null; }
    }
    return dstFile;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function run() {
    let src, tgt;

    try { src = openSource(); }
    catch (err) { console.error('[paste-migration] SKIP:', err.message); process.exit(0); }

    if (DRY_RUN) {
        console.log('[paste-migration] DRY RUN — no writes will occur');
    } else {
        try { tgt = openTarget(); }
        catch (err) { console.error('[paste-migration] ERROR:', err.message); process.exit(1); }
        ensureTargetSchema(tgt);
    }

    // Check HoboStreamer schema
    const hsColumns = src.prepare('PRAGMA table_info(pastes)').all().map((c) => c.name);
    if (!hsColumns.length) {
        console.log('[paste-migration] HoboStreamer pastes table not found — nothing to migrate');
        src.close();
        if (tgt) tgt.close();
        return;
    }

    // Build query — only public / unlisted, not burn-after-read
    let query = `SELECT * FROM pastes WHERE visibility IN ('public', 'unlisted')`;
    if (hsColumns.includes('burn_after_read')) query += ` AND (burn_after_read IS NULL OR burn_after_read = 0)`;
    query += ` ORDER BY created_at ASC`;
    if (LIMIT_ARG) query += ` LIMIT ${LIMIT_ARG}`;

    const rows = src.prepare(query).all();
    console.log(`[paste-migration] found ${rows.length} pastes to evaluate`);

    // Build a set of already-imported legacy IDs
    let importedIds = new Set();
    if (tgt) {
        try {
            const existing = tgt.prepare(`SELECT legacy_id FROM community_pastes WHERE legacy_id IS NOT NULL`).all();
            for (const row of existing) importedIds.add(String(row.legacy_id));
        } catch { /* table may not have the column yet in dry-run */ }
    }

    let inserted = 0;
    let skipped  = 0;
    let errors   = 0;

    const insertStmt = tgt ? tgt.prepare(`
        INSERT INTO community_pastes
            (id, slug, title, body, language, visibility, expires_at,
             created_by_actor_type, created_by_actor_id,
             metadata_json, legacy_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `) : null;

    // Version insert for audit trail
    const versionStmt = tgt ? tgt.prepare(`
        INSERT INTO community_paste_versions
            (id, paste_id, version_number, title, body, language,
             edited_by_actor_type, edited_by_actor_id,
             change_summary, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
    `) : null;

    // Check if community_paste_versions table exists
    let hasVersionsTable = false;
    if (tgt) {
        try {
            tgt.prepare(`SELECT 1 FROM community_paste_versions LIMIT 0`).get();
            hasVersionsTable = true;
        } catch { hasVersionsTable = false; }
    }

    for (const row of rows) {
        const legacyId = String(row.id);
        if (importedIds.has(legacyId)) { skipped++; continue; }

        const content = row.content || '';
        if (!content.trim()) { skipped++; continue; }

        const baseSlug = slugify(row.slug || row.title || legacyId);
        const language = row.language || 'text';
        const visibility = row.visibility === 'unlisted' ? 'unlisted' : 'public';
        const title    = row.title || null;

        // Build metadata — preserve hobostreamer-specific fields
        const metadata = {
            migrated_from: 'hobostreamer',
            legacy_id: legacyId,
            legacy_user_id: row.user_id != null ? String(row.user_id) : null,
            legacy_stream_id: row.stream_id != null ? String(row.stream_id) : null,
            views_at_migration: row.views || 0,
        };

        // Handle screenshots
        if (row.screenshot_path) {
            const dst = DRY_RUN ? `<copy:${row.screenshot_path}>` : copyScreenshot(row.screenshot_path);
            if (dst) metadata.screenshot_path = dst;
        }

        const pasteId = newId('paste');

        // Ensure slug is unique in target
        let slug = baseSlug;
        if (tgt) {
            try {
                const conflict = tgt.prepare(`SELECT 1 FROM community_pastes WHERE slug=?`).get(slug);
                if (conflict) slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
            } catch { /* table might not exist in early dry-run */ }
        }

        if (DRY_RUN) {
            console.log(`  [dry-run] would import paste ${legacyId}: slug="${slug}" lang="${language}" len=${content.length}`);
            inserted++;
            continue;
        }

        try {
            insertStmt.run(
                pasteId,
                slug,
                title,
                content,
                language,
                visibility,
                null, // expires_at — HoboStreamer pastes don't expire
                'user',
                row.user_id != null ? String(row.user_id) : null,
                JSON.stringify(metadata),
                legacyId,
                row.created_at || new Date().toISOString(),
                row.updated_at || row.created_at || new Date().toISOString(),
            );

            if (hasVersionsTable && versionStmt) {
                versionStmt.run(
                    newId('pver'),
                    pasteId, 1, title, content, language,
                    'user', row.user_id != null ? String(row.user_id) : null,
                    'migrated from hobostreamer',
                    JSON.stringify({ migration: true }),
                    row.created_at || new Date().toISOString(),
                );
            }
            inserted++;
            importedIds.add(legacyId);
        } catch (err) {
            console.error(`  [paste-migration] error importing paste ${legacyId}: ${err.message}`);
            errors++;
        }
    }

    console.log(`\n[paste-migration] done.`);
    console.log(`  inserted: ${inserted}`);
    console.log(`  skipped:  ${skipped}`);
    console.log(`  errors:   ${errors}`);

    src.close();
    if (tgt) tgt.close();
}

run().catch((err) => {
    console.error('[paste-migration] fatal:', err.message || err);
    process.exit(1);
});
