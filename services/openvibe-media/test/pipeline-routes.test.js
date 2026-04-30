'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-media-pipeline-'));
process.env.DB_PATH = path.join(rootDir, 'media.db');
process.env.OPENVIBE_MEDIA_HOT_ROOT = path.join(rootDir, 'storage');
process.env.OPENVIBE_MEDIA_MULTIPART_ROOT = path.join(rootDir, 'multipart');
process.env.PUBLIC_BASE_URL = 'http://media.test';
process.env.OPENVIBE_MEDIA_PROVIDER = 'local';
process.env.OPENVIBE_MEDIA_CANONICAL_PROVIDER = 'local';
process.env.OPENVIBE_MEDIA_HOT_PROVIDER = 'local';
process.env.OPENVIBE_MEDIA_ASSET_ORIGIN_PROVIDER = 'local';
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.INTERNAL_API_KEY = 'test-internal';

const config = require('../server/config');
const { buildApp } = require('../server/index');
const model = require('../server/model');
const storageModel = require('../server/storage-model');
const vodModel = require('../server/vod-model');
const clipModel = require('../server/clip-model');

function listen(server) {
    return new Promise((resolve) => {
        const instance = server.listen(0, '127.0.0.1', () => resolve(instance));
    });
}

function close(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

function request(server, method, requestPath, body, extraHeaders) {
    return new Promise((resolve, reject) => {
        const payload = body == null ? null : JSON.stringify(body);
        const headers = Object.assign({}, extraHeaders || {});
        if (payload) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(payload);
        }
        const req = http.request({
            host: '127.0.0.1',
            port: server.address().port,
            method,
            path: requestPath,
            headers,
        }, (res) => {
            let responseBody = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body: responseBody, headers: res.headers }));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

(async function mediaPipelineRoutesWork() {
    const { app } = buildApp();
    const server = await listen(app);
    try {
        const media = model.create({
            owner_type: 'user',
            owner_id: '42',
            namespace: 'live.vods',
            type: 'vod',
            status: 'ready',
            visibility: 'public',
            storage_provider: 'local',
            storage_key: 'live/vods/stream_1.mp4',
            public_url: 'http://media.test/files/stream_1.mp4',
            mime_type: 'video/mp4',
            size_bytes: 4096,
            metadata: { duration_seconds: 120 },
        });
        storageModel.recordLocation({
            mediaId: media.id,
            providerName: 'local',
            role: 'canonical',
            storageKey: media.storage_key,
            publicUrl: media.public_url,
            sizeBytes: media.size_bytes,
        });

        const recording = vodModel.createRecording({
            streamId: 'stream_1',
            channelSlug: 'alice',
            mediaId: media.id,
            status: 'ready',
            startedAt: '2026-04-29T00:00:00.000Z',
            metadata: { preview_sprites: true },
        });
        vodModel.upsertSegment({
            recordingId: recording.id,
            segmentIndex: 0,
            startMs: 0,
            durationMs: 60000,
            mediaId: media.id,
            storageKey: 'segments/stream_1-0.ts',
            playlistKey: 'stream_1.m3u8',
            status: 'ready',
            metadata: { preview_sprite_url: 'http://media.test/sprites/stream_1-0.jpg' },
        });
        vodModel.upsertSegment({
            recordingId: recording.id,
            segmentIndex: 1,
            startMs: 60000,
            durationMs: 60000,
            mediaId: media.id,
            storageKey: 'segments/stream_1-1.ts',
            playlistKey: 'stream_1.m3u8',
            status: 'ready',
            metadata: { preview_sprite_url: 'http://media.test/sprites/stream_1-1.jpg' },
        });

        const playbackResponse = await request(server, 'GET', '/api/v1/streams/stream_1/playback');
        assert.strictEqual(playbackResponse.status, 200);
        const playback = JSON.parse(playbackResponse.body);
        assert.strictEqual(playback.stream_id, 'stream_1');
        assert.strictEqual(playback.playback.url, `http://media.test/files/${encodeURIComponent(media.id)}`);

        const timelineResponse = await request(server, 'GET', '/api/v1/streams/stream_1/timeline');
        assert.strictEqual(timelineResponse.status, 200);
        const timeline = JSON.parse(timelineResponse.body);
        assert.strictEqual(timeline.timeline.segment_count, 2);
        assert.strictEqual(timeline.timeline.duration_ms, 120000);

        const segmentsResponse = await request(server, 'GET', '/api/v1/streams/stream_1/segments');
        assert.strictEqual(segmentsResponse.status, 200);
        const segments = JSON.parse(segmentsResponse.body);
        assert.strictEqual(segments.items.length, 2);

        const spritesResponse = await request(server, 'GET', '/api/v1/streams/stream_1/preview-sprites');
        assert.strictEqual(spritesResponse.status, 200);
        const sprites = JSON.parse(spritesResponse.body);
        assert.strictEqual(sprites.items.length, 2);

        const clipResponse = await request(server, 'POST', '/api/v1/streams/stream_1/clips', {
            title: 'Intro clip',
            start_ms: 1000,
            end_ms: 9000,
        }, {
            'x-internal-key': config.internalKey,
            'x-openvibe-service': 'openvibe-workers',
        });
        assert.strictEqual(clipResponse.status, 201);
        const createdClip = JSON.parse(clipResponse.body).clip;
        assert.ok(createdClip.id.startsWith('clip_'));

        const internalMaterializeResponse = await request(server, 'POST', '/api/v1/internal/clips/materialize', {
            clip_id: createdClip.id,
            mode: 'worker-materialize',
        }, {
            'x-internal-key': config.internalKey,
            'x-openvibe-service': 'openvibe-workers',
        });
        assert.strictEqual(internalMaterializeResponse.status, 201);
        const internalMaterialized = JSON.parse(internalMaterializeResponse.body);
        assert.strictEqual(internalMaterialized.clip.status, 'ready');
        assert.ok(internalMaterialized.media.id);

        const materializeResponse = await request(server, 'POST', `/api/v1/clips/${encodeURIComponent(createdClip.id)}/materialize`, {
            mode: 'virtual-copy',
        }, {
            'x-internal-key': config.internalKey,
            'x-openvibe-service': 'openvibe-workers',
        });
        assert.strictEqual(materializeResponse.status, 200);
        const materialized = JSON.parse(materializeResponse.body);
        assert.strictEqual(materialized.clip.status, 'ready');
        assert.ok(materialized.media.id);

        const reconcileResponse = await request(server, 'POST', '/api/v1/internal/lifecycle/reconcile', {
            namespace: 'live.vods',
            limit: 20,
        }, {
            'x-internal-key': config.internalKey,
            'x-openvibe-service': 'openvibe-workers',
        });
        assert.strictEqual(reconcileResponse.status, 200);
        const reconcile = JSON.parse(reconcileResponse.body);
        assert.strictEqual(reconcile.ok, true);
        assert.strictEqual(reconcile.requested_by_service, 'openvibe-workers');
        assert.ok(reconcile.reconciled_group_count >= 1);

        const clipPlaybackResponse = await request(server, 'GET', `/api/v1/clips/${encodeURIComponent(createdClip.id)}/playback`);
        assert.strictEqual(clipPlaybackResponse.status, 200);
        const clipPlayback = JSON.parse(clipPlaybackResponse.body);
        assert.strictEqual(clipPlayback.playback.url, `http://media.test/files/${encodeURIComponent(materialized.media.id)}`);

        const analyzeResponse = await request(server, 'POST', `/api/v1/media/${encodeURIComponent(media.id)}/analyze`, {
            mode: 'local-stub',
        }, {
            'x-internal-key': config.internalKey,
            'x-openvibe-service': 'openvibe-workers',
        });
        assert.strictEqual(analyzeResponse.status, 200);
        const analysis = JSON.parse(analyzeResponse.body);
        assert.strictEqual(analysis.mode, 'local-stub');
        assert.ok(analysis.transcript_segments.length >= 1);

        const transcriptResponse = await request(server, 'GET', `/api/v1/media/${encodeURIComponent(media.id)}/transcript`);
        assert.strictEqual(transcriptResponse.status, 200);
        const transcript = JSON.parse(transcriptResponse.body);
        assert.ok(transcript.items.length >= 1);

        const candidatesResponse = await request(server, 'GET', `/api/v1/media/${encodeURIComponent(media.id)}/clip-candidates`);
        assert.strictEqual(candidatesResponse.status, 200);
        const candidates = JSON.parse(candidatesResponse.body);
        assert.ok(candidates.items.length >= 1);

        const candidateClipResponse = await request(server, 'POST', `/api/v1/media/${encodeURIComponent(media.id)}/clip-candidates/${encodeURIComponent(String(candidates.items[0].id))}/create-clip`, {
            title: 'Candidate clip',
        }, {
            'x-internal-key': config.internalKey,
            'x-openvibe-service': 'openvibe-workers',
        });
        assert.strictEqual(candidateClipResponse.status, 201);
        const candidateClip = JSON.parse(candidateClipResponse.body);
        assert.ok(candidateClip.clip.id);
        assert.ok(clipModel.getClipById(candidateClip.clip.id));
    } finally {
        await close(server);
    }
})();

console.log('media pipeline route tests OK');
