'use strict';

const https = require('https');
const http = require('http');
const express = require('express');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const DEALS_QUERY = 'fast food deals sales coupons Killeen TX';
const CL_BASE = 'killeen.craigslist.org';
const RS_URL = 'https://robotstreamer.com/robot/6223';

let _rsLastSeenLive = null;

function httpGet(rawUrl, opts = {}) {
    return new Promise((resolve, reject) => {
        const lib = rawUrl.startsWith('https') ? https : http;
        const req = lib.get(rawUrl, {
            headers: Object.assign({ 'User-Agent': UA }, opts.headers || {}),
            timeout: opts.timeout || 10000,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function decodeEntities(s) {
    return s
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function flattenJson(obj) {
    const out = [];
    (function walk(o) {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') out.push(o);
    }(obj));
    return out;
}

async function fetchStatus(lastOnlineSeed) {
    const result = {
        robotstreamer: { live: false, text: 'Offline', last_seen: null },
        openvibe: { live: false, stream: null },
    };

    if (lastOnlineSeed && !_rsLastSeenLive) {
        try { const d = new Date(lastOnlineSeed); if (!isNaN(d)) _rsLastSeenLive = d; } catch {}
    }

    try {
        const html = await httpGet(RS_URL, { timeout: 8000 });
        const m = html.match(/id="stream_time_container"([^>]*)/);
        let isLive = false;
        if (m) {
            const attrs = m[1];
            isLive = !attrs.includes('display: none') && !attrs.includes('display:none');
        }
        const now = new Date();
        if (isLive) _rsLastSeenLive = now;

        let text = isLive ? 'Live now' : 'Offline';
        if (!isLive && _rsLastSeenLive) {
            const s = Math.floor((now - _rsLastSeenLive) / 1000);
            if (s < 60)      text = 'Last online just now';
            else if (s < 3600)  text = `Last online ${Math.floor(s / 60)} minutes ago`;
            else if (s < 86400) text = `Last online ${Math.floor(s / 3600)} hours ago`;
            else               text = `Last online ${Math.floor(s / 86400)} days ago`;
        }
        result.robotstreamer = { live: isLive, text };
    } catch (e) {
        result.robotstreamer.error = e.message;
    }

    try {
        const config = require('./config');
        const base = (config.live && config.live.url) || 'http://localhost:4600';
        const data = JSON.parse(await httpGet(base + '/api/v1/channels/finditfixit', { timeout: 5000 }));
        const stream = data.current_stream || null;
        result.openvibe = { live: stream !== null, stream };
    } catch (e) {
        result.openvibe.error = e.message;
    }

    return result;
}

async function fetchDeals() {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(DEALS_QUERY) + '&kl=us-en';
    const html = await httpGet(url, { timeout: 10000 });
    const blocks = html.split('<div class="result ').slice(1);
    const deals = [];
    for (const block of blocks.slice(0, 12)) {
        const tm = block.match(/class="result__a"[^>]*>(.+?)<\/a>/);
        const um = block.match(/uddg=([^&"]+)/);
        const sm = block.match(/class="result__snippet"[^>]*>(.+?)<\/span>/);
        if (!tm || !um) continue;
        const title = decodeEntities(tm[1].replace(/<[^>]+>/g, ''));
        const href  = decodeURIComponent(um[1]);
        const snip  = sm ? decodeEntities(sm[1].replace(/<[^>]+>/g, '')) : '';
        deals.push({ title, url: href, snippet: snip });
    }
    return deals;
}

async function fetchFindit(query) {
    const qs = query
        ? '/jsonsearch/sss/?sort=date&query=' + encodeURIComponent(query)
        : '/jsonsearch/zip/?sort=date';
    const raw = await httpGet('https://' + CL_BASE + qs, {
        timeout: 12000,
        headers: { Accept: 'application/json' },
    });
    const items = flattenJson(JSON.parse(raw));
    const results = [];
    for (const item of items) {
        const title = item.PostingTitle || '';
        const link  = item.PostingURL   || '';
        if (!title || !link) continue;
        const price = item.price        || '$0';
        const thumb = item.ImageThumb   || '';
        const ts    = item.PostedDate   || 0;
        const image = thumb ? thumb.replace(/\d+x\d+c?\.jpg$/, '600x450.jpg') : '';
        let date = '';
        if (ts) {
            try {
                date = new Date(ts * 1000).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                });
            } catch {}
        }
        results.push({ title, url: link, image, price, date });
    }
    return results.slice(0, 24);
}

function buildFinditfixitRouter() {
    const r = express.Router();

    r.get('/status', async (req, res) => {
        try {
            res.json(await fetchStatus(String(req.query.last_online || '')));
        } catch (e) {
            res.json({ error: e.message });
        }
    });

    r.get('/deals', async (_req, res) => {
        try {
            res.json(await fetchDeals());
        } catch {
            res.json([]);
        }
    });

    r.get('/findit', async (req, res) => {
        try {
            res.json(await fetchFindit(String(req.query.q || '').trim()));
        } catch {
            res.json([]);
        }
    });

    return r;
}

module.exports = { buildFinditfixitRouter };
