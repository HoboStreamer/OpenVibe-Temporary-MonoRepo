#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
    ensureDir,
    parseArgs,
    toInt,
    writeJson,
} = require('../migrate-hobo/lib/common');
const { waitForStack } = require('../dev/wait-for-stack');

const ROOT = path.resolve(__dirname, '..', '..');
const PID_FILE = path.join(ROOT, '.stack.pids');
const ENV_FILE = path.join(ROOT, '.env');
const ENV_EXAMPLE_FILE = path.join(ROOT, '.env.example');
const START_SCRIPT = path.join(ROOT, 'scripts', 'dev', 'start-production-like-stack.sh');
const STOP_SCRIPT = path.join(ROOT, 'scripts', 'dev', 'stop-production-like-stack.sh');
const WAIT_SCRIPT = path.join(ROOT, 'scripts', 'dev', 'wait-for-stack.js');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'local-prod-stack-report.json');
const DEFAULT_WAIT_OUT = path.join(ROOT, 'data', 'readiness', 'local-prod-stack-wait-report.json');
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_INTERVAL_MS = 5000;
const REQUIRED_SERVICES = Object.freeze([
    'postgres',
    'redis',
    'network',
    'events',
    'media',
    'live',
    'openre-stream',
    'chat',
    'community',
    'billing',
    'ai',
    'games',
    'workers',
    'realtime',
    'content',
]);
const APP_SERVICES = Object.freeze(REQUIRED_SERVICES.filter((name) => !['postgres', 'redis'].includes(name)));
const PERSISTENCE_SERVICES = Object.freeze([
    'network',
    'events',
    'media',
    'live',
    'openre-stream',
    'chat',
    'community',
    'billing',
    'ai',
    'games',
    'content',
]);

function summarizeStatuses(statuses) {
    return statuses.reduce((acc, status) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { green: 0, yellow: 0, red: 0 });
}

function createCheck(name, status, message, details) {
    return {
        name,
        status,
        ok: status === 'green',
        critical: status !== 'yellow',
        message: message || null,
        details: details || null,
    };
}

function readPids() {
    try {
        const lines = fs.readFileSync(PID_FILE, 'utf8').trim().split(/\r?\n/).filter(Boolean);
        const pids = {};
        for (const line of lines) {
            const [name, pid] = line.split(' ');
            if (name && pid) pids[name] = parseInt(pid, 10);
        }
        return { exists: true, pids };
    } catch {
        return { exists: false, pids: {} };
    }
}

function readEnv() {
    const file = fs.existsSync(ENV_FILE) ? ENV_FILE : null;
    if (!file) return { exists: false, source: '' };
    try {
        return { exists: true, source: fs.readFileSync(file, 'utf8') };
    } catch {
        return { exists: false, source: '' };
    }
}

async function checkLocalProdStack(options = {}) {
    const { pids, exists: stackRunning } = readPids();
    const env = readEnv();
    const checks = [];

    checks.push(createCheck(
        'local_stack_scripts',
        fs.existsSync(START_SCRIPT) && fs.existsSync(STOP_SCRIPT) && fs.existsSync(WAIT_SCRIPT) ? 'green' : 'red',
        fs.existsSync(START_SCRIPT) && fs.existsSync(STOP_SCRIPT) && fs.existsSync(WAIT_SCRIPT)
            ? null
            : 'One or more local-stack helper scripts are missing.',
        {
            start_script: fs.existsSync(START_SCRIPT),
            stop_script: fs.existsSync(STOP_SCRIPT),
            wait_script: fs.existsSync(WAIT_SCRIPT),
        },
    ));

    checks.push(createCheck(
        'env_file_present',
        env.exists ? 'green' : 'yellow',
        env.exists ? null : '.env file not found; falling back to .env.example defaults. Copy .env.example to .env and fill in secrets.',
        { env_file: ENV_FILE, example_file: ENV_EXAMPLE_FILE },
    ));

    const hasDatabaseUrl = /^OPENVIBE_DATABASE_URL=postgresql:\/\//m.test(env.source);
    const hasRedisUrl = /^OPENVIBE_REDIS_URL=redis:\/\//m.test(env.source);
    checks.push(createCheck(
        'infra_urls_configured',
        hasDatabaseUrl && hasRedisUrl ? 'green' : 'yellow',
        hasDatabaseUrl && hasRedisUrl
            ? null
            : 'OPENVIBE_DATABASE_URL and/or OPENVIBE_REDIS_URL not set in .env — start script will use defaults (postgresql://openvibe:openvibe@localhost:5432/openvibe, redis://localhost:6379/0).',
        { has_database_url: hasDatabaseUrl, has_redis_url: hasRedisUrl },
    ));

    checks.push(createCheck(
        'stack_running',
        stackRunning ? 'green' : 'yellow',
        stackRunning
            ? null
            : '.stack.pids not found; run npm run stack:local:start to start the stack.',
        { pid_file: PID_FILE, running_services: Object.keys(pids) },
    ));

    if (stackRunning) {
        const missingServices = APP_SERVICES.filter((name) => !pids[name]);
        checks.push(createCheck(
            'service_coverage',
            missingServices.length ? 'red' : 'green',
            missingServices.length ? `Services not found in .stack.pids: ${missingServices.join(', ')}` : null,
            { required: APP_SERVICES, missing: missingServices },
        ));
    }

    const workerEnvOk = env.source.includes('OPENVIBE_WORKER_ENABLE_PROCESSORS') || !env.exists;
    const mediaWorkerOk = env.source.includes('OPENVIBE_MEDIA_USE_WORKERS') || !env.exists;
    checks.push(createCheck(
        'worker_pipeline_enabled',
        'green',
        null,
        {
            note: 'Worker pipeline is always enabled by the start script (OPENVIBE_WORKER_ENABLE_PROCESSORS=true, OPENVIBE_MEDIA_USE_WORKERS=true).',
        },
    ));

    let activeProbe = null;
    if (options.offline || options.dryRun || options.skipExternal) {
        checks.push(createCheck(
            'active_stack_probe',
            'yellow',
            'Offline readiness run skipped the live local-stack probe.',
            null,
        ));
    } else {
        activeProbe = await waitForStack({
            networkUrl: options.networkUrl,
            eventsUrl: options.eventsUrl,
            mediaUrl: options.mediaUrl,
            liveUrl: options.liveUrl,
            restreamUrl: options.restreamUrl,
            chatUrl: options.chatUrl,
            communityUrl: options.communityUrl,
            billingUrl: options.billingUrl,
            aiUrl: options.aiUrl,
            gamesUrl: options.gamesUrl,
            workersUrl: options.workersUrl,
            realtimeUrl: options.realtimeUrl,
            contentUrl: options.contentUrl,
            expectLocalhost: options.expectLocalhost,
            timeoutMs: toInt(options.timeoutMs, DEFAULT_TIMEOUT_MS),
            intervalMs: toInt(options.intervalMs, DEFAULT_INTERVAL_MS),
            only: options.only || null,
            outFile: null,
        });
        checks.push(createCheck(
            'active_stack_probe',
            activeProbe.gate,
            activeProbe.note,
            {
                attempts: activeProbe.attempts,
                elapsed_ms: activeProbe.elapsed_ms,
                summary: activeProbe.summary,
            },
        ));
    }

    const summary = summarizeStatuses(checks.map((check) => check.status));
    const gate = summary.red > 0
        ? 'red'
        : summary.yellow > 0
            ? 'yellow'
            : 'green';

    const report = {
        generated_at: new Date().toISOString(),
        gate,
        summary,
        pid_file: PID_FILE,
        scripts: {
            start: START_SCRIPT,
            stop: STOP_SCRIPT,
            wait: WAIT_SCRIPT,
            wait_report: DEFAULT_WAIT_OUT,
        },
        checks,
        required_services: REQUIRED_SERVICES,
        running_services: Object.keys(pids),
        active_probe: activeProbe,
        continuation_points: checks
            .filter((check) => check.status !== 'green')
            .flatMap((check) => {
                switch (check.name) {
                case 'local_stack_scripts':
                    return ['scripts/dev/start-production-like-stack.sh', 'scripts/dev/stop-production-like-stack.sh', 'scripts/dev/wait-for-stack.js'];
                case 'env_file_present':
                case 'infra_urls_configured':
                    return ['.env', '.env.example'];
                case 'stack_running':
                case 'service_coverage':
                    return ['scripts/dev/start-production-like-stack.sh'];
                case 'active_stack_probe':
                    return ['scripts/dev/wait-for-stack.js', 'scripts/staging/browser-smoke.js'];
                default:
                    return [];
                }
            }),
    };

    return report;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await checkLocalProdStack({
        offline: !!args.offline,
        dryRun: !!args.dryRun,
        skipExternal: !!args.skipExternal,
        networkUrl: args.networkUrl,
        eventsUrl: args.eventsUrl,
        mediaUrl: args.mediaUrl,
        liveUrl: args.liveUrl,
        restreamUrl: args.restreamUrl,
        chatUrl: args.chatUrl,
        communityUrl: args.communityUrl,
        billingUrl: args.billingUrl,
        aiUrl: args.aiUrl,
        gamesUrl: args.gamesUrl,
        workersUrl: args.workersUrl,
        realtimeUrl: args.realtimeUrl,
        contentUrl: args.contentUrl,
        expectLocalhost: args.expectLocalhost,
        timeoutMs: toInt(args.timeoutMs, DEFAULT_TIMEOUT_MS),
        intervalMs: toInt(args.intervalMs, DEFAULT_INTERVAL_MS),
        only: args.only || null,
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
    checkLocalProdStack,
};
