'use strict';

const fs = require('fs');
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

function buildContext(bundleDir, dbPaths, logger) {
    const importReport = loadJson(path.join(bundleDir, 'audit', 'import-report.json'), { exclusions: [], datasets: {} });
    const report = {
        generated_at: new Date().toISOString(),
        bundle_dir: bundleDir,
        service_db_paths: dbPaths,
        hobo_bucks_exclusion_confirmed: false,
        datasets: {},
        services: {},
        manual_actions: [],
    };

    const manualActions = new Set();
    const dbs = initServiceDbs(dbPaths);
    for (const db of Object.values(dbs)) {
        ensureHoldingTable(db);
    }

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
    const existing = getRestreamChannelById(context, syntheticId);
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

    upsertRestreamChannel(context, channelRow);
    upsertLiveChannel(context, channelRow);
    context.addManualAction('Some migrated stream sessions did not have a resolvable channel reference and were assigned synthetic fallback channels during staging load.');
    return { channelId: syntheticId, channelSlug: syntheticSlug, mode: 'synthetic-created' };
}

function resolveStreamChannelBinding(context, row) {
    const explicit = getRestreamChannelById(context, row.channel_id);
    if (explicit) {
        return { channelId: explicit.id, channelSlug: explicit.slug, mode: 'explicit' };
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
            loadIntoNetworkHolding(context, dataset, row);
            context.addManualAction('openvibe-network stores migrated identity/control-plane rows in staging_import_records until standalone OpenVibe auth tables are implemented.');
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
            loadIntoNetworkHolding(context, dataset, row);
            context.addManualAction('openvibe-network stores migrated identity/control-plane rows in staging_import_records until standalone OpenVibe auth tables are implemented.');
            return;
        case 'control-plane/url-registry':
            loadIntoNetworkHolding(context, dataset, row);
            upsertNetworkUrlOverlay(context.dbs.network, row);
            bumpLoadReport(context.report, dataset, 'network', 'url_registry_overlay', 'direct', context.dbPaths.network);
            return;
        case 'live/channels':
            upsertRestreamChannel(context, row);
            upsertLiveChannel(context, row);
            return;
        case 'live/stream-definitions':
            loadIntoRestreamHolding(context, dataset, row);
            context.addManualAction('openre-stream does not yet expose first-class stream-definition runtime tables, so migrated definitions are stored in staging_import_records.');
            return;
        case 'live/stream-sessions':
            {
                const channelBinding = resolveStreamChannelBinding(context, row);
                upsertRestreamStream(context, row, channelBinding);
                upsertLiveStream(context, row, channelBinding);
            }
            return;
        case 'live/restream_destinations':
            upsertRestreamDestination(context, row);
            return;
        case 'chat/messages':
            upsertChatMessage(context, row);
            return;
        case 'chat/moderation-bans':
            loadIntoChatHolding(context, dataset, row);
            context.addManualAction('openvibe-chat does not yet expose first-class moderation-ban runtime tables, so migrated bans are stored in staging_import_records.');
            return;
        case 'community/pastes':
            upsertCommunityPaste(context, row);
            return;
        case 'community/comments':
            upsertCommunityComment(context, row);
            return;
        case 'community/paste_likes':
        case 'community/paste_comments':
            loadIntoCommunityHolding(context, dataset, row);
            context.addManualAction('openvibe-community stores migrated paste likes/comments in staging_import_records until richer engagement models are wired into the runtime tables.');
            return;
        case 'media/objects':
            upsertMediaObject(context, row);
            return;
        case 'billing/subscriptions':
            loadIntoBillingHolding(context, dataset, row);
            context.addManualAction('openvibe-billing stores migrated legacy subscriptions in staging_import_records until canonical plan and entitlement remapping is implemented.');
            return;
        default:
            break;
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
            loadIntoLiveHolding(context, dataset, row);
        } else {
            loadIntoRestreamHolding(context, dataset, row);
        }
        context.addManualAction('Some live/re-stream datasets are staged into holding tables pending a fuller canonical runtime model.');
        return;
    }

    if (dataset.startsWith('loyalty/')) {
        loadIntoBillingHolding(context, dataset, row);
        context.addManualAction('Loyalty datasets are stored in openvibe-billing staging_import_records until a dedicated non-billing loyalty service/model is implemented.');
        return;
    }

    loadIntoNetworkHolding(context, dataset, row);
    context.addManualAction(`Dataset ${dataset} fell back to openvibe-network staging_import_records because no more specific staging target exists yet.`);
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
    const bundleDir = path.resolve(options.bundleDir);
    const dbPaths = resolveServiceDbPaths(options.dbPaths || {});
    const context = buildContext(bundleDir, dbPaths, options.logger);

    try {
        const requiredExclusions = new Set(['users.hobo_bucks_balance', 'transactions']);
        const exclusions = new Set((context.importReport.exclusions || []).map((entry) => entry.entity));
        context.report.hobo_bucks_exclusion_confirmed = Array.from(requiredExclusions).every((entity) => exclusions.has(entity));

        for (const dataset of datasetLoadOrder(context.importReport)) {
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
