'use strict';

const crypto = require('crypto');
const path = require('path');

const {
    createPostgresPool,
    query,
    runMigrations,
} = require('@openvibe/persistence/postgres');

function safeJsonParse(value, fallbackValue) {
    if (!value) return fallbackValue;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallbackValue;
    }
}

function hydrateSource(row) {
    if (!row) return null;
    return {
        id: row.id,
        surface: row.surface,
        source_key: row.source_key,
        display_name: row.display_name,
        origin_url: row.origin_url || '',
        kind: row.kind,
        status: row.status,
        notes: row.notes || '',
        metadata: safeJsonParse(row.metadata_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateItem(row) {
    if (!row) return null;
    return {
        id: row.id,
        surface: row.surface,
        source_id: row.source_id || null,
        slug: row.slug,
        title: row.title,
        summary: row.summary || '',
        body_md: row.body_md || '',
        body_html: row.body_html || '',
        state: row.state,
        indexable: row.indexable === true,
        published_at: row.published_at || null,
        metadata: safeJsonParse(row.metadata_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateJob(row) {
    if (!row) return null;
    return {
        id: row.id,
        job_type: row.job_type,
        surface: row.surface || null,
        source_id: row.source_id || null,
        item_id: row.item_id || null,
        state: row.state,
        scheduled_at: row.scheduled_at || null,
        started_at: row.started_at || null,
        completed_at: row.completed_at || null,
        error: row.error || null,
        payload: safeJsonParse(row.payload_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function searchTextForItem(input) {
    return [input.surface, input.slug, input.title, input.summary, input.body_md, input.body_html]
        .filter(Boolean)
        .join(' ')
        .trim();
}

function buildWhere(filters, options) {
    const parts = [];
    const values = [];
    const likeColumns = options && options.likeColumns ? options.likeColumns : [];

    function push(clause, value) {
        values.push(value);
        parts.push(clause.replace(/\$(\d+)/g, () => `$${values.length}`));
    }

    if (filters.surface) push('$1 = surface', String(filters.surface));
    if (filters.state) push('$1 = state', String(filters.state));
    if (filters.source_id) push('$1 = source_id', String(filters.source_id));
    if (filters.item_id) push('$1 = item_id', String(filters.item_id));
    if (filters.job_type) push('$1 = job_type', String(filters.job_type));
    if (filters.q && likeColumns.length) {
        const queryValue = `%${String(filters.q).trim()}%`;
        const local = likeColumns.map(() => {
            values.push(queryValue);
            return `$${values.length}`;
        });
        parts.push(`(${likeColumns.map((column, index) => `${column} ILIKE ${local[index]}`).join(' OR ')})`);
    }

    return {
        clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
        values,
    };
}

function createPostgresContentStore(options) {
    const opts = options || {};
    const pool = createPostgresPool({
        serviceName: 'openvibe-content',
        connectionString: opts.databaseUrl,
        onTiming: opts.onTiming,
    });
    const migrationsDir = path.join(__dirname, '..', 'migrations', 'postgres');
    const status = {
        adapter: 'postgres',
        ready: false,
        error: null,
        sqlite_path: null,
        migrations_dir: migrationsDir,
    };

    const readyPromise = runMigrations('openvibe-content', {
        pool,
        migrationsDir,
    }).then((summary) => {
        status.ready = true;
        status.schema = summary;
        return summary;
    }).catch((error) => {
        status.error = error.message;
        throw error;
    });

    async function ensureReady() {
        await readyPromise;
        return status;
    }

    async function listSources(filters) {
        await ensureReady();
        const where = buildWhere(filters || {}, { likeColumns: ['display_name', 'source_key', 'origin_url'] });
        const limit = Math.min(Math.max(Number(filters && filters.limit) || 25, 1), 250);
        const result = await query(pool, `
            SELECT *
            FROM content_sources
            ${where.clause}
            ORDER BY updated_at DESC
            LIMIT $${where.values.length + 1}
        `, [...where.values, limit]);
        return result.rows.map(hydrateSource);
    }

    async function createSource(input) {
        await ensureReady();
        const payload = input || {};
        const id = String(payload.id || crypto.randomUUID());
        const result = await query(pool, `
            INSERT INTO content_sources (
                id, surface, source_key, display_name, origin_url, kind, status, notes, metadata_json, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
            ON CONFLICT (source_key) DO UPDATE SET
                surface = EXCLUDED.surface,
                display_name = EXCLUDED.display_name,
                origin_url = EXCLUDED.origin_url,
                kind = EXCLUDED.kind,
                status = EXCLUDED.status,
                notes = EXCLUDED.notes,
                metadata_json = EXCLUDED.metadata_json,
                updated_at = NOW()
            RETURNING *
        `, [
            id,
            String(payload.surface || 'codes'),
            String(payload.source_key || id),
            String(payload.display_name || payload.source_key || 'Untitled source'),
            payload.origin_url ? String(payload.origin_url) : null,
            String(payload.kind || 'feed'),
            String(payload.status || 'active'),
            payload.notes ? String(payload.notes) : null,
            JSON.stringify(payload.metadata || {}),
        ]);
        return hydrateSource(result.rows[0]);
    }

    async function listItems(filters) {
        await ensureReady();
        const where = buildWhere(filters || {}, { likeColumns: ['title', 'summary', 'search_text', 'slug'] });
        const limit = Math.min(Math.max(Number(filters && filters.limit) || 25, 1), 250);
        const result = await query(pool, `
            SELECT *
            FROM content_items
            ${where.clause}
            ORDER BY COALESCE(published_at, updated_at) DESC
            LIMIT $${where.values.length + 1}
        `, [...where.values, limit]);
        return result.rows.map(hydrateItem);
    }

    async function getItemById(id) {
        await ensureReady();
        const result = await query(pool, 'SELECT * FROM content_items WHERE id = $1', [String(id)]);
        return hydrateItem(result.rows[0]);
    }

    async function createItem(input) {
        await ensureReady();
        const payload = input || {};
        const id = String(payload.id || crypto.randomUUID());
        const result = await query(pool, `
            INSERT INTO content_items (
                id, surface, source_id, slug, title, summary, body_md, body_html, state, indexable,
                published_at, metadata_json, search_text, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, NOW())
            ON CONFLICT (surface, slug) DO UPDATE SET
                source_id = EXCLUDED.source_id,
                title = EXCLUDED.title,
                summary = EXCLUDED.summary,
                body_md = EXCLUDED.body_md,
                body_html = EXCLUDED.body_html,
                state = EXCLUDED.state,
                indexable = EXCLUDED.indexable,
                published_at = EXCLUDED.published_at,
                metadata_json = EXCLUDED.metadata_json,
                search_text = EXCLUDED.search_text,
                updated_at = NOW()
            RETURNING *
        `, [
            id,
            String(payload.surface || 'codes'),
            payload.source_id ? String(payload.source_id) : null,
            String(payload.slug || id),
            String(payload.title || 'Untitled content item'),
            payload.summary ? String(payload.summary) : null,
            payload.body_md ? String(payload.body_md) : null,
            payload.body_html ? String(payload.body_html) : null,
            String(payload.state || 'draft'),
            !!payload.indexable,
            payload.published_at ? String(payload.published_at) : null,
            JSON.stringify(payload.metadata || {}),
            searchTextForItem(payload),
        ]);
        return hydrateItem(result.rows[0]);
    }

    async function searchItems(searchQuery, filters) {
        return listItems(Object.assign({}, filters || {}, { q: searchQuery }));
    }

    async function listJobs(filters) {
        await ensureReady();
        const where = buildWhere(filters || {}, { likeColumns: ['job_type', 'state'] });
        const limit = Math.min(Math.max(Number(filters && filters.limit) || 25, 1), 250);
        const result = await query(pool, `
            SELECT *
            FROM content_jobs
            ${where.clause}
            ORDER BY created_at DESC
            LIMIT $${where.values.length + 1}
        `, [...where.values, limit]);
        return result.rows.map(hydrateJob);
    }

    async function queueJob(input) {
        await ensureReady();
        const payload = input || {};
        const id = String(payload.id || crypto.randomUUID());
        const result = await query(pool, `
            INSERT INTO content_jobs (
                id, job_type, surface, source_id, item_id, state, scheduled_at, payload_json, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
            RETURNING *
        `, [
            id,
            String(payload.job_type || 'content.publish'),
            payload.surface ? String(payload.surface) : null,
            payload.source_id ? String(payload.source_id) : null,
            payload.item_id ? String(payload.item_id) : null,
            String(payload.state || 'queued'),
            payload.scheduled_at ? String(payload.scheduled_at) : null,
            JSON.stringify(payload.payload || {}),
        ]);
        return hydrateJob(result.rows[0]);
    }

    async function getCounts() {
        await ensureReady();
        const [sources, items, jobs] = await Promise.all([
            query(pool, 'SELECT COUNT(*)::int AS count FROM content_sources', []),
            query(pool, 'SELECT COUNT(*)::int AS count FROM content_items', []),
            query(pool, 'SELECT COUNT(*)::int AS count FROM content_jobs', []),
        ]);
        return {
            sources: sources.rows[0].count,
            items: items.rows[0].count,
            jobs: jobs.rows[0].count,
        };
    }

    return {
        adapter: 'postgres',
        status,
        ready: async () => {
            await ensureReady();
            return Object.assign({}, status);
        },
        close: async () => pool.end(),
        getStatus: () => Object.assign({}, status),
        getCounts,
        listItems,
        getItemById,
        createItem,
        searchItems,
        listSources,
        createSource,
        listJobs,
        queueJob,
    };
}

module.exports = {
    createPostgresContentStore,
};
