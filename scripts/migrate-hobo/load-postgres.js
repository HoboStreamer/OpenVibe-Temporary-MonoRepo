#!/usr/bin/env node
'use strict';

const path = require('path');
const { parseArgs, createLogger, writeJson, ensureDir } = require('./lib/common');
const { loadBundleWithUrl } = require('./lib/postgres-loader');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('load-postgres');
    const databaseUrl = args.databaseUrl || process.env.OPENVIBE_STAGING_DATABASE_URL || process.env.OPENVIBE_DATABASE_URL;
    if (!databaseUrl) throw new Error('--database-url or OPENVIBE_STAGING_DATABASE_URL required');
    if (!args.bundle) throw new Error('--bundle <openvibe-target dir> required');

    const runId = args.runId || `phase9-${Date.now()}`;
    const dryRun = !!args.dryRun || !args.apply;

    const report = await loadBundleWithUrl({
        databaseUrl,
        bundleDir: path.resolve(args.bundle),
        runId,
        dryRun,
        only: args.only || null,
        batchSize: Number(args.batchSize) || 500,
        applyMigrations: !!args.apply,
    });

    const outDir = args.out
        ? path.resolve(args.out)
        : path.join(path.resolve(args.bundle), 'audit');
    ensureDir(outDir);
    writeJson(path.join(outDir, 'postgres-load-report.json'), report);
    logger.info(`Wrote ${path.join(outDir, 'postgres-load-report.json')} (dry_run=${dryRun})`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
