'use strict';

// ═══════════════════════════════════════════════════════════════
// OpenVibe Tools — Audio Processing
// FFmpeg-based audio conversion, normalization, trim, merge.
// ═══════════════════════════════════════════════════════════════

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

// Ensure tmp dir exists
if (!fs.existsSync(config.tmpDir)) fs.mkdirSync(config.tmpDir, { recursive: true });

function tmpFile(ext) {
    return path.join(config.tmpDir, `${crypto.randomBytes(16).toString('hex')}.${ext}`);
}

function probe(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, data) => {
            if (err) return reject(err);
            resolve(data);
        });
    });
}

function runFfmpeg(cmd) {
    return new Promise((resolve, reject) => {
        cmd.on('error', reject).on('end', resolve).run();
    });
}

// Format → ffmpeg config
const AUDIO_FORMATS = {
    mp3:  { ext: 'mp3',  codec: 'libmp3lame', lossy: true,  mime: 'audio/mpeg' },
    wav:  { ext: 'wav',  codec: 'pcm_s16le',  lossy: false, mime: 'audio/wav' },
    flac: { ext: 'flac', codec: 'flac',       lossy: false, mime: 'audio/flac' },
    ogg:  { ext: 'ogg',  codec: 'libvorbis',  lossy: true,  mime: 'audio/ogg' },
    m4a:  { ext: 'm4a',  codec: 'aac',        lossy: true,  mime: 'audio/mp4', extra: ['-movflags', '+faststart'] },
    aac:  { ext: 'aac',  codec: 'aac',        lossy: true,  mime: 'audio/aac' },
    opus: { ext: 'opus', codec: 'libopus',    lossy: true,  mime: 'audio/ogg; codecs=opus' },
    webm: { ext: 'webm', codec: 'libopus',    lossy: true,  mime: 'audio/webm' },
};

/**
 * Convert audio to target format.
 */
async function convert(inputPath, options = {}) {
    const fmt = String(options.format || 'mp3').toLowerCase();
    const cfg = AUDIO_FORMATS[fmt];
    if (!cfg) throw new Error(`Unsupported format: ${fmt}`);

    const bitrate = parseInt(options.bitrate, 10) || 192;
    const sampleRate = parseInt(options.sampleRate, 10) || 0;
    const channels = parseInt(options.channels, 10) || 0;

    const out = tmpFile(cfg.ext);
    await new Promise((resolve, reject) => {
        let cmd = ffmpeg(inputPath).noVideo().audioCodec(cfg.codec);
        if (cfg.lossy) cmd = cmd.audioBitrate(bitrate);
        if (sampleRate > 0) cmd = cmd.audioFrequency(sampleRate);
        if (channels > 0) cmd = cmd.audioChannels(channels);
        if (cfg.extra) cmd.outputOptions(cfg.extra);
        cmd.on('error', reject).on('end', resolve).save(out);
    });

    const info = await probe(out).catch(() => null);
    const duration = info?.streams?.find(s => s.codec_type === 'audio')?.duration || 0;

    return { outputPath: out, mime: cfg.mime, ext: cfg.ext, duration: parseFloat(duration) || 0 };
}

/**
 * Normalize audio to target loudness (LUFS).
 */
async function normalize(inputPath, options = {}) {
    const targetLufs = parseFloat(options.lufs) || -14;
    const fmt = String(options.format || 'mp3').toLowerCase();
    const cfg = AUDIO_FORMATS[fmt] || AUDIO_FORMATS.mp3;
    const out = tmpFile(cfg.ext);

    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .noVideo()
            .audioFilter(`loudnorm=I=${targetLufs}:LRA=11:TP=-1.5`)
            .audioCodec(cfg.codec)
            .on('error', reject)
            .on('end', resolve)
            .save(out);
    });

    return { outputPath: out, mime: cfg.mime, ext: cfg.ext };
}

/**
 * Trim audio to a time range.
 */
async function trim(inputPath, options = {}) {
    const start = parseFloat(options.start) || 0;
    const end = parseFloat(options.end) || 0;
    const fmt = String(options.format || 'mp3').toLowerCase();
    const cfg = AUDIO_FORMATS[fmt] || AUDIO_FORMATS.mp3;
    const out = tmpFile(cfg.ext);

    if (end <= start && end !== 0) throw new Error('End time must be greater than start time');

    await new Promise((resolve, reject) => {
        let cmd = ffmpeg(inputPath).noVideo().audioCodec(cfg.codec);
        if (start > 0) cmd = cmd.setStartTime(start);
        if (end > 0) cmd = cmd.setDuration(end - start);
        cmd.on('error', reject).on('end', resolve).save(out);
    });

    return { outputPath: out, mime: cfg.mime, ext: cfg.ext };
}

/**
 * Extract metadata from audio file.
 */
async function metadata(inputPath) {
    const info = await probe(inputPath);
    const astream = info.streams.find(s => s.codec_type === 'audio') || {};
    const tags = info.format.tags || {};
    return {
        duration: parseFloat(info.format.duration) || 0,
        bitrate: parseInt(info.format.bit_rate, 10) || 0,
        codec: astream.codec_name || null,
        sampleRate: parseInt(astream.sample_rate, 10) || 0,
        channels: astream.channels || 0,
        format: info.format.format_name || null,
        size: parseInt(info.format.size, 10) || 0,
        tags: {
            title: tags.title || tags.TITLE || null,
            artist: tags.artist || tags.ARTIST || null,
            album: tags.album || tags.ALBUM || null,
            year: tags.date || tags.DATE || tags.year || tags.YEAR || null,
            genre: tags.genre || tags.GENRE || null,
            comment: tags.comment || tags.COMMENT || null,
            track: tags.track || tags.TRACK || null,
        },
    };
}

/**
 * Change playback speed.
 */
async function speed(inputPath, options = {}) {
    const rate = Math.max(0.25, Math.min(4.0, parseFloat(options.rate) || 1.0));
    const fmt = String(options.format || 'mp3').toLowerCase();
    const cfg = AUDIO_FORMATS[fmt] || AUDIO_FORMATS.mp3;
    const out = tmpFile(cfg.ext);

    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .noVideo()
            .audioFilter(`atempo=${rate}`)
            .audioCodec(cfg.codec)
            .on('error', reject)
            .on('end', resolve)
            .save(out);
    });

    return { outputPath: out, mime: cfg.mime, ext: cfg.ext };
}

/**
 * Reverse audio.
 */
async function reverse(inputPath, options = {}) {
    const fmt = String(options.format || 'mp3').toLowerCase();
    const cfg = AUDIO_FORMATS[fmt] || AUDIO_FORMATS.mp3;
    const out = tmpFile(cfg.ext);

    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .noVideo()
            .audioFilter('areverse')
            .audioCodec(cfg.codec)
            .on('error', reject)
            .on('end', resolve)
            .save(out);
    });

    return { outputPath: out, mime: cfg.mime, ext: cfg.ext };
}

/**
 * Strip audio track from video file (extract audio only).
 */
async function extractAudio(inputPath, options = {}) {
    const fmt = String(options.format || 'mp3').toLowerCase();
    const cfg = AUDIO_FORMATS[fmt] || AUDIO_FORMATS.mp3;
    const out = tmpFile(cfg.ext);

    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .noVideo()
            .audioCodec(cfg.codec)
            .on('error', reject)
            .on('end', resolve)
            .save(out);
    });

    return { outputPath: out, mime: cfg.mime, ext: cfg.ext };
}

/**
 * Clean up a temp file (fire-and-forget).
 */
function cleanTmp(filePath) {
    if (!filePath) return;
    fs.unlink(filePath, () => {});
}

module.exports = { convert, normalize, trim, metadata, speed, reverse, extractAudio, cleanTmp, AUDIO_FORMATS };
