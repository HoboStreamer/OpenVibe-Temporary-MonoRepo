'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function safeJsonParse(value, fallbackValue) {
    if (!value) return fallbackValue;
    try {
        return JSON.parse(value);
    } catch {
        return fallbackValue;
    }
}

function asBoolean(value) {
    return value === true || value === 1 || value === '1';
}

function searchTextForItem(input) {
    return [input.surface, input.slug, input.title, input.summary, input.body_md, input.body_html]
        .filter(Boolean)
        .join(' ')
        .trim();
}

function hydrateSource(row) {
    if (!row) return null;
    return {
        id: row.id,
        surface: row.surface,
        source_key: row.source_key,
        display_name: row.display_name,
        origin_url: row.origin_url,
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
        source_id: row.source_id,
        slug: row.slug,
        title: row.title,
        summary: row.summary || '',
        body_md: row.body_md || '',
        body_html: row.body_html || '',
        state: row.state,
        indexable: asBoolean(row.indexable),
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

function buildWhere(filters, options) {
    const parts = [];
    const values = [];
    const likeColumns = options && options.likeColumns ? options.likeColumns : [];

    if (filters.surface) {
        parts.push('surface = ?');
        values.push(String(filters.surface));
    }
    if (filters.state) {
        parts.push('state = ?');
        values.push(String(filters.state));
    }
    if (filters.source_id) {
        parts.push('source_id = ?');
        values.push(String(filters.source_id));
    }
    if (filters.item_id) {
        parts.push('item_id = ?');
        values.push(String(filters.item_id));
    }
    if (filters.job_type) {
        parts.push('job_type = ?');
        values.push(String(filters.job_type));
    }
    if (filters.q) {
        const query = `%${String(filters.q).trim()}%`;
        if (likeColumns.length) {
            parts.push(`(${likeColumns.map((column) => `${column} LIKE ?`).join(' OR ')})`);
            likeColumns.forEach(() => values.push(query));
        }
    }

    return {
        clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
        values,
    };
}

function createSqliteContentStore(options) {
    const opts = options || {};
    const sqlitePath = String(opts.sqlitePath || path.resolve(process.cwd(), 'data', 'openvibe-content.db'));
    const dir = path.dirname(sqlitePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(sqlitePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS content_sources (
            id              TEXT PRIMARY KEY,
            surface         TEXT NOT NULL,
            source_key      TEXT NOT NULL UNIQUE,
            display_name    TEXT NOT NULL,
            origin_url      TEXT,
            kind            TEXT NOT NULL DEFAULT 'feed',
            status          TEXT NOT NULL DEFAULT 'active',
            notes           TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_content_sources_surface ON content_sources(surface, status, updated_at DESC);

        CREATE TABLE IF NOT EXISTS content_items (
            id              TEXT PRIMARY KEY,
            surface         TEXT NOT NULL,
            source_id       TEXT,
            slug            TEXT NOT NULL,
            title           TEXT NOT NULL,
            summary         TEXT,
            body_md         TEXT,
            body_html       TEXT,
            state           TEXT NOT NULL DEFAULT 'draft',
            indexable       INTEGER NOT NULL DEFAULT 0,
            published_at    DATETIME,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            search_text     TEXT NOT NULL DEFAULT '',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(surface, slug),
            FOREIGN KEY (source_id) REFERENCES content_sources(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_content_items_surface ON content_items(surface, state, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_content_items_published ON content_items(surface, published_at DESC);

        CREATE TABLE IF NOT EXISTS content_jobs (
            id              TEXT PRIMARY KEY,
            job_type        TEXT NOT NULL,
            surface         TEXT,
            source_id       TEXT,
            item_id         TEXT,
            state           TEXT NOT NULL DEFAULT 'queued',
            scheduled_at    DATETIME,
            started_at      DATETIME,
            completed_at    DATETIME,
            error           TEXT,
            payload_json    TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_id) REFERENCES content_sources(id) ON DELETE SET NULL,
            FOREIGN KEY (item_id) REFERENCES content_items(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_content_jobs_state ON content_jobs(state, job_type, created_at DESC);

        CREATE TABLE IF NOT EXISTS content_review_decisions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id         TEXT NOT NULL,
            decision        TEXT NOT NULL,
            from_state      TEXT,
            to_state        TEXT,
            reviewer_actor_type TEXT,
            reviewer_actor_id   TEXT,
            notes           TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            decided_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_id) REFERENCES content_items(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_content_review_item ON content_review_decisions(item_id, decided_at DESC);
        CREATE INDEX IF NOT EXISTS idx_content_review_decision ON content_review_decisions(decision, decided_at DESC);

        CREATE TABLE IF NOT EXISTS content_distribution_audit (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id         TEXT NOT NULL,
            surface         TEXT NOT NULL,
            channel         TEXT NOT NULL,
            outcome         TEXT NOT NULL,
            actor_type      TEXT,
            actor_id        TEXT,
            error_message   TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            recorded_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_id) REFERENCES content_items(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_content_distribution_item ON content_distribution_audit(item_id, recorded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_content_distribution_outcome ON content_distribution_audit(outcome, recorded_at DESC);
    `);

    const status = {
        adapter: 'sqlite',
        ready: true,
        error: null,
        sqlite_path: sqlitePath,
        migrations_dir: null,
    };

    async function listSources(filters) {
        const where = buildWhere(filters || {}, { likeColumns: ['display_name', 'source_key', 'origin_url'] });
        const limit = Math.min(Math.max(Number(filters && filters.limit) || 25, 1), 250);
        return db.prepare(`SELECT * FROM content_sources ${where.clause} ORDER BY updated_at DESC LIMIT ?`).all(...where.values, limit).map(hydrateSource);
    }

    async function createSource(input) {
        const payload = input || {};
        const id = String(payload.id || crypto.randomUUID());
        const source = {
            id,
            surface: String(payload.surface || 'codes'),
            source_key: String(payload.source_key || id),
            display_name: String(payload.display_name || payload.source_key || 'Untitled source'),
            origin_url: payload.origin_url ? String(payload.origin_url) : '',
            kind: String(payload.kind || 'feed'),
            status: String(payload.status || 'active'),
            notes: payload.notes ? String(payload.notes) : '',
            metadata_json: JSON.stringify(payload.metadata || {}),
        };
        db.prepare(`
            INSERT INTO content_sources (id, surface, source_key, display_name, origin_url, kind, status, notes, metadata_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(source_key) DO UPDATE SET
                surface=excluded.surface,
                display_name=excluded.display_name,
                origin_url=excluded.origin_url,
                kind=excluded.kind,
                status=excluded.status,
                notes=excluded.notes,
                metadata_json=excluded.metadata_json,
                updated_at=CURRENT_TIMESTAMP
        `).run(source.id, source.surface, source.source_key, source.display_name, source.origin_url, source.kind, source.status, source.notes, source.metadata_json);
        return hydrateSource(db.prepare('SELECT * FROM content_sources WHERE source_key = ?').get(source.source_key));
    }

    async function listItems(filters) {
        const where = buildWhere(filters || {}, { likeColumns: ['title', 'summary', 'search_text', 'slug'] });
        const limit = Math.min(Math.max(Number(filters && filters.limit) || 25, 1), 250);
        return db.prepare(`SELECT * FROM content_items ${where.clause} ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ?`).all(...where.values, limit).map(hydrateItem);
    }

    async function getItemById(id) {
        return hydrateItem(db.prepare('SELECT * FROM content_items WHERE id = ?').get(String(id)));
    }

    async function createItem(input) {
        const payload = input || {};
        const id = String(payload.id || crypto.randomUUID());
        const item = {
            id,
            surface: String(payload.surface || 'codes'),
            source_id: payload.source_id ? String(payload.source_id) : null,
            slug: String(payload.slug || id),
            title: String(payload.title || 'Untitled content item'),
            summary: payload.summary ? String(payload.summary) : '',
            body_md: payload.body_md ? String(payload.body_md) : '',
            body_html: payload.body_html ? String(payload.body_html) : '',
            state: String(payload.state || 'draft'),
            indexable: payload.indexable ? 1 : 0,
            published_at: payload.published_at ? String(payload.published_at) : null,
            metadata_json: JSON.stringify(payload.metadata || {}),
            search_text: searchTextForItem(payload),
        };
        db.prepare(`
            INSERT INTO content_items (id, surface, source_id, slug, title, summary, body_md, body_html, state, indexable, published_at, metadata_json, search_text, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(surface, slug) DO UPDATE SET
                source_id=excluded.source_id,
                title=excluded.title,
                summary=excluded.summary,
                body_md=excluded.body_md,
                body_html=excluded.body_html,
                state=excluded.state,
                indexable=excluded.indexable,
                published_at=excluded.published_at,
                metadata_json=excluded.metadata_json,
                search_text=excluded.search_text,
                updated_at=CURRENT_TIMESTAMP
        `).run(item.id, item.surface, item.source_id, item.slug, item.title, item.summary, item.body_md, item.body_html, item.state, item.indexable, item.published_at, item.metadata_json, item.search_text);
        return hydrateItem(db.prepare('SELECT * FROM content_items WHERE surface = ? AND slug = ?').get(item.surface, item.slug));
    }

    async function searchItems(query, filters) {
        return listItems(Object.assign({}, filters || {}, { q: query }));
    }

    async function listJobs(filters) {
        const where = buildWhere(filters || {}, { likeColumns: ['job_type', 'state'] });
        const limit = Math.min(Math.max(Number(filters && filters.limit) || 25, 1), 250);
        return db.prepare(`SELECT * FROM content_jobs ${where.clause} ORDER BY created_at DESC LIMIT ?`).all(...where.values, limit).map(hydrateJob);
    }

    async function queueJob(input) {
        const payload = input || {};
        const id = String(payload.id || crypto.randomUUID());
        db.prepare(`
            INSERT INTO content_jobs (id, job_type, surface, source_id, item_id, state, scheduled_at, payload_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
            id,
            String(payload.job_type || 'content.publish'),
            payload.surface ? String(payload.surface) : null,
            payload.source_id ? String(payload.source_id) : null,
            payload.item_id ? String(payload.item_id) : null,
            String(payload.state || 'queued'),
            payload.scheduled_at ? String(payload.scheduled_at) : null,
            JSON.stringify(payload.payload || {}),
        );
        return hydrateJob(db.prepare('SELECT * FROM content_jobs WHERE id = ?').get(id));
    }

    async function getCounts() {
        return {
            sources: db.prepare('SELECT COUNT(*) AS count FROM content_sources').get().count,
            items: db.prepare('SELECT COUNT(*) AS count FROM content_items').get().count,
            jobs: db.prepare('SELECT COUNT(*) AS count FROM content_jobs').get().count,
            review_decisions: db.prepare('SELECT COUNT(*) AS count FROM content_review_decisions').get().count,
            distribution_audit: db.prepare('SELECT COUNT(*) AS count FROM content_distribution_audit').get().count,
        };
    }

    function hydrateReviewDecision(row) {
        if (!row) return null;
        return {
            id: row.id, item_id: row.item_id, decision: row.decision,
            from_state: row.from_state, to_state: row.to_state,
            reviewer_actor_type: row.reviewer_actor_type,
            reviewer_actor_id: row.reviewer_actor_id,
            notes: row.notes || '',
            metadata: safeJsonParse(row.metadata_json, {}),
            decided_at: row.decided_at,
        };
    }

    function hydrateDistribution(row) {
        if (!row) return null;
        return {
            id: row.id, item_id: row.item_id, surface: row.surface,
            channel: row.channel, outcome: row.outcome,
            actor_type: row.actor_type, actor_id: row.actor_id,
            error_message: row.error_message || null,
            metadata: safeJsonParse(row.metadata_json, {}),
            recorded_at: row.recorded_at,
        };
    }

    async function recordReviewDecision(input) {
        const payload = input || {};
        if (!payload.item_id) throw new Error('item_id required');
        const item = db.prepare('SELECT * FROM content_items WHERE id = ?').get(String(payload.item_id));
        if (!item) throw new Error(`unknown content item: ${payload.item_id}`);
        const fromState = item.state;
        const toState = payload.to_state || (
            payload.decision === 'approve' ? 'approved' :
            payload.decision === 'reject' ? 'rejected' :
            payload.decision === 'publish' ? 'published' :
            payload.decision === 'unpublish' ? 'draft' :
            fromState
        );
        const result = db.prepare(`
            INSERT INTO content_review_decisions (item_id, decision, from_state, to_state,
                reviewer_actor_type, reviewer_actor_id, notes, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            String(payload.item_id),
            String(payload.decision || 'note'),
            fromState,
            toState,
            payload.reviewer_actor_type || null,
            payload.reviewer_actor_id != null ? String(payload.reviewer_actor_id) : null,
            payload.notes ? String(payload.notes) : null,
            JSON.stringify(payload.metadata || {}),
        );
        if (toState && toState !== fromState) {
            const publishedAt = toState === 'published' ? new Date().toISOString() : null;
            db.prepare(`UPDATE content_items SET state = ?, published_at = COALESCE(?, published_at), indexable = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
                .run(toState, publishedAt, toState === 'published' ? 1 : item.indexable, String(payload.item_id));
        }
        return hydrateReviewDecision(db.prepare('SELECT * FROM content_review_decisions WHERE id = ?').get(result.lastInsertRowid));
    }

    async function listReviewDecisions(filters) {
        const f = filters || {};
        const where = [];
        const args = [];
        if (f.item_id) { where.push('item_id = ?'); args.push(String(f.item_id)); }
        if (f.decision) { where.push('decision = ?'); args.push(String(f.decision)); }
        const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 250);
        const sql = `SELECT * FROM content_review_decisions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY decided_at DESC, id DESC LIMIT ?`;
        return db.prepare(sql).all(...args, limit).map(hydrateReviewDecision);
    }

    async function recordDistributionAudit(input) {
        const payload = input || {};
        if (!payload.item_id) throw new Error('item_id required');
        if (!payload.channel) throw new Error('channel required');
        const item = db.prepare('SELECT * FROM content_items WHERE id = ?').get(String(payload.item_id));
        if (!item) throw new Error(`unknown content item: ${payload.item_id}`);
        const result = db.prepare(`
            INSERT INTO content_distribution_audit (item_id, surface, channel, outcome,
                actor_type, actor_id, error_message, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            String(payload.item_id),
            String(payload.surface || item.surface),
            String(payload.channel),
            String(payload.outcome || 'delivered'),
            payload.actor_type || null,
            payload.actor_id != null ? String(payload.actor_id) : null,
            payload.error_message || null,
            JSON.stringify(payload.metadata || {}),
        );
        return hydrateDistribution(db.prepare('SELECT * FROM content_distribution_audit WHERE id = ?').get(result.lastInsertRowid));
    }

    async function listDistributionAudit(filters) {
        const f = filters || {};
        const where = [];
        const args = [];
        if (f.item_id) { where.push('item_id = ?'); args.push(String(f.item_id)); }
        if (f.surface) { where.push('surface = ?'); args.push(String(f.surface)); }
        if (f.outcome) { where.push('outcome = ?'); args.push(String(f.outcome)); }
        if (f.channel) { where.push('channel = ?'); args.push(String(f.channel)); }
        const limit = Math.min(Math.max(Number(f.limit) || 100, 1), 500);
        const sql = `SELECT * FROM content_distribution_audit ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY recorded_at DESC, id DESC LIMIT ?`;
        return db.prepare(sql).all(...args, limit).map(hydrateDistribution);
    }

    async function getProductWorkflowStatus() {
        const stateCounts = db.prepare(`SELECT state, COUNT(*) AS n FROM content_items GROUP BY state`).all();
        const byState = {};
        for (const row of stateCounts) byState[row.state] = Number(row.n);
        const decisionCounts = db.prepare(`SELECT decision, COUNT(*) AS n FROM content_review_decisions GROUP BY decision`).all();
        const byDecision = {};
        for (const row of decisionCounts) byDecision[row.decision] = Number(row.n);
        const distributionCounts = db.prepare(`SELECT outcome, COUNT(*) AS n FROM content_distribution_audit GROUP BY outcome`).all();
        const byOutcome = {};
        for (const row of distributionCounts) byOutcome[row.outcome] = Number(row.n);
        // Phase 16 — per-surface and per-kind item counters so the workflow truth is
        // surfaced separately for wiki/blog/news/reviews/deals/coupons/trade/host.
        const surfaceRows = db.prepare(
            `SELECT surface, state, COUNT(*) AS n FROM content_items GROUP BY surface, state`,
        ).all();
        const bySurface = {};
        const byKind = {};
        for (const row of surfaceRows) {
            const surface = row.surface || 'unknown';
            const state = row.state || 'unknown';
            const n = Number(row.n || 0);
            if (!bySurface[surface]) bySurface[surface] = { total: 0, by_state: {} };
            bySurface[surface].total += n;
            bySurface[surface].by_state[state] = (bySurface[surface].by_state[state] || 0) + n;
        }
        return {
            items_by_state: byState,
            decisions_by_type: byDecision,
            distribution_by_outcome: byOutcome,
            counts: await getCounts(),
            items_by_surface: bySurface,
        };
    }

    return {
        adapter: 'sqlite',
        status,
        ready: async () => status,
        close: async () => db.close(),
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
        recordReviewDecision,
        listReviewDecisions,
        recordDistributionAudit,
        listDistributionAudit,
        getProductWorkflowStatus,
    };
}

module.exports = {
    createSqliteContentStore,
};
