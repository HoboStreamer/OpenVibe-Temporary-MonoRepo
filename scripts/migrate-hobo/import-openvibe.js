#!/usr/bin/env node
'use strict';

const path = require('path');

const { createLogger, parseArgs } = require('./lib/common');
const { importCanonicalBundle } = require('./lib/importer');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SOURCE = path.join(ROOT, 'data', 'migrations', 'hobo-cutover');
const DEFAULT_OUT = DEFAULT_SOURCE;

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('import-openvibe');

    const sourceDir = path.resolve(args.source || DEFAULT_SOURCE);
    const outDir = path.resolve(args.out || DEFAULT_OUT);

    const report = await importCanonicalBundle({
        sourceDir,
        outDir,
        logger,
    });

    logger.info(`Bundle written to ${report.bundle_dir}`);
    for (const [dataset, info] of Object.entries(report.datasets)) {
        logger.info(`${dataset}: wrote ${info.written_records} rows`);
    }
    logger.info(`Canonical users: ${report.user_merge.canonical_users}`);
    logger.info(`Username conflicts needing review: ${report.user_merge.username_conflicts}`);
}

main().catch((error) => {
    console.error(`[import-openvibe] ❌ ${error.message}`);
    process.exit(1);
});
