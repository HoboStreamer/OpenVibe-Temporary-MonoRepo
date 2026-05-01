'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-media-parting-'));
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.DB_PATH = path.join(tempRoot, 'media.db');
process.env.OPENVIBE_MEDIA_HOT_ROOT = path.join(tempRoot, 'storage');
process.env.OPENVIBE_MEDIA_MULTIPART_ROOT = path.join(tempRoot, 'multipart');
process.env.OPENVIBE_MEDIA_PROVIDER = 'local';
process.env.OPENVIBE_MEDIA_CANONICAL_PROVIDER = 'local';
process.env.OPENVIBE_MEDIA_HOT_PROVIDER = 'local';
process.env.OPENVIBE_MEDIA_ASSET_ORIGIN_PROVIDER = 'local';
process.env.PUBLIC_BASE_URL = 'http://media.test';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const { validatePublicPlaybackSize } = require('../server/size-validator');
const vodModel = require('../server/vod-model');

(function publicSizeGuardBlocksOversizedLocationsAndParts() {
    const media = model.create({
        owner_type: 'user',
        owner_id: '101',
        namespace: 'live.vods',
        type: 'vod',
        status: 'ready',
        visibility: 'public',
        storage_provider: 'local',
        storage_key: 'live/vods/oversized.mp4',
        public_url: 'http://media.test/files/oversized',
        mime_type: 'video/mp4',
        size_bytes: 64 * 1024 * 1024,
    });
    const decision = validatePublicPlaybackSize(media, {
        publicPlaybackMaxBytes: 500 * 1024 * 1024,
        targetPublicObjectBytes: 256 * 1024 * 1024,
        warnPublicObjectBytes: 384 * 1024 * 1024,
        locations: [
            {
                media_id: media.id,
                provider_name: 'local',
                role: 'canonical',
                storage_key: 'live/vods/oversized.mp4',
                size_bytes: 600 * 1024 * 1024,
            },
        ],
        parts: [
            {
                id: 1,
                media_id: media.id,
                part_number: 1,
                provider_name: 'local',
                total_bytes: 540 * 1024 * 1024,
                playlist_storage_key: 'vods/part-1.m3u8',
            },
        ],
    });
    assert.strictEqual(decision.ok, false);
    assert.ok(decision.blocking_objects.find((item) => item.source_type === 'location'));
    assert.ok(decision.blocking_objects.find((item) => item.source_type === 'vod_part'));
})();

(function vodPartsRollOverAtTargetThresholds() {
    const recordingMedia = model.create({
        owner_type: 'user',
        owner_id: '55',
        namespace: 'live.vods',
        type: 'vod',
        status: 'ready',
        visibility: 'public',
        storage_provider: 'local',
        storage_key: 'live/vods/recording.mp4',
        public_url: 'http://media.test/files/recording',
        mime_type: 'video/mp4',
        size_bytes: 900 * 1024 * 1024,
    });
    const recording = vodModel.createRecording({
        streamId: 'stream_part_rollover',
        mediaId: recordingMedia.id,
        status: 'ready',
    });

    vodModel.upsertSegment({
        recordingId: recording.id,
        segmentIndex: 0,
        startMs: 0,
        durationMs: 20 * 60 * 1000,
        mediaId: recordingMedia.id,
        storageKey: 'segments/part-rollover-0.ts',
        playlistKey: 'stream_part_rollover.m3u8',
        sizeBytes: 150 * 1024 * 1024,
        status: 'ready',
        providerName: 'local',
    });
    vodModel.upsertSegment({
        recordingId: recording.id,
        segmentIndex: 1,
        startMs: 20 * 60 * 1000,
        durationMs: 20 * 60 * 1000,
        mediaId: recordingMedia.id,
        storageKey: 'segments/part-rollover-1.ts',
        playlistKey: 'stream_part_rollover.m3u8',
        sizeBytes: 150 * 1024 * 1024,
        status: 'ready',
        providerName: 'local',
    });
    vodModel.upsertSegment({
        recordingId: recording.id,
        segmentIndex: 2,
        startMs: 40 * 60 * 1000,
        durationMs: 20 * 60 * 1000,
        mediaId: recordingMedia.id,
        storageKey: 'segments/part-rollover-2.ts',
        playlistKey: 'stream_part_rollover.m3u8',
        sizeBytes: 150 * 1024 * 1024,
        status: 'ready',
        providerName: 'local',
    });

    const parts = vodModel.listPartsByRecordingId(recording.id);
    const partialSegments = vodModel.listPartialSegmentsByRecordingId(recording.id);
    assert.ok(parts.length >= 2, 'expected rollover to create at least two parts');
    assert.strictEqual(parts[0].status, 'closed');
    assert.strictEqual(partialSegments[0].part_number, 1);
    assert.strictEqual(partialSegments[1].part_number, 1);
    assert.strictEqual(partialSegments[2].part_number, 2);
})();

console.log('media parting + size guard tests OK');
