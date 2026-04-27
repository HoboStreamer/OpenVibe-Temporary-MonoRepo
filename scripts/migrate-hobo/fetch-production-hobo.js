#!/usr/bin/env node
'use strict';

const path = require('path');

const { createLogger, parseArgs } = require('./lib/common');
const { fetchProductionArtifacts } = require('./lib/production-fetch');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'migrations', 'hobo-production-staging');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('fetch-production-hobo');

    const report = fetchProductionArtifacts({
        host: args.host || 'hobo.tools',
        user: args.user || null,
        remoteHobostreamerRoot: args.remoteHobostreamerRoot || null,
        remoteHobotoolsRoot: args.remoteHobotoolsRoot || null,
        remoteHobostreamerDb: args.remoteHobostreamerDb || null,
        remoteHobotoolsDb: args.remoteHobotoolsDb || null,
        outDir: path.resolve(args.out || DEFAULT_OUT),
        dryRun: !!args.dryRun,
        skipMedia: !!args.skipMedia,
        mediaMode: args.mediaMode || 'metadata-only',
        sshOptions: args.sshOptions || '',
        sshKey: args.sshKey || null,
        logger,
    });

    logger.info(`hobostreamer remote db: ${report.hobostreamer.remote_db || 'not discovered'}`);
    logger.info(`hobotools remote db: ${report.hobotools.remote_db || 'not discovered'}`);
    logger.info(`manual actions: ${report.manual_actions.length}`);
}

main().catch((error) => {
    console.error(`[fetch-production-hobo] ❌ ${error.message}`);
    process.exit(1);
});
