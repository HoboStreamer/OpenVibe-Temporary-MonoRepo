'use strict';

const assert = require('assert');

const {
    buildDeadLetterStreamKey,
    buildJobId,
    buildStreamKey,
    createQueueBundle,
    getQueueStats,
    summarizeWorkerRegistry,
} = require('..');

(function queueBundleDisablesWithoutRedis() {
    const bundle = createQueueBundle({ queueName: 'media-processing' });
    assert.strictEqual(bundle.enabled, false);
})();

(async function queueStatsStaySafeWithoutRedis() {
    const bundle = createQueueBundle({ queueName: 'media-processing' });
    const stats = await getQueueStats(bundle);
    assert.deepStrictEqual(stats, {
        enabled: false,
        queue_name: 'media-processing',
        waiting: 0,
        active: 0,
        delayed: 0,
        completed: 0,
        failed: 0,
    });
})();

(function queueHelpersBuildDeterministicNames() {
    assert.strictEqual(buildStreamKey('media', 'events'), 'ov:stream:media:events');
    assert.strictEqual(buildDeadLetterStreamKey('ov:stream:media:events'), 'ov:stream:media:events:dlq');
    assert.strictEqual(buildJobId('media-processing', 'media.thumbnail', 'abc123'), 'media-processing:media.thumbnail:abc123');
})();

(function workerSummaryCountsJobsAndQueues() {
    const summary = summarizeWorkerRegistry([
        { queue: 'media-processing', name: 'media.thumbnail' },
        { queue: 'ai-analysis', name: 'ai.transcript' },
    ]);
    assert.strictEqual(summary.queue_count, 2);
    assert.strictEqual(summary.job_count, 2);
    assert.deepStrictEqual(summary.queue_names, ['ai-analysis', 'media-processing']);
})();

console.log('openvibe-queue: OK');
