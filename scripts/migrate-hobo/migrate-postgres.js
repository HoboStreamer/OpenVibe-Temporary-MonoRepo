#!/usr/bin/env node
'use strict';

const { parseArgs, createLogger } = require('./lib/common');
const { applySchema } = require('./lib/postgres-loader');
const { withClient } = require('./lib/postgres');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('migrate-postgres');
    const databaseUrl = args.databaseUrl || process.env.OPENVIBE_STAGING_DATABASE_URL || process.env.OPENVIBE_DATABASE_URL;
    if (!databaseUrl) throw new Error('--database-url or OPENVIBE_STAGING_DATABASE_URL required');

    if (args.dryRun || !args.apply) {
        logger.info('Dry-run: would apply scripts/migrate-hobo/postgres/schema/*.sql');
        return;
    }

    const applied = await withClient({ databaseUrl }, async (client) => applySchema({ client }));
    logger.info(`Applied ${applied.length} schema files`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
