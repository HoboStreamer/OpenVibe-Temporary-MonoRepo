'use strict';

require('dotenv').config();

const path = require('path');
const { resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');

module.exports = {
    port:    parseInt(process.env.PORT, 10) || 4700,
    host:    process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    serviceId: 'openre-stream',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: { path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openre-stream.db') },

    events:  { url: process.env.OPENVIBE_EVENTS_URL  || 'http://127.0.0.1:4400' },
    network: { url: resolvePublicOrigin({ surface: 'network' }) },
    live:    { url: resolvePublicOrigin({ surface: 'live' }) },
    media:   { url: resolvePublicOrigin({ surface: 'media' }) },

    ingest: {
        rtmp:   process.env.INGEST_RTMP_URL   || 'rtmp://ingest.openre.stream/live',
        whip:   process.env.INGEST_WHIP_URL   || 'https://ingest.openre.stream/whip',
        jsmpeg: process.env.INGEST_JSMPEG_URL || 'wss://ingest.openre.stream/jsmpeg',
    },
};
