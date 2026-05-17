'use strict';

require('dotenv').config();

const path = require('path');

const port = parseInt(process.env.PORT, 10) || 5700;

module.exports = {
    port,
    host: process.env.HOST || '127.0.0.1',
    nodeEnv: process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-tools',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    dataDir: process.env.DATA_DIR || path.resolve(process.cwd(), 'data'),
    tmpDir:  process.env.TMP_DIR  || path.resolve(process.cwd(), 'data/tmp'),

    // Max upload sizes
    maxAudioSize:   parseInt(process.env.MAX_AUDIO_SIZE, 10)   || 200 * 1024 * 1024, // 200 MB
    maxImageSize:   parseInt(process.env.MAX_IMAGE_SIZE, 10)   || 50  * 1024 * 1024, // 50 MB
    maxVideoSize:   parseInt(process.env.MAX_VIDEO_SIZE, 10)   || 500 * 1024 * 1024, // 500 MB

    // Retention (ms)
    retentionMs: parseInt(process.env.RETENTION_MS, 10) || 60 * 60 * 1000, // 1 hour

    publicBaseUrl: process.env.OPENVIBE_TOOLS_URL || 'https://openvibe.tools',
};
