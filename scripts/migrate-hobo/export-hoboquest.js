#!/usr/bin/env node
'use strict';

const path = require('path');

const { createLogger, parseArgs, toInt } = require('./lib/common');
const { exportSource } = require('./lib/exporter');
const { resolveLegacySource } = require('./lib/legacy-source-roots');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'migrations', 'hobo-cutover');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('export-hoboquest');
    const source = resolveLegacySource('hoboquest', {
        explicitRoot: args.legacyRoot,
        explicitDbPath: args.db,
        sharedRoot: args.legacySourceRoot || args.sharedLegacyRoot,
    });

    if (!source.dbPath) {
        throw new Error('Unable to resolve HoboQuest SQLite path. Provide --db or --legacy-source-root/--legacy-root.');
    }
    if (!source.legacyRoot) {
        throw new Error('Unable to resolve HoboQuest legacy root. Provide --legacy-root or --legacy-source-root.');
    }

    const dbPath = path.resolve(source.dbPath);
    const outDir = path.resolve(args.out || DEFAULT_OUT);
    const legacyRoot = path.resolve(source.legacyRoot);
    const batchSize = toInt(args.batchSize, 500);
    const dryRun = !!args.dryRun;

    logger.info(`Resolved legacy root: ${legacyRoot}`);
    logger.info(`Resolved SQLite path: ${dbPath}`);

    const manifest = await exportSource({
        sourceName: 'hoboquest',
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
    console.error(`[export-hoboquest] ❌ ${error.message}`);
    process.exit(1);
});