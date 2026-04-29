#!/usr/bin/env node
'use strict';

const path = require('path');

const { createStorageManager } = require('../../packages/openvibe-storage');
const mediaConfig = require('../../services/openvibe-media/server/config');
const { ensureDir, parseArgs, writeJson } = require('../migrate-hobo/lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'storage-providers-report.json');
const PUBLIC_MEDIA_OBJECT_MAX_BYTES = 500 * 1024 * 1024;
const TARGET_PUBLIC_OBJECT_MAX_BYTES = 256 * 1024 * 1024;
const WARN_PUBLIC_OBJECT_BYTES = 384 * 1024 * 1024;

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

async function checkStorageProviders(options = {}) {
    const storage = createStorageManager(mediaConfig.storage);
    const plan = storage.describePlan();
    const offline = !!options.offline || !!options.skipExternal || !!options.dryRun;
    const providerHealth = await storage.healthCheck({ mode: offline ? 'headOnly' : 'probe' });
    const selectedProviders = new Set([
        plan.canonical_provider,
        plan.hot_provider,
        plan.asset_origin_provider,
    ].filter(Boolean));

    const checks = [];
    checks.push(buildCheck(
        'public_playback_max_bytes',
        mediaConfig.storage.publicPlaybackMaxBytes === PUBLIC_MEDIA_OBJECT_MAX_BYTES ? 'green' : 'red',
        {
            expected: PUBLIC_MEDIA_OBJECT_MAX_BYTES,
            actual: mediaConfig.storage.publicPlaybackMaxBytes,
        },
        mediaConfig.storage.publicPlaybackMaxBytes === PUBLIC_MEDIA_OBJECT_MAX_BYTES
            ? null
            : 'openvibe-media still advertises the wrong public playback hard limit.',
    ));
    checks.push(buildCheck(
        'target_public_object_bytes',
        mediaConfig.storage.targetPublicObjectBytes === TARGET_PUBLIC_OBJECT_MAX_BYTES ? 'green' : 'yellow',
        {
            expected: TARGET_PUBLIC_OBJECT_MAX_BYTES,
            actual: mediaConfig.storage.targetPublicObjectBytes,
        },
        mediaConfig.storage.targetPublicObjectBytes === TARGET_PUBLIC_OBJECT_MAX_BYTES
            ? null
            : 'Target public object size is not exposed as the expected 256 MB value.',
    ));
    checks.push(buildCheck(
        'warn_public_object_bytes',
        mediaConfig.storage.warnPublicObjectBytes === WARN_PUBLIC_OBJECT_BYTES ? 'green' : 'yellow',
        {
            expected: WARN_PUBLIC_OBJECT_BYTES,
            actual: mediaConfig.storage.warnPublicObjectBytes,
        },
        mediaConfig.storage.warnPublicObjectBytes === WARN_PUBLIC_OBJECT_BYTES
            ? null
            : 'Warning public object size is not exposed as the expected 384 MB value.',
    ));

    for (const provider of providerHealth.checks || []) {
        const selected = selectedProviders.has(provider.provider);
        let status = 'green';
        let message = null;
        if (!provider.ok) {
            if (provider.configured === false) {
                status = selected ? (isLocalLikeEnv() && provider.provider === 'local' ? 'green' : 'red') : 'yellow';
                message = selected
                    ? `Selected provider '${provider.provider}' is not configured.`
                    : `Optional provider '${provider.provider}' is not configured.`;
            } else {
                status = selected ? 'red' : 'yellow';
                message = provider.error || `Provider '${provider.provider}' failed its health check.`;
            }
        }
        checks.push(buildCheck(
            `provider:${provider.provider}`,
            status,
            {
                selected,
                configured: provider.configured !== false,
                provider,
            },
            message,
        ));
    }

    if (plan.canonical_provider === 'local' && !isLocalLikeEnv()) {
        checks.push(buildCheck(
            'canonical_provider_is_local',
            'red',
            { canonical_provider: plan.canonical_provider, env: process.env.OPENVIBE_ENV || process.env.NODE_ENV || 'local' },
            'Local filesystem storage is still the canonical media store outside local/dev.',
        ));
    } else if (plan.canonical_provider === 'local') {
        checks.push(buildCheck(
            'canonical_provider_is_local',
            'yellow',
            { canonical_provider: plan.canonical_provider },
            'Local filesystem storage remains the canonical provider in local/dev. Production should switch to B2/S3-compatible durable storage.',
        ));
    }

    const summary = summarize(checks);
    const gate = summary.red > 0 ? 'red' : summary.yellow > 0 ? 'yellow' : 'green';
    return {
        generated_at: new Date().toISOString(),
        mode: offline ? 'offline' : 'active',
        gate,
        summary,
        storage_plan: plan,
        provider_health: providerHealth.checks || [],
        checks,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await checkStorageProviders({
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
    checkStorageProviders,
};
