'use strict';

const db = require('./db');

function hydrateMediaAccessRollup(row) {
    if (!row) return null;
    return {
        media_id: row.media_id,
        media_kind: row.media_kind,
        views_1h: Number(row.views_1h || 0),
        views_24h: Number(row.views_24h || 0),
        views_7d: Number(row.views_7d || 0),
        views_30d: Number(row.views_30d || 0),
        unique_viewers_1h: Number(row.unique_viewers_1h || 0),
        unique_viewers_24h: Number(row.unique_viewers_24h || 0),
        unique_viewers_7d: Number(row.unique_viewers_7d || 0),
        unique_viewers_30d: Number(row.unique_viewers_30d || 0),
        watch_minutes_24h: Number(row.watch_minutes_24h || 0),
        watch_minutes_7d: Number(row.watch_minutes_7d || 0),
        bytes_served_24h: Number(row.bytes_served_24h || 0),
        bytes_served_7d: Number(row.bytes_served_7d || 0),
        cache_miss_bytes_24h: Number(row.cache_miss_bytes_24h || 0),
        cache_miss_bytes_7d: Number(row.cache_miss_bytes_7d || 0),
        concurrent_viewers_peak_24h: Number(row.concurrent_viewers_peak_24h || 0),
        last_viewed_at: row.last_viewed_at || null,
        updated_at: row.updated_at,
    };
}

function hydrateSiteHeatRollup(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        window_name: row.window_name,
        unique_video_viewers: Number(row.unique_video_viewers || 0),
        video_watch_minutes: Number(row.video_watch_minutes || 0),
        media_origin_egress_bytes: Number(row.media_origin_egress_bytes || 0),
        media_cache_miss_bytes: Number(row.media_cache_miss_bytes || 0),
        concurrent_viewers_peak: Number(row.concurrent_viewers_peak || 0),
        calculated_at: row.calculated_at,
    };
}

function hydratePartAccessRollup(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        media_id: row.media_id,
        part_id: Number(row.part_id),
        views_24h: Number(row.views_24h || 0),
        unique_viewers_24h: Number(row.unique_viewers_24h || 0),
        watch_minutes_24h: Number(row.watch_minutes_24h || 0),
        bytes_served_24h: Number(row.bytes_served_24h || 0),
        cache_miss_bytes_24h: Number(row.cache_miss_bytes_24h || 0),
        updated_at: row.updated_at,
    };
}

function upsertMediaAccessRollup(input) {
    const source = input || {};
    db.get().prepare(`
        INSERT INTO media_access_rollups (
            media_id, media_kind,
            views_1h, views_24h, views_7d, views_30d,
            unique_viewers_1h, unique_viewers_24h, unique_viewers_7d, unique_viewers_30d,
            watch_minutes_24h, watch_minutes_7d,
            bytes_served_24h, bytes_served_7d,
            cache_miss_bytes_24h, cache_miss_bytes_7d,
            concurrent_viewers_peak_24h, last_viewed_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(media_id) DO UPDATE SET
            media_kind = excluded.media_kind,
            views_1h = excluded.views_1h,
            views_24h = excluded.views_24h,
            views_7d = excluded.views_7d,
            views_30d = excluded.views_30d,
            unique_viewers_1h = excluded.unique_viewers_1h,
            unique_viewers_24h = excluded.unique_viewers_24h,
            unique_viewers_7d = excluded.unique_viewers_7d,
            unique_viewers_30d = excluded.unique_viewers_30d,
            watch_minutes_24h = excluded.watch_minutes_24h,
            watch_minutes_7d = excluded.watch_minutes_7d,
            bytes_served_24h = excluded.bytes_served_24h,
            bytes_served_7d = excluded.bytes_served_7d,
            cache_miss_bytes_24h = excluded.cache_miss_bytes_24h,
            cache_miss_bytes_7d = excluded.cache_miss_bytes_7d,
            concurrent_viewers_peak_24h = excluded.concurrent_viewers_peak_24h,
            last_viewed_at = excluded.last_viewed_at,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(source.mediaId),
        source.mediaKind || null,
        Number(source.views1h || 0),
        Number(source.views24h || 0),
        Number(source.views7d || 0),
        Number(source.views30d || 0),
        Number(source.uniqueViewers1h || 0),
        Number(source.uniqueViewers24h || 0),
        Number(source.uniqueViewers7d || 0),
        Number(source.uniqueViewers30d || 0),
        Number(source.watchMinutes24h || 0),
        Number(source.watchMinutes7d || 0),
        Number(source.bytesServed24h || 0),
        Number(source.bytesServed7d || 0),
        Number(source.cacheMissBytes24h || 0),
        Number(source.cacheMissBytes7d || 0),
        Number(source.concurrentViewersPeak24h || 0),
        source.lastViewedAt || null,
    );
    return getMediaAccessRollup(source.mediaId);
}

function getMediaAccessRollup(mediaId) {
    return hydrateMediaAccessRollup(db.get().prepare(`
        SELECT * FROM media_access_rollups WHERE media_id = ?
    `).get(String(mediaId)));
}

function listMediaAccessRollups(filters) {
    const source = filters || {};
    const where = [];
    const args = [];
    if (source.mediaKind) {
        where.push('media_kind = ?');
        args.push(String(source.mediaKind));
    }
    const limit = Math.min(Math.max(Number(source.limit) || 100, 1), 500);
    const sql = where.length
        ? `SELECT * FROM media_access_rollups WHERE ${where.join(' AND ')} ORDER BY watch_minutes_24h DESC, unique_viewers_24h DESC LIMIT ?`
        : `SELECT * FROM media_access_rollups ORDER BY watch_minutes_24h DESC, unique_viewers_24h DESC LIMIT ?`;
    return db.get().prepare(sql).all(...args, limit).map(hydrateMediaAccessRollup);
}

function recordSiteHeatRollup(input) {
    const source = input || {};
    const result = db.get().prepare(`
        INSERT INTO media_site_heat_rollups (
            window_name,
            unique_video_viewers,
            video_watch_minutes,
            media_origin_egress_bytes,
            media_cache_miss_bytes,
            concurrent_viewers_peak
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        String(source.windowName || '7d'),
        Number(source.uniqueVideoViewers || 0),
        Number(source.videoWatchMinutes || 0),
        Number(source.mediaOriginEgressBytes || 0),
        Number(source.mediaCacheMissBytes || 0),
        Number(source.concurrentViewersPeak || 0),
    );
    return getSiteHeatRollupById(result.lastInsertRowid);
}

function getSiteHeatRollupById(id) {
    return hydrateSiteHeatRollup(db.get().prepare(`
        SELECT * FROM media_site_heat_rollups WHERE id = ?
    `).get(Number(id)));
}

function getLatestSiteHeatRollup(windowName) {
    return hydrateSiteHeatRollup(db.get().prepare(`
        SELECT * FROM media_site_heat_rollups
        WHERE window_name = ?
        ORDER BY calculated_at DESC, id DESC
        LIMIT 1
    `).get(String(windowName || '7d')));
}

function listSiteHeatRollups(limit) {
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return db.get().prepare(`
        SELECT * FROM media_site_heat_rollups ORDER BY calculated_at DESC, id DESC LIMIT ?
    `).all(cap).map(hydrateSiteHeatRollup);
}

function recomputeSiteHeatRollup(windowName) {
    const row = db.get().prepare(`
        SELECT
            COALESCE(SUM(unique_viewers_7d), 0) AS unique_video_viewers,
            COALESCE(SUM(watch_minutes_7d), 0) AS video_watch_minutes,
            COALESCE(SUM(bytes_served_7d), 0) AS media_origin_egress_bytes,
            COALESCE(SUM(cache_miss_bytes_7d), 0) AS media_cache_miss_bytes,
            COALESCE(MAX(concurrent_viewers_peak_24h), 0) AS concurrent_viewers_peak
        FROM media_access_rollups
    `).get();
    return recordSiteHeatRollup({
        windowName: windowName || '7d',
        uniqueVideoViewers: Number(row.unique_video_viewers || 0),
        videoWatchMinutes: Number(row.video_watch_minutes || 0),
        mediaOriginEgressBytes: Number(row.media_origin_egress_bytes || 0),
        mediaCacheMissBytes: Number(row.media_cache_miss_bytes || 0),
        concurrentViewersPeak: Number(row.concurrent_viewers_peak || 0),
    });
}

function upsertPartAccessRollup(input) {
    const source = input || {};
    db.get().prepare(`
        INSERT INTO media_part_access_rollups (
            media_id, part_id,
            views_24h, unique_viewers_24h, watch_minutes_24h,
            bytes_served_24h, cache_miss_bytes_24h, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(media_id, part_id) DO UPDATE SET
            views_24h = excluded.views_24h,
            unique_viewers_24h = excluded.unique_viewers_24h,
            watch_minutes_24h = excluded.watch_minutes_24h,
            bytes_served_24h = excluded.bytes_served_24h,
            cache_miss_bytes_24h = excluded.cache_miss_bytes_24h,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(source.mediaId),
        Number(source.partId),
        Number(source.views24h || 0),
        Number(source.uniqueViewers24h || 0),
        Number(source.watchMinutes24h || 0),
        Number(source.bytesServed24h || 0),
        Number(source.cacheMissBytes24h || 0),
    );
    return getPartAccessRollup(source.mediaId, source.partId);
}

function getPartAccessRollup(mediaId, partId) {
    return hydratePartAccessRollup(db.get().prepare(`
        SELECT * FROM media_part_access_rollups WHERE media_id = ? AND part_id = ?
    `).get(String(mediaId), Number(partId)));
}

function listPartAccessRollupsByMediaId(mediaId) {
    return db.get().prepare(`
        SELECT * FROM media_part_access_rollups WHERE media_id = ? ORDER BY watch_minutes_24h DESC, unique_viewers_24h DESC, part_id ASC
    `).all(String(mediaId)).map(hydratePartAccessRollup);
}

module.exports = {
    getLatestSiteHeatRollup,
    getMediaAccessRollup,
    getPartAccessRollup,
    listMediaAccessRollups,
    listPartAccessRollupsByMediaId,
    listSiteHeatRollups,
    recomputeSiteHeatRollup,
    recordSiteHeatRollup,
    upsertMediaAccessRollup,
    upsertPartAccessRollup,
};
