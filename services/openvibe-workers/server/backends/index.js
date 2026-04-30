'use strict';

const { reconcileWalletSnapshots } = require('../../../openvibe-billing/server/reconciler');
const { queueSearchReindex } = require('../../../openvibe-content/server/search-indexer');
const { materializeClipProject } = require('../../../openvibe-media/server/clip-materializer');
const { reconcileLifecycle } = require('../../../openvibe-media/server/lifecycle-reconciler');
const { broadcastInternalNotification } = require('../../../openvibe-network/server/notifications/broadcast');
const runtimeBootstrap = require('./runtime-bootstrap');
const {
    ensureBillingRuntime,
    ensureContentRuntime,
    ensureMediaRuntime,
    ensureNetworkRuntime,
} = runtimeBootstrap;
const nativeAnalytics = require('./native-analytics');
const nativeAi = require('./native-ai');
const migrationBundleVerifier = require('./migration-bundle-verifier');

function dependencyFromNative(service, backend) {
    return {
        type: 'native-backend',
        service,
        backend,
        configured: true,
        status: 'configured',
        message: null,
        available: true,
        mode: 'direct-module',
    };
}

function dependencyFromArtifact(bundleDir) {
    return migrationBundleVerifier.describeDependency(bundleDir);
}

function createServiceActor(config) {
    return {
        id: config.serviceId || 'openvibe-workers',
        role: 'service',
    };
}

function createNativeBackendCatalog(config) {
    const serviceActor = createServiceActor(config);
    const workerActor = {
        actor_type: 'service',
        actor_id: serviceActor.id,
    };
    const bundleDefaults = {
        bundleDir: config.migrationBundleDir,
        cutoverReportPath: config.migrationCutoverReportPath,
    };

    return {
        'media.thumbnail': {
            dependency: dependencyFromNative('openvibe-media', 'processing-runner'),
            async run(body) {
                const data = body || {};
                const mediaId = data.media_id || data.mediaId;
                if (!mediaId) return { ok: false, status: 400, error: 'media_id required' };
                const mediaRuntime = await ensureMediaRuntime();
                const kind = String(data.kind || 'video_thumbnail');
                const result = await mediaRuntime.processing.runTrackedJob({
                    local_job_id: data.local_job_id || data.localJobId || null,
                    media_id: String(mediaId),
                    kind,
                    payload: data.payload || {},
                }, {
                    storage: mediaRuntime.storage,
                    publishMediaEvent: mediaRuntime.eventBus.publishMediaEvent,
                });
                return {
                    ok: true,
                    backend: 'native-media-thumbnail',
                    result,
                    media: mediaRuntime.model.getById(String(mediaId)),
                    requested_by_service: serviceActor.id,
                };
            },
        },
        'media.metadata': {
            dependency: dependencyFromNative('openvibe-media', 'processing-runner'),
            async run(body) {
                const data = body || {};
                const mediaId = data.media_id || data.mediaId;
                if (!mediaId) return { ok: false, status: 400, error: 'media_id required' };
                const mediaRuntime = await ensureMediaRuntime();
                const kind = String(data.kind || 'vod_metadata');
                const result = await mediaRuntime.processing.runTrackedJob({
                    local_job_id: data.local_job_id || data.localJobId || null,
                    media_id: String(mediaId),
                    kind,
                    payload: data.payload || {},
                }, {
                    storage: mediaRuntime.storage,
                    publishMediaEvent: mediaRuntime.eventBus.publishMediaEvent,
                });
                return {
                    ok: true,
                    backend: 'native-media-metadata',
                    result,
                    media: mediaRuntime.model.getById(String(mediaId)),
                    requested_by_service: serviceActor.id,
                };
            },
        },
        'ai.transcript': {
            dependency: nativeAi.describeAiDependency('native-ai-transcript'),
            async run(body) {
                return nativeAi.runTranscript(body || {}, runtimeBootstrap, serviceActor);
            },
        },
        'ai.scene-detect': {
            dependency: nativeAi.describeAiDependency('native-ai-scene-detect'),
            async run(body) {
                return nativeAi.runSceneDetect(body || {}, runtimeBootstrap, serviceActor);
            },
        },
        'analytics.audio-features': {
            dependency: nativeAnalytics.describeAnalyticsDependency('native-analytics-audio-features'),
            async run(body) {
                return nativeAnalytics.runAudioFeatures(body || {}, runtimeBootstrap, serviceActor);
            },
        },
        'analytics.motion-detect': {
            dependency: nativeAnalytics.describeAnalyticsDependency('native-analytics-motion-detect'),
            async run(body) {
                return nativeAnalytics.runMotionDetect(body || {}, runtimeBootstrap, serviceActor);
            },
        },
        'migration.bundle-verify': {
            dependency: dependencyFromArtifact(config.migrationBundleDir),
            async run(body) {
                return migrationBundleVerifier.verifyMigrationBundle(bundleDefaults, body || {});
            },
        },
        'clips.materialize': {
            dependency: dependencyFromNative('openvibe-media', 'clip-materializer'),
            async run(body) {
                const mediaRuntime = await ensureMediaRuntime();
                const clipId = body && body.clip_id ? String(body.clip_id) : '';
                if (!clipId) {
                    return { ok: false, status: 400, error: 'clip_id required' };
                }
                const clip = mediaRuntime.clipModel.getClipById(clipId);
                if (!clip) {
                    return { ok: false, status: 404, error: 'clip not found' };
                }
                return materializeClipProject({
                    clipModel: mediaRuntime.clipModel,
                    model: mediaRuntime.model,
                    storageModel: mediaRuntime.storageModel,
                    buildPlaybackPayload: mediaRuntime.buildPlaybackPayload,
                    storage: mediaRuntime.storage,
                    eventBus: mediaRuntime.eventBus,
                    mediaEventTypes: mediaRuntime.mediaEventTypes,
                }, clip, workerActor, String(body.mode || 'worker-materialize'));
            },
        },
        'lifecycle.reconcile': {
            dependency: dependencyFromNative('openvibe-media', 'lifecycle-reconciler'),
            async run(body) {
                const mediaRuntime = await ensureMediaRuntime();
                return Object.assign({ requested_by_service: serviceActor.id }, reconcileLifecycle({
                    database: mediaRuntime.db.get(),
                    quotas: mediaRuntime.quotas,
                    processing: mediaRuntime.processing,
                    storageModel: mediaRuntime.storageModel,
                }, body || {}));
            },
        },
        'search.reindex': {
            dependency: dependencyFromNative('openvibe-content', 'search-indexer'),
            async run(body) {
                const contentRuntime = await ensureContentRuntime();
                return queueSearchReindex({
                    contentStore: contentRuntime.contentStore,
                    requestedByService: serviceActor.id,
                }, body || {});
            },
        },
        'billing.reconcile': {
            dependency: dependencyFromNative('openvibe-billing', 'wallet-reconciler'),
            async run(body) {
                const billingRuntime = await ensureBillingRuntime();
                return reconcileWalletSnapshots({
                    model: billingRuntime.model,
                    requestedByService: serviceActor.id,
                }, body || {});
            },
        },
        'notifications.broadcast': {
            dependency: dependencyFromNative('openvibe-network', 'notifications-broadcast'),
            async run(body) {
                const networkRuntime = await ensureNetworkRuntime();
                return broadcastInternalNotification({
                    recordAudit: networkRuntime.staff.recordAudit,
                }, body || {}, serviceActor);
            },
        },
    };
}

module.exports = {
    createNativeBackendCatalog,
    dependencyFromNative,
};
