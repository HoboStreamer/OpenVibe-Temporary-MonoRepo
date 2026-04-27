#!/usr/bin/env node
'use strict';

const path = require('path');
const { parseArgs, createLogger, writeJson, ensureDir } = require('./lib/common');
const { validate } = require('./lib/postgres-validator');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('validate-postgres');
    const databaseUrl = args.databaseUrl || process.env.OPENVIBE_STAGING_DATABASE_URL || process.env.OPENVIBE_DATABASE_URL;
    if (!databaseUrl) throw new Error('--database-url or OPENVIBE_STAGING_DATABASE_URL required');

    const report = await validate({ databaseUrl });
    if (args.out) {
        ensureDir(args.out);
        writeJson(path.join(args.out, 'postgres-validation.json'), report);
    }
    logger.info(`tables=${report.tables.length} missing=${report.missing_tables.length}`);
    for (const check of report.checks) logger.info(`  - [${check.status}] ${check.name}: ${check.detail}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
