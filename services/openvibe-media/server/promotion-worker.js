'use strict';

const accessRollupModel = require('./access-rollup-model');
const lifecyclePolicy = require('./lifecycle-policy');
const model = require('./model');
const partModel = require('./part-model');

async function reconcileSingleMedia(storage, mediaId, options) {
    return lifecyclePolicy.reconcileMediaStorage(storage, mediaId, options || {});
}

async function reconcileHotTierSweep(storage, options) {
    const source = options || {};
    const limit = Math.min(Math.max(Number(source.limit) || 100, 1), 500);
    const items = model.list({ limit });
    const results = [];
    for (const media of items) {
        results.push(await lifecyclePolicy.reconcileMediaStorage(storage, media, source));
    }
    return {
        ok: true,
        media_count: items.length,
        results,
    };
}

function listPartHotTierCandidates(storage, mediaId, recordingId) {
    const parts = partModel.listPartsByRecordingId(recordingId);
    const rollups = accessRollupModel.listPartAccessRollupsByMediaId(mediaId);
    return lifecyclePolicy.evaluatePartHotCandidates(storage, mediaId, parts, rollups);
}

module.exports = {
    listPartHotTierCandidates,
    reconcileHotTierSweep,
    reconcileSingleMedia,
};
