'use strict';

const assert = require('assert');

const registry = require('../server/registry');

const jobs = registry.listJobs();
const jobNames = new Set(jobs.map((job) => job.name));
const queueNames = new Set(jobs.map((job) => job.queue));

for (const name of [
    'media.thumbnail',
    'media.metadata',
    'ai.transcript',
    'ai.scene-detect',
    'clips.materialize',
    'analytics.audio-features',
    'lifecycle.reconcile',
    'search.reindex',
    'billing.reconcile',
    'migration.bundle-verify',
    'notifications.broadcast',
]) {
    assert.ok(jobNames.has(name), `expected worker registry entry for ${name}`);
}

for (const queue of ['media-processing', 'ai-analysis', 'clips', 'analytics', 'lifecycle', 'search', 'billing', 'migration', 'notifications']) {
    assert.ok(queueNames.has(queue), `expected queue ${queue}`);
}

console.log('openvibe-workers registry test OK');
