'use strict';

const JOBS = Object.freeze([
    {
        name: 'media.thumbnail',
        queue: 'media-processing',
        description: 'Generate image and video thumbnails.',
        critical: true,
    },
    {
        name: 'media.metadata',
        queue: 'media-processing',
        description: 'Extract ffprobe metadata and derivative manifests.',
        critical: true,
    },
    {
        name: 'ai.transcript',
        queue: 'ai-analysis',
        description: 'Transcribe media and produce transcript segments.',
        critical: true,
    },
    {
        name: 'ai.scene-detect',
        queue: 'ai-analysis',
        description: 'Detect scene boundaries and candidate highlight windows.',
        critical: false,
    },
    {
        name: 'clips.materialize',
        queue: 'clips',
        description: 'Materialize virtual clips into playback-ready media references.',
        critical: true,
    },
    {
        name: 'analytics.audio-features',
        queue: 'analytics',
        description: 'Extract cheap local audio features for media review and ranking seams.',
        critical: false,
    },
    {
        name: 'analytics.motion-detect',
        queue: 'analytics',
        description: 'Detect simple motion windows for clip-candidate generation.',
        critical: false,
    },
    {
        name: 'lifecycle.reconcile',
        queue: 'lifecycle',
        description: 'Audit storage lifecycle state and reconcile stale media diagnostics.',
        critical: false,
    },
    {
        name: 'search.reindex',
        queue: 'search',
        description: 'Refresh search/index seams after content or metadata changes.',
        critical: false,
    },
    {
        name: 'billing.reconcile',
        queue: 'billing',
        description: 'Reconcile staged billing imports and loyalty projections.',
        critical: false,
    },
    {
        name: 'migration.bundle-verify',
        queue: 'migration',
        description: 'Re-run canonical migration bundle verification and import-hold diagnostics.',
        critical: true,
    },
    {
        name: 'notifications.broadcast',
        queue: 'notifications',
        description: 'Fan out admin broadcasts and queued notices.',
        critical: false,
    },
]);

function listJobs() {
    return JOBS.map((job) => Object.assign({}, job));
}

function listQueues() {
    return Array.from(new Set(JOBS.map((job) => job.queue))).sort();
}

function getJob(name) {
    return listJobs().find((job) => job.name === name) || null;
}

module.exports = {
    getJob,
    listJobs,
    listQueues,
};
