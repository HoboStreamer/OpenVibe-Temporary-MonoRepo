'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    buildEntityId,
    forEachNdjson,
    loadJson,
    writeJson,
} = require('./common');
const { ROOT, resolveServiceDbPaths } = require('./service-paths');

const networkDbModule = require(path.join(ROOT, 'services', 'openvibe-network', 'server', 'db.js'));
const mediaDbModule = require(path.join(ROOT, 'services', 'openvibe-media', 'server', 'db.js'));
const billingDbModule = require(path.join(ROOT, 'services', 'openvibe-billing', 'server', 'db.js'));
const restreamDbModule = require(path.join(ROOT, 'services', 'openre-stream', 'server', 'db.js'));
const liveDbModule = require(path.join(ROOT, 'services', 'openvibe-live', 'server', 'db.js'));
const chatDbModule = require(path.join(ROOT, 'services', 'openvibe-chat', 'server', 'db.js'));
const communityDbModule = require(path.join(ROOT, 'services', 'openvibe-community', 'server', 'db.js'));
const gamesDbModule = require(path.join(ROOT, 'services', 'openvibe-games', 'server', 'db.js'));

const KNOWN_STAGING_SERVICES = new Set(['network', 'media', 'billing', 'restream', 'live', 'chat', 'community', 'games']);

function isTruthy(value) {
    if (value == null || value === '') return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeLoaderMode(value) {
    const mode = String(value || 'sqlite').trim().toLowerCase();
    if (mode === 'sqlite' || mode === 'staging') return 'sqlite';
    if (mode === 'postgres' || mode === 'pg') return 'postgres';
    return 'sqlite';
}

function normalizeStagingServiceName(value) {
    const raw = String(value || '').trim().toLowerCase();
    switch (raw) {
        case 'openvibe-network': return 'network';
        case 'openvibe-media': return 'media';
        case 'openvibe-billing': return 'billing';
        case 'openre-stream': return 'restream';
        case 'openvibe-live': return 'live';
        case 'openvibe-chat': return 'chat';
        case 'openvibe-community': return 'community';
        case 'openvibe-games': return 'games';
        default: return raw;
    }
}

function parseSelectionSet(value, normalizeItem) {
    if (value == null || value === '') return null;
    const rawItems = Array.isArray(value) ? value : String(value).split(/[\s,]+/g);
    const items = rawItems
        .map((item) => normalizeItem ? normalizeItem(item) : String(item || '').trim())
        .filter(Boolean);
    return items.length ? new Set(items) : null;
}

function effectiveDryRunDbPaths(dbPaths) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-staging-dry-run-'));
    return Object.fromEntries(Object.entries(dbPaths).map(([name, dbPath]) => {
        const safeBaseName = path.basename(String(dbPath || name)).replace(/[:]/g, '-');
        return [name, path.join(tempRoot, safeBaseName || `${name}.db`)];
    }));
}

function datasetTargetServices(dataset) {
    if (!dataset) return ['network'];
    switch (dataset) {
        case 'identity/users':
        case 'identity/linked-accounts':
        case 'identity/anon-users':
        case 'identity/verification-keys':
        case 'identity/user-effects':
        case 'identity/username-conflicts':
        case 'themes/catalog':
        case 'themes/preferences':
        case 'control-plane/user-preferences':
        case 'control-plane/url-registry':
        case 'control-plane/oauth-clients':
        case 'control-plane/notifications':
        case 'control-plane/notification-preferences':
        case 'social/follows':
            return ['network'];
        case 'live/channels':
        case 'live/stream-sessions':
            return ['restream', 'live'];
        case 'live/stream-definitions':
        case 'live/restream_destinations':
            return ['restream'];
        case 'chat/messages':
        case 'chat/moderation-bans':
            return ['chat'];
        case 'community/pastes':
        case 'community/comments':
        case 'community/paste_likes':
        case 'community/paste_comments':
            return ['community'];
        case 'media/objects':
            return ['media'];
        case 'billing/subscriptions':
        case 'loyalty/coin-transactions':
        case 'loyalty/coin-rewards':
        case 'loyalty/coin-redemptions':
        case 'loyalty/watch-time':
            return ['billing'];
        case 'games/world-state':
        case 'games/players':
        case 'games/inventory':
        case 'games/bank':
        case 'games/structures':
        case 'games/farm-plots':
        case 'games/recipes':
        case 'games/effects':
        case 'games/battle-stats':
        case 'games/dungeon-runs':
        case 'games/leaderboards':
        case 'games/fish-collection':
        case 'games/daily-quests':
        case 'games/achievements':
        case 'games/cosmetics':
        case 'games/tags':
        case 'games/equipped-tags':
        case 'games/tag-guardian-defeats':
        case 'games/canvas-settings':
        case 'games/canvas-tiles':
        case 'games/canvas-actions':
        case 'games/canvas-snapshots':
        case 'games/canvas-region-locks':
        case 'games/canvas-bans':
        case 'games/canvas-user-overrides':
            return ['games'];
        default:
            break;
    }

    if (dataset.startsWith('live/')) return ['restream', 'live'];
    if (dataset.startsWith('chat/')) return ['chat'];
    if (dataset.startsWith('community/')) return ['community'];
    if (dataset.startsWith('media/')) return ['media'];
    if (dataset.startsWith('billing/') || dataset.startsWith('loyalty/')) return ['billing'];
    if (dataset.startsWith('games/')) return ['games'];
    return ['network'];
}

function shouldWriteService(context, serviceName) {
    return !context.serviceFilter || context.serviceFilter.has(serviceName);
}

function shouldIncludeDataset(context, dataset) {
    if (context.datasetFilter && !context.datasetFilter.has(dataset)) {
        return false;
    }
    return datasetTargetServices(dataset).some((serviceName) => shouldWriteService(context, serviceName));
}

function hasTable(db, tableName) {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
}

function toJson(value, fallbackValue) {
    try {
        return JSON.stringify(value == null ? fallbackValue : value);
    } catch {
        return JSON.stringify(fallbackValue == null ? {} : fallbackValue);
    }
}

function initServiceDbs(dbPaths) {
    return {
        network: networkDbModule.init(dbPaths.network),
        media: mediaDbModule.init(dbPaths.media),
        billing: billingDbModule.init(dbPaths.billing),
        restream: restreamDbModule.init(dbPaths.restream),
        live: liveDbModule.init(dbPaths.live),
        chat: chatDbModule.init(dbPaths.chat),
        community: communityDbModule.init(dbPaths.community),
        games: gamesDbModule.init(dbPaths.games),
    };
}

function closeServiceDbs(dbs) {
    for (const db of Object.values(dbs)) {
        try {
            db.close();
        } catch {
            // ignore
        }
    }
}

function ensureHoldingTable(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS staging_import_records (
            dataset         TEXT NOT NULL,
            record_id       TEXT NOT NULL,
            payload_json    TEXT NOT NULL,
            legacy_ref_json TEXT,
            loaded_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (dataset, record_id)
        );
        CREATE INDEX IF NOT EXISTS idx_staging_import_records_dataset
            ON staging_import_records(dataset, loaded_at DESC);
    `);
}

function upsertHoldingRecord(db, dataset, row) {
    ensureHoldingTable(db);
    db.prepare(`
        INSERT INTO staging_import_records (dataset, record_id, payload_json, legacy_ref_json, loaded_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(dataset, record_id) DO UPDATE SET
            payload_json = excluded.payload_json,
            legacy_ref_json = excluded.legacy_ref_json,
            loaded_at = CURRENT_TIMESTAMP
    `).run(
        dataset,
        String(row.id || `${dataset}:${JSON.stringify(row)}`),
        toJson(row, {}),
        toJson(row.legacy_ref || null, null)
    );
}

function recordLegacyMap(db, tableName, source, kind, legacyId, newId) {
    if (!legacyId || !newId || !hasTable(db, tableName)) return;
    db.prepare(`
        INSERT OR REPLACE INTO ${tableName} (${tableName === 'media_legacy_map' ? 'source, kind, legacy_id, media_id' : 'source, kind, legacy_id, new_id'}${tableName === 'media_legacy_map' ? '' : ''})
        VALUES (?, ?, ?, ?)
    `).run(String(source), String(kind), String(legacyId), String(newId));
}

function upsertNetworkUrlOverlay(db, row) {
    db.prepare(`
        INSERT INTO url_registry_overlay (key, value, description, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            description = excluded.description,
            updated_at = CURRENT_TIMESTAMP
    `).run(String(row.key), row.value == null ? null : String(row.value), row.description || null);
}

function normalizeLiveStatus(status) {
    if (status === 'live' || status === 'started') return 'started';
    if (status === 'ended') return 'ended';
    return 'created';
}

function mediaLegacyKind(row) {
    switch (row.legacy_table) {
        case 'vods':
            return 'vod';
        case 'clips':
            return 'clip';
        case 'users.avatar_url':
            return 'avatar';
        case 'emotes':
            return 'emote';
        case 'pastes.screenshot_path':
            return 'paste-screenshot';
        default:
            return String(row.legacy_table || row.media_type || 'object');
    }
}

function ensureDatasetReport(report, dataset) {
    if (!report.datasets[dataset]) {
        report.datasets[dataset] = {
            processed_records: 0,
            services: {},
        };
    }
    return report.datasets[dataset];
}

function ensureServiceReport(report, serviceName, dbPath) {
    if (!report.services[serviceName]) {
        report.services[serviceName] = {
            db_path: dbPath,
            processed_records: 0,
            tables: {},
            persistence: report.service_persistence && report.service_persistence[serviceName] || null,
        };
    }
    return report.services[serviceName];
}

function bumpLoadReport(report, dataset, serviceName, tableName, mode, dbPath) {
    const datasetReport = ensureDatasetReport(report, dataset);
    datasetReport.processed_records += 1;
    if (!datasetReport.services[serviceName]) {
        datasetReport.services[serviceName] = {
            processed_records: 0,
            tables: {},
            modes: [],
        };
    }
    datasetReport.services[serviceName].processed_records += 1;
    datasetReport.services[serviceName].tables[tableName] = (datasetReport.services[serviceName].tables[tableName] || 0) + 1;
    if (!datasetReport.services[serviceName].modes.includes(mode)) {
        datasetReport.services[serviceName].modes.push(mode);
    }

    const serviceReport = ensureServiceReport(report, serviceName, dbPath);
    serviceReport.processed_records += 1;
    serviceReport.tables[tableName] = (serviceReport.tables[tableName] || 0) + 1;
}

function buildContext(bundleDir, dbPaths, logger, options) {
    const importReport = loadJson(path.join(bundleDir, 'audit', 'import-report.json'), { exclusions: [], datasets: {} });
    const report = {
        generated_at: new Date().toISOString(),
        bundle_dir: bundleDir,
        run_id: options.runId,
        requested_mode: options.requestedMode,
        effective_mode: options.effectiveMode,
        dry_run: !!options.dryRun,
        load_scope: 'staged-and-holding-only',
        native_runtime_claim: false,
        selected_services: options.selectedServices,
        selected_datasets: options.selectedDatasets,
        service_db_paths: options.requestedDbPaths,
        effective_service_db_paths: dbPaths,
        gates: {
            allow_staging_load_env: !!options.allowStagingLoad,
            staging_confirm_env: !!options.stagingConfirmEnv,
            confirm_load_flag: !!options.confirmLoad,
        },
        hobo_bucks_exclusion_confirmed: false,
        datasets: {},
        services: {},
        manual_actions: [],
        skipped_datasets: [],
    };

    const manualActions = new Set();
    const dbs = initServiceDbs(dbPaths);
    for (const db of Object.values(dbs)) {
        ensureHoldingTable(db);
    }

    report.service_persistence = {
        network: networkDbModule.describePersistence ? networkDbModule.describePersistence() : null,
        media: mediaDbModule.describePersistence ? mediaDbModule.describePersistence() : null,
        billing: billingDbModule.describePersistence ? billingDbModule.describePersistence() : null,
        restream: restreamDbModule.describePersistence ? restreamDbModule.describePersistence() : null,
        live: liveDbModule.describePersistence ? liveDbModule.describePersistence() : null,
        chat: chatDbModule.describePersistence ? chatDbModule.describePersistence() : null,
        community: communityDbModule.describePersistence ? communityDbModule.describePersistence() : null,
        games: gamesDbModule.describePersistence ? gamesDbModule.describePersistence() : null,
    };

    const legacyUserMaps = {
        hobostreamer: new Map(),
        hobotools: new Map(),
    };

    return {
        bundleDir,
        dbPaths,
        dbs,
        importReport,
        report,
        logger,
        dryRun: !!options.dryRun,
        serviceFilter: options.serviceFilter,
        datasetFilter: options.datasetFilter,
        legacyUserMaps,
        addManualAction(message) {
            if (!manualActions.has(message)) {
                manualActions.add(message);
                report.manual_actions.push(message);
            }
        },
    };
}

function mapLegacyUserId(context, sourceName, legacyId) {
    if (legacyId == null) return null;
    return context.legacyUserMaps[sourceName] && context.legacyUserMaps[sourceName].get(String(legacyId)) || null;
}

function loadIntoNetworkHolding(context, dataset, row) {
    upsertHoldingRecord(context.dbs.network, dataset, row);
    bumpLoadReport(context.report, dataset, 'network', 'staging_import_records', 'holding', context.dbPaths.network);
}

function loadIntoBillingHolding(context, dataset, row) {
    upsertHoldingRecord(context.dbs.billing, dataset, row);
    bumpLoadReport(context.report, dataset, 'billing', 'staging_import_records', 'holding', context.dbPaths.billing);
}

function loadIntoRestreamHolding(context, dataset, row) {
    upsertHoldingRecord(context.dbs.restream, dataset, row);
    bumpLoadReport(context.report, dataset, 'restream', 'staging_import_records', 'holding', context.dbPaths.restream);
}

function loadIntoLiveHolding(context, dataset, row) {
    upsertHoldingRecord(context.dbs.live, dataset, row);
    bumpLoadReport(context.report, dataset, 'live', 'staging_import_records', 'holding', context.dbPaths.live);
}

function loadIntoChatHolding(context, dataset, row) {
    upsertHoldingRecord(context.dbs.chat, dataset, row);
    bumpLoadReport(context.report, dataset, 'chat', 'staging_import_records', 'holding', context.dbPaths.chat);
}

function loadIntoCommunityHolding(context, dataset, row) {
    upsertHoldingRecord(context.dbs.community, dataset, row);
    bumpLoadReport(context.report, dataset, 'community', 'staging_import_records', 'holding', context.dbPaths.community);
}

function loadIntoGamesHolding(context, dataset, row) {
    upsertHoldingRecord(context.dbs.games, dataset, row);
    bumpLoadReport(context.report, dataset, 'games', 'staging_import_records', 'holding', context.dbPaths.games);
}

function upsertRestreamChannel(context, row) {
    context.dbs.restream.prepare(`
        INSERT INTO channels (id, slug, owner_user_id, display_name, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug,
            owner_user_id = excluded.owner_user_id,
            display_name = excluded.display_name,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        String(row.slug),
        String(row.owner_user_id || 'unknown'),
        row.title || row.slug,
        toJson({
            source: row.source,
            title: row.title,
            description: row.description,
            category: row.category,
            tags: row.tags,
            protocol: row.protocol,
            metadata: row.metadata || {},
        }, {}),
        row.created_at || null
    );
    recordLegacyMap(context.dbs.restream, 'legacy_id_map', row.legacy_ref && row.legacy_ref.source, 'channel', row.legacy_ref && row.legacy_ref.legacy_id, row.id);
    bumpLoadReport(context.report, 'live/channels', 'restream', 'channels', 'direct', context.dbPaths.restream);
}

function upsertLiveChannel(context, row) {
    context.dbs.live.prepare(`
        INSERT INTO live_channels (id, slug, display_name, owner_user_id, description, avatar_url, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug,
            display_name = excluded.display_name,
            owner_user_id = excluded.owner_user_id,
            description = excluded.description,
            avatar_url = excluded.avatar_url,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        String(row.slug),
        row.title || row.slug,
        row.owner_user_id || null,
        row.description || null,
        row.offline_banner_url || null,
        toJson({
            source: row.source,
            category: row.category,
            tags: row.tags,
            protocol: row.protocol,
            metadata: row.metadata || {},
        }, {}),
        row.created_at || null
    );
    recordLegacyMap(context.dbs.live, 'legacy_id_map', row.legacy_ref && row.legacy_ref.source, 'channel', row.legacy_ref && row.legacy_ref.legacy_id, row.id);
    bumpLoadReport(context.report, 'live/channels', 'live', 'live_channels', 'direct', context.dbPaths.live);
}

function channelSlugFor(context, channelId) {
    if (!channelId) return null;
    const row = context.dbs.live.prepare('SELECT slug FROM live_channels WHERE id = ?').get(String(channelId));
    return row ? row.slug : null;
}

function getRestreamChannelById(context, channelId) {
    if (!channelId) return null;
    return context.dbs.restream.prepare(`
        SELECT id, slug, owner_user_id
        FROM channels
        WHERE id = ?
    `).get(String(channelId)) || null;
}

function getRestreamChannelsByOwner(context, ownerUserId) {
    if (!ownerUserId) return [];
    return context.dbs.restream.prepare(`
        SELECT id, slug, owner_user_id
        FROM channels
        WHERE owner_user_id = ?
        ORDER BY created_at ASC, id ASC
    `).all(String(ownerUserId));
}

function getLiveChannelById(context, channelId) {
    if (!channelId) return null;
    return context.dbs.live.prepare(`
        SELECT id, slug, owner_user_id
        FROM live_channels
        WHERE id = ?
    `).get(String(channelId)) || null;
}

function getLiveChannelsByOwner(context, ownerUserId) {
    if (!ownerUserId) return [];
    return context.dbs.live.prepare(`
        SELECT id, slug, owner_user_id
        FROM live_channels
        WHERE owner_user_id = ?
        ORDER BY created_at ASC, id ASC
    `).all(String(ownerUserId));
}

function toSlugPart(value) {
    const slug = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return slug || 'legacy-channel';
}

function ensureSyntheticStreamChannel(context, row) {
    const sourceName = row.source || 'migration';
    const syntheticSeed = row.owner_user_id || row.id;
    const syntheticId = buildEntityId('channel', sourceName, `synthetic-${syntheticSeed}`);
    const existing = getRestreamChannelById(context, syntheticId) || getLiveChannelById(context, syntheticId);
    if (existing) {
        return { channelId: existing.id, channelSlug: existing.slug, mode: 'synthetic-existing' };
    }

    const syntheticSlug = `legacy-${toSlugPart(row.title || syntheticSeed)}-${toSlugPart(row.id).slice(-12)}`;
    const channelRow = {
        id: syntheticId,
        source: sourceName,
        owner_user_id: row.owner_user_id || 'migration',
        slug: syntheticSlug,
        title: row.title || 'Recovered Legacy Channel',
        description: row.description || null,
        category: row.category || null,
        protocol: row.protocol || 'rtmp',
        metadata: {
            synthetic: true,
            recovered_from_stream_id: row.id,
        },
        created_at: row.started_at || row.created_at || null,
    };

    if (shouldWriteService(context, 'restream')) {
        upsertRestreamChannel(context, channelRow);
    }
    if (shouldWriteService(context, 'live')) {
        upsertLiveChannel(context, channelRow);
    }
    context.addManualAction('Some migrated stream sessions did not have a resolvable channel reference and were assigned synthetic fallback channels during staging load.');
    return { channelId: syntheticId, channelSlug: syntheticSlug, mode: 'synthetic-created' };
}

function resolveStreamChannelBinding(context, row) {
    const explicit = getRestreamChannelById(context, row.channel_id);
    if (explicit) {
        return { channelId: explicit.id, channelSlug: explicit.slug, mode: 'explicit' };
    }

    const explicitLive = getLiveChannelById(context, row.channel_id);
    if (explicitLive) {
        return { channelId: explicitLive.id, channelSlug: explicitLive.slug, mode: 'explicit-live' };
    }

    const ownerMatches = getRestreamChannelsByOwner(context, row.owner_user_id);
    if (ownerMatches.length === 1) {
        context.addManualAction('Stream sessions missing channel_id are rebound to the owner\'s sole migrated channel during staging load so the current openre-stream foreign keys remain satisfied.');
        return {
            channelId: ownerMatches[0].id,
            channelSlug: ownerMatches[0].slug,
            mode: 'owner-rebound',
        };
    }

    const liveOwnerMatches = getLiveChannelsByOwner(context, row.owner_user_id);
    if (liveOwnerMatches.length === 1) {
        context.addManualAction('Stream sessions missing channel_id are rebound to the owner\'s sole migrated channel during staging load so service-filtered live staging remains navigable.');
        return {
            channelId: liveOwnerMatches[0].id,
            channelSlug: liveOwnerMatches[0].slug,
            mode: 'owner-rebound-live',
        };
    }

    return ensureSyntheticStreamChannel(context, row);
}

function upsertRestreamStream(context, row, binding) {
    const resolvedBinding = binding || resolveStreamChannelBinding(context, row);
    context.dbs.restream.prepare(`
        INSERT INTO streams (id, channel_id, stream_key, protocol, status, title, category, metadata_json, started_at, ended_at, vod_media_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            channel_id = excluded.channel_id,
            protocol = excluded.protocol,
            status = excluded.status,
            title = excluded.title,
            category = excluded.category,
            metadata_json = excluded.metadata_json,
            started_at = excluded.started_at,
            ended_at = excluded.ended_at,
            vod_media_id = excluded.vod_media_id,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        String(resolvedBinding.channelId),
        null,
        row.protocol || 'rtmp',
        normalizeLiveStatus(row.status),
        row.title || 'Untitled Stream',
        row.category || null,
        toJson({
            source: row.source,
            is_live: !!row.is_live,
            viewer_count: row.viewer_count || 0,
            peak_viewers: row.peak_viewers || 0,
            follower_count: row.follower_count || 0,
            thumbnail_url: row.thumbnail_url || null,
            channel_binding_mode: resolvedBinding.mode,
            metadata: row.metadata || {},
        }, {}),
        row.started_at || null,
        row.ended_at || null,
        row.vod_media_id || null,
        row.started_at || row.created_at || null
    );
    recordLegacyMap(context.dbs.restream, 'legacy_id_map', row.legacy_ref && row.legacy_ref.source, 'stream', row.legacy_ref && row.legacy_ref.legacy_id, row.id);
    bumpLoadReport(context.report, 'live/stream-sessions', 'restream', 'streams', 'direct', context.dbPaths.restream);
}

function upsertLiveStream(context, row, binding) {
    const resolvedBinding = binding || resolveStreamChannelBinding(context, row);
    const channelSlug = resolvedBinding.channelSlug || channelSlugFor(context, resolvedBinding.channelId) || row.channel_slug || 'legacy-channel';
    context.dbs.live.prepare(`
        INSERT INTO live_streams (id, channel_slug, channel_id, status, title, category, thumbnail_url, embed_url, vod_media_id, started_at, ended_at, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            channel_slug = excluded.channel_slug,
            channel_id = excluded.channel_id,
            status = excluded.status,
            title = excluded.title,
            category = excluded.category,
            thumbnail_url = excluded.thumbnail_url,
            embed_url = excluded.embed_url,
            vod_media_id = excluded.vod_media_id,
            started_at = excluded.started_at,
            ended_at = excluded.ended_at,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        String(channelSlug),
        resolvedBinding.channelId || null,
        normalizeLiveStatus(row.status),
        row.title || 'Untitled Stream',
        row.category || null,
        row.thumbnail_url || null,
        null,
        row.vod_media_id || null,
        row.started_at || null,
        row.ended_at || null,
        toJson({
            source: row.source,
            is_live: !!row.is_live,
            viewer_count: row.viewer_count || 0,
            peak_viewers: row.peak_viewers || 0,
            channel_binding_mode: resolvedBinding.mode,
            metadata: row.metadata || {},
        }, {}),
        row.started_at || row.created_at || null
    );
    recordLegacyMap(context.dbs.live, 'legacy_id_map', row.legacy_ref && row.legacy_ref.source, 'stream', row.legacy_ref && row.legacy_ref.legacy_id, row.id);
    bumpLoadReport(context.report, 'live/stream-sessions', 'live', 'live_streams', 'direct', context.dbPaths.live);
}

function upsertRestreamDestination(context, row) {
    const payload = row.payload || {};
    const ownerUserId = mapLegacyUserId(context, 'hobostreamer', payload.user_id) || payload.user_id || 'unknown';
    context.dbs.restream.prepare(`
        INSERT INTO restream_destinations (id, owner_user_id, kind, label, target_url, target_key, enabled, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            kind = excluded.kind,
            label = excluded.label,
            target_url = excluded.target_url,
            target_key = excluded.target_key,
            enabled = excluded.enabled,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        String(ownerUserId),
        payload.kind || payload.platform || 'rtmp',
        payload.label || payload.name || payload.platform || 'Migrated Destination',
        payload.target_url || payload.server_url || payload.rtmp_url || 'redacted://legacy-target',
        null,
        payload.enabled == null ? 1 : (payload.enabled ? 1 : 0),
        toJson({ source: row.source, payload }, {}),
        payload.created_at || null
    );
    recordLegacyMap(context.dbs.restream, 'legacy_id_map', row.legacy_ref && row.legacy_ref.source, 'restream_destination', row.legacy_ref && row.legacy_ref.legacy_id, row.id);
    bumpLoadReport(context.report, 'live/restream_destinations', 'restream', 'restream_destinations', 'direct', context.dbPaths.restream);
}

function ensureChatRoom(context, row) {
    const externalRefId = row.room_ref || row.room_type || 'global';
    const roomId = buildEntityId('chat-room', row.room_type || 'room', externalRefId);
    context.dbs.chat.prepare(`
        INSERT INTO chat_rooms (id, room_type, external_ref_type, external_ref_id, title, visibility, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'public', ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            room_type = excluded.room_type,
            external_ref_type = excluded.external_ref_type,
            external_ref_id = excluded.external_ref_id,
            title = excluded.title,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        roomId,
        row.room_type || 'room',
        row.room_type || 'room',
        String(externalRefId),
        row.room_type === 'global'
            ? 'Migrated Global Chat'
            : `Migrated ${row.room_type || 'room'} ${String(externalRefId)}`,
        toJson({ source: row.source, room_ref: row.room_ref || null }, {}),
        row.timestamp || row.created_at || null
    );
    return roomId;
}

function upsertChatMessage(context, row) {
    const roomId = ensureChatRoom(context, row);
    context.dbs.chat.prepare(`
        INSERT INTO chat_messages (id, room_id, sender_type, sender_id, message_type, body, rich_payload_json, reply_to_message_id, legacy_source, legacy_id, moderation_status, metadata_json, created_at, edited_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            room_id = excluded.room_id,
            sender_type = excluded.sender_type,
            sender_id = excluded.sender_id,
            message_type = excluded.message_type,
            body = excluded.body,
            rich_payload_json = excluded.rich_payload_json,
            reply_to_message_id = excluded.reply_to_message_id,
            legacy_source = excluded.legacy_source,
            legacy_id = excluded.legacy_id,
            moderation_status = excluded.moderation_status,
            metadata_json = excluded.metadata_json,
            edited_at = excluded.edited_at,
            deleted_at = excluded.deleted_at
    `).run(
        String(row.id),
        roomId,
        row.sender_type || 'user',
        row.sender_id || null,
        row.message_type || 'text',
        row.body || '',
        toJson({ username: row.username || null, source_platform: row.source_platform || null }, {}),
        row.reply_to_legacy_id ? buildEntityId('chat-message', 'hobostreamer', row.reply_to_legacy_id) : null,
        row.source || null,
        row.legacy_ref ? row.legacy_ref.legacy_id : null,
        row.is_deleted ? 'deleted' : (row.is_filtered ? 'filtered' : 'visible'),
        toJson({
            deleted_by_user_id: row.deleted_by_user_id || null,
            auto_delete_at: row.auto_delete_at || null,
            timestamp: row.timestamp || null,
        }, {}),
        row.timestamp || null,
        null,
        row.deleted_at || null
    );
    recordLegacyMap(context.dbs.chat, 'chat_legacy_map', row.legacy_ref && row.legacy_ref.source, 'message', row.legacy_ref && row.legacy_ref.legacy_id, row.id);
    bumpLoadReport(context.report, 'chat/messages', 'chat', 'chat_messages', 'direct', context.dbPaths.chat);
}

function ensureCommentThread(context, row) {
    const threadId = buildEntityId('community-thread', row.ref_type || 'comment', row.ref_id || 'legacy-ref');
    context.dbs.community.prepare(`
        INSERT INTO community_threads (id, community_id, category_id, slug, title, thread_type, status, visibility, ref_type, ref_id, metadata_json, last_activity_at, created_at, updated_at)
        VALUES (?, NULL, NULL, NULL, ?, 'comments', 'open', 'public', ?, ?, ?, CURRENT_TIMESTAMP, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            ref_type = excluded.ref_type,
            ref_id = excluded.ref_id,
            metadata_json = excluded.metadata_json,
            last_activity_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        threadId,
        `Migrated comments for ${row.ref_type || 'content'} ${row.ref_id || ''}`.trim(),
        row.ref_type || null,
        row.ref_id || null,
        toJson({ source: row.source, migrated: true }, {}),
        row.created_at || null
    );
    return threadId;
}

function upsertCommunityPaste(context, row) {
    context.dbs.community.prepare(`
        INSERT INTO community_pastes (id, slug, title, body, language, visibility, expires_at, created_by_actor_type, created_by_actor_id, view_count, metadata_json, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug,
            title = excluded.title,
            body = excluded.body,
            language = excluded.language,
            visibility = excluded.visibility,
            expires_at = excluded.expires_at,
            created_by_actor_type = excluded.created_by_actor_type,
            created_by_actor_id = excluded.created_by_actor_id,
            view_count = excluded.view_count,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        String(row.slug),
        row.title || null,
        row.body || '',
        row.language || 'text',
        row.visibility || 'public',
        null,
        row.author_user_id ? 'user' : null,
        row.author_user_id || null,
        row.views || 0,
        toJson({
            source: row.source,
            type: row.type || 'paste',
            stream_session_id: row.stream_session_id || null,
            screenshot_path: row.screenshot_path || null,
            metadata: row.metadata || {},
            burn_after_read: !!row.burn_after_read,
            forked_from_paste_id: row.forked_from_paste_id || null,
            pinned: !!row.pinned,
            likes: row.likes || 0,
            copies: row.copies || 0,
            is_nsfw: !!row.is_nsfw,
        }, {}),
        row.created_at || null,
        row.updated_at || row.created_at || null
    );
    recordLegacyMap(context.dbs.community, 'community_legacy_map', row.legacy_ref && row.legacy_ref.source, 'paste', row.legacy_ref && row.legacy_ref.legacy_id, row.id);
    bumpLoadReport(context.report, 'community/pastes', 'community', 'community_pastes', 'direct', context.dbPaths.community);
}

function upsertCommunityComment(context, row) {
    const threadId = ensureCommentThread(context, row);
    context.dbs.community.prepare(`
        INSERT INTO community_posts (id, thread_id, parent_post_id, author_type, author_id, body, body_format, source_type, source_id, metadata_json, edited_at, deleted_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'markdown', 'migration', ?, ?, NULL, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            thread_id = excluded.thread_id,
            parent_post_id = excluded.parent_post_id,
            author_type = excluded.author_type,
            author_id = excluded.author_id,
            body = excluded.body,
            source_type = excluded.source_type,
            source_id = excluded.source_id,
            metadata_json = excluded.metadata_json,
            deleted_at = excluded.deleted_at
    `).run(
        String(row.id),
        threadId,
        row.parent_comment_id || null,
        row.author_user_id ? 'user' : null,
        row.author_user_id || null,
        row.body || '',
        row.legacy_ref ? row.legacy_ref.legacy_id : null,
        toJson({ source: row.source, ref_type: row.ref_type, ref_id: row.ref_id }, {}),
        row.is_deleted ? (row.updated_at || row.created_at || new Date().toISOString()) : null,
        row.created_at || null
    );
    recordLegacyMap(context.dbs.community, 'community_legacy_map', row.legacy_ref && row.legacy_ref.source, 'comment', row.legacy_ref && row.legacy_ref.legacy_id, row.id);
    bumpLoadReport(context.report, 'community/comments', 'community', 'community_posts', 'direct', context.dbPaths.community);
}

function upsertMediaObject(context, row) {
    context.dbs.media.prepare(`
        INSERT INTO media_objects (
            id, owner_type, owner_id, namespace, type, status, visibility,
            storage_tier, storage_provider, storage_key, public_url, cdn_url,
            size_bytes, mime_type, sha256, metadata_json,
            created_by_actor_type, created_by_actor_id, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, 'service', 'migration-loader', COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, NULL)
        ON CONFLICT(id) DO UPDATE SET
            owner_type = excluded.owner_type,
            owner_id = excluded.owner_id,
            namespace = excluded.namespace,
            type = excluded.type,
            status = excluded.status,
            visibility = excluded.visibility,
            storage_tier = excluded.storage_tier,
            storage_provider = excluded.storage_provider,
            size_bytes = excluded.size_bytes,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        row.owner_user_id ? 'user' : 'system',
        row.owner_user_id || 'migration',
        row.namespace || 'legacy.media',
        row.media_type || 'file',
        'initialized',
        row.visibility || 'public',
        'hot',
        'local',
        row.size_bytes || 0,
        toJson({
            source: row.source,
            legacy_table: row.legacy_table,
            title: row.title || null,
            description: row.description || null,
            stream_session_id: row.stream_session_id || null,
            file_path: row.file_path || null,
            thumbnail_url: row.thumbnail_url || null,
            parent_media_id: row.parent_media_id || null,
            start_time: row.start_time || null,
            end_time: row.end_time || null,
            duration_seconds: row.duration_seconds || 0,
            view_count: row.view_count || 0,
            code: row.code || null,
            attached_to_type: row.attached_to_type || null,
            attached_to_id: row.attached_to_id || null,
            metadata: row.metadata || {},
        }, {}),
        row.created_at || null
    );
    recordLegacyMap(context.dbs.media, 'media_legacy_map', row.legacy_ref && row.legacy_ref.source, mediaLegacyKind(row), row.legacy_ref && row.legacy_ref.legacy_id, row.id);
    bumpLoadReport(context.report, 'media/objects', 'media', 'media_objects', 'direct', context.dbPaths.media);
}

function recordGameLegacyMap(context, row, kind, newId) {
    recordLegacyMap(
        context.dbs.games,
        'game_legacy_map',
        row.legacy_ref && row.legacy_ref.source,
        kind,
        row.legacy_ref && row.legacy_ref.legacy_id,
        newId
    );
}

function upsertGameWorldState(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_world_state (key, value, value_type, updated_at)
        VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            value_type = excluded.value_type,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.key),
        row.value == null ? '' : String(row.value),
        row.type || 'json',
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'world-state', row.key);
    bumpLoadReport(context.report, 'games/world-state', 'games', 'game_world_state', 'direct', context.dbPaths.games);
}

function upsertGamePlayer(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_players (
            user_id, display_name, avatar_url, class_name, world_id, zone, x, y, coins, loyalty_points,
            mining_xp, fishing_xp, woodcut_xp, farming_xp, combat_xp, crafting_xp, smithing_xp, agility_xp,
            hp, max_hp, stamina, max_stamina, equip_pickaxe, equip_rod, equip_axe, equip_hat, equip_weapon, equip_armor,
            metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id) DO UPDATE SET
            display_name = excluded.display_name,
            avatar_url = excluded.avatar_url,
            class_name = excluded.class_name,
            world_id = excluded.world_id,
            zone = excluded.zone,
            x = excluded.x,
            y = excluded.y,
            coins = excluded.coins,
            loyalty_points = excluded.loyalty_points,
            mining_xp = excluded.mining_xp,
            fishing_xp = excluded.fishing_xp,
            woodcut_xp = excluded.woodcut_xp,
            farming_xp = excluded.farming_xp,
            combat_xp = excluded.combat_xp,
            crafting_xp = excluded.crafting_xp,
            smithing_xp = excluded.smithing_xp,
            agility_xp = excluded.agility_xp,
            hp = excluded.hp,
            max_hp = excluded.max_hp,
            stamina = excluded.stamina,
            max_stamina = excluded.max_stamina,
            equip_pickaxe = excluded.equip_pickaxe,
            equip_rod = excluded.equip_rod,
            equip_axe = excluded.equip_axe,
            equip_hat = excluded.equip_hat,
            equip_weapon = excluded.equip_weapon,
            equip_armor = excluded.equip_armor,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.user_id),
        row.display_name || null,
        row.avatar_url || null,
        row.class_name || 'wanderer',
        row.world_id || 'main',
        row.zone || 'outpost',
        row.x == null ? 4096 : Number(row.x),
        row.y == null ? 4096 : Number(row.y),
        row.coins || 0,
        row.loyalty_points || 0,
        row.mining_xp || 0,
        row.fishing_xp || 0,
        row.woodcut_xp || 0,
        row.farming_xp || 0,
        row.combat_xp || 0,
        row.crafting_xp || 0,
        row.smithing_xp || 0,
        row.agility_xp || 0,
        row.hp || 100,
        row.max_hp || 100,
        row.stamina || 100,
        row.max_stamina || 100,
        row.equip_pickaxe || null,
        row.equip_rod || null,
        row.equip_axe || null,
        row.equip_hat || '',
        row.equip_weapon || '',
        row.equip_armor || '',
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.created_at || null,
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'player', row.user_id);
    bumpLoadReport(context.report, 'games/players', 'games', 'game_players', 'direct', context.dbPaths.games);
}

function upsertGameInventoryRow(context, dataset, tableName, row) {
    context.dbs.games.prepare(`
        INSERT INTO ${tableName} (user_id, item_id, quantity, metadata_json, updated_at)
        VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id, item_id) DO UPDATE SET
            quantity = excluded.quantity,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.user_id),
        String(row.item_id),
        row.quantity || 0,
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, tableName === 'game_bank' ? 'bank-item' : 'inventory-item', `${row.user_id}:${row.item_id}`);
    bumpLoadReport(context.report, dataset, 'games', tableName, 'direct', context.dbPaths.games);
}

function upsertGameStructure(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_structures (id, type, world_id, x, y, owner_id, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            world_id = excluded.world_id,
            x = excluded.x,
            y = excluded.y,
            owner_id = excluded.owner_id,
            data_json = excluded.data_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        row.type,
        row.world_id || 'main',
        Number(row.x),
        Number(row.y),
        row.owner_user_id || null,
        toJson({ source: row.source, ...(row.data || {}), metadata: row.metadata || {} }, {}),
        row.created_at || null,
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'structure', row.id);
    bumpLoadReport(context.report, 'games/structures', 'games', 'game_structures', 'direct', context.dbPaths.games);
}

function upsertGameFarmPlot(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_farm_plots (id, user_id, plot_index, seed_id, stage, planted_at, watered_at, ready_at, metadata_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            plot_index = excluded.plot_index,
            seed_id = excluded.seed_id,
            stage = excluded.stage,
            planted_at = excluded.planted_at,
            watered_at = excluded.watered_at,
            ready_at = excluded.ready_at,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        String(row.user_id),
        row.plot_index || 0,
        row.seed_id || null,
        row.stage || 'empty',
        row.planted_at || null,
        row.watered_at || null,
        row.ready_at || null,
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'farm-plot', row.id);
    bumpLoadReport(context.report, 'games/farm-plots', 'games', 'game_farm_plots', 'direct', context.dbPaths.games);
}

function upsertGameRecipe(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_recipes (user_id, recipe_id, metadata_json, unlocked_at)
        VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id, recipe_id) DO UPDATE SET
            metadata_json = excluded.metadata_json,
            unlocked_at = excluded.unlocked_at
    `).run(
        String(row.user_id),
        String(row.recipe_id),
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.unlocked_at || null
    );
    recordGameLegacyMap(context, row, 'recipe', `${row.user_id}:${row.recipe_id}`);
    bumpLoadReport(context.report, 'games/recipes', 'games', 'game_recipes', 'direct', context.dbPaths.games);
}

function upsertGameEffect(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_effects (id, user_id, effect_type, effect_id, expires_at, charges, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            effect_type = excluded.effect_type,
            effect_id = excluded.effect_id,
            expires_at = excluded.expires_at,
            charges = excluded.charges,
            data_json = excluded.data_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        String(row.user_id),
        row.effect_type || 'legacy-effect',
        row.effect_id || null,
        row.expires_at || null,
        row.charges == null ? null : row.charges,
        toJson({ source: row.source, ...(row.data || {}) }, {}),
        row.created_at || null,
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'effect', row.id);
    bumpLoadReport(context.report, 'games/effects', 'games', 'game_effects', 'direct', context.dbPaths.games);
}

function upsertGameBattleStats(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_battle_stats (
            user_id, battles_won, battles_lost, total_stolen, total_lost,
            kill_streak, best_streak, fatalities, kills, deaths, metadata_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id) DO UPDATE SET
            battles_won = excluded.battles_won,
            battles_lost = excluded.battles_lost,
            total_stolen = excluded.total_stolen,
            total_lost = excluded.total_lost,
            kill_streak = excluded.kill_streak,
            best_streak = excluded.best_streak,
            fatalities = excluded.fatalities,
            kills = excluded.kills,
            deaths = excluded.deaths,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.user_id),
        row.battles_won || 0,
        row.battles_lost || 0,
        row.total_stolen || 0,
        row.total_lost || 0,
        row.kill_streak || 0,
        row.best_streak || 0,
        row.fatalities || 0,
        row.kills || 0,
        row.deaths || 0,
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'battle-stats', row.user_id);
    bumpLoadReport(context.report, 'games/battle-stats', 'games', 'game_battle_stats', 'direct', context.dbPaths.games);
}

function upsertGameDungeonRun(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_dungeon_runs (id, user_id, dungeon_id, floor_reached, status, party_json, metadata_json, started_at, ended_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
        ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            dungeon_id = excluded.dungeon_id,
            floor_reached = excluded.floor_reached,
            status = excluded.status,
            party_json = excluded.party_json,
            metadata_json = excluded.metadata_json,
            started_at = excluded.started_at,
            ended_at = excluded.ended_at
    `).run(
        String(row.id),
        String(row.user_id),
        row.dungeon_id || 'legacy-dungeon',
        row.floor_reached || 1,
        row.status || 'active',
        toJson(row.party || [], []),
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.started_at || null,
        row.ended_at || null
    );
    recordGameLegacyMap(context, row, 'dungeon-run', row.id);
    bumpLoadReport(context.report, 'games/dungeon-runs', 'games', 'game_dungeon_runs', 'direct', context.dbPaths.games);
}

function upsertGameLeaderboard(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_leaderboard (id, board, rank, user_id, username, value, metadata_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            board = excluded.board,
            rank = excluded.rank,
            user_id = excluded.user_id,
            username = excluded.username,
            value = excluded.value,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.id),
        row.board || 'legacy',
        row.rank || 0,
        row.user_id || null,
        row.username || null,
        row.value || 0,
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'leaderboard-entry', row.id);
    bumpLoadReport(context.report, 'games/leaderboards', 'games', 'game_leaderboard', 'direct', context.dbPaths.games);
}

function upsertGameFishCollection(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_fish_collection (user_id, fish_id, count, best_weight, metadata_json, first_caught)
        VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id, fish_id) DO UPDATE SET
            count = excluded.count,
            best_weight = excluded.best_weight,
            metadata_json = excluded.metadata_json,
            first_caught = excluded.first_caught
    `).run(
        String(row.user_id),
        String(row.fish_id),
        row.count || 0,
        row.best_weight || 0,
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.first_caught || null
    );
    recordGameLegacyMap(context, row, 'fish-collection', `${row.user_id}:${row.fish_id}`);
    bumpLoadReport(context.report, 'games/fish-collection', 'games', 'game_fish_collection', 'direct', context.dbPaths.games);
}

function upsertGameDailyQuest(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_daily_quests (user_id, quest_date, quest_id, title, description, progress, goal, reward_json, claimed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id, quest_date, quest_id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            progress = excluded.progress,
            goal = excluded.goal,
            reward_json = excluded.reward_json,
            claimed_at = excluded.claimed_at,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.user_id),
        String(row.quest_date),
        String(row.quest_id),
        row.title || null,
        row.description || null,
        row.progress || 0,
        row.goal || 1,
        toJson(row.reward || {}, {}),
        row.claimed_at || null,
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'daily-quest', `${row.user_id}:${row.quest_date}:${row.quest_id}`);
    bumpLoadReport(context.report, 'games/daily-quests', 'games', 'game_daily_quests', 'direct', context.dbPaths.games);
}

function upsertGameAchievement(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_achievements (user_id, achievement_id, title, description, metadata_json, unlocked_at)
        VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id, achievement_id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            metadata_json = excluded.metadata_json,
            unlocked_at = excluded.unlocked_at
    `).run(
        String(row.user_id),
        String(row.achievement_id),
        row.title || null,
        row.description || null,
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.unlocked_at || null
    );
    recordGameLegacyMap(context, row, 'achievement', `${row.user_id}:${row.achievement_id}`);
    bumpLoadReport(context.report, 'games/achievements', 'games', 'game_achievements', 'direct', context.dbPaths.games);
}

function upsertGameCosmetic(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_cosmetics (user_id, slot, item_id, equipped, source, metadata_json, acquired_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id, slot, item_id) DO UPDATE SET
            equipped = excluded.equipped,
            source = excluded.source,
            metadata_json = excluded.metadata_json,
            acquired_at = excluded.acquired_at,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.user_id),
        String(row.slot),
        String(row.item_id),
        row.equipped ? 1 : 0,
        row.source || 'import',
        toJson(row.metadata || {}, {}),
        row.acquired_at || null,
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'cosmetic', `${row.user_id}:${row.slot}:${row.item_id}`);
    bumpLoadReport(context.report, 'games/cosmetics', 'games', 'game_cosmetics', 'direct', context.dbPaths.games);
}

function upsertGameTag(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_tags (user_id, tag_id, source, metadata_json, granted_at)
        VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id, tag_id) DO UPDATE SET
            source = excluded.source,
            metadata_json = excluded.metadata_json,
            granted_at = excluded.granted_at
    `).run(
        String(row.user_id),
        String(row.tag_id),
        row.source || 'import',
        toJson(row.metadata || {}, {}),
        row.granted_at || null
    );
    recordGameLegacyMap(context, row, 'tag', `${row.user_id}:${row.tag_id}`);
    bumpLoadReport(context.report, 'games/tags', 'games', 'game_tags', 'direct', context.dbPaths.games);
}

function upsertGameEquippedTag(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_equipped_tags (user_id, tag_id, updated_at)
        VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id) DO UPDATE SET
            tag_id = excluded.tag_id,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.user_id),
        String(row.tag_id),
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'equipped-tag', row.user_id);
    bumpLoadReport(context.report, 'games/equipped-tags', 'games', 'game_equipped_tags', 'direct', context.dbPaths.games);
}

function upsertGameTagGuardianDefeat(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO game_tag_guardian_defeats (user_id, defeated_at)
        VALUES (?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id) DO UPDATE SET
            defeated_at = excluded.defeated_at
    `).run(String(row.user_id), row.defeated_at || null);
    recordGameLegacyMap(context, row, 'tag-guardian-defeat', row.user_id);
    bumpLoadReport(context.report, 'games/tag-guardian-defeats', 'games', 'game_tag_guardian_defeats', 'direct', context.dbPaths.games);
}

function upsertCanvasSetting(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO canvas_settings (key, value, type, updated_at)
        VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            type = excluded.type,
            updated_at = CURRENT_TIMESTAMP
    `).run(String(row.key), row.value == null ? '' : String(row.value), row.type || 'json', row.updated_at || null);
    recordGameLegacyMap(context, row, 'canvas-setting', row.key);
    bumpLoadReport(context.report, 'games/canvas-settings', 'games', 'canvas_settings', 'direct', context.dbPaths.games);
}

function upsertCanvasTile(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO canvas_tiles (x, y, color_index, user_id, username, ip_address, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(x, y) DO UPDATE SET
            color_index = excluded.color_index,
            user_id = excluded.user_id,
            username = excluded.username,
            ip_address = excluded.ip_address,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        row.x || 0,
        row.y || 0,
        row.color_index || 0,
        row.user_id || null,
        row.username || null,
        row.ip_address || null,
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'canvas-tile', `${row.x}:${row.y}`);
    bumpLoadReport(context.report, 'games/canvas-tiles', 'games', 'canvas_tiles', 'direct', context.dbPaths.games);
}

function upsertCanvasAction(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO canvas_actions (id, action_type, x, y, prev_color_index, color_index, user_id, username, ip_address, meta_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            action_type = excluded.action_type,
            x = excluded.x,
            y = excluded.y,
            prev_color_index = excluded.prev_color_index,
            color_index = excluded.color_index,
            user_id = excluded.user_id,
            username = excluded.username,
            ip_address = excluded.ip_address,
            meta_json = excluded.meta_json,
            created_at = excluded.created_at
    `).run(
        row.id,
        row.action_type || 'place',
        row.x == null ? null : row.x,
        row.y == null ? null : row.y,
        row.prev_color_index == null ? null : row.prev_color_index,
        row.color_index == null ? null : row.color_index,
        row.user_id || null,
        row.username || null,
        row.ip_address || null,
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.created_at || null
    );
    recordGameLegacyMap(context, row, 'canvas-action', row.id);
    bumpLoadReport(context.report, 'games/canvas-actions', 'games', 'canvas_actions', 'direct', context.dbPaths.games);
}

function upsertCanvasSnapshot(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO canvas_snapshots (id, name, board_data_json, created_by, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            board_data_json = excluded.board_data_json,
            created_by = excluded.created_by,
            metadata_json = excluded.metadata_json,
            created_at = excluded.created_at
    `).run(
        String(row.id),
        row.name || 'snapshot',
        toJson(row.board_data || null, null),
        row.created_by_user_id || null,
        toJson({ source: row.source, ...(row.metadata || {}) }, {}),
        row.created_at || null
    );
    recordGameLegacyMap(context, row, 'canvas-snapshot', row.id);
    bumpLoadReport(context.report, 'games/canvas-snapshots', 'games', 'canvas_snapshots', 'direct', context.dbPaths.games);
}

function upsertCanvasRegionLock(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO canvas_region_locks (id, label, mode, x1, y1, x2, y2, reason, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            label = excluded.label,
            mode = excluded.mode,
            x1 = excluded.x1,
            y1 = excluded.y1,
            x2 = excluded.x2,
            y2 = excluded.y2,
            reason = excluded.reason,
            created_by = excluded.created_by,
            created_at = excluded.created_at
    `).run(
        row.id,
        row.label || '',
        row.mode || 'locked',
        row.x1,
        row.y1,
        row.x2,
        row.y2,
        row.reason || '',
        row.created_by_user_id || null,
        row.created_at || null
    );
    recordGameLegacyMap(context, row, 'canvas-region-lock', row.id);
    bumpLoadReport(context.report, 'games/canvas-region-locks', 'games', 'canvas_region_locks', 'direct', context.dbPaths.games);
}

function upsertCanvasBan(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO canvas_bans (id, user_id, ip_address, action_type, reason, expires_at, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            ip_address = excluded.ip_address,
            action_type = excluded.action_type,
            reason = excluded.reason,
            expires_at = excluded.expires_at,
            created_by = excluded.created_by,
            created_at = excluded.created_at
    `).run(
        row.id,
        row.user_id || null,
        row.ip_address || null,
        row.action_type || 'ban',
        row.reason || '',
        row.expires_at || null,
        row.created_by_user_id || null,
        row.created_at || null
    );
    recordGameLegacyMap(context, row, 'canvas-ban', row.id);
    bumpLoadReport(context.report, 'games/canvas-bans', 'games', 'canvas_bans', 'direct', context.dbPaths.games);
}

function upsertCanvasUserOverride(context, row) {
    context.dbs.games.prepare(`
        INSERT INTO canvas_user_overrides (user_id, cooldown_seconds, placements_per_minute, bypass_read_only, note, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(user_id) DO UPDATE SET
            cooldown_seconds = excluded.cooldown_seconds,
            placements_per_minute = excluded.placements_per_minute,
            bypass_read_only = excluded.bypass_read_only,
            note = excluded.note,
            updated_by = excluded.updated_by,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(row.user_id),
        row.cooldown_seconds == null ? null : row.cooldown_seconds,
        row.placements_per_minute == null ? null : row.placements_per_minute,
        row.bypass_read_only ? 1 : 0,
        row.note || '',
        row.updated_by_user_id || null,
        row.updated_at || null
    );
    recordGameLegacyMap(context, row, 'canvas-user-override', row.user_id);
    bumpLoadReport(context.report, 'games/canvas-user-overrides', 'games', 'canvas_user_overrides', 'direct', context.dbPaths.games);
}

function loadGameDatasetRow(context, dataset, row) {
    switch (dataset) {
        case 'games/world-state':
            upsertGameWorldState(context, row);
            return;
        case 'games/players':
            upsertGamePlayer(context, row);
            return;
        case 'games/inventory':
            upsertGameInventoryRow(context, dataset, 'game_inventory', row);
            return;
        case 'games/bank':
            upsertGameInventoryRow(context, dataset, 'game_bank', row);
            return;
        case 'games/structures':
            upsertGameStructure(context, row);
            return;
        case 'games/farm-plots':
            upsertGameFarmPlot(context, row);
            return;
        case 'games/recipes':
            upsertGameRecipe(context, row);
            return;
        case 'games/effects':
            upsertGameEffect(context, row);
            return;
        case 'games/battle-stats':
            upsertGameBattleStats(context, row);
            return;
        case 'games/dungeon-runs':
            upsertGameDungeonRun(context, row);
            return;
        case 'games/leaderboards':
            upsertGameLeaderboard(context, row);
            return;
        case 'games/fish-collection':
            upsertGameFishCollection(context, row);
            return;
        case 'games/daily-quests':
            upsertGameDailyQuest(context, row);
            return;
        case 'games/achievements':
            upsertGameAchievement(context, row);
            return;
        case 'games/cosmetics':
            upsertGameCosmetic(context, row);
            return;
        case 'games/tags':
            upsertGameTag(context, row);
            return;
        case 'games/equipped-tags':
            upsertGameEquippedTag(context, row);
            return;
        case 'games/tag-guardian-defeats':
            upsertGameTagGuardianDefeat(context, row);
            return;
        case 'games/canvas-settings':
            upsertCanvasSetting(context, row);
            return;
        case 'games/canvas-tiles':
            upsertCanvasTile(context, row);
            return;
        case 'games/canvas-actions':
            upsertCanvasAction(context, row);
            return;
        case 'games/canvas-snapshots':
            upsertCanvasSnapshot(context, row);
            return;
        case 'games/canvas-region-locks':
            upsertCanvasRegionLock(context, row);
            return;
        case 'games/canvas-bans':
            upsertCanvasBan(context, row);
            return;
        case 'games/canvas-user-overrides':
            upsertCanvasUserOverride(context, row);
            return;
        default:
            loadIntoGamesHolding(context, dataset, row);
            context.addManualAction(`Dataset ${dataset} is temporarily stored in openvibe-games staging_import_records until a direct runtime table is added.`);
    }
}

function rememberCanonicalUser(context, row) {
    const sourceProfiles = row.source_profiles || {};
    if (sourceProfiles.hobostreamer && sourceProfiles.hobostreamer.legacy_id != null) {
        context.legacyUserMaps.hobostreamer.set(String(sourceProfiles.hobostreamer.legacy_id), row.id);
    }
    if (sourceProfiles.hobotools && sourceProfiles.hobotools.legacy_id != null) {
        context.legacyUserMaps.hobotools.set(String(sourceProfiles.hobotools.legacy_id), row.id);
    }
}

function loadDatasetRow(context, dataset, row) {
    switch (dataset) {
        case 'identity/users':
            rememberCanonicalUser(context, row);
            if (shouldWriteService(context, 'network')) {
                loadIntoNetworkHolding(context, dataset, row);
                context.addManualAction('openvibe-network stores migrated identity/control-plane rows in staging_import_records until standalone OpenVibe auth tables are implemented.');
            }
            return;
        case 'identity/linked-accounts':
        case 'identity/anon-users':
        case 'identity/verification-keys':
        case 'identity/user-effects':
        case 'identity/username-conflicts':
        case 'themes/catalog':
        case 'themes/preferences':
        case 'control-plane/user-preferences':
        case 'control-plane/oauth-clients':
        case 'control-plane/notifications':
        case 'control-plane/notification-preferences':
        case 'social/follows':
            if (shouldWriteService(context, 'network')) {
                loadIntoNetworkHolding(context, dataset, row);
                context.addManualAction('openvibe-network stores migrated identity/control-plane rows in staging_import_records until standalone OpenVibe auth tables are implemented.');
            }
            return;
        case 'control-plane/url-registry':
            if (shouldWriteService(context, 'network')) {
                loadIntoNetworkHolding(context, dataset, row);
                upsertNetworkUrlOverlay(context.dbs.network, row);
                bumpLoadReport(context.report, dataset, 'network', 'url_registry_overlay', 'direct', context.dbPaths.network);
            }
            return;
        case 'live/channels':
            if (shouldWriteService(context, 'restream')) upsertRestreamChannel(context, row);
            if (shouldWriteService(context, 'live')) upsertLiveChannel(context, row);
            return;
        case 'live/stream-definitions':
            if (shouldWriteService(context, 'restream')) {
                loadIntoRestreamHolding(context, dataset, row);
                context.addManualAction('openre-stream does not yet expose first-class stream-definition runtime tables, so migrated definitions are stored in staging_import_records.');
            }
            return;
        case 'live/stream-sessions':
            {
                if (!shouldWriteService(context, 'restream') && !shouldWriteService(context, 'live')) return;
                const channelBinding = resolveStreamChannelBinding(context, row);
                if (shouldWriteService(context, 'restream')) upsertRestreamStream(context, row, channelBinding);
                if (shouldWriteService(context, 'live')) upsertLiveStream(context, row, channelBinding);
            }
            return;
        case 'live/restream_destinations':
            if (shouldWriteService(context, 'restream')) upsertRestreamDestination(context, row);
            return;
        case 'chat/messages':
            if (shouldWriteService(context, 'chat')) upsertChatMessage(context, row);
            return;
        case 'chat/moderation-bans':
            if (shouldWriteService(context, 'chat')) {
                loadIntoChatHolding(context, dataset, row);
                context.addManualAction('openvibe-chat does not yet expose first-class moderation-ban runtime tables, so migrated bans are stored in staging_import_records.');
            }
            return;
        case 'community/pastes':
            if (shouldWriteService(context, 'community')) upsertCommunityPaste(context, row);
            return;
        case 'community/comments':
            if (shouldWriteService(context, 'community')) upsertCommunityComment(context, row);
            return;
        case 'community/paste_likes':
        case 'community/paste_comments':
            if (shouldWriteService(context, 'community')) {
                loadIntoCommunityHolding(context, dataset, row);
                context.addManualAction('openvibe-community stores migrated paste likes/comments in staging_import_records until richer engagement models are wired into the runtime tables.');
            }
            return;
        case 'media/objects':
            if (shouldWriteService(context, 'media')) upsertMediaObject(context, row);
            return;
        case 'billing/subscriptions':
            if (shouldWriteService(context, 'billing')) {
                loadIntoBillingHolding(context, dataset, row);
                context.addManualAction('openvibe-billing stores migrated legacy subscriptions in staging_import_records until canonical plan and entitlement remapping is implemented.');
            }
            return;
        default:
            break;
    }

    if (dataset.startsWith('games/')) {
        if (shouldWriteService(context, 'games')) {
            loadGameDatasetRow(context, dataset, row);
        }
        return;
    }

    if (dataset.startsWith('live/')) {
        if ([
            'live/channel_moderators',
            'live/channel_moderation_settings',
            'live/viewer_snapshots',
            'live/stream_analytics',
            'live/media_request_settings',
            'live/media_requests',
            'live/vibe_coding_sessions',
            'live/vibe_coding_events',
        ].includes(dataset)) {
            if (shouldWriteService(context, 'live')) {
                loadIntoLiveHolding(context, dataset, row);
            }
        } else {
            if (shouldWriteService(context, 'restream')) {
                loadIntoRestreamHolding(context, dataset, row);
            }
        }
        if (shouldWriteService(context, 'live') || shouldWriteService(context, 'restream')) {
            context.addManualAction('Some live/re-stream datasets are staged into holding tables pending a fuller canonical runtime model.');
        }
        return;
    }

    if (dataset.startsWith('loyalty/')) {
        if (shouldWriteService(context, 'billing')) {
            loadIntoBillingHolding(context, dataset, row);
            context.addManualAction('Loyalty datasets are stored in openvibe-billing staging_import_records until a dedicated non-billing loyalty service/model is implemented.');
        }
        return;
    }

    if (shouldWriteService(context, 'network')) {
        loadIntoNetworkHolding(context, dataset, row);
        context.addManualAction(`Dataset ${dataset} fell back to openvibe-network staging_import_records because no more specific staging target exists yet.`);
    }
}

async function loadDatasetFile(context, dataset, filePath) {
    if (!fs.existsSync(filePath)) return;
    await forEachNdjson(filePath, async (row) => {
        loadDatasetRow(context, dataset, row);
    });
}

function datasetLoadOrder(importReport) {
    const preferred = [
        'identity/users',
        'identity/linked-accounts',
        'identity/anon-users',
        'identity/verification-keys',
        'identity/user-effects',
        'identity/username-conflicts',
        'themes/catalog',
        'themes/preferences',
        'control-plane/user-preferences',
        'control-plane/url-registry',
        'control-plane/oauth-clients',
        'control-plane/notifications',
        'control-plane/notification-preferences',
        'social/follows',
        'live/channels',
        'live/stream-definitions',
        'live/stream-sessions',
        'live/restream_destinations',
        'chat/messages',
        'chat/moderation-bans',
        'community/pastes',
        'community/comments',
        'community/paste_likes',
        'community/paste_comments',
        'games/world-state',
        'games/players',
        'games/inventory',
        'games/bank',
        'games/structures',
        'games/farm-plots',
        'games/recipes',
        'games/effects',
        'games/battle-stats',
        'games/dungeon-runs',
        'games/leaderboards',
        'games/fish-collection',
        'games/daily-quests',
        'games/achievements',
        'games/cosmetics',
        'games/tags',
        'games/equipped-tags',
        'games/tag-guardian-defeats',
        'games/canvas-settings',
        'games/canvas-tiles',
        'games/canvas-actions',
        'games/canvas-snapshots',
        'games/canvas-region-locks',
        'games/canvas-bans',
        'games/canvas-user-overrides',
        'media/objects',
        'billing/subscriptions',
        'loyalty/coin-transactions',
        'loyalty/coin-rewards',
        'loyalty/coin-redemptions',
        'loyalty/watch-time',
    ];

    const available = new Set(Object.keys(importReport.datasets || {}));
    const ordered = preferred.filter((dataset) => available.has(dataset));
    for (const dataset of Object.keys(importReport.datasets || {})) {
        if (!ordered.includes(dataset)) {
            ordered.push(dataset);
        }
    }
    return ordered;
}

async function loadStagingBundle(options) {
    const requestedMode = normalizeLoaderMode(options.mode || 'sqlite');
    if (requestedMode !== 'sqlite') {
        throw new Error(`load-staging-openvibe only supports sqlite staging mode. Use scripts/migrate-hobo/load-postgres.js for mode='${requestedMode}'.`);
    }

    const allowStagingLoad = isTruthy(process.env.OPENVIBE_ALLOW_STAGING_LOAD);
    const stagingConfirmEnv = isTruthy(process.env.OPENVIBE_STAGING_CONFIRM);
    const confirmLoad = isTruthy(options.confirmLoad);
    const dryRun = !!options.dryRun;
    if (!dryRun && (!allowStagingLoad || !stagingConfirmEnv || !confirmLoad)) {
        throw new Error('Refusing staging load without explicit confirmation. Set OPENVIBE_ALLOW_STAGING_LOAD=true and OPENVIBE_STAGING_CONFIRM=true, then pass --confirm-load (or confirmLoad: true).');
    }

    const bundleDir = path.resolve(options.bundleDir);
    const requestedDbPaths = resolveServiceDbPaths(options.dbPaths || {});
    const effectiveDbPaths = dryRun ? effectiveDryRunDbPaths(requestedDbPaths) : requestedDbPaths;
    const serviceFilter = parseSelectionSet(options.services || options.service, normalizeStagingServiceName);
    if (serviceFilter) {
        for (const serviceName of serviceFilter) {
            if (!KNOWN_STAGING_SERVICES.has(serviceName)) {
                throw new Error(`Unknown staging-loader service filter '${serviceName}'. Expected one of: ${Array.from(KNOWN_STAGING_SERVICES).join(', ')}`);
            }
        }
    }
    const datasetFilter = parseSelectionSet(options.datasets || options.dataset);
    const runId = options.runId || `staging-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const context = buildContext(bundleDir, effectiveDbPaths, options.logger, {
        runId,
        requestedMode,
        effectiveMode: 'sqlite-staging',
        dryRun,
        requestedDbPaths,
        allowStagingLoad,
        stagingConfirmEnv,
        confirmLoad,
        selectedServices: serviceFilter ? Array.from(serviceFilter) : [],
        selectedDatasets: datasetFilter ? Array.from(datasetFilter) : [],
        serviceFilter,
        datasetFilter,
    });

    try {
        const requiredExclusions = new Set(['users.hobo_bucks_balance', 'transactions']);
        const exclusions = new Set((context.importReport.exclusions || []).map((entry) => entry.entity));
        context.report.hobo_bucks_exclusion_confirmed = Array.from(requiredExclusions).every((entity) => exclusions.has(entity));

        for (const dataset of datasetLoadOrder(context.importReport)) {
            if (!shouldIncludeDataset(context, dataset)) {
                context.report.skipped_datasets.push({
                    dataset,
                    reason: context.datasetFilter && !context.datasetFilter.has(dataset)
                        ? 'dataset-filter'
                        : 'service-filter',
                    targets: datasetTargetServices(dataset),
                });
                continue;
            }
            const filePath = path.join(bundleDir, `${dataset}.ndjson`);
            await loadDatasetFile(context, dataset, filePath);
        }

        const reportPath = path.join(bundleDir, 'audit', 'staging-load-report.json');
        writeJson(reportPath, context.report);
        if (context.logger) {
            context.logger.info(`Staging load report written to ${reportPath}`);
        }
        return context.report;
    } finally {
        closeServiceDbs(context.dbs);
    }
}

module.exports = {
    loadStagingBundle,
    resolveServiceDbPaths,
};
