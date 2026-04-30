#!/usr/bin/env node
'use strict';

const path = require('path');

const {
    ensureDir,
    parseArgs,
    toInt,
    writeJson,
} = require('../migrate-hobo/lib/common');
const {
    DEFAULT_URLS,
    runBrowserSmoke,
} = require('../staging/browser-smoke');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'local-prod-stack-wait-report.json');
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_INTERVAL_MS = 5000;
const FALSEY = new Set(['0', 'false', 'no', 'off', '']);

function readFlag(value, fallbackValue) {
    if (value == null) return fallbackValue;
    if (typeof value === 'boolean') return value;
    return !FALSEY.has(String(value).trim().toLowerCase());
}

function withDefinedValues(source) {
    return Object.fromEntries(Object.entries(source || {}).filter(([, value]) => value !== undefined));
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStack(options = {}) {
    const resolved = Object.assign({}, DEFAULT_URLS, withDefinedValues(options));
    resolved.timeoutMs = toInt(resolved.timeoutMs, DEFAULT_TIMEOUT_MS);
    resolved.intervalMs = toInt(resolved.intervalMs, DEFAULT_INTERVAL_MS);
    if (resolved.expectLocalhost == null) {
        resolved.expectLocalhost = true;
    }

    const startedAt = Date.now();
    let attempts = 0;
    let lastSmoke = null;
    let ready = false;

    do {
        attempts += 1;
        lastSmoke = await runBrowserSmoke({
            networkUrl: resolved.networkUrl,
            eventsUrl: resolved.eventsUrl,
            mediaUrl: resolved.mediaUrl,
            liveUrl: resolved.liveUrl,
            restreamUrl: resolved.restreamUrl,
            chatUrl: resolved.chatUrl,
            communityUrl: resolved.communityUrl,
            billingUrl: resolved.billingUrl,
            aiUrl: resolved.aiUrl,
            gamesUrl: resolved.gamesUrl,
            workersUrl: resolved.workersUrl,
            realtimeUrl: resolved.realtimeUrl,
            contentUrl: resolved.contentUrl,
            expectLocalhost: resolved.expectLocalhost,
            only: resolved.only || null,
            outFile: null,
        });

        ready = lastSmoke.summary.red === 0;
        if (ready) break;

        if (Date.now() - startedAt >= resolved.timeoutMs) break;
        await delay(resolved.intervalMs);
    } while (Date.now() - startedAt < resolved.timeoutMs);

    const elapsedMs = Date.now() - startedAt;
    const report = {
        generated_at: new Date().toISOString(),
        gate: ready ? lastSmoke.gate : 'red',
        summary: lastSmoke ? lastSmoke.summary : { green: 0, yellow: 0, red: 1 },
        attempts,
        elapsed_ms: elapsedMs,
        timeout_ms: resolved.timeoutMs,
        interval_ms: resolved.intervalMs,
        selected_checks: lastSmoke && lastSmoke.options && Array.isArray(lastSmoke.options.only)
            ? lastSmoke.options.only
            : [],
        reached_steady_state: ready,
        note: ready
            ? 'All selected browser-smoke checks stopped returning red responses.'
            : 'Timed out while waiting for the selected browser-smoke checks to stop returning red responses.',
        smoke: lastSmoke,
    };

    if (resolved.outFile) {
        ensureDir(path.dirname(resolved.outFile));
        writeJson(resolved.outFile, report);
    }

    return report;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await waitForStack({
        networkUrl: args.networkUrl || DEFAULT_URLS.networkUrl,
        eventsUrl: args.eventsUrl || DEFAULT_URLS.eventsUrl,
        mediaUrl: args.mediaUrl || DEFAULT_URLS.mediaUrl,
        liveUrl: args.liveUrl || DEFAULT_URLS.liveUrl,
        restreamUrl: args.restreamUrl || DEFAULT_URLS.restreamUrl,
        chatUrl: args.chatUrl || DEFAULT_URLS.chatUrl,
        communityUrl: args.communityUrl || DEFAULT_URLS.communityUrl,
        billingUrl: args.billingUrl || DEFAULT_URLS.billingUrl,
        aiUrl: args.aiUrl || DEFAULT_URLS.aiUrl,
        gamesUrl: args.gamesUrl || DEFAULT_URLS.gamesUrl,
        workersUrl: args.workersUrl || DEFAULT_URLS.workersUrl,
        realtimeUrl: args.realtimeUrl || DEFAULT_URLS.realtimeUrl,
        contentUrl: args.contentUrl || DEFAULT_URLS.contentUrl,
        expectLocalhost: readFlag(args.expectLocalhost, true),
        timeoutMs: toInt(args.timeoutMs, DEFAULT_TIMEOUT_MS),
        intervalMs: toInt(args.intervalMs, DEFAULT_INTERVAL_MS),
        only: args.only || null,
        outFile: path.resolve(args.out || DEFAULT_OUT),
    });

    console.log(`[wait-for-stack] gate=${report.gate} attempts=${report.attempts} elapsed_ms=${report.elapsed_ms}`);
    if (report.smoke && Array.isArray(report.smoke.checks)) {
        for (const check of report.smoke.checks) {
            const prefix = check.status === 'green' ? '✓' : check.status === 'yellow' ? '!' : '✗';
            console.log(`  ${prefix} ${check.id}: ${check.detail}`);
        }
    }

    if (report.gate === 'red') {
        process.exitCode = 2;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[wait-for-stack] ❌ ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    waitForStack,
};
