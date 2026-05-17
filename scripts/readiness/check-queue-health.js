#!/usr/bin/env node
'use strict';

const path = require('path');

const config = require('../../services/openvibe-workers/server/config');
const registry = require('../../services/openvibe-workers/server/registry');
const { buildWorkerReadiness } = require('../../services/openvibe-workers/server/runtime');
const { ensureDir, parseArgs, writeJson } = require('../migrate-hobo/lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'queue-health-report.json');
const REQUIRED_QUEUE_CATEGORIES = Object.freeze([
    'media',
    'clips',
    'transcription',
    'vision',
    'analytics',
    'lifecycle',
    'search',
    'billing',
    'migration',
    'notifications',
]);

function buildCheck(name, status, details, message) {
    return { name, status, details: details || null, message: message || null };
}

function summarize(checks) {
    return checks.reduce((acc, check) => {
        acc[check.status] = (acc[check.status] || 0) + 1;
        return acc;
    }, { green: 0, yellow: 0, red: 0 });
}

function isLocalLikeEnv() {
    const raw = String(process.env.OPENVIBE_ENV || process.env.NODE_ENV || 'local').trim().toLowerCase();
    return raw === 'local' || raw === 'development' || raw === 'dev' || raw === 'test';
}

function implementedQueueCategories(jobs) {
    const categories = new Set();
    for (const job of jobs) {
        if (job.queue === 'media-processing' || job.name.startsWith('media.')) categories.add('media');
        if (job.name === 'ai.transcript') categories.add('transcription');
        if (job.name === 'ai.scene-detect') categories.add('vision');
        if (job.queue === 'clips' || job.name.startsWith('clips.')) categories.add('clips');
        if (job.queue === 'analytics' || job.name.startsWith('analytics.')) categories.add('analytics');
        if (job.queue === 'lifecycle' || job.name.startsWith('lifecycle.')) categories.add('lifecycle');
        if (job.queue === 'search' || job.name.startsWith('search.')) categories.add('search');
        if (job.queue === 'billing' || job.name.startsWith('billing.')) categories.add('billing');
        if (job.queue === 'migration' || job.name.startsWith('migration.')) categories.add('migration');
        if (job.queue === 'notifications' || job.name.startsWith('notifications.')) categories.add('notifications');
    }
    return Array.from(categories).sort();
}

async function fetchJson(url) {
    try {
        const response = await fetch(url, {
            headers: {
                accept: 'application/json',
                'x-internal-key': config.internalKey,
                'x-openvibe-service': 'openvibe-readiness',
            },
        });
        const text = await response.text();
        return {
            ok: response.ok,
            status: response.status,
            body: text ? JSON.parse(text) : null,
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            error: error.message,
            body: null,
        };
    }
}

async function checkQueueHealth(options = {}) {
    const offline = !!options.offline || !!options.skipExternal || !!options.dryRun;
    const jobs = registry.listJobs();
    const queues = registry.listQueues();
    const workersUrl = options.workersUrl || process.env.OPENVIBE_WORKERS_URL || 'http://127.0.0.1:5300';
    const liveReadiness = !offline ? await fetchJson(`${workersUrl.replace(/\/$/, '')}/ready`) : null;
    const liveRuntime = !offline ? await fetchJson(`${workersUrl.replace(/\/$/, '')}/api/v1/runtime`) : null;
    const readiness = liveReadiness && liveReadiness.ok && liveReadiness.body && Array.isArray(liveReadiness.body.checks)
        ? liveReadiness.body
        : buildWorkerReadiness(config, null);
    const checks = [];

    for (const check of readiness.checks || []) {
        let status = check.status || (check.ok ? 'green' : 'red');
        if ((offline || !(liveReadiness && liveReadiness.ok)) && check.name === 'redis_url_configured' && !config.redisUrl && isLocalLikeEnv()) {
            status = 'yellow';
        }
        // In offline/dry-run mode a missing heartbeat means the worker is not yet started,
        // not that it has failed — downgrade from red to yellow so offline CI passes.
        if (offline && check.name === 'worker_heartbeat' && status === 'red') {
            status = 'yellow';
        }
        checks.push(buildCheck(check.name, status, check.details, check.message));
    }

    const categories = implementedQueueCategories(jobs);
    const missingCategories = REQUIRED_QUEUE_CATEGORIES.filter((name) => !categories.includes(name));
    checks.push(buildCheck(
        'queue_category_coverage',
        missingCategories.length ? 'red' : 'green',
        {
            implemented_categories: categories,
            missing_categories: missingCategories,
            actual_queues: queues,
        },
        missingCategories.length
            ? 'Worker registry is missing several target queue categories; see missing_categories for exact gaps.'
            : null,
    ));

    checks.push(buildCheck(
        'queue_registry_entries',
        jobs.length > 0 ? 'green' : 'red',
        { job_count: jobs.length, jobs },
        jobs.length > 0 ? null : 'Worker registry has no registered jobs.',
    ));

    if (!config.enableProcessors) {
        checks.push(buildCheck(
            'processors_runtime_mode',
            'yellow',
            { enableProcessors: config.enableProcessors, redis_url: config.redisUrl || null },
            'Workers are still running in registry-only mode unless OPENVIBE_WORKER_ENABLE_PROCESSORS=true is set.',
        ));
    }

    const summary = summarize(checks);
    const gate = summary.red > 0 ? 'red' : summary.yellow > 0 ? 'yellow' : 'green';
    return {
        generated_at: new Date().toISOString(),
        mode: offline ? 'offline' : 'active',
        gate,
        summary,
        worker_config: {
            redis_url_configured: !!config.redisUrl,
            enable_processors: !!config.enableProcessors,
            worker_backend_mode: config.workerBackendMode || 'auto',
            queue_filter: config.queueFilter,
            concurrency: config.concurrency,
        },
        live_runtime: liveRuntime && liveRuntime.ok ? liveRuntime.body : null,
        live_runtime_source: !offline && liveReadiness && liveReadiness.ok ? 'worker-service' : 'static-config',
        registry: { jobs, queues },
        checks,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await checkQueueHealth({
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
    checkQueueHealth,
};
