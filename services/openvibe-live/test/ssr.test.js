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
const recentStartedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago — within listLiveNow's 8-hour window
const s = model.upsertStream({ id: 'strm_1', channel_slug: 'alice', status: 'started', title: 'speedrun', started_at: recentStartedAt, thumbnail_url: '/api/thumbnails/alice-live.svg' });
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
const vodCard = {
    id: 'media:hobostreamer-vod:7',
    kind: 'vod',
    legacy_id: '7',
    route_url: '/vod/7',
    cta_label: 'Open vod →',
    title: 'archive run',
    channel_slug: 'alice',
    channel_name: 'Alice',
    category: 'Speedrun',
    thumbnail_url: '/api/thumbnails/alice-vod.webp',
    created_at: '2026-01-02T03:00:00Z',
    updated_at: '2026-01-02T03:00:00Z',
    duration_seconds: 7200,
    view_count: 42,
    playback_ready: true,
    playback_url: 'https://openvibe.media/files/media%3Ahobostreamer-vod%3A7',
    playback_api_url: 'https://openvibe.media/api/v1/media/media%3Ahobostreamer-vod%3A7/playback?redirect=true',
    playback_api_ready: true,
    playback_mode: 'file-direct',
    playback_mime_type: 'video/webm',
    status: 'ready',
    source: 'hobostreamer',
};
const clipCard = {
    id: 'media:hobostreamer-clip:3',
    kind: 'clip',
    legacy_id: '3',
    route_url: '/clip/3',
    cta_label: 'Open clip →',
    title: 'top deck glitch',
    channel_slug: 'alice',
    channel_name: 'Alice',
    category: 'Speedrun',
    thumbnail_url: '/api/thumbnails/alice-clip.webp',
    created_at: '2026-01-02T03:30:00Z',
    updated_at: '2026-01-02T03:30:00Z',
    duration_seconds: 37,
    view_count: 19,
    playback_ready: true,
    playback_url: 'https://openvibe.media/files/media%3Ahobostreamer-clip%3A3',
    playback_api_url: 'https://openvibe.media/api/v1/media/media%3Ahobostreamer-clip%3A3/playback?redirect=true',
    playback_api_ready: true,
    playback_mode: 'file-direct',
    playback_mime_type: 'video/webm',
    status: 'ready',
    source: 'hobostreamer',
};

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

const goLiveHtml = ssr.renderGoLivePage({ baseUrl: config.publicBaseUrl });
assert.ok(/Sign in to unlock your stream manager/.test(goLiveHtml), 'go-live page gates creator controls for guests');
assert.ok(/data-go-live-session/.test(goLiveHtml), 'go-live page includes the session-aware dashboard mount');
assert.ok(/Sign in with OpenVibe/.test(goLiveHtml), 'go-live page exposes a working local sign-in CTA');
assert.ok(!/id="go-live-channel-form"/.test(goLiveHtml), 'go-live page should not show channel creation controls to guests');

const signedInGoLiveHtml = ssr.renderGoLivePage({
    baseUrl: config.publicBaseUrl,
    session: {
        authenticated: true,
        anonymous: false,
        user: { id: '42', username: 'alice', display_name: 'Alice' },
    },
});
assert.ok(/Your stream manager/.test(signedInGoLiveHtml), 'go-live page renders the creator dashboard section for signed-in users');
assert.ok(/id="go-live-channel-form"/.test(signedInGoLiveHtml), 'go-live page renders channel creation controls for signed-in users');
assert.ok(/Open openre\.stream/.test(signedInGoLiveHtml), 'go-live page links into openre.stream');

const vodHtml = ssr.renderMediaDetailPage({ item: vodCard, channel: ch, baseUrl: config.publicBaseUrl });
assert.ok(/archive run/.test(vodHtml), 'media detail page renders canonical vod title');
assert.ok(/Playback ready/.test(vodHtml), 'media detail page renders playback-ready state');
assert.ok(/openvibe\.media playback/.test(vodHtml), 'media detail page links to canonical media playback');
assert.ok(/data-ov-player/.test(vodHtml), 'media detail page renders the custom player shell');
assert.ok(/Detected type/.test(vodHtml), 'media detail page surfaces detected playback type');

const homeHtml = ssr.renderHomePage({
    channels: model.listChannels({ limit: 50 }),
    featuredChannels: model.listFeaturedChannels({ limit: 8 }),
    trendingNow: model.listTrendingStreams({ limit: 6 }),
    liveNow: model.listLiveNow({ limit: 12 }),
    recentlyEnded: model.listRecentlyEnded({ limit: 12 }),
    recentlyOnlineChannels: [Object.assign({}, ch, { stats: model.getChannelStats('alice'), recentStream: ended })],
    recentVods: [vodCard],
    recentClips: [clipCard],
    categories: model.listTopCategories({ limit: 10 }),
    stats: Object.assign({}, model.getHomeStats(), { vods: 1, clips: 1 }),
    community: {
        recentThreads: [],
        recentPastes: [{
            slug: 'migration-screenshot',
            title: 'Migration screenshot',
            kind: 'screenshot',
            image_url: '/api/community-assets/home-proof.webp',
            route_url: 'https://openvibe.community/',
            created_at: '2026-01-02T04:00:00Z',
            view_count: 11,
            source: 'hobostreamer',
            preview_text: 'Migrated screenshot paste preview.',
        }],
        discordRelays: [],
    },
    chat: { publicRooms: [], activeCalls: [] },
    baseUrl: config.publicBaseUrl,
});
assert.ok(/Live now/.test(homeHtml), 'home page renders live-now section');
assert.ok(/Community pulse/.test(homeHtml), 'home page renders community section');
assert.ok(/Recent VODs/.test(homeHtml), 'home page renders vod section');
assert.ok(/Recent clips/.test(homeHtml), 'home page renders clips section');
assert.ok(/Built different/.test(homeHtml), 'home page renders origin story section');
assert.ok(/openre\.stream/.test(homeHtml), 'home page emphasizes openre.stream');
assert.ok(/archive run/.test(homeHtml), 'home page shows canonical vod card');
assert.ok(/top deck glitch/.test(homeHtml), 'home page shows canonical clip card');
assert.ok(homeHtml.indexOf('Recent VODs') > 0, 'VODs section is present');
assert.ok(homeHtml.indexOf('Recent clips') > 0, 'clips section is present');

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
