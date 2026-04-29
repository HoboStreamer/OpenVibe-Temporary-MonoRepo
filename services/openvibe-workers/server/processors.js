'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function postJson(url, body, headers) {
    if (typeof fetch !== 'function') {
        return { ok: false, skipped: true, reason: 'global fetch unavailable' };
    }
    const response = await fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
        body: JSON.stringify(body || {}),
    });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) {
        return {
            ok: false,
            status: response.status,
            error: data && data.error || `http_${response.status}`,
            body: data,
        };
    }
    return data || { ok: true };
}

function runPythonScript(config, scriptName, payload) {
    const scriptPath = path.join(__dirname, '..', 'python', scriptName);
    if (!fs.existsSync(scriptPath)) {
        return Promise.resolve({ ok: false, skipped: true, reason: `missing script: ${scriptName}` });
    }

    return new Promise((resolve) => {
        const child = spawn(config.pythonBin || 'python3', [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += String(chunk); });
        child.stderr.on('data', (chunk) => { stderr += String(chunk); });
        child.on('close', (code) => {
            if (code !== 0) {
                resolve({ ok: false, skipped: true, reason: stderr.trim() || `python exit ${code}` });
                return;
            }
            try {
                resolve(JSON.parse(stdout || '{}'));
            } catch {
                resolve({ ok: true, raw: stdout.trim() });
            }
        });
        child.on('error', (error) => {
            resolve({ ok: false, skipped: true, reason: error.message });
        });
        child.stdin.write(JSON.stringify(payload || {}));
        child.stdin.end();
    });
}

async function stubProcessor(name, payload) {
    return {
        ok: true,
        mode: 'local-stub',
        processor: name,
        payload: payload || {},
    };
}

function createProcessors(config) {
    return {
        async 'media.thumbnail'(job) {
            return postJson(`${String(config.mediaUrl || '').replace(/\/$/, '')}/api/v1/internal/processing/run`, {
                local_job_id: job.data && job.data.local_job_id,
                media_id: job.data && job.data.media_id || null,
                kind: job.data && job.data.kind || 'video_thumbnail',
                payload: job.data && job.data.payload || {},
            }, {
                'x-internal-key': config.internalKey,
                'x-openvibe-service': config.serviceId || 'openvibe-workers',
            });
        },
        async 'media.metadata'(job) {
            return postJson(`${String(config.mediaUrl || '').replace(/\/$/, '')}/api/v1/internal/processing/run`, {
                local_job_id: job.data && job.data.local_job_id,
                media_id: job.data && job.data.media_id || null,
                kind: job.data && job.data.kind || 'vod_metadata',
                payload: job.data && job.data.payload || {},
            }, {
                'x-internal-key': config.internalKey,
                'x-openvibe-service': config.serviceId || 'openvibe-workers',
            });
        },
        async 'ai.transcript'(job) {
            return runPythonScript(config, 'transcribe.py', job.data || {});
        },
        async 'ai.scene-detect'(job) {
            return runPythonScript(config, 'scene_detect.py', job.data || {});
        },
        async 'clips.materialize'(job) {
            return stubProcessor('clips.materialize', job.data || {});
        },
        async 'analytics.audio-features'(job) {
            return runPythonScript(config, 'extract_audio_features.py', job.data || {});
        },
        async 'analytics.motion-detect'(job) {
            return runPythonScript(config, 'detect_motion.py', job.data || {});
        },
        async 'lifecycle.reconcile'(job) {
            return stubProcessor('lifecycle.reconcile', job.data || {});
        },
        async 'search.reindex'(job) {
            return stubProcessor('search.reindex', job.data || {});
        },
        async 'billing.reconcile'(job) {
            return stubProcessor('billing.reconcile', job.data || {});
        },
        async 'migration.bundle-verify'(job) {
            return stubProcessor('migration.bundle-verify', job.data || {});
        },
        async 'notifications.broadcast'(job) {
            return {
                ok: true,
                delivered: false,
                action: 'log-only',
                payload: job.data || {},
            };
        },
    };
}

module.exports = {
    createProcessors,
};