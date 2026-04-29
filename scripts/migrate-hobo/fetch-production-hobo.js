#!/usr/bin/env node
'use strict';

const path = require('path');

const { createLogger, parseArgs } = require('./lib/common');
const { resolveFetchCliOptions } = require('./lib/production-fetch-options');
const { fetchProductionArtifacts } = require('./lib/production-fetch');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'migrations', 'hobo-production-staging');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('fetch-production-hobo');
    const options = resolveFetchCliOptions({ args, defaultOut: DEFAULT_OUT });

    const report = fetchProductionArtifacts(Object.assign({}, options, { logger }));

    logger.info(`hobostreamer remote db: ${report.hobostreamer.remote_db || 'not discovered'}`);
    logger.info(`hobotools remote db: ${report.hobotools.remote_db || 'not discovered'}`);
    logger.info(`hoboquest remote db: ${report.hoboquest.remote_db || 'not discovered'}`);
    logger.info(`fetch mode: ${report.dry_run ? 'dry-run' : 'confirmed copy'}`);
    logger.info(`manual actions: ${report.manual_actions.length}`);

    if (options.summary) {
        console.log(JSON.stringify({
            generated_at: report.generated_at,
            dry_run: report.dry_run,
            confirm_used: report.confirm_used,
            selected_paths: report.selected_paths,
            warnings: report.warnings,
            manual_actions: report.manual_actions,
        }, null, 2));
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[fetch-production-hobo] ❌ ${error.message}`);
        process.exit(1);
    });
}

module.exports = { main };
