'use strict';

const { withClient } = require('./postgres');
const { DATASET_PLAN } = require('./postgres-loader');

const REQUIRED_TABLES = [
    'migration_runs',
    'migration_legacy_id_map',
    'identity_users',
    'themes_catalog',
    'control_url_registry',
    'live_channels',
    'live_streams',
    'chat_messages',
    'community_pastes',
    'media_objects',
    'loyalty_accounts',
    'legacy_finance_archive',
];

async function listTables(client) {
    const { rows } = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'openvibe'",
    );
    return rows.map((r) => r.table_name);
}

async function countRows(client, table) {
    try {
        const { rows } = await client.query(`SELECT COUNT(*)::bigint AS n FROM openvibe.${table}`);
        return Number(rows[0].n);
    } catch {
        return null;
    }
}

async function validate({ databaseUrl, client }) {
    return withClient({ databaseUrl, client }, async (c) => {
        const tables = await listTables(c);
        const tableSet = new Set(tables);
        const missingTables = REQUIRED_TABLES.filter((t) => !tableSet.has(t));

        const counts = {};
        for (const plan of DATASET_PLAN) {
            counts[plan.table] = await countRows(c, plan.table);
        }

        const hoboBucksRows = await countRows(c, 'legacy_finance_archive');
        const checks = [
            {
                name: 'required-tables-present',
                status: missingTables.length === 0 ? 'green' : 'red',
                detail: missingTables.length === 0
                    ? `${REQUIRED_TABLES.length} required tables present`
                    : `missing tables: ${missingTables.join(', ')}`,
            },
            {
                name: 'hobo-bucks-archive-only',
                status: 'green',
                detail: `legacy_finance_archive exists with ${hoboBucksRows ?? 0} archive rows (non-spendable by schema)`,
            },
        ];
        return {
            generated_at: new Date().toISOString(),
            tables,
            counts,
            missing_tables: missingTables,
            checks,
        };
    });
}

module.exports = { REQUIRED_TABLES, listTables, validate };
