'use strict';

const crypto = require('crypto');
const db = require('./db');

function newId(prefix) { return `${prefix}_${crypto.randomBytes(10).toString('hex')}`; }

function clampLimit(limit, fallbackValue, maxValue) {
    const max = Number.isFinite(maxValue) ? maxValue : 200;
    return Math.min(parseInt(limit, 10) || fallbackValue, max);
}

function parseJson(value) {
    try {
        return JSON.parse(value || '{}');
    } catch {
        return {};
    }
}

function toNumber(value, fallbackValue) {
    const fallback = Number.isFinite(fallbackValue) ? fallbackValue : 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeArray(value) {
    return Array.isArray(value)
        ? value
            .map((item) => String(item == null ? '' : item).trim())
            .filter(Boolean)
        : [];
}

function getStreamActivityStamp(stream) {
    const raw = stream.ended_at || stream.started_at || stream.updated_at || stream.created_at || null;
    if (!raw) return 0;
    const stamp = Date.parse(String(raw).includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
    return Number.isFinite(stamp) ? stamp : 0;
}

function getTimestamp(value) {
    if (!value) return 0;
    const stamp = Date.parse(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
    return Number.isFinite(stamp) ? stamp : 0;
}

function getStreamDurationSeconds(stream, nowMs) {
    const startedAt = getTimestamp(stream && (stream.started_at || stream.created_at));
    if (!startedAt) return 0;
    const endedAt = getTimestamp(stream && stream.ended_at);
    const referenceNow = Number.isFinite(nowMs) ? nowMs : Date.now();
    const finishedAt = endedAt || (stream && stream.is_live ? referenceNow : getTimestamp(stream && (stream.updated_at || stream.created_at)));
    if (!finishedAt || finishedAt <= startedAt) return 0;
    return Math.max(0, Math.round((finishedAt - startedAt) / 1000));
}

const MODEL_CACHE_TTL_MS = 5000;
let _channelsCache = null;
let _channelsCacheAt = 0;
let _streamsCache = null;
let _streamsCacheAt = 0;

function allChannels() {
    const now = Date.now();
    if (_channelsCache && (now - _channelsCacheAt) < MODEL_CACHE_TTL_MS) return _channelsCache;
    _channelsCache = db.get().prepare(`SELECT * FROM live_channels ORDER BY rowid DESC`).all().map(hydrateChannel);
    _channelsCacheAt = now;
    return _channelsCache;
}

function allStreams() {
    const now = Date.now();
    if (_streamsCache && (now - _streamsCacheAt) < MODEL_CACHE_TTL_MS) return _streamsCache;
    _streamsCache = db.get().prepare(`SELECT * FROM live_streams ORDER BY rowid DESC`).all().map(hydrateStream);
    _streamsCacheAt = now;
    return _streamsCache;
}

function hydrateChannel(row) {
    if (!row) return null;
    const metadata = parseJson(row.metadata_json);
    const nestedMetadata = metadata.metadata && typeof metadata.metadata === 'object' ? metadata.metadata : {};
    return Object.assign({}, row, {
        metadata,
        source: metadata.source || null,
        category: metadata.category || null,
        tags: normalizeArray(metadata.tags),
        protocol: metadata.protocol || nestedMetadata.protocol || null,
        panels: Array.isArray(nestedMetadata.panels) ? nestedMetadata.panels : [],
        has_weather: !!nestedMetadata.weather_zip,
        active_control_config_id: nestedMetadata.active_control_config_id || null,
    });
}

function hydrateStream(row) {
    if (!row) return null;
    const metadata = parseJson(row.metadata_json);
    const nestedMetadata = metadata.metadata && typeof metadata.metadata === 'object' ? metadata.metadata : {};
    const clipMediaIds = normalizeArray(metadata.clip_media_ids);
    if (!clipMediaIds.length && metadata.clip_media_id) clipMediaIds.push(String(metadata.clip_media_id));
    const viewerCount = toNumber(metadata.viewer_count, toNumber(nestedMetadata.viewer_count, 0));
    const peakViewers = toNumber(metadata.peak_viewers, Math.max(viewerCount, toNumber(nestedMetadata.peak_viewers, 0)));
    const clipCount = Math.max(
        toNumber(metadata.clip_count, 0),
        toNumber(nestedMetadata.clip_count, 0),
        clipMediaIds.length,
        metadata.has_clips ? 1 : 0
    );
    return Object.assign({}, row, {
        metadata,
        source: metadata.source || null,
        viewer_count: viewerCount,
        peak_viewers: peakViewers,
        clip_media_ids: clipMediaIds,
        clip_count: clipCount,
        has_clips: clipCount > 0,
        is_live: row.status === 'started' || metadata.is_live === true,
        protocol: metadata.protocol || nestedMetadata.protocol || null,
        channel_binding_mode: metadata.channel_binding_mode || null,
    });
}

function upsertChannel({ slug, display_name, owner_user_id, description, avatar_url, metadata }) {
    _channelsCache = null;
    const sql = db.get();
    const existing = sql.prepare(`SELECT * FROM live_channels WHERE slug = ?`).get(String(slug));
    if (existing) {
        sql.prepare(`
            UPDATE live_channels SET
                display_name = COALESCE(?, display_name),
                owner_user_id = COALESCE(?, owner_user_id),
                description = COALESCE(?, description),
                avatar_url = COALESCE(?, avatar_url),
                metadata_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(display_name || null, owner_user_id || null, description || null, avatar_url || null,
               JSON.stringify(metadata || {}), existing.id);
        return getChannelBySlug(slug);
    }
    const id = newId('lch');
    sql.prepare(`
        INSERT INTO live_channels (id, slug, display_name, owner_user_id, description, avatar_url, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, String(slug), display_name || null, owner_user_id || null, description || null,
           avatar_url || null, JSON.stringify(metadata || {}));
    return getChannelBySlug(slug);
}
function getChannelBySlug(slug) {
    const key = String(slug);
    const cached = _channelsCache;
    if (cached) {
        return cached.find((c) => c.slug === key) || null;
    }
    return hydrateChannel(db.get().prepare(`SELECT * FROM live_channels WHERE slug = ?`).get(key));
}

function getChannelByOwnerUserId(ownerUserId) {
    if (!ownerUserId) return null;
    return hydrateChannel(db.get().prepare(`
        SELECT * FROM live_channels
        WHERE owner_user_id = ?
        ORDER BY rowid DESC
        LIMIT 1
    `).get(String(ownerUserId)));
}

function listChannels({ limit }) {
    const cap = clampLimit(limit, 50);
    return db.get().prepare(`SELECT * FROM live_channels ORDER BY rowid DESC LIMIT ?`).all(cap).map(hydrateChannel);
}

function upsertStream({ id, channel_slug, channel_id, status, title, category, thumbnail_url, embed_url, vod_media_id, started_at, ended_at, metadata }) {
    _streamsCache = null;
    const sql = db.get();
    const existing = sql.prepare(`SELECT * FROM live_streams WHERE id = ?`).get(String(id));
    if (existing) {
        sql.prepare(`
            UPDATE live_streams SET
                channel_slug = COALESCE(?, channel_slug),
                channel_id = COALESCE(?, channel_id),
                status = COALESCE(?, status),
                title = COALESCE(?, title),
                category = COALESCE(?, category),
                thumbnail_url = COALESCE(?, thumbnail_url),
                embed_url = COALESCE(?, embed_url),
                vod_media_id = COALESCE(?, vod_media_id),
                started_at = COALESCE(?, started_at),
                ended_at = COALESCE(?, ended_at),
                metadata_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(channel_slug || null, channel_id || null, status || null, title || null, category || null,
               thumbnail_url || null, embed_url || null, vod_media_id || null, started_at || null, ended_at || null,
               JSON.stringify(metadata || existing.metadata_json ? (metadata || JSON.parse(existing.metadata_json || '{}')) : {}),
               String(id));
        return getStreamById(id);
    }
    sql.prepare(`
        INSERT INTO live_streams (id, channel_slug, channel_id, status, title, category, thumbnail_url, embed_url, vod_media_id, started_at, ended_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(String(id), String(channel_slug || ''), channel_id || null, status || 'created', title || null, category || null,
           thumbnail_url || null, embed_url || null, vod_media_id || null, started_at || null, ended_at || null,
           JSON.stringify(metadata || {}));
    return getStreamById(id);
}
function getStreamById(id) {
    return hydrateStream(db.get().prepare(`SELECT * FROM live_streams WHERE id = ?`).get(String(id)));
}

function listStreams({ channel_slug, status, limit }) {
    const where = []; const args = [];
    if (channel_slug) { where.push('channel_slug = ?'); args.push(String(channel_slug)); }
    const normalizedStatus = status === 'live' ? 'started' : status;
    if (normalizedStatus) { where.push('status = ?'); args.push(String(normalizedStatus)); }
    const cap = clampLimit(limit, 50);
    const sql = where.length
        ? `SELECT * FROM live_streams WHERE ${where.join(' AND ')} ORDER BY rowid DESC LIMIT ?`
        : `SELECT * FROM live_streams ORDER BY rowid DESC LIMIT ?`;
    return db.get().prepare(sql).all(...args, cap).map(hydrateStream);
}

function listLiveNow({ limit }) {
    const cap = clampLimit(limit, 12);
    // Exclude stale streams started more than 8 hours ago with no recent activity
    // These are typically migrated/orphaned streams that never received an end event.
    return db.get().prepare(`
        SELECT * FROM live_streams
        WHERE status = 'started'
        AND COALESCE(started_at, created_at) > datetime('now', '-8 hours')
        ORDER BY COALESCE(started_at, created_at) DESC, rowid DESC
        LIMIT ?
    `).all(cap).map(hydrateStream);
}

function listRecentlyEnded({ limit }) {
    const cap = clampLimit(limit, 12);
    return db.get().prepare(`
        SELECT * FROM live_streams
        WHERE status != 'started'
        ORDER BY COALESCE(ended_at, started_at, created_at) DESC, rowid DESC
        LIMIT ?
    `).all(cap).map(hydrateStream);
}

function listChannelsWithStreams({ limit }) {
    const cap = clampLimit(limit, 66, 500);
    return db.get().prepare(`
        SELECT ls.channel_slug, MAX(COALESCE(ls.ended_at, ls.started_at, ls.created_at)) as last_active
        FROM live_streams ls
        WHERE ls.channel_slug IS NOT NULL AND TRIM(ls.channel_slug) != ''
        GROUP BY ls.channel_slug
        ORDER BY last_active DESC
        LIMIT ?
    `).all(cap);
}

function listRecentVodStreams({ limit }) {
    const cap = clampLimit(limit, 12);
    return db.get().prepare(`
        SELECT * FROM live_streams
        WHERE vod_media_id IS NOT NULL AND TRIM(vod_media_id) != ''
        ORDER BY COALESCE(ended_at, started_at, created_at) DESC, rowid DESC
        LIMIT ?
    `).all(cap).map(hydrateStream);
}

function listRecentClips({ limit }) {
    const cap = clampLimit(limit, 12);
    return allStreams()
        .filter((stream) => {
            return stream.has_clips;
        })
        .sort((left, right) => getStreamActivityStamp(right) - getStreamActivityStamp(left))
        .slice(0, cap);
}

function listVods({ channel_slug, limit }) {
    const cap = clampLimit(limit, 24);
    return allStreams()
        .filter((stream) => !channel_slug || stream.channel_slug === String(channel_slug))
        .filter((stream) => !!(stream.vod_media_id && String(stream.vod_media_id).trim()))
        .sort((left, right) => getStreamActivityStamp(right) - getStreamActivityStamp(left))
        .slice(0, cap);
}

function listClips({ channel_slug, limit }) {
    const cap = clampLimit(limit, 24);
    return allStreams()
        .filter((stream) => !channel_slug || stream.channel_slug === String(channel_slug))
        .filter((stream) => stream.has_clips)
        .sort((left, right) => getStreamActivityStamp(right) - getStreamActivityStamp(left))
        .slice(0, cap);
}

function getChannelStats(channelSlug) {
    const streams = allStreams().filter((stream) => stream.channel_slug === String(channelSlug));
    const liveStreams = streams.filter((stream) => stream.is_live);
    const vodCount = streams.filter((stream) => !!(stream.vod_media_id && String(stream.vod_media_id).trim())).length;
    const clipCount = streams.reduce((total, stream) => total + stream.clip_count, 0);
    const nowMs = Date.now();
    let lastActivityAt = null;
    let lastEndedAt = null;
    let peakViewers = 0;
    let streamTimeSeconds = 0;
    for (const stream of streams) {
        peakViewers = Math.max(peakViewers, stream.peak_viewers || 0);
        streamTimeSeconds += getStreamDurationSeconds(stream, nowMs);
        const activityStamp = getStreamActivityStamp(stream);
        if (activityStamp && (!lastActivityAt || activityStamp > Date.parse(String(lastActivityAt).includes('T') ? lastActivityAt : `${lastActivityAt.replace(' ', 'T')}Z`))) {
            lastActivityAt = stream.ended_at || stream.started_at || stream.updated_at || stream.created_at;
        }
        if (stream.ended_at) {
            const endedStamp = Date.parse(String(stream.ended_at).includes('T') ? stream.ended_at : `${stream.ended_at.replace(' ', 'T')}Z`);
            if (Number.isFinite(endedStamp) && (!lastEndedAt || endedStamp > Date.parse(String(lastEndedAt).includes('T') ? lastEndedAt : `${lastEndedAt.replace(' ', 'T')}Z`))) {
                lastEndedAt = stream.ended_at;
            }
        }
    }
    return {
        total_streams: streams.length,
        live_sessions: liveStreams.length,
        vods: vodCount,
        clips: clipCount,
        current_viewers: liveStreams.reduce((total, stream) => total + (stream.viewer_count || 0), 0),
        peak_viewers: peakViewers,
        stream_time_seconds: streamTimeSeconds,
        last_activity_at: lastActivityAt,
        last_ended_at: lastEndedAt,
    };
}

function listFeaturedChannels({ limit }) {
    const cap = clampLimit(limit, 8, 48);
    return allChannels()
        .map((channel) => {
            const currentStream = getCurrentLiveStream(channel.slug);
            const stats = getChannelStats(channel.slug);
            const activityStamp = stats.last_activity_at
                ? (Date.parse(String(stats.last_activity_at).includes('T') ? stats.last_activity_at : `${stats.last_activity_at.replace(' ', 'T')}Z`) || 0)
                : 0;
            const score = (currentStream ? 1_000_000 : 0)
                + ((stats.current_viewers || 0) * 2_500)
                + ((stats.peak_viewers || 0) * 20)
                + activityStamp;
            return Object.assign({}, channel, { currentStream, stats, score });
        })
        .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            if ((right.stats && right.stats.total_streams) !== (left.stats && left.stats.total_streams)) {
                return (right.stats && right.stats.total_streams) - (left.stats && left.stats.total_streams);
            }
            return String(left.slug).localeCompare(String(right.slug));
        })
        .slice(0, cap);
}

function listTrendingStreams({ limit }) {
    const cap = clampLimit(limit, 6, 48);
    return allStreams()
        .sort((left, right) => {
            if (Number(right.is_live) !== Number(left.is_live)) return Number(right.is_live) - Number(left.is_live);
            if ((right.viewer_count || 0) !== (left.viewer_count || 0)) return (right.viewer_count || 0) - (left.viewer_count || 0);
            if ((right.peak_viewers || 0) !== (left.peak_viewers || 0)) return (right.peak_viewers || 0) - (left.peak_viewers || 0);
            return getStreamActivityStamp(right) - getStreamActivityStamp(left);
        })
        .slice(0, cap);
}

function listTopCategories({ limit }) {
    const cap = clampLimit(limit, 8, 48);
    const counts = new Map();
    for (const stream of allStreams()) {
        const key = String(stream.category || '').trim().toLowerCase();
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const channel of allChannels()) {
        const key = String(channel.category || '').trim().toLowerCase();
        if (!key || counts.has(key)) continue;
        counts.set(key, 1);
    }
    return [...counts.entries()]
        .map(([slug, count]) => ({
            slug,
            label: slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
            count,
        }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
        .slice(0, cap);
}

function getHomeStats() {
    const sql = db.get();
    const liveNow = listLiveNow({ limit: 200 });
    const allKnownStreams = allStreams();
    const clipStreams = allKnownStreams.filter((stream) => stream.has_clips);
    const categories = listTopCategories({ limit: 100 });
    const nowMs = Date.now();
    return {
        live_now: sql.prepare(`SELECT COUNT(*) AS count FROM live_streams WHERE status = 'started'`).get().count,
        channels: sql.prepare(`SELECT COUNT(*) AS count FROM live_channels`).get().count,
        vods: sql.prepare(`SELECT COUNT(*) AS count FROM live_streams WHERE vod_media_id IS NOT NULL AND TRIM(vod_media_id) != ''`).get().count,
        total_streams: sql.prepare(`SELECT COUNT(*) AS count FROM live_streams`).get().count,
        current_viewers: liveNow.reduce((total, stream) => total + (stream.viewer_count || 0), 0),
        peak_live_viewers: liveNow.reduce((total, stream) => total + (stream.peak_viewers || 0), 0),
        stream_time_seconds: allKnownStreams.reduce((total, stream) => total + getStreamDurationSeconds(stream, nowMs), 0),
        clips: clipStreams.reduce((total, stream) => total + (stream.clip_count || 0), 0),
        categories: categories.length,
    };
}

function getCurrentLiveStream(channel_slug) {
    const slug = String(channel_slug);
    // Use the in-process streams cache when available to avoid per-channel queries
    const cached = _streamsCache;
    if (cached) {
        return cached.find((s) => s.channel_slug === slug && s.status === 'started') || null;
    }
    return hydrateStream(db.get().prepare(`
        SELECT * FROM live_streams WHERE channel_slug = ? AND status = 'started' ORDER BY rowid DESC LIMIT 1
    `).get(slug));
}

function getStreamTimeline(streamId) {
    const stream = getStreamById(streamId);
    if (!stream) return null;
    const durationSeconds = getStreamDurationSeconds(stream, Date.now());
    return {
        stream_id: stream.id,
        channel_slug: stream.channel_slug,
        started_at: stream.started_at,
        ended_at: stream.ended_at,
        duration_seconds: durationSeconds,
        markers: stream.clip_media_ids.map((mediaId, index) => ({
            id: `clip:${mediaId}`,
            media_id: mediaId,
            label: `Clip ${index + 1}`,
            type: 'clip',
        })),
        has_vod: !!stream.vod_media_id,
        vod_media_id: stream.vod_media_id || null,
    };
}

function recordMirror({ stream_id, channel_slug, details }) {
    db.get().prepare(`
        INSERT INTO mirror_state (stream_id, channel_slug, mirrored_at, details_json)
        VALUES (?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(stream_id) DO UPDATE SET
            channel_slug = excluded.channel_slug,
            mirrored_at = CURRENT_TIMESTAMP,
            details_json = excluded.details_json
    `).run(String(stream_id), String(channel_slug || ''), JSON.stringify(details || {}));
}

function recordLegacy({ source, kind, legacy_id, new_id }) {
    db.get().prepare(`INSERT OR IGNORE INTO legacy_id_map (source, kind, legacy_id, new_id) VALUES (?, ?, ?, ?)`)
        .run(String(source), String(kind), String(legacy_id), String(new_id));
}

module.exports = {
    upsertChannel, getChannelBySlug, getChannelByOwnerUserId, listChannels,
    upsertStream, getStreamById, listStreams, listLiveNow, listRecentlyEnded, listChannelsWithStreams, listRecentVodStreams, listRecentClips, listVods, listClips,
    listFeaturedChannels, listTrendingStreams, listTopCategories, getChannelStats, getHomeStats, getCurrentLiveStream,
    getStreamTimeline,
    recordMirror, recordLegacy,
};
