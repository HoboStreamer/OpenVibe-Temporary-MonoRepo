#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const mediaConfig = require('../../services/openvibe-media/server/config');
const { ensureDir, parseArgs, writeJson } = require('../migrate-hobo/lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'media-pipeline-report.json');
const PUBLIC_MEDIA_OBJECT_MAX_BYTES = 500 * 1024 * 1024;
const TARGET_PUBLIC_OBJECT_MAX_BYTES = 256 * 1024 * 1024;
const WARN_PUBLIC_OBJECT_BYTES = 384 * 1024 * 1024;
const REQUIRED_PIPELINE_ROUTES = Object.freeze([
    { route: 'GET /media/:id/playback', matcher: "/media/:id/playback", continuation: 'services/openvibe-media/server/routes.js:playback route' },
    { route: 'POST /media/multipart/init', matcher: "/media/multipart/init", continuation: 'services/openvibe-media/server/routes.js:multipart routes' },
    { route: 'PUT /media/:id/upload', matcher: "/media/:id/upload", continuation: 'services/openvibe-media/server/routes.js:upload route' },
]);
const MISSING_TARGET_ROUTES = Object.freeze([
    { route: 'GET /streams/:streamId/playback', matcher: "/streams/:streamId/playback", continuation: 'services/openvibe-media/server/routes.js:stream playback metadata' },
    { route: 'GET /streams/:streamId/timeline', matcher: "/streams/:streamId/timeline", continuation: 'services/openvibe-media/server/routes.js:timeline metadata' },
    { route: 'GET /streams/:streamId/segments', matcher: "/streams/:streamId/segments", continuation: 'services/openvibe-media/server/routes.js:segment metadata' },
    { route: 'GET /streams/:streamId/preview-sprites', matcher: "/streams/:streamId/preview-sprites", continuation: 'services/openvibe-media/server/routes.js:preview sprites' },
    { route: 'POST /streams/:streamId/clips', matcher: "/streams/:streamId/clips", continuation: 'services/openvibe-media/server/routes.js:clip creation' },
    { route: 'GET /clips/:clipId', matcher: "/clips/:clipId", continuation: 'services/openvibe-media/server/routes.js:clip read/update' },
    { route: 'POST /media/:mediaId/analyze', matcher: "/media/:mediaId/analyze", continuation: 'services/openvibe-media/server/routes.js:media analysis seam' },
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

async function checkMediaPipeline(options = {}) {
    const offline = !!options.offline || !!options.skipExternal || !!options.dryRun;
    const routesSource = fs.readFileSync(path.join(ROOT, 'services', 'openvibe-media', 'server', 'routes.js'), 'utf8');
    const dbSource = fs.readFileSync(path.join(ROOT, 'services', 'openvibe-media', 'server', 'db.js'), 'utf8');
    const checks = [];

    for (const route of REQUIRED_PIPELINE_ROUTES) {
        const present = routesSource.includes(route.matcher);
        checks.push(buildCheck(
            `route:${route.route}`,
            present ? 'green' : 'red',
            { matcher: route.matcher, continuation: route.continuation },
            present ? null : `Required media route is missing: ${route.route}`,
        ));
    }

    const missingTargetRoutes = MISSING_TARGET_ROUTES.filter((route) => !routesSource.includes(route.matcher));
    checks.push(buildCheck(
        'target_stream_and_clip_routes',
        missingTargetRoutes.length ? 'red' : 'green',
        {
            missing_routes: missingTargetRoutes.map((route) => route.route),
            continuation_points: missingTargetRoutes.map((route) => route.continuation),
        },
        missingTargetRoutes.length ? 'Several DVR/clip/media-analysis target routes are not implemented yet.' : null,
    ));

    const tables = ['recording_segments', 'clip_projects', 'clip_exports', 'transcript_segments'];
    const missingTables = tables.filter((table) => !dbSource.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
    checks.push(buildCheck(
        'pipeline_schema_tables',
        missingTables.length ? 'red' : 'green',
        { expected_tables: tables, missing_tables: missingTables },
        missingTables.length ? 'Media schema is missing one or more recording/clip/transcript tables.' : null,
    ));

    checks.push(buildCheck(
        'public_playback_max_bytes',
        mediaConfig.storage.publicPlaybackMaxBytes === PUBLIC_MEDIA_OBJECT_MAX_BYTES ? 'green' : 'red',
        { expected: PUBLIC_MEDIA_OBJECT_MAX_BYTES, actual: mediaConfig.storage.publicPlaybackMaxBytes },
        mediaConfig.storage.publicPlaybackMaxBytes === PUBLIC_MEDIA_OBJECT_MAX_BYTES ? null : 'Media playback hard limit is not the required 500 MB value.',
    ));
    checks.push(buildCheck(
        'target_warn_thresholds',
        mediaConfig.storage.targetPublicObjectBytes === TARGET_PUBLIC_OBJECT_MAX_BYTES && mediaConfig.storage.warnPublicObjectBytes === WARN_PUBLIC_OBJECT_BYTES ? 'green' : 'yellow',
        {
            expected_target: TARGET_PUBLIC_OBJECT_MAX_BYTES,
            actual_target: mediaConfig.storage.targetPublicObjectBytes,
            expected_warn: WARN_PUBLIC_OBJECT_BYTES,
            actual_warn: mediaConfig.storage.warnPublicObjectBytes,
        },
        'Target/warn thresholds should be surfaced as 256 MB / 384 MB for operator reporting.',
    ));

    const summary = summarize(checks);
    const gate = summary.red > 0 ? 'red' : summary.yellow > 0 ? 'yellow' : 'green';
    return {
        generated_at: new Date().toISOString(),
        mode: offline ? 'offline' : 'active',
        gate,
        summary,
        object_limits: {
            public_max_bytes: mediaConfig.storage.publicPlaybackMaxBytes,
            target_bytes: mediaConfig.storage.targetPublicObjectBytes,
            warn_bytes: mediaConfig.storage.warnPublicObjectBytes,
        },
        checks,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await checkMediaPipeline({
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
    checkMediaPipeline,
};
