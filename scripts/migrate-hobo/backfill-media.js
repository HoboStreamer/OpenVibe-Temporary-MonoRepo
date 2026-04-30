#!/usr/bin/env node
'use strict';

const path = require('path');

const { createLogger, parseArgs } = require('./lib/common');
const { backfillMedia } = require('./lib/media-backfill');
const { resolveLegacySource } = require('./lib/legacy-source-roots');
const { resolveServiceDbPaths } = require('./lib/service-paths');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SOURCE = path.join(ROOT, 'data', 'migrations', 'hobo-production-staging');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('backfill-media');
    const dbPaths = resolveServiceDbPaths({ media: args.mediaDb });
    const source = resolveLegacySource('hobostreamer', {
        explicitRoot: args.legacyRoot,
        sharedRoot: args.legacySourceRoot || args.sharedLegacyRoot,
        sourceDir: args.source || DEFAULT_SOURCE,
    });

    if (!source.legacyRoot) {
        throw new Error('Unable to resolve HoboStreamer legacy root for media backfill. Provide --legacy-root or --legacy-source-root.');
    }

    const report = await backfillMedia({
        bundleDir: path.resolve(args.bundle || path.join(args.out || DEFAULT_SOURCE, 'openvibe-target')),
        legacyRoot: path.resolve(source.legacyRoot),
        mediaDbPath: dbPaths.media,
        hotRoot: path.resolve(args.hotRoot || process.env.OPENVIBE_MEDIA_HOT_ROOT || path.join(ROOT, 'services', 'openvibe-media', 'data', 'storage', 'hot')),
        publicBaseUrl: args.publicBaseUrl || process.env.OPENVIBE_MEDIA_PUBLIC_BASE_URL || 'http://127.0.0.1:4500',
        dryRun: !!args.dryRun,
        strict: !!args.strict,
        logger,
    });

    logger.info(`Copied records: ${report.copied_records}`);
    logger.info(`Missing files: ${report.missing_files.length}`);
}

main().catch((error) => {
    console.error(`[backfill-media] ❌ ${error.message}`);
    process.exit(1);
});
