'use strict';

// openvibe-media — async processing seam. Uses local job table (media_jobs)
// for ordering/retry today; the API is identical to the openvibe-events
// queue so it can be moved later. Each job kind has a callable seam
// (image_thumbnail, video_thumbnail, vod_metadata, clip_metadata) that may
// shell out to ffmpeg/ffprobe/sharp when those binaries are available, but
// degrades gracefully when they aren't (status → ready, no derivative).

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const model = require('./model');

const JOB_KINDS = Object.freeze(['image_thumbnail', 'video_thumbnail', 'vod_metadata', 'clip_metadata']);

function enqueue(mediaId, kind, payload) {
    if (!JOB_KINDS.includes(kind)) throw new Error(`unknown job kind: ${kind}`);
    const r = db.get().prepare(`
        INSERT INTO media_jobs (media_id, kind, state, payload_json)
        VALUES (?, ?, 'pending', ?)
    `).run(String(mediaId), kind, JSON.stringify(payload || {}));
    return { id: r.lastInsertRowid, media_id: mediaId, kind };
}

function nextPending(limit) {
    return db.get().prepare(`
        SELECT * FROM media_jobs
        WHERE state IN ('pending', 'failed')
          AND attempts < ?
          AND next_attempt_at <= CURRENT_TIMESTAMP
        ORDER BY id ASC LIMIT ?
    `).all(8, limit || 1);
}

function markRunning(jobId) {
    db.get().prepare(`
        UPDATE media_jobs
        SET state = 'running', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(jobId);
}

function markDone(jobId) {
    db.get().prepare(`UPDATE media_jobs SET state='done', last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id = ?`).run(jobId);
}

function markFailed(jobId, message, attempts) {
    const backoffMs = Math.min(60000, 2000 * Math.pow(2, attempts || 1));
    db.get().prepare(`
        UPDATE media_jobs
        SET state = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP,
            next_attempt_at = datetime('now', '+' || ? || ' seconds')
        WHERE id = ?
    `).run(String(message || ''), Math.ceil(backoffMs / 1000), jobId);
}

function listJobs({ state, limit }) {
    const where = [];
    const args = [];
    if (state) { where.push('state = ?'); args.push(String(state)); }
    const cap = Math.min(parseInt(limit, 10) || 50, 200);
    const sql = where.length
        ? `SELECT * FROM media_jobs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`
        : `SELECT * FROM media_jobs ORDER BY id DESC LIMIT ?`;
    return db.get().prepare(sql).all(...args, cap);
}

// ── Job runners (callable seams) ──────────────────────────────
// These intentionally don't require ffmpeg/sharp at module load. If the
// binary isn't on PATH we record a 'derivative-skipped' note and mark the
// media object 'ready' anyway so consumers don't block on offline tooling.

function _ffprobeAvailable() {
    try {
        const r = require('child_process').spawnSync('ffprobe', ['-version'], { stdio: 'ignore' });
        return r.status === 0;
    } catch { return false; }
}

function _ffmpegAvailable() {
    try {
        const r = require('child_process').spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
        return r.status === 0;
    } catch { return false; }
}

async function runJob(job, deps) {
    const media = model.getById(job.media_id);
    if (!media) throw new Error('media not found');

    if (job.kind === 'image_thumbnail' || job.kind === 'video_thumbnail') {
        await _runThumbnailJob(job, media, deps);
    } else if (job.kind === 'vod_metadata' || job.kind === 'clip_metadata') {
        await _runMetadataJob(job, media, deps);
    } else {
        throw new Error(`unknown job kind: ${job.kind}`);
    }

    // Promote media to ready once all pending jobs for it are done.
    const pending = db.get().prepare(
        `SELECT COUNT(*) AS c FROM media_jobs WHERE media_id = ? AND state IN ('pending','running','failed')`
    ).get(media.id).c;
    if (pending === 0 && media.status !== 'ready' && media.status !== 'deleted') {
        const updated = model.update(media.id, { status: 'ready' });
        deps.publishMediaEvent('media.ready', updated);
    }
}

async function _runThumbnailJob(job, media, deps) {
    if (job.kind === 'video_thumbnail' && !_ffmpegAvailable()) {
        // Skip cleanly — record a derivative note for diagnostic visibility.
        db.get().prepare(`UPDATE media_jobs SET last_error='ffmpeg unavailable, skipped' WHERE id = ?`).run(job.id);
        return;
    }

    const storagePath = deps.storage.pathFor(media.storage_key);
    if (!storagePath || !fs.existsSync(storagePath)) {
        // Storage might be remote in S3 mode; in that case we can't extract
        // thumbnails locally — leave a structured note and exit without error.
        db.get().prepare(`UPDATE media_jobs SET last_error='storage not local; thumbnail skipped' WHERE id = ?`).run(job.id);
        return;
    }

    if (job.kind === 'image_thumbnail') {
        // For images we record the source itself as the 'thumbnail' derivative.
        // Real resizing requires sharp; we treat it as a callable seam.
        db.get().prepare(`
            INSERT INTO media_derivatives (id, parent_media_id, kind, label, storage_provider, storage_key, public_url, mime_type, size_bytes, metadata_json)
            VALUES (?, ?, 'thumbnail', 'source', ?, ?, ?, ?, ?, '{}')
        `).run(
            `der_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            media.id, media.storage_provider, media.storage_key,
            media.public_url, media.mime_type, media.size_bytes,
        );
        deps.publishMediaEvent('media.derivative.created', media, { derivative_kind: 'thumbnail', label: 'source' });
        return;
    }

    // video_thumbnail — extract a single frame at 10% of duration.
    const outName = `${media.id}.jpg`;
    const outDir = path.join(path.dirname(storagePath), '_thumbs');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, outName);

    await new Promise((resolve) => {
        const args = ['-y', '-ss', '00:00:01', '-i', storagePath, '-vframes', '1', '-vf', 'scale=640:-1', '-q:v', '6', outPath];
        const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
        const t = setTimeout(() => { try { proc.kill(); } catch {} resolve(); }, 30000);
        proc.on('close', () => { clearTimeout(t); resolve(); });
        proc.on('error', () => { clearTimeout(t); resolve(); });
    });

    if (fs.existsSync(outPath)) {
        const buf = fs.readFileSync(outPath);
        const derivId = `der_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const wrote = deps.storage.writeBuffer(media.namespace, `${media.id}.thumb`, buf, { extension: 'jpg' });
        const publicUrl = deps.storage.publicUrlFor(`${media.id}.thumb`);
        db.get().prepare(`
            INSERT INTO media_derivatives (id, parent_media_id, kind, label, storage_provider, storage_key, public_url, mime_type, size_bytes, metadata_json)
            VALUES (?, ?, 'thumbnail', 'jpeg-640', ?, ?, ?, 'image/jpeg', ?, '{}')
        `).run(derivId, media.id, deps.storage.name(), wrote.storageKey, publicUrl, wrote.sizeBytes);
        deps.publishMediaEvent('media.derivative.created', media, { derivative_kind: 'thumbnail', label: 'jpeg-640' });
        try { fs.unlinkSync(outPath); } catch {}
    }
}

async function _runMetadataJob(job, media, deps) {
    if (!_ffprobeAvailable()) {
        db.get().prepare(`UPDATE media_jobs SET last_error='ffprobe unavailable, skipped' WHERE id = ?`).run(job.id);
        return;
    }
    const storagePath = deps.storage.pathFor(media.storage_key);
    if (!storagePath || !fs.existsSync(storagePath)) {
        db.get().prepare(`UPDATE media_jobs SET last_error='storage not local; metadata skipped' WHERE id = ?`).run(job.id);
        return;
    }
    const info = await new Promise((resolve) => {
        const proc = spawn('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', storagePath]);
        let out = '';
        proc.stdout.on('data', d => out += d);
        const t = setTimeout(() => { try { proc.kill(); } catch {} resolve(null); }, 30000);
        proc.on('close', () => {
            clearTimeout(t);
            try { resolve(JSON.parse(out)); } catch { resolve(null); }
        });
        proc.on('error', () => { clearTimeout(t); resolve(null); });
    });
    if (info) {
        const dur = parseFloat(info.format && info.format.duration) || null;
        model.update(media.id, { metadata: { duration_seconds: dur, ffprobe_format: info.format ? info.format.format_name : null } });
    }
}

class ProcessingWorker {
    constructor(opts) {
        this.opts = opts;
        this.timer = null;
        this.running = false;
    }
    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick().catch(err => console.warn('[Worker] tick error:', err.message)),
            this.opts.intervalMs || 1000);
        console.log(`[MediaWorker] started, interval=${this.opts.intervalMs || 1000}ms`);
    }
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
    async tick() {
        if (this.running) return;
        this.running = true;
        try {
            const jobs = nextPending(3);
            for (const job of jobs) {
                markRunning(job.id);
                try {
                    this.opts.publishMediaEvent('media.processing.started',
                        model.getById(job.media_id), { job_kind: job.kind, job_id: job.id });
                    await runJob(job, { storage: this.opts.storage, publishMediaEvent: this.opts.publishMediaEvent });
                    markDone(job.id);
                    this.opts.publishMediaEvent('media.processing.completed',
                        model.getById(job.media_id), { job_kind: job.kind, job_id: job.id });
                } catch (err) {
                    console.error(`[MediaWorker] job ${job.id} (${job.kind}) failed: ${err.message}`);
                    markFailed(job.id, err.message, (job.attempts || 0) + 1);
                    this.opts.publishMediaEvent('media.processing.failed',
                        model.getById(job.media_id), { job_kind: job.kind, job_id: job.id, error: err.message });
                }
            }
        } finally {
            this.running = false;
        }
    }
}

module.exports = {
    JOB_KINDS, enqueue, nextPending, markRunning, markDone, markFailed,
    listJobs, runJob, ProcessingWorker,
};
