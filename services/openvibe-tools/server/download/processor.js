'use strict';

// ═══════════════════════════════════════════════════════════════
// OpenVibe Tools — Download Module
// yt-dlp backed URL downloader supporting YouTube, SoundCloud, etc.
// ═══════════════════════════════════════════════════════════════

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

if (!fs.existsSync(config.tmpDir)) fs.mkdirSync(config.tmpDir, { recursive: true });

const YT_DLP = process.env.YT_DLP_PATH || 'yt-dlp';

function runYtDlp(args, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        const proc = execFile(YT_DLP, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout.trim());
        });
    });
}

/**
 * Fetch metadata/info for a URL without downloading.
 */
async function info(url) {
    const json = await runYtDlp(['--dump-json', '--no-playlist', url]);
    const data = JSON.parse(json);
    return {
        id: data.id,
        title: data.title,
        duration: data.duration,
        uploader: data.uploader,
        description: data.description,
        thumbnail: data.thumbnail,
        formats: (data.formats || []).map(f => ({
            formatId: f.format_id,
            ext: f.ext,
            quality: f.quality,
            height: f.height,
            width: f.width,
            fps: f.fps,
            filesize: f.filesize,
            note: f.format_note,
            vcodec: f.vcodec,
            acodec: f.acodec,
        })),
        extractorKey: data.extractor_key,
    };
}

/**
 * Download audio from a URL as mp3.
 */
async function downloadAudio(url, options = {}) {
    const fmt = String(options.format || 'mp3').toLowerCase();
    const quality = String(options.quality || '192');
    const outId = crypto.randomBytes(12).toString('hex');
    const outBase = path.join(config.tmpDir, outId);

    await runYtDlp([
        '--no-playlist',
        '-x',
        '--audio-format', fmt,
        '--audio-quality', quality,
        '-o', `${outBase}.%(ext)s`,
        url,
    ]);

    // Find the output file
    const files = fs.readdirSync(config.tmpDir).filter(f => f.startsWith(outId));
    if (!files.length) throw new Error('Download produced no output file');

    const outFile = path.join(config.tmpDir, files[0]);
    const ext = path.extname(files[0]).slice(1);
    const mimeMap = { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac', wav: 'audio/wav' };
    return { outputPath: outFile, ext, mime: mimeMap[ext] || 'audio/octet-stream' };
}

/**
 * Download video from a URL.
 */
async function downloadVideo(url, options = {}) {
    const formatSpec = options.format || 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
    const outId = crypto.randomBytes(12).toString('hex');
    const outBase = path.join(config.tmpDir, outId);
    const mergeExt = 'mp4';

    await runYtDlp([
        '--no-playlist',
        '-f', formatSpec,
        '--merge-output-format', mergeExt,
        '-o', `${outBase}.%(ext)s`,
        url,
    ], 300000);

    const files = fs.readdirSync(config.tmpDir).filter(f => f.startsWith(outId));
    if (!files.length) throw new Error('Download produced no output file');

    const outFile = path.join(config.tmpDir, files[0]);
    const ext = path.extname(files[0]).slice(1);
    return { outputPath: outFile, ext, mime: 'video/mp4' };
}

module.exports = { info, downloadAudio, downloadVideo };
