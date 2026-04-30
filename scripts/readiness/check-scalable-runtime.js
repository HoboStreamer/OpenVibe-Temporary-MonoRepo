#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { ensureDir, parseArgs, writeJson } = require('../migrate-hobo/lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const LEGACY_REPORT_PATH = path.join(ROOT, 'data', 'migrations', 'runtime-readiness-report.json');
const DEFAULT_REPORT_PATH = path.join(ROOT, 'data', 'readiness', 'scalable-runtime-report.json');

function exists(relPath) {
    return fs.existsSync(path.join(ROOT, relPath));
}

function readJson(relPath) {
    try {
        return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
    } catch {
        return null;
    }
}

function buildCheck(name, status, details, message) {
    return {
        name,
        status,
        details: details || null,
        message: message || null,
    };
}

function summarize(checks) {
    const summary = { green: 0, yellow: 0, red: 0 };
    for (const check of checks) summary[check.status] += 1;
    return summary;
}

async function checkScalableRuntime(options = {}) {
    const checks = [];

    for (const relPath of [
        'packages/openvibe-runtime/index.js',
        'packages/openvibe-observability/index.js',
        'packages/openvibe-persistence/index.js',
        'packages/openvibe-redis/index.js',
        'packages/openvibe-queue/index.js',
        'packages/openvibe-sdk/url-defaults.js',
        'deploy/nginx/nginx.conf',
        'deploy/nginx/mime.types',
        'deploy/nginx/conf.d/openvibe.conf',
        'deploy/nginx/conf.d/security-headers.conf',
        'deploy/nginx/conf.d/proxy-cache.conf',
        'deploy/cloudflare/cloudflare-rules.md',
        'deploy/cloudflare/cache-rules.md',
        'deploy/cloudflare/waf-rules.md',
        'deploy/cloudflare/dns.md',
        'deploy/env/openvibe.production.example.env',
        'deploy/compose/docker-compose.local.yml',
        '.github/workflows/ci.yml',
        'context/PHASE_10_SCALING.md',
        'scripts/readiness/check-storage-providers.js',
        'scripts/readiness/check-queue-health.js',
        'scripts/readiness/check-media-pipeline.js',
        'scripts/readiness/check-realtime-socketio.js',
        'scripts/readiness/check-nginx-config.js',
        'scripts/readiness/check-cloudflare-assumptions.js',
        'scripts/readiness/generate-production-readiness-report.js',
        'scripts/dev/install-fontawesome-pro-local.js',
        'scripts/dev/test/install-fontawesome-pro-local.test.js',
        'scripts/staging/browser-smoke.js',
        'scripts/staging/browser-smoke-playwright.js',
        'scripts/staging/test/browser-smoke.test.js',
        'scripts/staging/test/browser-smoke-playwright.test.js',
        'packages/openvibe-icons/test/icons.test.js',
        'services/openvibe-workers/server/index.js',
        'services/openvibe-realtime/server/index.js',
        'services/openvibe-content/server/index.js',
    ]) {
        checks.push(buildCheck(
            `file:${relPath}`,
            exists(relPath) ? 'green' : 'red',
            { path: relPath },
            exists(relPath) ? null : 'Required scalable runtime artifact is missing.',
        ));
    }

    const rootPackage = readJson('package.json') || {};
    const readinessScript = rootPackage.scripts && rootPackage.scripts.readiness || null;
    checks.push(buildCheck(
        'root_script:readiness',
        readinessScript && readinessScript.includes('generate-production-readiness-report.js') ? 'green' : 'yellow',
        { script: readinessScript },
        readinessScript && readinessScript.includes('generate-production-readiness-report.js')
            ? null
            : 'Root readiness script does not yet point at the aggregate production-readiness report generator.',
    ));

    for (const serviceName of [
        'openvibe-network',
        'openvibe-events',
        'openvibe-media',
        'openvibe-live',
        'openre-stream',
        'openvibe-chat',
        'openvibe-community',
        'openvibe-billing',
        'openvibe-ai',
        'openvibe-games',
        'openvibe-workers',
        'openvibe-realtime',
        'openvibe-content',
    ]) {
        const pkg = readJson(path.join('services', serviceName, 'package.json')) || {};
        checks.push(buildCheck(
            `service:${serviceName}:runtime_dependency`,
            pkg.dependencies && pkg.dependencies['@openvibe/runtime'] ? 'green' : 'red',
            { dependency: pkg.dependencies && pkg.dependencies['@openvibe/runtime'] || null },
            pkg.dependencies && pkg.dependencies['@openvibe/runtime'] ? null : 'Service does not yet depend on @openvibe/runtime.',
        ));
    }

    const summary = summarize(checks);
    const gate = summary.red > 0 ? 'red' : summary.yellow > 0 ? 'yellow' : 'green';
    return {
        phase: 10,
        track: 'scalable-runtime-foundation',
        mode: options.offline ? 'offline' : 'filesystem',
        checked_at: new Date().toISOString(),
        gate,
        summary,
        checks,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await checkScalableRuntime({ offline: !!args.offline });
    const outFile = path.resolve(args.out || DEFAULT_REPORT_PATH);
    ensureDir(path.dirname(outFile));
    writeJson(outFile, report);
    ensureDir(path.dirname(LEGACY_REPORT_PATH));
    writeJson(LEGACY_REPORT_PATH, report);
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
    checkScalableRuntime,
};
