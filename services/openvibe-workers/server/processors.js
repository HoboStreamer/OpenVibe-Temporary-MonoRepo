'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { createNativeBackendCatalog } = require('./backends');
const { dependencyFromHttp, postProcessorJson } = require('./processor-http');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_MIGRATION_BUNDLE_DIR = path.join(REPO_ROOT, 'data', 'migrations', 'hobo-production-staging', 'openvibe-target');
const DEFAULT_CUTOVER_REPORT_PATH = path.join(REPO_ROOT, 'data', 'migrations', 'cutover-report.json');

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

function toStringValue(value) {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : undefined;
}

function toBooleanValue(value, fallbackValue) {
    if (value == null) return fallbackValue;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return !!value;
}

function toIntegerValue(value, fallbackValue, minValue, maxValue) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallbackValue;
    return Math.min(Math.max(parsed, minValue), maxValue);
}

function toStringArray(value) {
    if (!Array.isArray(value)) return undefined;
    const items = value.map((item) => toStringValue(item)).filter(Boolean);
    return items.length ? items : undefined;
}

function normalizeObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const out = {};
    for (const [key, innerValue] of Object.entries(value)) {
        if (innerValue !== undefined) {
            out[key] = innerValue;
        }
    }
    return Object.keys(out).length ? out : undefined;
}

function compactObject(value) {
    const out = {};
    for (const [key, innerValue] of Object.entries(value || {})) {
        if (innerValue !== undefined) {
            out[key] = innerValue;
        }
    }
    return out;
}

function normalizeWorkerBackendMode(value) {
    const normalized = String(value || 'auto').trim().toLowerCase();
    if (normalized === 'http' || normalized === 'native' || normalized === 'auto') {
        return normalized;
    }
    return 'auto';
}

function buildMediaProcessingPayload(data, defaultKind) {
    return compactObject({
        local_job_id: toStringValue(data.local_job_id || data.localJobId),
        media_id: toStringValue(data.media_id || data.mediaId),
        kind: toStringValue(data.kind) || defaultKind,
        payload: normalizeObject(data.payload),
    });
}

function buildAiTranscriptPayload(data) {
    return compactObject({
        media_id: toStringValue(data.media_id || data.mediaId),
        media_url: toStringValue(data.media_url || data.mediaUrl),
        language: toStringValue(data.language),
        duration_seconds: data.duration_seconds == null && data.durationSeconds == null
            ? undefined
            : Number(data.duration_seconds != null ? data.duration_seconds : data.durationSeconds),
        segment_count: data.segment_count == null && data.segmentCount == null
            ? undefined
            : Number(data.segment_count != null ? data.segment_count : data.segmentCount),
        transcript_seed: toStringValue(data.transcript_seed || data.transcriptSeed),
        payload: normalizeObject(data.payload),
    });
}

function buildAiSceneDetectPayload(data) {
    return compactObject({
        media_id: toStringValue(data.media_id || data.mediaId),
        duration_seconds: data.duration_seconds == null && data.durationSeconds == null
            ? undefined
            : Number(data.duration_seconds != null ? data.duration_seconds : data.durationSeconds),
        scene_count: data.scene_count == null && data.sceneCount == null
            ? undefined
            : Number(data.scene_count != null ? data.scene_count : data.sceneCount),
        scene_seed: toStringValue(data.scene_seed || data.sceneSeed),
        payload: normalizeObject(data.payload),
    });
}

function buildAnalyticsAudioPayload(data) {
    return compactObject({
        media_id: toStringValue(data.media_id || data.mediaId),
        duration_seconds: data.duration_seconds == null && data.durationSeconds == null
            ? undefined
            : Number(data.duration_seconds != null ? data.duration_seconds : data.durationSeconds),
        segment_count: data.segment_count == null && data.segmentCount == null
            ? undefined
            : Number(data.segment_count != null ? data.segment_count : data.segmentCount),
        payload: normalizeObject(data.payload),
    });
}

function buildAnalyticsMotionPayload(data) {
    return compactObject({
        media_id: toStringValue(data.media_id || data.mediaId),
        duration_seconds: data.duration_seconds == null && data.durationSeconds == null
            ? undefined
            : Number(data.duration_seconds != null ? data.duration_seconds : data.durationSeconds),
        sample_count: data.sample_count == null && data.sampleCount == null
            ? undefined
            : Number(data.sample_count != null ? data.sample_count : data.sampleCount),
        motion_threshold: data.motion_threshold == null && data.motionThreshold == null
            ? undefined
            : Number(data.motion_threshold != null ? data.motion_threshold : data.motionThreshold),
        payload: normalizeObject(data.payload),
    });
}

function buildMigrationBundlePayload(data) {
    return compactObject({
        bundle_dir: toStringValue(data.bundle_dir || data.bundleDir),
        validation_summary_path: toStringValue(data.validation_summary_path || data.validationSummaryPath),
        readiness_report_path: toStringValue(data.readiness_report_path || data.readinessReportPath),
        cutover_report_path: toStringValue(data.cutover_report_path || data.cutoverReportPath),
    });
}

function buildClipMaterializePayload(data) {
    return compactObject({
        clip_id: toStringValue(data.clip_id || data.clipId),
        mode: toStringValue(data.mode) || 'worker-materialize',
        reason: toStringValue(data.reason) || 'worker.clips.materialize',
        request_id: toStringValue(data.request_id || data.requestId),
        payload: normalizeObject(data.payload),
    });
}

function buildLifecycleReconcilePayload(data) {
    return compactObject({
        media_id: toStringValue(data.media_id || data.mediaId),
        media_ids: toStringArray(data.media_ids || data.mediaIds),
        repair: data.repair == null ? undefined : toBooleanValue(data.repair, true),
        dry_run: data.dry_run == null && data.dryRun == null ? undefined : toBooleanValue(data.dry_run != null ? data.dry_run : data.dryRun, false),
        reason: toStringValue(data.reason) || 'worker.lifecycle.reconcile',
        payload: normalizeObject(data.payload),
    });
}

function buildSearchReindexPayload(data) {
    return compactObject({
        job_type: toStringValue(data.job_type || data.jobType) || 'search.reindex',
        surface: toStringValue(data.surface),
        source_id: toStringValue(data.source_id || data.sourceId),
        item_id: toStringValue(data.item_id || data.itemId),
        state: toStringValue(data.state),
        scheduled_at: toStringValue(data.scheduled_at || data.scheduledAt),
        payload: compactObject(Object.assign({}, normalizeObject(data.payload), {
            reason: toStringValue(data.reason) || 'worker.search.reindex',
            trigger: toStringValue(data.trigger),
            correlation_id: toStringValue(data.correlation_id || data.correlationId),
        })),
    });
}

function buildBillingReconcilePayload(data) {
    return compactObject({
        repair: toBooleanValue(data.repair, true),
        limit: toIntegerValue(data.limit, 100, 1, 500),
        wallet_type: toStringValue(data.wallet_type || data.walletType),
        status: toStringValue(data.status),
        owner_type: toStringValue(data.owner_type || data.ownerType),
        owner_id: toStringValue(data.owner_id || data.ownerId),
        currency: toStringValue(data.currency),
        reason: toStringValue(data.reason) || 'worker.billing.reconcile',
    });
}

function buildNotificationBroadcastPayload(data, defaultSource) {
    return compactObject({
        title: toStringValue(data.title || data.subject) || 'OpenVibe broadcast',
        audience: toStringValue(data.audience || data.channel) || 'all',
        body: data.body == null ? String(data.message || '') : String(data.body),
        severity: toStringValue(data.severity),
        source: toStringValue(data.source) || defaultSource,
        metadata: normalizeObject(data.metadata),
        reason: toStringValue(data.reason) || 'worker.notifications.broadcast',
    });
}

function selectPairedBackend(name, configuredMode, httpDependency, nativeDefinition, buildPayload, config, validate) {
    const httpDefinition = {
        dependency: httpDependency,
        async run(payload) {
            return postProcessorJson({ name, dependency: httpDependency }, payload, config, { validate });
        },
    };
    return selectBackendVariant({
        name,
        configuredMode,
        nativeDefinition,
        fallbackDefinition: httpDefinition,
        fallbackKind: 'http',
        buildPayload,
    });
}

function selectScriptPairedBackend(name, configuredMode, scriptName, nativeDefinition, buildPayload, config) {
    const scriptDependency = dependencyFromScript(path.join(__dirname, '..', 'python', scriptName));
    const scriptDefinition = {
        dependency: scriptDependency,
        async run(payload) {
            ensureDependency({ name, dependency: scriptDependency });
            return runPythonScript(config, scriptName, payload);
        },
    };
    return selectBackendVariant({
        name,
        configuredMode,
        nativeDefinition,
        fallbackDefinition: scriptDefinition,
        fallbackKind: 'script',
        buildPayload,
    });
}

function selectNativeOnlyBackend(name, nativeDefinition, buildPayload) {
    return selectBackendVariant({
        name,
        configuredMode: 'native',
        nativeDefinition,
        fallbackDefinition: null,
        fallbackKind: null,
        buildPayload,
    });
}

function selectBackendVariant({ name, configuredMode, nativeDefinition, fallbackDefinition, fallbackKind, buildPayload }) {
    const nativeAvailable = !!(nativeDefinition && nativeDefinition.dependency && nativeDefinition.dependency.available);
    const fallbackAvailable = !!(fallbackDefinition && fallbackDefinition.dependency && fallbackDefinition.dependency.available);
    let selectedBackend;
    if (configuredMode === 'native' || !fallbackDefinition) {
        selectedBackend = 'native';
    } else if (configuredMode === 'http' || configuredMode === fallbackKind) {
        // explicit non-native mode: prefer the legacy fallback (http or script).
        selectedBackend = fallbackKind;
    } else {
        selectedBackend = nativeAvailable ? 'native' : (fallbackAvailable ? fallbackKind : 'native');
    }
    const activeDefinition = selectedBackend === 'native' ? nativeDefinition : fallbackDefinition;
    const fallbackBackend = fallbackDefinition
        ? (selectedBackend === 'native' ? fallbackKind : 'native')
        : null;

    return {
        name,
        dependency: Object.assign({}, activeDefinition.dependency, {
            selected_backend: selectedBackend,
            configured_backend_mode: configuredMode,
            fallback_backend: fallbackBackend,
        }),
        backend: selectedBackend,
        configured_backend_mode: configuredMode,
        async run(job) {
            ensureDependency(this);
            return activeDefinition.run(buildPayload(job.data || {}));
        },
    };
}

function validateOkResponse(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return 'response body must be a JSON object';
    }
    if (body.ok === false) {
        return body.error || 'endpoint returned ok=false';
    }
    return null;
}

function validateQueuedResponse(body) {
    const error = validateOkResponse(body);
    if (error) return error;
    if (body.queued !== true) {
        return 'response omitted queued=true';
    }
    return null;
}

function validateMediaProcessingResponse(body) {
    const error = validateOkResponse(body);
    if (error) return error;
    if (!body.result) {
        return 'response omitted processing result';
    }
    return null;
}

function validateBillingResponse(body) {
    const error = validateOkResponse(body);
    if (error) return error;
    if (typeof body.mismatch_count !== 'number') {
        return 'response omitted mismatch_count';
    }
    return null;
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
    const backendMode = normalizeWorkerBackendMode(config.workerBackendMode || 'auto');
    const nativeCatalog = createNativeBackendCatalog(config);
    const mediaProcessing = dependencyFromHttp('media', config.mediaUrl, '/api/v1/internal/processing/run', {
        expects: 'tracked media-processing result',
    });
    const mediaMaterialize = dependencyFromHttp('media', config.mediaUrl, '/api/v1/internal/clips/materialize', {
        expects: 'materialized clip result',
    });
    const mediaLifecycle = dependencyFromHttp('media', config.mediaUrl, '/api/v1/internal/lifecycle/reconcile', {
        expects: 'lifecycle reconciliation summary',
    });
    const contentSearch = dependencyFromHttp('content', config.contentUrl, '/api/v1/internal/search/reindex', {
        expects: 'queued search reindex job',
    });
    const billingReconcile = dependencyFromHttp('billing', config.billingUrl, '/api/billing/internal/reconcile', {
        expects: 'billing mismatch reconciliation summary',
    });
    const networkBroadcast = dependencyFromHttp('network', config.networkUrl, '/api/v1/internal/notifications/broadcast', {
        expects: 'queued notification broadcast',
    });

    function runHttp(definition, body, validate) {
        ensureDependency(definition);
        return postProcessorJson(definition, body, config, { validate });
    }

    function runScript(definition, scriptName, payload) {
        ensureDependency(definition);
        return runPythonScript(config, scriptName, payload);
    }

    return {
        'media.thumbnail': {
            ...selectPairedBackend(
                'media.thumbnail',
                backendMode,
                mediaProcessing,
                nativeCatalog['media.thumbnail'],
                (data) => buildMediaProcessingPayload(data, 'video_thumbnail'),
                config,
                validateMediaProcessingResponse,
            ),
        },
        'media.metadata': {
            ...selectPairedBackend(
                'media.metadata',
                backendMode,
                mediaProcessing,
                nativeCatalog['media.metadata'],
                (data) => buildMediaProcessingPayload(data, 'vod_metadata'),
                config,
                validateMediaProcessingResponse,
            ),
        },
        'ai.transcript': {
            ...selectScriptPairedBackend(
                'ai.transcript',
                backendMode,
                'transcribe.py',
                nativeCatalog['ai.transcript'],
                buildAiTranscriptPayload,
                config,
            ),
        },
        'ai.scene-detect': {
            ...selectScriptPairedBackend(
                'ai.scene-detect',
                backendMode,
                'scene_detect.py',
                nativeCatalog['ai.scene-detect'],
                buildAiSceneDetectPayload,
                config,
            ),
        },
        'clips.materialize': {
            ...selectPairedBackend(
                'clips.materialize',
                backendMode,
                mediaMaterialize,
                nativeCatalog['clips.materialize'],
                buildClipMaterializePayload,
                config,
                validateOkResponse,
            ),
        },
        'analytics.audio-features': {
            ...selectScriptPairedBackend(
                'analytics.audio-features',
                backendMode,
                'extract_audio_features.py',
                nativeCatalog['analytics.audio-features'],
                buildAnalyticsAudioPayload,
                config,
            ),
        },
        'analytics.motion-detect': {
            ...selectScriptPairedBackend(
                'analytics.motion-detect',
                backendMode,
                'detect_motion.py',
                nativeCatalog['analytics.motion-detect'],
                buildAnalyticsMotionPayload,
                config,
            ),
        },
        'lifecycle.reconcile': {
            ...selectPairedBackend(
                'lifecycle.reconcile',
                backendMode,
                mediaLifecycle,
                nativeCatalog['lifecycle.reconcile'],
                buildLifecycleReconcilePayload,
                config,
                validateOkResponse,
            ),
        },
        'search.reindex': {
            ...selectPairedBackend(
                'search.reindex',
                backendMode,
                contentSearch,
                nativeCatalog['search.reindex'],
                buildSearchReindexPayload,
                config,
                validateQueuedResponse,
            ),
        },
        'billing.reconcile': {
            ...selectPairedBackend(
                'billing.reconcile',
                backendMode,
                billingReconcile,
                nativeCatalog['billing.reconcile'],
                buildBillingReconcilePayload,
                config,
                validateBillingResponse,
            ),
        },
        'migration.bundle-verify': {
            ...selectNativeOnlyBackend(
                'migration.bundle-verify',
                nativeCatalog['migration.bundle-verify'],
                buildMigrationBundlePayload,
            ),
        },
        'notifications.broadcast': {
            ...selectPairedBackend(
                'notifications.broadcast',
                backendMode,
                networkBroadcast,
                nativeCatalog['notifications.broadcast'],
                (data) => buildNotificationBroadcastPayload(data, config.serviceId || 'openvibe-workers'),
                config,
                validateQueuedResponse,
            ),
        },
    };
}

function describeProcessorCatalog(config) {
    const catalog = createProcessorCatalog(config);
    return Object.fromEntries(Object.entries(catalog).map(([name, definition]) => [name, {
        name,
        dependency: Object.assign({}, definition.dependency),
        available: !!(definition.dependency && definition.dependency.available),
        backend: definition.backend || null,
        configured_backend_mode: definition.configured_backend_mode || null,
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