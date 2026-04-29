#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const realtimeConfig = require('../../services/openvibe-realtime/server/config');
const { buildApp } = require('../../services/openvibe-realtime/server/index');
const { ensureDir, parseArgs, writeJson } = require('../migrate-hobo/lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'realtime-socketio-report.json');
const REQUIRED_NAMESPACES = Object.freeze(['/realtime', '/chat', '/live', '/community', '/media', '/clips', '/billing', '/ai', '/notifications', '/admin', '/games']);

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

async function checkRealtimeSocketIo(options = {}) {
    const offline = !!options.offline || !!options.skipExternal || !!options.dryRun;
    const runtimeSource = fs.readFileSync(path.join(ROOT, 'services', 'openvibe-realtime', 'server', 'socket-runtime.js'), 'utf8');
    const { socketRuntime, eventBridge } = buildApp();
    const summaryState = socketRuntime.summary();
    await eventBridge.start().catch(() => {});
    const bridgeState = eventBridge.summary();
    await socketRuntime.stop().catch(() => {});
    await eventBridge.stop().catch(() => {});

    const namespaceNames = summaryState.namespaces.map((entry) => entry.namespace).sort();
    const missingNamespaces = REQUIRED_NAMESPACES.filter((name) => !namespaceNames.includes(name));
    const websocketOnly = /transports:\s*\[\s*'websocket'\s*\]/.test(runtimeSource);
    const pollingEnabled = /'polling'/.test(runtimeSource);
    const checks = [];

    checks.push(buildCheck(
        'namespace_coverage',
        missingNamespaces.length ? 'red' : 'green',
        { namespaces: namespaceNames, missing_namespaces: missingNamespaces },
        missingNamespaces.length ? 'Realtime gateway is missing required namespaces for the production-shaped plan.' : null,
    ));
    checks.push(buildCheck(
        'default_transport_policy',
        websocketOnly && !pollingEnabled ? 'green' : 'red',
        { websocket_only: websocketOnly, polling_enabled: pollingEnabled },
        websocketOnly && !pollingEnabled ? null : 'Realtime still allows polling by default instead of websocket-only transport.',
    ));
    checks.push(buildCheck(
        'redis_adapter_configured',
        realtimeConfig.redisUrl ? 'green' : (isLocalLikeEnv() ? 'yellow' : 'red'),
        { configured: !!realtimeConfig.redisUrl, redis_url: realtimeConfig.redisUrl || null },
        realtimeConfig.redisUrl ? null : 'Redis Streams adapter is not configured; fanout remains single-node only.',
    ));
    checks.push(buildCheck(
        'presence_ttl',
        realtimeConfig.presenceTtlSeconds > 0 ? 'green' : 'red',
        { ttl_seconds: realtimeConfig.presenceTtlSeconds },
        realtimeConfig.presenceTtlSeconds > 0 ? null : 'Presence TTL must be greater than zero.',
    ));
    checks.push(buildCheck(
        'event_bridge_mode',
        bridgeState.mode === 'redis-stream' ? 'green' : (bridgeState.mode === 'polling' ? 'yellow' : 'red'),
        bridgeState,
        bridgeState.mode === 'redis-stream'
            ? null
            : bridgeState.mode === 'polling'
                ? 'Realtime bridge is running in HTTP polling fallback mode.'
                : 'Realtime event bridge is missing or disabled.',
    ));

    const summary = summarize(checks);
    const gate = summary.red > 0 ? 'red' : summary.yellow > 0 ? 'yellow' : 'green';
    return {
        generated_at: new Date().toISOString(),
        mode: offline ? 'offline' : 'active',
        gate,
        summary,
        realtime_config: {
            redis_url_configured: !!realtimeConfig.redisUrl,
            allow_anonymous: !!realtimeConfig.allowAnonymous,
            presence_ttl_seconds: realtimeConfig.presenceTtlSeconds,
        },
        namespaces: namespaceNames,
        continuation_points: missingNamespaces.length || bridgeState.mode === 'disabled' ? [
            'services/openvibe-realtime/server/socket-runtime.js:namespaces',
            'services/openvibe-realtime/server/socket-runtime.js:transport config',
            'services/openvibe-realtime/server/event-bridge.js',
        ] : [],
        checks,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await checkRealtimeSocketIo({
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
    checkRealtimeSocketIo,
};
