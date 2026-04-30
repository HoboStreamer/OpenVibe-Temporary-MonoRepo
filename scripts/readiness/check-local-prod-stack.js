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
const COMPOSE_FILE = path.join(ROOT, 'deploy', 'compose', 'docker-compose.local.yml');
const START_SCRIPT = path.join(ROOT, 'scripts', 'dev', 'start-production-like-stack.sh');
const STOP_SCRIPT = path.join(ROOT, 'scripts', 'dev', 'stop-production-like-stack.sh');
const WAIT_SCRIPT = path.join(ROOT, 'scripts', 'dev', 'wait-for-stack.js');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'local-prod-stack-report.json');
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_INTERVAL_MS = 5000;
const REQUIRED_SERVICES = Object.freeze([
    'postgres',
    'redis',
    'nginx',
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
const APP_SERVICES = Object.freeze(REQUIRED_SERVICES.filter((name) => !['postgres', 'redis', 'nginx'].includes(name)));
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

function parseComposeServices(source) {
    const lines = String(source || '').split(/\r?\n/);
    const services = {};
    let inServices = false;
    let currentService = null;
    let currentLines = [];

    function flush() {
        if (!currentService) return;
        services[currentService] = currentLines.join('\n');
    }

    for (const line of lines) {
        if (!inServices) {
            if (/^services:\s*$/.test(line)) {
                inServices = true;
            }
            continue;
        }

        if (/^[^\s].*:\s*$/.test(line) && !/^services:\s*$/.test(line)) {
            flush();
            currentService = null;
            currentLines = [];
            break;
        }

        const serviceMatch = /^  ([a-zA-Z0-9_-]+):\s*$/.exec(line);
        if (serviceMatch) {
            flush();
            currentService = serviceMatch[1];
            currentLines = [];
            continue;
        }

        if (currentService) {
            currentLines.push(line);
        }
    }

    flush();
    return services;
}

function readCompose() {
    try {
        const source = fs.readFileSync(COMPOSE_FILE, 'utf8');
        return {
            exists: true,
            source,
            services: parseComposeServices(source),
        };
    } catch {
        return {
            exists: false,
            source: '',
            services: {},
        };
    }
}

async function checkLocalProdStack(options = {}) {
    const compose = readCompose();
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
        'compose_file_present',
        compose.exists ? 'green' : 'red',
        compose.exists ? null : 'deploy/compose/docker-compose.local.yml is missing.',
        { compose_file: COMPOSE_FILE },
    ));

    const missingServices = REQUIRED_SERVICES.filter((name) => !compose.services[name]);
    checks.push(createCheck(
        'compose_service_coverage',
        missingServices.length ? 'red' : 'green',
        missingServices.length ? `Compose file is missing services: ${missingServices.join(', ')}` : null,
        {
            required: REQUIRED_SERVICES,
            missing: missingServices,
        },
    ));

    const postgresModeMissing = PERSISTENCE_SERVICES.filter((name) => !/OPENVIBE_PERSISTENCE_MODE:\s*postgres\b/.test(compose.services[name] || ''));
    checks.push(createCheck(
        'postgres_runtime_mode',
        postgresModeMissing.length ? 'red' : 'green',
        postgresModeMissing.length ? `These services are not pinned to Postgres mode: ${postgresModeMissing.join(', ')}` : null,
        { missing: postgresModeMissing },
    ));

    const databaseUrlMissing = PERSISTENCE_SERVICES.filter((name) => !/OPENVIBE_DATABASE_URL:\s*postgresql:\/\//.test(compose.services[name] || ''));
    const stagingDatabaseUrlMissing = PERSISTENCE_SERVICES.filter((name) => !/OPENVIBE_STAGING_DATABASE_URL:\s*postgresql:\/\//.test(compose.services[name] || ''));
    checks.push(createCheck(
        'postgres_urls_configured',
        databaseUrlMissing.length || stagingDatabaseUrlMissing.length ? 'red' : 'green',
        databaseUrlMissing.length || stagingDatabaseUrlMissing.length
            ? 'One or more services are missing explicit Postgres connection URLs in compose.'
            : null,
        {
            missing_database_url: databaseUrlMissing,
            missing_staging_database_url: stagingDatabaseUrlMissing,
        },
    ));

    const redisUrlMissing = APP_SERVICES.filter((name) => !/OPENVIBE_REDIS_URL:\s*redis:\/\//.test(compose.services[name] || ''));
    checks.push(createCheck(
        'redis_runtime_configured',
        redisUrlMissing.length ? 'red' : 'green',
        redisUrlMissing.length ? `These services are missing OPENVIBE_REDIS_URL: ${redisUrlMissing.join(', ')}` : null,
        { missing: redisUrlMissing },
    ));

    const workersBlock = compose.services.workers || '';
    const mediaBlock = compose.services.media || '';
    const workersEnabled = /OPENVIBE_WORKER_ENABLE_PROCESSORS:\s*['"]?true['"]?/i.test(workersBlock);
    const mediaUsesWorkers = /OPENVIBE_MEDIA_USE_WORKERS:\s*['"]?true['"]?/i.test(mediaBlock);
    checks.push(createCheck(
        'worker_pipeline_enabled',
        workersEnabled && mediaUsesWorkers ? 'green' : 'red',
        workersEnabled && mediaUsesWorkers
            ? null
            : 'Media external queueing or worker processors are not enabled in compose.',
        {
            worker_processors_enabled: workersEnabled,
            media_uses_workers: mediaUsesWorkers,
        },
    ));

    const nginxBlock = compose.services.nginx || '';
    checks.push(createCheck(
        'nginx_localhost_gateway',
        /network_mode:\s*host\b/.test(nginxBlock) ? 'green' : 'red',
        /network_mode:\s*host\b/.test(nginxBlock)
            ? null
            : 'The Nginx compose service must use host networking because the checked-in upstream config targets 127.0.0.1:* ports.',
        {
            network_mode_host: /network_mode:\s*host\b/.test(nginxBlock),
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
        compose_file: COMPOSE_FILE,
        scripts: {
            start: START_SCRIPT,
            stop: STOP_SCRIPT,
            wait: WAIT_SCRIPT,
        },
        checks,
        required_services: REQUIRED_SERVICES,
        compose_services: Object.keys(compose.services),
        active_probe: activeProbe,
        continuation_points: checks
            .filter((check) => check.status !== 'green')
            .flatMap((check) => {
                switch (check.name) {
                case 'local_stack_scripts':
                    return ['scripts/dev/start-production-like-stack.sh', 'scripts/dev/stop-production-like-stack.sh', 'scripts/dev/wait-for-stack.js'];
                case 'compose_file_present':
                case 'compose_service_coverage':
                case 'postgres_runtime_mode':
                case 'postgres_urls_configured':
                case 'redis_runtime_configured':
                case 'worker_pipeline_enabled':
                case 'nginx_localhost_gateway':
                    return ['deploy/compose/docker-compose.local.yml'];
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
