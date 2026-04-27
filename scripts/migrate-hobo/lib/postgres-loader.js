'use strict';

const path = require('path');
const fs = require('fs');

const { forEachNdjson, ensureDir, writeJson } = require('./common');
const { withClient, buildUpsert, applySchemaDirectory } = require('./postgres');

const SCHEMA_DIR = path.resolve(__dirname, '..', 'postgres', 'schema');

const DATASET_PLAN = [
    {
        dataset: 'identity/users',
        table: 'identity_users',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                username: row.username || null,
                display_name: row.display_name || row.displayName || null,
                email: row.email || null,
                role: row.role || null,
                flags_json: row.flags || row.flags_json || {},
                legacy_source: row.legacy_source || (row.legacy_ref && row.legacy_ref.source) || null,
                legacy_id: row.legacy_id || (row.legacy_ref && row.legacy_ref.legacy_id) || null,
            };
        },
    },
    {
        dataset: 'identity/linked-accounts',
        table: 'identity_linked_accounts',
        keys: ['service', 'external_id'],
        map(row) {
            return {
                user_id: row.user_id || row.userId || null,
                service: row.service,
                external_id: row.external_id || row.externalId || row.id,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'themes/catalog',
        table: 'themes_catalog',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                name: row.name || null,
                description: row.description || null,
                css_vars_json: row.css_vars || row.cssVars || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'themes/preferences',
        table: 'themes_user_preferences',
        keys: ['user_id'],
        map(row) {
            return {
                user_id: row.user_id || row.userId,
                theme_id: row.theme_id || row.themeId || null,
                overrides_json: row.overrides || {},
            };
        },
    },
    {
        dataset: 'control-plane/url-registry',
        table: 'control_url_registry',
        keys: ['key'],
        map(row) {
            return {
                key: row.key,
                value: row.value == null ? null : String(row.value),
                description: row.description || null,
            };
        },
    },
    {
        dataset: 'live/channels',
        table: 'live_channels',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                owner_id: row.owner_id || row.user_id || null,
                title: row.title || null,
                description: row.description || null,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'live/streams',
        table: 'live_streams',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                channel_id: row.channel_id || null,
                user_id: row.user_id || null,
                title: row.title || null,
                status: row.status || null,
                started_at: row.started_at || row.startedAt || null,
                ended_at: row.ended_at || row.endedAt || null,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'chat/messages',
        table: 'chat_messages',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                room: row.room || null,
                sender_id: row.sender_id || null,
                body: row.body || row.message || null,
                sent_at: row.sent_at || row.sentAt || row.created_at || null,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'community/pastes',
        table: 'community_pastes',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                owner_id: row.owner_id || row.user_id || null,
                title: row.title || null,
                body: row.body || null,
                visibility: row.visibility || null,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'media/objects',
        table: 'media_objects',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                namespace: row.namespace || 'uncategorized',
                media_type: row.media_type || row.mediaType || null,
                owner_id: row.owner_id || row.ownerId || null,
                storage_key: row.storage_key || row.storageKey || null,
                size_bytes: row.size_bytes || row.sizeBytes || null,
                sha256: row.sha256 || null,
                status: row.status || null,
                tier: row.tier || null,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'loyalty/accounts',
        table: 'loyalty_accounts',
        keys: ['user_id'],
        map(row) {
            return {
                user_id: row.user_id || row.userId,
                coins_balance: row.coins_balance || row.coinsBalance || 0,
                nickels_balance: row.nickels_balance || row.nickelsBalance || 0,
                metadata_json: row.metadata || {},
            };
        },
    },
    {
        dataset: 'loyalty/transactions',
        table: 'loyalty_transactions',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                user_id: row.user_id || null,
                kind: row.kind || row.tx_kind || null,
                amount: row.amount || 0,
                reason: row.reason || null,
                created_at: row.created_at || null,
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
];

function bundleFile(bundleDir, dataset) {
    return path.join(bundleDir, `${dataset}.ndjson`);
}

async function loadBundle({ client, bundleDir, runId, dryRun = false, only = null, batchSize = 500 }) {
    const report = {
        generated_at: new Date().toISOString(),
        bundle_dir: bundleDir,
        run_id: runId,
        dry_run: !!dryRun,
        datasets: {},
        hobo_bucks_excluded: true,
        loyalty_imported_as_progression: true,
        manual_actions: [],
    };

    if (!dryRun) {
        await client.query(
            `INSERT INTO migration_runs (run_id, bundle_dir, mode, status)
             VALUES ($1, $2, $3, 'running')
             ON CONFLICT (run_id) DO UPDATE SET status = 'running', started_at = now()`,
            [runId, bundleDir, 'postgres'],
        );
    }

    for (const plan of DATASET_PLAN) {
        if (only && only !== plan.dataset) continue;
        const file = bundleFile(bundleDir, plan.dataset);
        if (!fs.existsSync(file)) {
            report.datasets[plan.dataset] = { file, status: 'missing', count: 0 };
            continue;
        }
        let count = 0;
        let batch = [];
        const flush = async () => {
            if (!batch.length) return;
            if (!dryRun) {
                for (const mapped of batch) {
                    const cols = Object.keys(mapped);
                    const vals = cols.map((c) => mapped[c]);
                    const sql = buildUpsert(plan.table, cols, plan.keys);
                    await client.query(sql, vals);
                }
            }
            count += batch.length;
            batch = [];
        };
        await forEachNdjson(file, async (row) => {
            batch.push(plan.map(row));
            if (batch.length >= batchSize) await flush();
        });
        await flush();
        report.datasets[plan.dataset] = { file, status: dryRun ? 'planned' : 'loaded', count };
    }

    if (!dryRun) {
        await client.query(
            `UPDATE migration_runs SET finished_at = now(), status = 'completed',
                summary_json = $2 WHERE run_id = $1`,
            [runId, JSON.stringify(report)],
        );
    }

    return report;
}

async function applySchema({ client }) {
    return applySchemaDirectory(client, SCHEMA_DIR);
}

async function loadBundleWithUrl({ databaseUrl, client, bundleDir, runId, dryRun, only, batchSize, applyMigrations }) {
    return withClient({ databaseUrl, client }, async (c) => {
        if (applyMigrations) await applySchema({ client: c });
        return loadBundle({ client: c, bundleDir, runId, dryRun, only, batchSize });
    });
}

module.exports = {
    DATASET_PLAN,
    SCHEMA_DIR,
    applySchema,
    loadBundle,
    loadBundleWithUrl,
};
