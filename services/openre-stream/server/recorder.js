'use strict';

/**
 * openre-stream — VOD Recorder
 *
 * Manages FFmpeg recording sessions per stream. Called by routes.js
 * when an ingest connection is established or disconnected.
 *
 * Record lifecycle:
 *   1. ingest/connected → startRecording(stream, channel, config)
 *   2. FFmpeg reads from the RTMP local endpoint and writes HLS segments + playlist
 *   3. ingest/disconnected → stopRecording(streamId) → returns { hlsDir, playlistPath }
 *   4. Caller posts the recording result to model + publishes vod-ready event
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const FFMPEG_BIN = process.env.FFMPEG_BIN || '/usr/bin/ffmpeg';

// Map<streamId, { proc, hlsDir, playlistPath, startedAt }>
const activeRecordings = new Map();

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

/**
 * Start recording a stream via FFmpeg (HLS output).
 * @param {object} stream - stream row from model
 * @param {object} channel - channel row from model
 * @param {object} cfg - config with db.path and vodDir
 * @returns {{ hlsDir, playlistPath }} paths for the recording
 */
function startRecording(stream, channel, cfg) {
    if (activeRecordings.has(stream.id)) {
        return activeRecordings.get(stream.id);
    }

    const vodBase = cfg.vodDir || path.join(path.dirname(cfg.db.path), 'vods');
    const hlsDir = path.join(vodBase, String(channel.slug), String(stream.id));
    const playlistPath = path.join(hlsDir, 'index.m3u8');

    ensureDir(hlsDir);

    // Derive RTMP local pull URL — works when nginx-rtmp is running on localhost
    // The ingest.rtmp is the public URL (e.g. rtmp://ingest.openre.stream/live)
    // For local recording we always pull from 127.0.0.1:1935
    const localRtmpBase = cfg.ingest && cfg.ingest.rtmpLocalPull
        ? cfg.ingest.rtmpLocalPull
        : 'rtmp://127.0.0.1:1935/live';
    const rtmpUrl = `${localRtmpBase}/${encodeURIComponent(channel.slug)}`;

    const args = [
        '-loglevel', 'warning',
        '-i', rtmpUrl,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '0',
        '-hls_flags', 'independent_segments+append_list',
        '-hls_segment_filename', path.join(hlsDir, 'seg%05d.ts'),
        playlistPath,
    ];

    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (chunk) => {
        process.stdout.write(`[recorder:${stream.id}] ${chunk}`);
    });
    proc.stderr.on('data', (chunk) => {
        const line = String(chunk).trim();
        if (line) console.log(`[recorder:${stream.id}] ${line}`);
    });
    proc.on('close', (code) => {
        console.log(`[recorder:${stream.id}] ffmpeg exited code=${code}`);
        activeRecordings.delete(stream.id);
    });
    proc.on('error', (err) => {
        console.warn(`[recorder:${stream.id}] ffmpeg spawn error: ${err.message}`);
        activeRecordings.delete(stream.id);
    });

    const entry = { proc, hlsDir, playlistPath, startedAt: new Date().toISOString() };
    activeRecordings.set(stream.id, entry);
    console.log(`[recorder:${stream.id}] started ffmpeg → ${playlistPath}`);
    return { hlsDir, playlistPath };
}

/**
 * Stop recording a stream. Returns recorded file paths for finalization.
 * @param {string} streamId
 * @returns {{ hlsDir, playlistPath, startedAt }|null}
 */
function stopRecording(streamId) {
    const entry = activeRecordings.get(String(streamId));
    if (!entry) return null;
    try {
        entry.proc.kill('SIGTERM');
    } catch {
        // already exited
    }
    activeRecordings.delete(String(streamId));
    console.log(`[recorder:${streamId}] stopped ffmpeg recording`);
    return { hlsDir: entry.hlsDir, playlistPath: entry.playlistPath, startedAt: entry.startedAt };
}

/**
 * Check if a stream is being actively recorded.
 */
function isRecording(streamId) {
    return activeRecordings.has(String(streamId));
}

/**
 * List all active recording stream IDs.
 */
function listRecordings() {
    return Array.from(activeRecordings.keys()).map((streamId) => ({
        stream_id: streamId,
        started_at: activeRecordings.get(streamId).startedAt,
        playlist_path: activeRecordings.get(streamId).playlistPath,
    }));
}

module.exports = { startRecording, stopRecording, isRecording, listRecordings };
