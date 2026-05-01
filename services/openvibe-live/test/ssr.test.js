'use strict';

// openvibe-live — SSR contains real <title>, <meta>, OG tags.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'development';
process.env.OPENVIBE_ENV = 'development';
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-live-test-')), 'live.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_OPENVIBE_LIVE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_LIVE_DATABASE_URL = '';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const ssr = require('../server/ssr');
const { applyStreamEvent } = require('../server/ingestion');
const { STREAM_EVENT_TYPES } = require('@openvibe/contracts/stream-events');

const ch = model.upsertChannel({ slug: 'alice', display_name: 'Alice', description: 'streamer' });
const s = model.upsertStream({ id: 'strm_1', channel_slug: 'alice', status: 'started', title: 'speedrun', started_at: '2026-01-01T00:00:00Z', thumbnail_url: '/api/thumbnails/alice-live.svg' });
const ended = model.upsertStream({
    id: 'strm_2',
    channel_slug: 'alice',
    status: 'ended',
    title: 'vod stream',
    started_at: '2026-01-02T00:00:00Z',
    ended_at: '2026-01-02T02:00:00Z',
    vod_media_id: 'media:v1',
    thumbnail_url: '/api/thumbnails/alice-ended.svg',
    metadata: { clip_media_ids: ['clip_1'], clip_count: 1 },
});

const channelHtml = ssr.renderChannelPage({ channel: ch, currentStream: s, recentStreams: [s], baseUrl: config.publicBaseUrl });
assert.ok(/<title>Alice — LIVE NOW — openvibe\.live<\/title>/.test(channelHtml), 'channel page has live title');
assert.ok(/<meta name="description" content="[^"]+"/.test(channelHtml), 'has meta description');
assert.ok(/<link rel="canonical"/.test(channelHtml), 'has canonical');
assert.ok(/<meta property="og:title"/.test(channelHtml), 'has og:title');
assert.ok(/<meta property="og:url"/.test(channelHtml), 'has og:url');
assert.ok(/<meta name="twitter:card"/.test(channelHtml), 'has twitter:card');
assert.ok(/speedrun/.test(channelHtml), 'shows current stream title in body');
assert.ok(/LIVE/.test(channelHtml), 'live badge rendered');

const streamHtml = ssr.renderStreamPage({ channel: ch, stream: s, baseUrl: config.publicBaseUrl });
assert.ok(/<title>speedrun — Alice — openvibe\.live<\/title>/.test(streamHtml));
assert.ok(/<link rel="canonical" href="[^"]+\/@alice\/s\/strm_1"/.test(streamHtml));

const homeHtml = ssr.renderHomePage({
    channels: model.listChannels({ limit: 50 }),
    featuredChannels: model.listFeaturedChannels({ limit: 8 }),
    trendingNow: model.listTrendingStreams({ limit: 6 }),
    liveNow: model.listLiveNow({ limit: 12 }),
    recentlyEnded: model.listRecentlyEnded({ limit: 12 }),
    recentlyOnlineChannels: [Object.assign({}, ch, { stats: model.getChannelStats('alice'), recentStream: ended })],
    recentVods: model.listRecentVodStreams({ limit: 12 }),
    recentClips: model.listRecentClips({ limit: 12 }),
    categories: model.listTopCategories({ limit: 10 }),
    stats: model.getHomeStats(),
    community: { recentThreads: [], recentPastes: [], discordRelays: [] },
    chat: { publicRooms: [], activeCalls: [] },
    baseUrl: config.publicBaseUrl,
});
assert.ok(/Live now/.test(homeHtml), 'home page renders live-now section');
assert.ok(/Recently online creators/.test(homeHtml), 'home page renders recently online creators section');
assert.ok(/Community pulse/.test(homeHtml), 'home page renders community section');
assert.ok(/Recent VODs/.test(homeHtml), 'home page renders vod section');
assert.ok(/Recent clips/.test(homeHtml), 'home page renders clips section');
assert.ok(/Go live however you want/.test(homeHtml), 'home page renders onboarding section');
assert.ok(/Why OpenVibe exists/.test(homeHtml), 'home page renders origin story section');
assert.ok(/openvibe\.live — native fallback shell/.test(homeHtml), 'home page includes browser-smoke shell marker');
assert.ok(/Mark updates as seen/.test(homeHtml), 'home page renders unread updates clear action');
assert.ok(/data-updates-feed/.test(homeHtml), 'home page renders updates feed state marker');
assert.ok(/openre\.stream/.test(homeHtml), 'home page emphasizes openre.stream');
assert.ok(/vod stream/.test(homeHtml), 'home page shows ended stream');
assert.ok(homeHtml.indexOf('Live now') < homeHtml.indexOf('Category pulse'), 'live now renders immediately after the hero');
assert.ok(homeHtml.indexOf('Recent clips') < homeHtml.indexOf('Recent VODs'), 'clips render before vods on the homepage');

// ingestion applies stream events to the read-model
const result = applyStreamEvent({
    event_type: STREAM_EVENT_TYPES.STARTED,
    occurred_at: '2026-02-01T00:00:00Z',
    payload: { stream_id: 'strm_2', channel_slug: 'bob', creator_id: '99', title: 'new stream' },
});
assert.strictEqual(result.ok, true);
const live = model.getStreamById('strm_2');
assert.strictEqual(live.status, 'started');
assert.strictEqual(live.channel_slug, 'bob');

console.log('openvibe-live SSR + ingestion tests OK');
