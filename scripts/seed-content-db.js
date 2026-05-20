#!/usr/bin/env node
'use strict';

/**
 * Seed the content DB with all SSR catalog entries.
 * 
 * Usage:
 *   node scripts/seed-content-db.js [--dry-run] [--force]
 * 
 * --dry-run  Show what would be inserted without making changes
 * --force    Re-seed even if items already exist (upsert)
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const config = require(path.join(ROOT, 'services', 'openvibe-content', 'server', 'config.js'));
const { buildSurfaceCatalog } = require(path.join(ROOT, 'services', 'openvibe-content', 'server', 'ssr.js'));
const { createContentStore } = require(path.join(ROOT, 'services', 'openvibe-content', 'server', 'db', 'index.js'));

const args = process.argv.slice(2).reduce((acc, arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    acc[k] = v !== undefined ? v : true;
    return acc;
}, {});

const DRY_RUN = !!args['dry-run'];
const FORCE = !!args.force;

function slugFromPath(p) {
    return String(p || '').replace(/^\//, '').replace(/\/$/, '') || 'index';
}

function sectionsToBodMd(sections) {
    if (!sections || !sections.length) return '';
    return sections.map(s => String(s)).join('\n\n');
}

function sectionsToHtml(sections) {
    if (!sections || !sections.length) return '';
    return sections.map(s => `<p>${String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('\n');
}

async function seed() {
    const store = createContentStore(config);
    await store.ready();

    const catalog = buildSurfaceCatalog(config);
    const surfaces = Object.values(catalog);

    console.log(`Seeding ${surfaces.length} surfaces${DRY_RUN ? ' (DRY RUN)' : ''}`);

    let totalSources = 0;
    let totalItems = 0;
    let totalSkipped = 0;
    let errors = [];

    for (const surface of surfaces) {
        const sourceKey = `builtin:${surface.id}`;
        
        if (!DRY_RUN) {
            try {
                await store.createSource({
                    id: `content-source:${surface.id}:builtin`,
                    surface: surface.id,
                    source_key: sourceKey,
                    display_name: `${surface.label} Built-in Catalog`,
                    origin_url: `https://${surface.host}`,
                    kind: 'builtin',
                    status: 'active',
                    notes: `Static catalog seeded from SSR. ${surface.deferReason || ''}`.trim(),
                    metadata: { surface_id: surface.id, builtin: true },
                });
                totalSources++;
            } catch (err) {
                console.error(`  Error creating source for ${surface.id}: ${err.message}`);
                errors.push({ surface: surface.id, type: 'source', error: err.message });
            }
        } else {
            console.log(`  [DRY-RUN] Would create source: ${sourceKey} for surface ${surface.id}`);
            totalSources++;
        }

        const entries = surface.entries || [];
        console.log(`  Surface: ${surface.id} — ${entries.length} entries`);

        for (const entry of entries) {
            const slug = slugFromPath(entry.path);
            const isDraft = !!entry.draft;

            if (DRY_RUN) {
                console.log(`    [DRY-RUN] Would seed: ${surface.id}/${slug} — "${entry.title}"`);
                totalItems++;
                continue;
            }

            try {
                // Check if already exists (only skip if not --force)
                if (!FORCE) {
                    const existing = await store.listItems({ surface: surface.id, slug, limit: 1 });
                    if (existing && existing.length > 0) {
                        totalSkipped++;
                        continue;
                    }
                }

                await store.createItem({
                    id: `content:${surface.id}:${slug.replace(/\//g, '-')}`,
                    surface: surface.id,
                    source_id: `content-source:${surface.id}:builtin`,
                    slug,
                    title: entry.title,
                    summary: entry.summary || null,
                    body_md: sectionsToBodMd(entry.sections),
                    body_html: sectionsToHtml(entry.sections),
                    state: isDraft ? 'draft' : 'published',
                    indexable: !isDraft && surface.indexable !== false,
                    published_at: entry.publishedAt || null,
                    metadata: {
                        kind: entry.kind || 'Article',
                        builtin: true,
                        path: entry.path,
                        surface: surface.id,
                    },
                });
                totalItems++;
            } catch (err) {
                console.error(`    Error seeding ${surface.id}/${slug}: ${err.message}`);
                errors.push({ surface: surface.id, slug, error: err.message });
            }
        }
    }

    if (!DRY_RUN) {
        const counts = await store.getCounts();
        console.log('\nFinal DB counts:', JSON.stringify(counts));
    }

    console.log('\n=== Seed Report ===');
    console.log(`Sources processed: ${totalSources}`);
    console.log(`Items seeded: ${totalItems}`);
    console.log(`Items skipped (already exist): ${totalSkipped}`);
    console.log(`Errors: ${errors.length}`);
    if (errors.length > 0) {
        errors.forEach(e => console.error(`  Error: ${JSON.stringify(e)}`));
    }
}

seed().catch(err => {
    console.error('Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});
