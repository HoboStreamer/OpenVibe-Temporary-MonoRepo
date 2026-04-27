#!/usr/bin/env node
'use strict';

const path = require('path');

const { createLogger, parseArgs } = require('./lib/common');
const { validateBundle } = require('./lib/validator');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BUNDLE = path.join(ROOT, 'data', 'migrations', 'hobo-cutover', 'openvibe-target');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('validate-migration');

    const bundleDir = path.resolve(args.bundle || DEFAULT_BUNDLE);
    const summary = await validateBundle({ bundleDir });

    logger.info(`Validation report written to ${path.join(bundleDir, 'audit', 'validation-summary.json')}`);
    logger.info(`Duplicate datasets: ${summary.duplicates.length}`);
    logger.info(`Missing refs: ${summary.missing_refs.length}`);
    logger.info(`Mismatches: ${summary.mismatches.length}`);

    if (!summary.ok) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(`[validate-migration] ❌ ${error.message}`);
    process.exit(1);
});
