'use strict';

/**
 * channel-resolver.js
 *
 * Resolves a canonical channel slug for a stream, VOD, or clip item.
 * Resolution order:
 *   1. item.channel_slug (already attached)
 *   2. item.channel_name lowercased + slugified
 *   3. openre-stream API: look up parent stream's channel by stream_id
 *   4. openvibe-network API: look up user by owner_user_id
 *   5. fallback: null (caller renders /channels)
 *
 * This module is I/O-only for paths 3 and 4. Paths 1 and 2 are synchronous.
 * Results are cached with a short TTL to avoid repeated upstream calls per page load.
 */

const https = require('https');
const http  = require('http');

// ── simple in-process LRU-style TTL cache ─────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX = 2000;
const _cache = new Map(); // key → { slug, expiresAt }

function _cacheGet(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
    return entry.slug;
}

function _cacheSet(key, slug) {
    if (_cache.size >= CACHE_MAX) {
        // Evict the first (oldest) entry
        const firstKey = _cache.keys().next().value;
        _cache.delete(firstKey);
    }
    _cache.set(key, { slug, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
function _jsonFetch(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { timeout: timeoutMs || 3000 }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
    });
}

// ── slug helpers ───────────────────────────────────────────────────────────────
function _slugify(value) {
    if (!value) return '';
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function _isValidSlug(value) {
    return typeof value === 'string' && value.length > 0 && value !== 'unknown';
}

// ── path 3: openre-stream channel lookup ──────────────────────────────────────
async function _resolveFromRestream(streamId, restreamBaseUrl, timeoutMs) {
    if (!streamId || !restreamBaseUrl) return null;
    const cacheKey = `restream:${streamId}`;
    const cached = _cacheGet(cacheKey);
    if (cached !== null) return cached;

    try {
        const url = `${restreamBaseUrl.replace(/\/$/, '')}/api/v1/streams/${encodeURIComponent(streamId)}`;
        const data = await _jsonFetch(url, timeoutMs);
        // openre-stream returns { stream: { channel_slug, channel: { slug } } }
        const stream = data && (data.stream || data.data || data);
        const slug = (stream && (stream.channel_slug || (stream.channel && stream.channel.slug))) || null;
        const result = _isValidSlug(slug) ? slug : null;
        _cacheSet(cacheKey, result);
        return result;
    } catch {
        return null;
    }
}

// ── path 4: openvibe-network user lookup ──────────────────────────────────────
async function _resolveFromNetwork(userId, networkBaseUrl, timeoutMs) {
    if (!userId || !networkBaseUrl) return null;
    const cacheKey = `network:${userId}`;
    const cached = _cacheGet(cacheKey);
    if (cached !== null) return cached;

    try {
        const url = `${networkBaseUrl.replace(/\/$/, '')}/api/v1/users/${encodeURIComponent(userId)}/profile`;
        const data = await _jsonFetch(url, timeoutMs);
        const profile = data && (data.profile || data.user || data);
        const slug = (profile && (profile.username || profile.slug || profile.handle)) || null;
        const result = _isValidSlug(slug) ? _slugify(slug) : null;
        _cacheSet(cacheKey, result);
        return result;
    } catch {
        return null;
    }
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * resolveChannelSlug(item, opts)
 *
 * @param {object} item   - stream, vod, or clip object with optional channel_slug,
 *                          channel_name, channel (nested), id, stream_id, owner_user_id
 * @param {object} opts
 *   opts.config.stream.url   — openre-stream base URL
 *   opts.config.network.url  — openvibe-network base URL
 *   opts.timeout             — upstream request timeout in ms (default 3000)
 * @returns {Promise<string|null>} resolved slug or null if unknown
 */
async function resolveChannelSlug(item, opts) {
    if (!item) return null;
    opts = opts || {};
    const timeoutMs = opts.timeout || 3000;
    const config = opts.config || {};

    // Path 1: direct field
    if (_isValidSlug(item.channel_slug)) return item.channel_slug;
    if (item.channel && _isValidSlug(item.channel.slug)) return item.channel.slug;

    // Path 2: channel_name → slug
    if (_isValidSlug(item.channel_name)) {
        const derived = _slugify(item.channel_name);
        if (derived) return derived;
    }

    const streamId  = item.stream_id || item.id;
    const userId    = item.owner_user_id || item.user_id || item.creator_id;
    const restreamUrl = config.stream && config.stream.url;
    const networkUrl  = config.network && config.network.url;

    // Path 3: openre-stream
    if (streamId && restreamUrl) {
        const slug = await _resolveFromRestream(streamId, restreamUrl, timeoutMs);
        if (slug) return slug;
    }

    // Path 4: network user profile
    if (userId && networkUrl) {
        const slug = await _resolveFromNetwork(userId, networkUrl, timeoutMs);
        if (slug) return slug;
    }

    return null;
}

/**
 * resolveChannelSlugSync(item)
 *
 * Synchronous fast path (paths 1–2 only). Returns null if upstream lookup is needed.
 */
function resolveChannelSlugSync(item) {
    if (!item) return null;
    if (_isValidSlug(item.channel_slug)) return item.channel_slug;
    if (item.channel && _isValidSlug(item.channel.slug)) return item.channel.slug;
    if (_isValidSlug(item.channel_name)) {
        const derived = _slugify(item.channel_name);
        if (derived) return derived;
    }
    return null;
}

/**
 * purgeCacheEntry(key) — for testing / manual invalidation
 */
function purgeCacheEntry(key) {
    _cache.delete(key);
}

/**
 * cacheStats() — for diagnostic endpoints
 */
function cacheStats() {
    const now = Date.now();
    let live = 0;
    for (const entry of _cache.values()) {
        if (now <= entry.expiresAt) live++;
    }
    return { total: _cache.size, live, capacity: CACHE_MAX };
}

module.exports = {
    resolveChannelSlug,
    resolveChannelSlugSync,
    purgeCacheEntry,
    cacheStats,
};
