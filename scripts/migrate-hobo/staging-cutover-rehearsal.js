#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { createLogger, parseArgs } = require('./lib/common');
const { exportSource } = require('./lib/exporter');
const { importCanonicalBundle } = require('./lib/importer');
const { resolveLegacyArtifactSummary } = require('./lib/legacy-source-roots');
const { validateBundle } = require('./lib/validator');
const { fetchProductionArtifacts } = require('./lib/production-fetch');
const { resolveFetchCliOptions } = require('./lib/production-fetch-options');
const { loadStagingBundle, resolveServiceDbPaths } = require('./lib/staging-loader');
const { backfillMedia } = require('./lib/media-backfill');
const { buildReadinessReport } = require('./lib/readiness');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_WORKDIR = path.join(ROOT, 'data', 'migrations', 'hobo-production-staging');
const DEFAULT_HOT_ROOT = path.join(ROOT, 'services', 'openvibe-media', 'data', 'storage', 'hot');

function artifactSummary(sourceDir, args) {
    return resolveLegacyArtifactSummary({ sourceDir, args });
}

function requireSourceArtifacts(sourceDir, args) {
    const summary = artifactSummary(sourceDir, args);
    const missing = [];
    if (!summary.hobostreamer_db || !fs.existsSync(summary.hobostreamer_db)) missing.push(summary.hobostreamer_db || 'hobostreamer db');
    if (!summary.hobotools_db || !fs.existsSync(summary.hobotools_db)) missing.push(summary.hobotools_db || 'hobotools db');
    if (!summary.hobostreamer_root || !fs.existsSync(summary.hobostreamer_root)) missing.push(summary.hobostreamer_root || 'hobostreamer root');
    if (missing.length) {
        throw new Error(`Missing legacy source inputs: ${missing.join(', ')}. Provide --legacy-source-root or per-source --hobostreamer-root/--hobotools-root/--hoboquest-root overrides when production-source artifacts are unavailable.`);
    }
    return summary;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('staging-cutover');

    const sourceDir = path.resolve(args.source || args.out || DEFAULT_WORKDIR);
    const outDir = path.resolve(args.out || sourceDir);
    const bundleDir = path.join(outDir, 'openvibe-target');
    const dbPaths = resolveServiceDbPaths({
        network: args.networkDb,
        media: args.mediaDb,
        billing: args.billingDb,
        restream: args.restreamDb,
        live: args.liveDb,
        chat: args.chatDb,
        community: args.communityDb,
        games: args.gamesDb,
    });

    if (args.host || args.fetchProduction) {
        const fetchOptions = resolveFetchCliOptions({ args, defaultOut: sourceDir });
        fetchProductionArtifacts(Object.assign({}, fetchOptions, {
            outDir: sourceDir,
            logger,
        }));
        if (fetchOptions.dryRun) {
            logger.info('Dry-run requested: stopping after production fetch planning.');
            return;
        }
    }

    const artifacts = requireSourceArtifacts(sourceDir, args);

    logger.info('Exporting read-only HoboStreamer snapshot into NDJSON tables');
    await exportSource({
        sourceName: 'hobostreamer',
        dbPath: artifacts.hobostreamer_db,
        outDir,
        batchSize: Number.parseInt(args.batchSize, 10) || 500,
        legacyRoot: artifacts.hobostreamer_root,
        dryRun: false,
        logger,
    });

    logger.info('Exporting read-only hobo-tools snapshot into NDJSON tables');
    await exportSource({
        sourceName: 'hobotools',
        dbPath: artifacts.hobotools_db,
        outDir,
        batchSize: Number.parseInt(args.batchSize, 10) || 500,
        legacyRoot: artifacts.hobotools_root,
        dryRun: false,
        logger,
    });

    if (artifacts.hoboquest_db && fs.existsSync(artifacts.hoboquest_db)) {
        logger.info('Exporting read-only HoboQuest snapshot into NDJSON tables');
        await exportSource({
            sourceName: 'hoboquest',
            dbPath: artifacts.hoboquest_db,
            outDir,
            batchSize: Number.parseInt(args.batchSize, 10) || 500,
            legacyRoot: artifacts.hoboquest_root,
            dryRun: false,
            logger,
        });
    } else {
        logger.warn(`HoboQuest SQLite snapshot not found at ${artifacts.hoboquest_db}; continuing without quest/canvas export.`);
    }

    logger.info('Building canonical OpenVibe bundle');
    await importCanonicalBundle({
        sourceDir: outDir,
        outDir,
        logger,
    });

    logger.info('Validating canonical bundle integrity');
    await validateBundle({ bundleDir });

    if (args.loadStaging === false || args.noLoadStaging) {
        logger.info('Skipping staging SQLite hydration because --no-load-staging was supplied.');
        return;
    }

    logger.info('Hydrating current OpenVibe staging SQLite stores');
    await loadStagingBundle({
        bundleDir,
        dbPaths,
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

    logger.info('Backfilling hot media storage from copied staging artifacts');
    await backfillMedia({
        bundleDir,
        legacyRoot: artifacts.hobostreamer_root,
        mediaDbPath: dbPaths.media,
        hotRoot: path.resolve(args.hotRoot || process.env.OPENVIBE_MEDIA_HOT_ROOT || DEFAULT_HOT_ROOT),
        publicBaseUrl: args.publicBaseUrl || process.env.OPENVIBE_MEDIA_PUBLIC_BASE_URL || 'http://127.0.0.1:4500',
        providerName: args.providerName || args.storageProvider || null,
        prune: !!args.prune,
        dryRun: false,
        logger,
    });

    logger.info('Running staging readiness checks');
    const readiness = await buildReadinessReport({
        bundleDir,
        dbPaths,
        networkUrl: args.networkUrl || process.env.OPENVIBE_NETWORK_URL || 'http://127.0.0.1:4100',
        mediaUrl: args.mediaUrl || process.env.OPENVIBE_MEDIA_URL || 'http://127.0.0.1:4500',
        liveUrl: args.liveUrl || process.env.OPENVIBE_LIVE_URL || 'http://127.0.0.1:4600',
        chatUrl: args.chatUrl || process.env.OPENVIBE_CHAT_URL || 'http://127.0.0.1:4800',
        communityUrl: args.communityUrl || process.env.OPENVIBE_COMMUNITY_URL || 'http://127.0.0.1:4900',
        eventsUrl: args.eventsUrl || process.env.OPENVIBE_EVENTS_URL || 'http://127.0.0.1:4400',
    });

    logger.info(`Readiness summary: ${readiness.summary.green} green, ${readiness.summary.yellow} yellow, ${readiness.summary.red} red`);
}

main().catch((error) => {
    console.error(`[staging-cutover-rehearsal] ❌ ${error.message}`);
    process.exit(1);
});
