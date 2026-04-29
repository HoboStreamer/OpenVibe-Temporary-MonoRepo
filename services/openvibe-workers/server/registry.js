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
