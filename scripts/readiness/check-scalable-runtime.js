#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_PATH = path.join(ROOT, 'data', 'migrations', 'runtime-readiness-report.json');
const args = new Set(process.argv.slice(2));

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

const checks = [];

for (const relPath of [
    'packages/openvibe-runtime/index.js',
    'packages/openvibe-observability/index.js',
    'packages/openvibe-persistence/index.js',
    'packages/openvibe-redis/index.js',
    'packages/openvibe-queue/index.js',
    'deploy/nginx/nginx.conf',
    'deploy/nginx/conf.d/openvibe.conf',
    'deploy/env/openvibe.production.example.env',
    'deploy/compose/docker-compose.local.yml',
    '.github/workflows/ci.yml',
    'context/PHASE_10_SCALING.md',
    'services/openvibe-workers/server/index.js',
]) {
    checks.push(buildCheck(
        `file:${relPath}`,
        exists(relPath) ? 'green' : 'red',
        { path: relPath },
        exists(relPath) ? null : 'Required scalable runtime artifact is missing.',
    ));
}

const rootPackage = readJson('package.json') || {};
checks.push(buildCheck(
    'root_script:readiness',
    rootPackage.scripts && rootPackage.scripts.readiness ? 'green' : 'yellow',
    { script: rootPackage.scripts && rootPackage.scripts.readiness || null },
    rootPackage.scripts && rootPackage.scripts.readiness ? null : 'Root readiness script is not yet registered in package.json.',
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
]) {
    const pkg = readJson(path.join('services', serviceName, 'package.json')) || {};
    checks.push(buildCheck(
        `service:${serviceName}:runtime_dependency`,
        pkg.dependencies && pkg.dependencies['@openvibe/runtime'] ? 'green' : 'red',
        { dependency: pkg.dependencies && pkg.dependencies['@openvibe/runtime'] || null },
        pkg.dependencies && pkg.dependencies['@openvibe/runtime'] ? null : 'Service does not yet depend on @openvibe/runtime.',
    ));
}

const summary = { green: 0, yellow: 0, red: 0 };
for (const check of checks) summary[check.status] += 1;

const gate = summary.red > 0 ? 'red' : summary.yellow > 0 ? 'yellow' : 'green';
const report = {
    phase: 10,
    track: 'scalable-runtime-foundation',
    mode: args.has('--offline') ? 'offline' : 'filesystem',
    checked_at: new Date().toISOString(),
    gate,
    summary,
    checks,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(gate === 'red' ? 1 : 0);
