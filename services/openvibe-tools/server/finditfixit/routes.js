'use strict';

const https = require('https');
const http  = require('http');
const { URL } = require('url');
const express = require('express');

const UA           = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const DEALS_QUERY  = 'fast food deals sales coupons Killeen TX';
const CL_BASE      = 'https://killeen.craigslist.org';
const RS_URL       = 'https://robotstreamer.com/robot/6223';
const OV_LIVE_URL  = 'http://127.0.0.1:4600/api/v1/channels/finditfixit';

// in-memory last-seen tracker for RoboStreamer
let rsLastSeenLive = null;

// ── helpers ───────────────────────────────────────────────────────────────────

function fetchUrl(rawUrl, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(rawUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const opts = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json,*/*' },
        };
        const req = lib.request(opts, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
    });
}

function unescapeHtml(s) {
    return String(s)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function flattenCl(obj) {
    const out = [];
    function walk(o) {
        if (Array.isArray(o)) { o.forEach(walk); }
        else if (o && typeof o === 'object') { out.push(o); }
    }
    walk(obj);
    return out;
}

// ── status ────────────────────────────────────────────────────────────────────

async function fetchStatus(lastOnlineSeed) {
    const result = {
        robotstreamer: { live: false, text: null },
        openvibe:      { live: false, stream: null },
    };

    // optionally seed the in-memory tracker from the browser (first visit)
    if (lastOnlineSeed && !rsLastSeenLive) {
        try { rsLastSeenLive = new Date(lastOnlineSeed); } catch {}
    }

    // ── RoboStreamer ──
    try {
        const html = await fetchUrl(RS_URL, 8000);
        const m = html.match(/id="stream_time_container"([^>]*)/);
        const isLive = m ? (!m[1].includes('display: none') && !m[1].includes('display:none')) : false;
        const now = new Date();
        if (isLive) rsLastSeenLive = now;

        let text = isLive ? 'Live now' : 'Offline';
        if (!isLive && rsLastSeenLive) {
            const diffSec = Math.floor((now - rsLastSeenLive) / 1000);
            if      (diffSec < 60)    text = 'Last online just now';
            else if (diffSec < 3600)  text = `Last online ${Math.floor(diffSec / 60)} minutes ago`;
            else if (diffSec < 86400) text = `Last online ${Math.floor(diffSec / 3600)} hours ago`;
            else                      text = `Last online ${Math.floor(diffSec / 86400)} days ago`;
        }
        result.robotstreamer = { live: isLive, text };
    } catch (e) {
        result.robotstreamer.error = e.message;
    }

    // ── OpenVibe Live ──
    try {
        const data = JSON.parse(await fetchUrl(OV_LIVE_URL, 5000));
        const stream = data.current_stream || null;
        result.openvibe = { live: stream !== null, stream };
    } catch (e) {
        result.openvibe.error = e.message;
    }

    return result;
}

// ── craigslist findit ─────────────────────────────────────────────────────────

async function fetchFindit(query) {
    const path = query
        ? `/jsonsearch/sss/?sort=date&query=${encodeURIComponent(query)}`
        : '/jsonsearch/zip/?sort=date';
    const raw   = await fetchUrl(CL_BASE + path, 12000);
    const items = flattenCl(JSON.parse(raw));
    return items
        .filter((item) => item.PostingTitle && item.PostingURL)
        .slice(0, 24)
        .map((item) => {
            const thumb = item.ImageThumb || '';
            const image = thumb ? thumb.replace(/\d+x\d+c?\.jpg$/, '600x450.jpg') : '';
            let date = '';
            if (item.PostedDate) {
                try { date = new Date(item.PostedDate * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch {}
            }
            return { title: item.PostingTitle, url: item.PostingURL, image, price: item.price || '$0', date };
        });
}

// ── duckduckgo deals ──────────────────────────────────────────────────────────

async function fetchDeals() {
    const url  = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(DEALS_QUERY)}&kl=us-en`;
    const html = await fetchUrl(url, 10000);
    const blocks = html.split('<div class="result ').slice(1);
    return blocks.slice(0, 12).flatMap((block) => {
        const titleM = block.match(/class="result__a"[^>]*>(.+?)<\/a>/);
        const urlM   = block.match(/uddg=([^&"]+)/);
        const snipM  = block.match(/class="result__snippet"[^>]*>(.+?)<\/span>/);
        if (!titleM || !urlM) return [];
        const title = unescapeHtml(titleM[1].replace(/<[^>]+>/g, ''));
        const href  = decodeURIComponent(urlM[1]);
        const snip  = snipM ? unescapeHtml(snipM[1].replace(/<[^>]+>/g, '')) : '';
        return [{ title, url: href, snippet: snip }];
    });
}

// ── router ────────────────────────────────────────────────────────────────────

const router = express.Router();

router.get('/deals', async (_req, res) => {
    try {
        res.json(await fetchDeals());
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

router.get('/findit', async (req, res) => {
    try {
        res.json(await fetchFindit(String(req.query.q || '')));
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

router.get('/status', async (req, res) => {
    try {
        res.json(await fetchStatus(req.query.last_online || null));
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

module.exports = router;
