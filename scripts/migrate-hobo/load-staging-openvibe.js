#!/usr/bin/env node
'use strict';

const path = require('path');

const { createLogger, parseArgs } = require('./lib/common');
const { loadStagingBundle } = require('./lib/staging-loader');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BUNDLE = path.join(ROOT, 'data', 'migrations', 'hobo-production-staging', 'openvibe-target');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('load-staging-openvibe');

    const report = await loadStagingBundle({
        bundleDir: path.resolve(args.bundle || DEFAULT_BUNDLE),
        dbPaths: {
            network: args.networkDb,
            media: args.mediaDb,
            billing: args.billingDb,
            restream: args.restreamDb,
            live: args.liveDb,
            chat: args.chatDb,
            community: args.communityDb,
            games: args.gamesDb,
        },
        mode: args.mode,
        dryRun: !!args.dryRun,
        confirmLoad: !!args.confirmLoad,
        runId: args.runId,
        service: args.service,
        services: args.services,
        dataset: args.dataset,
        datasets: args.datasets,
        logger,
    });

    logger.info(`Datasets loaded: ${Object.keys(report.datasets).length}`);
    logger.info(`Manual actions flagged: ${report.manual_actions.length}`);
    logger.info(`Hobo Bucks exclusion confirmed: ${report.hobo_bucks_exclusion_confirmed}`);
    logger.info(`Effective mode: ${report.effective_mode} (${report.dry_run ? 'dry-run' : 'apply'})`);
}

main().catch((error) => {
    console.error(`[load-staging-openvibe] ❌ ${error.message}`);
    process.exit(1);
});
