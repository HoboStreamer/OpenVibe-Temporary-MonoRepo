#!/usr/bin/env node
'use strict';

const path = require('path');

const { createLogger, parseArgs, toInt } = require('./lib/common');
const { exportSource } = require('./lib/exporter');

const ROOT = path.resolve(__dirname, '..', '..');
const LEGACY_ROOT = path.resolve(ROOT, 'HoboReposToMigrateFrom', 'HoboApp', 'hobo-tools');
const DEFAULT_DB = path.join(LEGACY_ROOT, 'data', 'hobo-tools.db');
const DEFAULT_OUT = path.join(ROOT, 'data', 'migrations', 'hobo-cutover');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('export-hobotools');

    const dbPath = path.resolve(args.db || DEFAULT_DB);
    const outDir = path.resolve(args.out || DEFAULT_OUT);
    const legacyRoot = path.resolve(args.legacyRoot || LEGACY_ROOT);
    const batchSize = toInt(args.batchSize, 500);
    const dryRun = !!args.dryRun;

    const manifest = await exportSource({
        sourceName: 'hobotools',
        dbPath,
        outDir,
        batchSize,
        legacyRoot,
        dryRun,
        logger,
    });

    logger.info(`Finished. Exported ${Object.keys(manifest.tables).length} table plans.`);
    for (const [tableName, info] of Object.entries(manifest.tables)) {
        if (info.missing) {
            logger.warn(`Skipped missing table ${tableName}`);
            continue;
        }
        logger.info(`${tableName}: ${info.exportedRows} rows`);
    }
    logger.info(`Excluded entities recorded: ${manifest.exclusions.length}`);
}

main().catch((error) => {
    console.error(`[export-hobotools] ❌ ${error.message}`);
    process.exit(1);
});
