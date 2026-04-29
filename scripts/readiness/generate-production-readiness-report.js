#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { hostStatuses } = require('../../services/openvibe-content/server/ssr');
const contentConfig = require('../../services/openvibe-content/server/config');
const { checkScalableRuntime } = require('./check-scalable-runtime');
const { checkStorageProviders } = require('./check-storage-providers');
const { checkQueueHealth } = require('./check-queue-health');
const { checkRealtimeSocketIo } = require('./check-realtime-socketio');
const { checkMediaPipeline } = require('./check-media-pipeline');
const { checkNginxConfig } = require('./check-nginx-config');
const { checkCloudflareAssumptions } = require('./check-cloudflare-assumptions');
const { ensureDir, parseArgs, writeJson } = require('../migrate-hobo/lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'openvibe-production-readiness-report.json');

function summarizeStatuses(statuses) {
    return statuses.reduce((acc, status) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { green: 0, yellow: 0, red: 0 });
}

function readJsonIfExists(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function section(name, report, notes) {
    return {
        name,
        gate: report && report.gate || 'yellow',
        summary: report && report.summary || { green: 0, yellow: 1, red: 0 },
        notes: notes || null,
        report,
    };
}

function collectMigrationReadiness() {
    const auditRoot = path.join(ROOT, 'data', 'migrations', 'hobo-production-staging', 'openvibe-target', 'audit');
    const importReport = readJsonIfExists(path.join(auditRoot, 'import-report.json'));
    const validationSummary = readJsonIfExists(path.join(auditRoot, 'validation-summary.json'));
    const stagingLoad = readJsonIfExists(path.join(auditRoot, 'staging-load-report.json'));
    const mediaBackfill = readJsonIfExists(path.join(auditRoot, 'media-backfill-report.json'));
    const readiness = readJsonIfExists(path.join(auditRoot, 'readiness-report.json'));

    const missing = [];
    if (!importReport) missing.push('import-report.json');
    if (!validationSummary) missing.push('validation-summary.json');
    if (!stagingLoad) missing.push('staging-load-report.json');
    if (!mediaBackfill) missing.push('media-backfill-report.json');
    if (!readiness) missing.push('readiness-report.json');

    const gate = missing.length ? 'yellow' : (validationSummary && validationSummary.gate === 'red' ? 'red' : 'green');
    return {
        gate,
        summary: summarizeStatuses([gate]),
        artifacts: {
            import_report: !!importReport,
            validation_summary: !!validationSummary,
            staging_load: !!stagingLoad,
            media_backfill: !!mediaBackfill,
            readiness_report: !!readiness,
        },
        missing_artifacts: missing,
        import_report: importReport,
        validation_summary: validationSummary,
        staging_load: stagingLoad,
        media_backfill: mediaBackfill,
        readiness_report: readiness,
        continuation_points: missing.map((name) => `data/migrations/hobo-production-staging/openvibe-target/audit/${name}`),
    };
}

function collectPostgresReadiness() {
    const auditRoot = path.join(ROOT, 'data', 'migrations', 'hobo-production-staging', 'openvibe-target', 'audit');
    const loadReport = readJsonIfExists(path.join(auditRoot, 'postgres-load-report.json'));
    const validation = readJsonIfExists(path.join(auditRoot, 'postgres-validation.json'));
    const configured = !!(process.env.OPENVIBE_DATABASE_URL || process.env.OPENVIBE_STAGING_DATABASE_URL);
    const gate = validation
        ? (validation.gate || 'green')
        : (configured ? 'yellow' : 'red');
    return {
        gate,
        summary: summarizeStatuses([gate]),
        configured,
        load_report: loadReport,
        validation,
        continuation_points: validation ? [] : [
            'scripts/migrate-hobo/load-postgres.js',
            'scripts/migrate-hobo/validate-postgres.js',
        ],
        note: validation
            ? null
            : configured
                ? 'Database URL is configured, but no checked-in Postgres validation artifact is available yet.'
                : 'OPENVIBE_DATABASE_URL / OPENVIBE_STAGING_DATABASE_URL is not configured for a live Postgres validation run.',
    };
}

function collectAiSeoSourceSearchReadiness() {
    const routesPath = path.join(ROOT, 'services', 'openvibe-ai', 'server', 'routes.js');
    const source = fs.readFileSync(routesPath, 'utf8');
    const requiredMatchers = [
        '/seo/metadata',
        '/seo/indexability',
        '/seo/structured-data',
        '/sources',
        '/ingestion/jobs',
        '/search/status',
    ];
    const missing = requiredMatchers.filter((matcher) => !source.includes(matcher));
    const gate = missing.length ? 'red' : 'green';
    return {
        gate,
        summary: summarizeStatuses([gate]),
        missing_routes: missing,
        continuation_points: missing.length ? ['services/openvibe-ai/server/routes.js'] : [],
    };
}

function collectPublicContentRuntimeReadiness() {
    const surfaces = hostStatuses(contentConfig);
    const missingWaveOne = surfaces.filter((surface) => ['codes', 'blog', 'wiki'].includes(surface.surface) && !surface.implemented);
    const deferred = surfaces.filter((surface) => !surface.implemented).map((surface) => surface.surface);
    const gate = missingWaveOne.length ? 'red' : (deferred.length ? 'yellow' : 'green');
    return {
        gate,
        summary: summarizeStatuses([gate]),
        surfaces,
        deferred_hosts: deferred,
        continuation_points: missingWaveOne.length ? ['services/openvibe-content/server/ssr.js'] : [],
    };
}

function hasPartialBrowserSelection(artifact) {
    return !!(artifact
        && artifact.options
        && Array.isArray(artifact.options.only)
        && artifact.options.only.length);
}

function collectBrowserSmokeStatus() {
    const artifact = readJsonIfExists(path.join(ROOT, 'data', 'migrations', 'browser-smoke-report.json'))
        || readJsonIfExists(path.join(ROOT, 'data', 'readiness', 'browser-smoke-report.json'));
    const focusedContentArtifact = readJsonIfExists(path.join(ROOT, 'data', 'readiness', 'browser-smoke-content-report.json'));
    if (!artifact) {
        if (focusedContentArtifact) {
            return {
                gate: 'yellow',
                summary: summarizeStatuses(['yellow']),
                note: 'Only a focused content browser-smoke artifact is present; run npm run smoke:browser for full-stack browser coverage.',
                focused_content_artifact: focusedContentArtifact,
                continuation_points: ['scripts/staging/browser-smoke.js', 'scripts/staging/test/browser-smoke.test.js'],
            };
        }
        return {
            gate: 'yellow',
            summary: summarizeStatuses(['yellow']),
            note: 'Browser smoke artifact is not present yet; run npm run smoke:browser after the relevant services are started.',
            continuation_points: ['scripts/staging/browser-smoke.js', 'scripts/staging/test/browser-smoke.test.js'],
        };
    }
    if (hasPartialBrowserSelection(artifact)) {
        return {
            ...artifact,
            gate: artifact.gate === 'red' ? 'red' : 'yellow',
            partial: true,
            note: `Browser smoke artifact covers only selected checks (${artifact.options.only.join(', ')}); run npm run smoke:browser for full-stack browser coverage.`,
            focused_content_artifact: focusedContentArtifact || null,
        };
    }
    if (focusedContentArtifact) {
        return {
            ...artifact,
            focused_content_artifact: focusedContentArtifact,
        };
    }
    return artifact;
}

function collectKnownBlockers(sections) {
    const blockers = [];
    for (const entry of sections) {
        if (entry.gate !== 'red') continue;
        blockers.push({
            system: entry.name,
            reason: entry.report && entry.report.note || entry.notes || 'Section gate is red.',
            continuation_points: entry.report && entry.report.continuation_points || [],
        });
        for (const check of entry.report && entry.report.checks || []) {
            if (check.status === 'red') {
                blockers.push({
                    system: `${entry.name}:${check.name}`,
                    reason: check.message || 'Check is red.',
                    continuation_points: check.details && check.details.continuation_points || [],
                });
            }
        }
    }
    return blockers;
}

async function generateProductionReadinessReport(options = {}) {
    const scalableRuntime = await checkScalableRuntime(options);
    const storageProviders = await checkStorageProviders(options);
    const queueHealth = await checkQueueHealth(options);
    const realtimeSocketIo = await checkRealtimeSocketIo(options);
    const mediaPipeline = await checkMediaPipeline(options);
    const nginxConfig = await checkNginxConfig(options);
    const cloudflareAssumptions = await checkCloudflareAssumptions(options);
    const migrationReadiness = collectMigrationReadiness();
    const postgresReadiness = collectPostgresReadiness();
    const aiSeoSourceSearch = collectAiSeoSourceSearchReadiness();
    const publicContentRuntime = collectPublicContentRuntimeReadiness();
    const browserSmoke = collectBrowserSmokeStatus();

    const sections = [
        section('scalable_runtime', scalableRuntime),
        section('migration_readiness', migrationReadiness),
        section('postgres_readiness', postgresReadiness),
        section('storage_providers', storageProviders),
        section('queue_health', queueHealth),
        section('media_pipeline', mediaPipeline),
        section('ai_seo_source_search', aiSeoSourceSearch),
        section('public_content_runtime', publicContentRuntime),
        section('realtime_socketio', realtimeSocketIo),
        section('nginx_config', nginxConfig),
        section('cloudflare_assumptions', cloudflareAssumptions),
        section('browser_smoke', browserSmoke),
    ];

    const sectionStatuses = sections.map((entry) => entry.gate);
    const summary = summarizeStatuses(sectionStatuses);
    const gate = summary.red > 0 ? 'red' : summary.yellow > 0 ? 'yellow' : 'green';
    const report = {
        generated_at: new Date().toISOString(),
        mode: options.offline ? 'offline' : 'active',
        gate,
        summary,
        migration_readiness: migrationReadiness,
        postgres_readiness: postgresReadiness,
        redis_readiness: {
            gate: queueHealth.worker_config && queueHealth.worker_config.redis_url_configured ? 'green' : (String(process.env.OPENVIBE_ENV || process.env.NODE_ENV || 'local').toLowerCase() === 'production' ? 'red' : 'yellow'),
            configured: queueHealth.worker_config && queueHealth.worker_config.redis_url_configured,
        },
        queue_health: queueHealth,
        object_storage: storageProviders,
        media_pipeline: mediaPipeline,
        ai_seo_source_search: aiSeoSourceSearch,
        public_content_runtime: publicContentRuntime,
        realtime_socketio: realtimeSocketIo,
        nginx_config: nginxConfig,
        cloudflare_assumptions: cloudflareAssumptions,
        browser_smoke: browserSmoke,
        known_blockers: collectKnownBlockers(sections),
        sections,
    };
    return report;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await generateProductionReadinessReport({
        offline: !!args.offline,
        dryRun: !!args.dryRun,
        skipExternal: !!args.skipExternal,
    });
    const outFile = path.resolve(args.out || DEFAULT_OUT);
    ensureDir(path.dirname(outFile));
    writeJson(outFile, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.gate === 'red' ? 1 : 0);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    generateProductionReadinessReport,
};
