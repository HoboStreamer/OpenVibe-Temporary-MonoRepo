'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const Database = require('better-sqlite3');

const { loadJson, writeJson } = require('./common');
const { resolveServiceDbPaths } = require('./service-paths');

function openDb(filePath) {
    return new Database(path.resolve(filePath), { fileMustExist: true, readonly: true });
}

function countRows(db, sql, args) {
    const row = db.prepare(sql).get(...(args || []));
    return row ? row.count : 0;
}

function hasTable(db, tableName) {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
}

function readHoldingRows(db, dataset) {
    if (!hasTable(db, 'staging_import_records')) return [];
    return db.prepare('SELECT payload_json FROM staging_import_records WHERE dataset = ?').all(dataset)
        .map((row) => {
            try {
                return JSON.parse(row.payload_json || '{}');
            } catch {
                return {};
            }
        });
}

function firstLiveSlug(db) {
    if (!hasTable(db, 'live_channels')) return null;
    const row = db.prepare('SELECT slug FROM live_channels ORDER BY rowid ASC LIMIT 1').get();
    return row ? row.slug : null;
}

function requestUrl(options, requester) {
    if (requester) {
        return requester(options);
    }

    return new Promise((resolve) => {
        const url = new URL(options.url);
        const client = url.protocol === 'https:' ? https : http;
        const req = client.request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: options.timeoutMs || 3000,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    headers: res.headers,
                    body,
                });
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error('timeout'));
        });
        req.on('error', (error) => {
            resolve({ ok: false, status: 0, headers: {}, body: '', error: error.message });
        });
        req.end();
    });
}

function pushCheck(target, check) {
    target.push(check);
}

function summarizeChecks(checks) {
    return checks.reduce((summary, check) => {
        summary[check.status] = (summary[check.status] || 0) + 1;
        return summary;
    }, { green: 0, yellow: 0, red: 0 });
}

function buildDatasetChecks(dbs, importReport, mediaBackfillReport, stagingLoadReport) {
    const checks = [];

    const networkUsers = readHoldingRows(dbs.network, 'identity/users');
    const linkedAccounts = readHoldingRows(dbs.network, 'identity/linked-accounts');
    const hoboToolsUsers = networkUsers.filter((row) => row.primary_source === 'hobotools' || (row.source_profiles && row.source_profiles.hobotools));
    const themes = readHoldingRows(dbs.network, 'themes/catalog');
    const themePreferences = readHoldingRows(dbs.network, 'themes/preferences');
    const urlOverlayCount = hasTable(dbs.network, 'url_registry_overlay')
        ? countRows(dbs.network, 'SELECT COUNT(*) AS count FROM url_registry_overlay')
        : 0;
    const liveChannels = hasTable(dbs.live, 'live_channels')
        ? countRows(dbs.live, 'SELECT COUNT(*) AS count FROM live_channels')
        : 0;
    const liveStreams = hasTable(dbs.live, 'live_streams')
        ? countRows(dbs.live, 'SELECT COUNT(*) AS count FROM live_streams')
        : 0;
    const chatMessages = hasTable(dbs.chat, 'chat_messages')
        ? countRows(dbs.chat, 'SELECT COUNT(*) AS count FROM chat_messages')
        : 0;
    const communityPastes = hasTable(dbs.community, 'community_pastes')
        ? countRows(dbs.community, 'SELECT COUNT(*) AS count FROM community_pastes')
        : 0;
    const communityPosts = hasTable(dbs.community, 'community_posts')
        ? countRows(dbs.community, 'SELECT COUNT(*) AS count FROM community_posts')
        : 0;
    const mediaObjects = hasTable(dbs.media, 'media_objects')
        ? countRows(dbs.media, 'SELECT COUNT(*) AS count FROM media_objects')
        : 0;
    const billingSubscriptions = readHoldingRows(dbs.billing, 'billing/subscriptions').length;
    const loyaltyRows = [
        ...readHoldingRows(dbs.billing, 'loyalty/coin-transactions'),
        ...readHoldingRows(dbs.billing, 'loyalty/coin-rewards'),
        ...readHoldingRows(dbs.billing, 'loyalty/coin-redemptions'),
        ...readHoldingRows(dbs.billing, 'loyalty/watch-time'),
    ].length;
    const exclusionEntities = new Set((importReport.exclusions || []).map((entry) => entry.entity));
    const missingMediaCount = (mediaBackfillReport && mediaBackfillReport.missing_files && mediaBackfillReport.missing_files.length) || 0;
    const stagingManualActions = (stagingLoadReport && stagingLoadReport.manual_actions) || [];

    pushCheck(checks, {
        name: 'migrated-users-loaded',
        status: networkUsers.length > 0 ? 'green' : 'red',
        detail: `${networkUsers.length} canonical users staged in openvibe-network`,
    });
    pushCheck(checks, {
        name: 'linked-accounts-preserved',
        status: linkedAccounts.length > 0 ? 'green' : 'yellow',
        detail: `${linkedAccounts.length} linked accounts staged`,
    });
    pushCheck(checks, {
        name: 'legacy-hobotools-users-present',
        status: hoboToolsUsers.length > 0 ? 'green' : 'yellow',
        detail: `${hoboToolsUsers.length} hobo-tools-primary users staged for login rehearsal`,
    });
    pushCheck(checks, {
        name: 'themes-present',
        status: themes.length > 0 && themePreferences.length > 0 ? 'green' : 'yellow',
        detail: `${themes.length} themes and ${themePreferences.length} theme preferences staged`,
    });
    pushCheck(checks, {
        name: 'url-registry-present',
        status: urlOverlayCount > 0 ? 'green' : 'yellow',
        detail: `${urlOverlayCount} url registry overlay rows loaded`,
    });
    pushCheck(checks, {
        name: 'live-data-present',
        status: liveChannels > 0 && liveStreams > 0 ? 'green' : 'red',
        detail: `${liveChannels} live channels and ${liveStreams} live streams loaded`,
    });
    pushCheck(checks, {
        name: 'chat-messages-present',
        status: chatMessages > 0 ? 'green' : 'red',
        detail: `${chatMessages} chat messages loaded`,
    });
    pushCheck(checks, {
        name: 'community-pastes-comments-present',
        status: communityPastes > 0 && communityPosts > 0 ? 'green' : 'yellow',
        detail: `${communityPastes} pastes and ${communityPosts} community posts/comments loaded`,
    });
    pushCheck(checks, {
        name: 'media-metadata-present',
        status: mediaObjects > 0 ? 'green' : 'red',
        detail: `${mediaObjects} media objects loaded`,
    });
    pushCheck(checks, {
        name: 'missing-media-diagnostics',
        status: missingMediaCount === 0 ? 'green' : 'red',
        detail: `${missingMediaCount} media files missing from local staging artifacts`,
    });
    pushCheck(checks, {
        name: 'billing-subscriptions-staged',
        status: billingSubscriptions > 0 ? 'yellow' : 'yellow',
        detail: `${billingSubscriptions} legacy subscriptions staged in holding tables`,
    });
    pushCheck(checks, {
        name: 'loyalty-datasets-staged',
        status: loyaltyRows > 0 ? 'green' : 'yellow',
        detail: `${loyaltyRows} loyalty rows staged`,
    });
    pushCheck(checks, {
        name: 'hobo-bucks-excluded',
        status: exclusionEntities.has('users.hobo_bucks_balance') && exclusionEntities.has('transactions') ? 'green' : 'red',
        detail: 'Required Hobo Bucks exclusions present in import audit',
    });
    pushCheck(checks, {
        name: 'staging-manual-actions',
        status: stagingManualActions.length === 0 ? 'green' : 'yellow',
        detail: `${stagingManualActions.length} loader manual-action notes recorded`,
    });

    return checks;
}

async function buildRouteChecks(options) {
    const checks = [];
    const networkBase = options.networkUrl || 'http://127.0.0.1:4100';
    const mediaBase = options.mediaUrl || 'http://127.0.0.1:4500';
    const liveBase = options.liveUrl || 'http://127.0.0.1:4600';
    const chatBase = options.chatUrl || 'http://127.0.0.1:4800';
    const communityBase = options.communityUrl || 'http://127.0.0.1:4900';
    const eventsBase = options.eventsUrl || 'http://127.0.0.1:4400';
    const requester = options.requester;
    const liveSlug = options.liveSlug || null;

    const probes = [
        {
            name: 'network-health',
            request: { url: `${networkBase}/health` },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'openvibe-network /health responded' : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'auth-openid-configuration',
            request: { url: `${networkBase}/.well-known/openid-configuration`, headers: { Host: 'auth.openvibe.network', Accept: 'application/json' } },
            classify: (result) => {
                if (!result.ok) {
                    return { status: 'red', detail: result.error || `HTTP ${result.status}` };
                }
                let body = {};
                try { body = JSON.parse(result.body || '{}'); } catch {}
                const mode = body.openvibe && body.openvibe.federation && body.openvibe.federation.mode;
                if (mode === 'hobo-tools') {
                    return { status: 'yellow', detail: 'OIDC discovery is live, but auth is still in federation mode to hobo-tools.' };
                }
                return { status: 'green', detail: 'OIDC discovery responded in native or standalone-capable mode.' };
            },
        },
        {
            name: 'api-url-registry',
            request: { url: `${networkBase}/api/v1/url-registry/resolved`, headers: { Host: 'api.openvibe.network', Accept: 'application/json' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'API surface responded with URL registry data' : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'admin-shell',
            request: { url: `${networkBase}/`, headers: { Host: 'admin.openvibe.network', Accept: 'text/html' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'admin shell responded' : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'my-shell',
            request: { url: `${networkBase}/`, headers: { Host: 'my.openvibe.network', Accept: 'text/html' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'my-account shell responded' : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'themes-shell',
            request: { url: `${networkBase}/`, headers: { Host: 'themes.openvibe.network', Accept: 'text/html' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'themes shell responded' : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'events-health',
            request: { url: `${eventsBase}/health`, headers: { Accept: 'application/json' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'openvibe-events /health responded' : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'media-health',
            request: { url: `${mediaBase}/health`, headers: { Accept: 'application/json' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'openvibe-media /health responded' : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'media-api',
            request: { url: `${mediaBase}/api/v1/media?limit=1`, headers: { Accept: 'application/json' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'openvibe-media API responded' : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'live-health',
            request: { url: `${liveBase}/health`, headers: { Accept: 'application/json' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'openvibe-live /health responded' : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'live-ssr',
            request: { url: liveSlug ? `${liveBase}/c/${encodeURIComponent(liveSlug)}` : `${liveBase}/`, headers: { Accept: 'text/html' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'yellow',
                detail: result.ok
                    ? `openvibe-live SSR responded${liveSlug ? ` for /c/${liveSlug}` : ' on /'}`
                    : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'chat-api',
            request: { url: `${chatBase}/api/chat/rooms?limit=1`, headers: { Accept: 'application/json' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'openvibe-chat API responded' : (result.error || `HTTP ${result.status}`),
            }),
        },
        {
            name: 'community-api',
            request: { url: `${communityBase}/api/community/pastes?limit=1`, headers: { Accept: 'application/json' } },
            classify: (result) => ({
                status: result.ok ? 'green' : 'red',
                detail: result.ok ? 'openvibe-community API responded' : (result.error || `HTTP ${result.status}`),
            }),
        },
    ];

    for (const probe of probes) {
        const result = await requestUrl(probe.request, requester);
        const classified = probe.classify(result);
        checks.push({
            name: probe.name,
            status: classified.status,
            detail: classified.detail,
            http_status: result.status,
        });
    }

    return checks;
}

async function buildReadinessReport(options) {
    const bundleDir = path.resolve(options.bundleDir);
    const dbPaths = resolveServiceDbPaths(options.dbPaths || {});
    const importReport = loadJson(path.join(bundleDir, 'audit', 'import-report.json'), { exclusions: [] });
    const mediaBackfillReport = loadJson(path.join(bundleDir, 'audit', 'media-backfill-report.json'), null);
    const stagingLoadReport = loadJson(path.join(bundleDir, 'audit', 'staging-load-report.json'), { manual_actions: [] });

    const dbs = {
        network: openDb(dbPaths.network),
        media: openDb(dbPaths.media),
        billing: openDb(dbPaths.billing),
        restream: openDb(dbPaths.restream),
        live: openDb(dbPaths.live),
        chat: openDb(dbPaths.chat),
        community: openDb(dbPaths.community),
    };

    try {
        const datasetChecks = buildDatasetChecks(dbs, importReport, mediaBackfillReport, stagingLoadReport);
        const routeChecks = await buildRouteChecks({
            requester: options.requester,
            networkUrl: options.networkUrl,
            mediaUrl: options.mediaUrl,
            liveUrl: options.liveUrl,
            chatUrl: options.chatUrl,
            communityUrl: options.communityUrl,
            eventsUrl: options.eventsUrl,
            liveSlug: firstLiveSlug(dbs.live),
        });
        const checks = datasetChecks.concat(routeChecks);
        const summary = summarizeChecks(checks);
        const manualActions = [];
        for (const check of checks) {
            if (check.status !== 'green') {
                manualActions.push(`${check.name}: ${check.detail}`);
            }
        }

        const report = {
            generated_at: new Date().toISOString(),
            bundle_dir: bundleDir,
            service_db_paths: dbPaths,
            checks,
            summary,
            manual_actions: manualActions,
        };

        const reportPath = path.join(bundleDir, 'audit', 'readiness-report.json');
        writeJson(reportPath, report);
        return report;
    } finally {
        for (const db of Object.values(dbs)) {
            try { db.close(); } catch {}
        }
    }
}

module.exports = {
    buildReadinessReport,
    requestUrl,
};
