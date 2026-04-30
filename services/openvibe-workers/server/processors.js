'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_MIGRATION_BUNDLE_DIR = path.join(REPO_ROOT, 'data', 'migrations', 'hobo-production-staging', 'openvibe-target');
const DEFAULT_CUTOVER_REPORT_PATH = path.join(REPO_ROOT, 'data', 'migrations', 'cutover-report.json');

function trimUrl(value) {
    return String(value || '').trim().replace(/\/$/, '');
}

function buildInternalHeaders(config, extraHeaders) {
    return Object.assign({
        'x-internal-key': config.internalKey,
        'x-openvibe-service': config.serviceId || 'openvibe-workers',
    }, extraHeaders || {});
}

function dependencyFromHttp(service, baseUrl, endpointPath) {
    const url = trimUrl(baseUrl);
    return {
        type: 'http',
        service,
        url: url ? `${url}${endpointPath}` : null,
        configured: !!url,
        status: url ? 'configured' : 'missing-config',
        message: url ? null : `${service} URL is not configured`,
        available: !!url,
    };
}

function dependencyFromScript(scriptPath) {
    const exists = fs.existsSync(scriptPath);
    return {
        type: 'python-script',
        path: scriptPath,
        configured: exists,
        status: exists ? 'configured' : 'missing-script',
        message: exists ? null : `missing script: ${path.basename(scriptPath)}`,
        available: exists,
    };
}

function dependencyFromArtifacts(bundleDir) {
    const validationSummaryPath = path.join(bundleDir, 'audit', 'validation-summary.json');
    const validationExists = fs.existsSync(validationSummaryPath);
    return {
        type: 'artifacts',
        bundle_dir: bundleDir,
        validation_summary_path: validationSummaryPath,
        configured: validationExists,
        status: validationExists ? 'configured' : 'missing-artifact',
        message: validationExists ? null : 'validation-summary.json is required for bundle verification',
        available: validationExists,
    };
}

function ensureDependency(definition) {
    if (!definition || !definition.dependency || definition.dependency.available) return;
    const error = new Error(definition.dependency.message || `processor dependency unavailable for ${definition.name}`);
    error.dependency = definition.dependency;
    throw error;
}

function readJsonIfExists(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function summarizeValidationSummary(report) {
    if (!report) return null;
    return {
        ok: report.ok !== false,
        check_count: Array.isArray(report.checks) ? report.checks.length : 0,
        mismatch_count: Array.isArray(report.mismatches) ? report.mismatches.length : 0,
        duplicate_count: Array.isArray(report.duplicates) ? report.duplicates.length : 0,
        missing_ref_count: Array.isArray(report.missing_refs) ? report.missing_refs.length : 0,
    };
}

function summarizeReadinessReport(report) {
    if (!report) return null;
    return {
        summary: report.summary || null,
        manual_action_count: Array.isArray(report.manual_actions) ? report.manual_actions.length : 0,
    };
}

function summarizeCutoverReport(report) {
    if (!report) return null;
    return {
        gate: report.gate || null,
        summary: report.summary || null,
        artifact_count: report.artifacts ? Object.keys(report.artifacts).length : 0,
    };
}

function deriveBundleGate(result) {
    if (!result.artifacts.validation_summary.exists) return 'red';
    if (result.validation && !result.validation.ok) return 'red';
    if (result.validation && (result.validation.mismatch_count > 0 || result.validation.duplicate_count > 0 || result.validation.missing_ref_count > 0)) {
        return 'red';
    }
    if (result.cutover && result.cutover.gate === 'red') return 'red';
    if (result.readiness && result.readiness.summary && Number(result.readiness.summary.red || 0) > 0) return 'red';
    if (!result.artifacts.readiness_report.exists || !result.artifacts.cutover_report.exists) return 'yellow';
    if (result.cutover && result.cutover.gate === 'yellow') return 'yellow';
    if (result.readiness && result.readiness.summary && Number(result.readiness.summary.yellow || 0) > 0) return 'yellow';
    return 'green';
}

async function postJson(url, body, headers, timeoutMs) {
    if (typeof fetch !== 'function') {
        return { ok: false, skipped: true, reason: 'global fetch unavailable' };
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    if (controller && timeoutMs > 0) {
        timer = setTimeout(() => controller.abort(), timeoutMs);
        if (typeof timer.unref === 'function') timer.unref();
    }
    const response = await fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
        body: JSON.stringify(body || {}),
        signal: controller ? controller.signal : undefined,
    });
    if (timer) clearTimeout(timer);
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

async function verifyMigrationBundle(config, payload) {
    const input = payload || {};
    const bundleDir = path.resolve(input.bundle_dir || config.migrationBundleDir || DEFAULT_MIGRATION_BUNDLE_DIR);
    const validationSummaryPath = path.resolve(input.validation_summary_path || path.join(bundleDir, 'audit', 'validation-summary.json'));
    const readinessReportPath = path.resolve(input.readiness_report_path || path.join(bundleDir, 'audit', 'readiness-report.json'));
    const cutoverReportPath = path.resolve(input.cutover_report_path || config.migrationCutoverReportPath || DEFAULT_CUTOVER_REPORT_PATH);
    const validationSummary = readJsonIfExists(validationSummaryPath);
    const readinessReport = readJsonIfExists(readinessReportPath);
    const cutoverReport = readJsonIfExists(cutoverReportPath);

    const result = {
        ok: true,
        mode: 'artifact-inspection',
        bundle_dir: bundleDir,
        artifacts: {
            validation_summary: {
                path: validationSummaryPath,
                exists: !!validationSummary,
            },
            readiness_report: {
                path: readinessReportPath,
                exists: !!readinessReport,
            },
            cutover_report: {
                path: cutoverReportPath,
                exists: !!cutoverReport,
            },
        },
        validation: summarizeValidationSummary(validationSummary),
        readiness: summarizeReadinessReport(readinessReport),
        cutover: summarizeCutoverReport(cutoverReport),
    };
    result.gate = deriveBundleGate(result);
    result.ok = result.gate !== 'red';
    return result;
}

function createProcessorCatalog(config) {
    const mediaProcessing = dependencyFromHttp('media', config.mediaUrl, '/api/v1/internal/processing/run');
    const mediaMaterialize = dependencyFromHttp('media', config.mediaUrl, '/api/v1/internal/clips/materialize');
    const mediaLifecycle = dependencyFromHttp('media', config.mediaUrl, '/api/v1/internal/lifecycle/reconcile');
    const contentSearch = dependencyFromHttp('content', config.contentUrl, '/api/v1/internal/search/reindex');
    const billingReconcile = dependencyFromHttp('billing', config.billingUrl, '/api/billing/internal/reconcile');
    const networkBroadcast = dependencyFromHttp('network', config.networkUrl, '/api/v1/internal/notifications/broadcast');
    const migrationBundle = dependencyFromArtifacts(config.migrationBundleDir || DEFAULT_MIGRATION_BUNDLE_DIR);

    function runHttp(definition, body) {
        ensureDependency(definition);
        return postJson(definition.dependency.url, body, buildInternalHeaders(config), config.requestTimeoutMs);
    }

    function runScript(definition, scriptName, payload) {
        ensureDependency(definition);
        return runPythonScript(config, scriptName, payload);
    }

    return {
        'media.thumbnail': {
            name: 'media.thumbnail',
            dependency: mediaProcessing,
            async run(job) {
                return runHttp(this, {
                    local_job_id: job.data && job.data.local_job_id,
                    media_id: job.data && job.data.media_id || null,
                    kind: job.data && job.data.kind || 'video_thumbnail',
                    payload: job.data && job.data.payload || {},
                });
            },
        },
        'media.metadata': {
            name: 'media.metadata',
            dependency: mediaProcessing,
            async run(job) {
                return runHttp(this, {
                    local_job_id: job.data && job.data.local_job_id,
                    media_id: job.data && job.data.media_id || null,
                    kind: job.data && job.data.kind || 'vod_metadata',
                    payload: job.data && job.data.payload || {},
                });
            },
        },
        'ai.transcript': {
            name: 'ai.transcript',
            dependency: dependencyFromScript(path.join(__dirname, '..', 'python', 'transcribe.py')),
            async run(job) {
                return runScript(this, 'transcribe.py', job.data || {});
            },
        },
        'ai.scene-detect': {
            name: 'ai.scene-detect',
            dependency: dependencyFromScript(path.join(__dirname, '..', 'python', 'scene_detect.py')),
            async run(job) {
                return runScript(this, 'scene_detect.py', job.data || {});
            },
        },
        'clips.materialize': {
            name: 'clips.materialize',
            dependency: mediaMaterialize,
            async run(job) {
                const data = job.data || {};
                return runHttp(this, {
                    clip_id: data.clip_id || data.clipId,
                    mode: data.mode || 'worker-materialize',
                });
            },
        },
        'analytics.audio-features': {
            name: 'analytics.audio-features',
            dependency: dependencyFromScript(path.join(__dirname, '..', 'python', 'extract_audio_features.py')),
            async run(job) {
                return runScript(this, 'extract_audio_features.py', job.data || {});
            },
        },
        'analytics.motion-detect': {
            name: 'analytics.motion-detect',
            dependency: dependencyFromScript(path.join(__dirname, '..', 'python', 'detect_motion.py')),
            async run(job) {
                return runScript(this, 'detect_motion.py', job.data || {});
            },
        },
        'lifecycle.reconcile': {
            name: 'lifecycle.reconcile',
            dependency: mediaLifecycle,
            async run(job) {
                return runHttp(this, job.data || {});
            },
        },
        'search.reindex': {
            name: 'search.reindex',
            dependency: contentSearch,
            async run(job) {
                return runHttp(this, job.data || {});
            },
        },
        'billing.reconcile': {
            name: 'billing.reconcile',
            dependency: billingReconcile,
            async run(job) {
                return runHttp(this, job.data || {});
            },
        },
        'migration.bundle-verify': {
            name: 'migration.bundle-verify',
            dependency: migrationBundle,
            async run(job) {
                ensureDependency(this);
                return verifyMigrationBundle(config, job.data || {});
            },
        },
        'notifications.broadcast': {
            name: 'notifications.broadcast',
            dependency: networkBroadcast,
            async run(job) {
                return runHttp(this, job.data || {});
            },
        },
    };
}

function describeProcessorCatalog(config) {
    const catalog = createProcessorCatalog(config);
    return Object.fromEntries(Object.entries(catalog).map(([name, definition]) => [name, {
        name,
        dependency: Object.assign({}, definition.dependency),
        available: !!(definition.dependency && definition.dependency.available),
    }]));
}

function createProcessors(config) {
    const catalog = createProcessorCatalog(config);
    return Object.fromEntries(Object.entries(catalog).map(([name, definition]) => [name, definition.run.bind(definition)]));
}

module.exports = {
    createProcessorCatalog,
    createProcessors,
    describeProcessorCatalog,
};