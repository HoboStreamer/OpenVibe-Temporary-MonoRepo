'use strict';

async function queueSearchReindex(deps, body) {
    const {
        contentStore,
        requestedByService,
        requestedAt,
    } = deps;
    const input = body || {};
    const serviceId = requestedByService || 'openvibe-content';
    const job = await contentStore.queueJob({
        job_type: String(input.job_type || 'search.reindex'),
        surface: input.surface ? String(input.surface) : null,
        source_id: input.source_id ? String(input.source_id) : null,
        item_id: input.item_id ? String(input.item_id) : null,
        state: String(input.state || 'queued'),
        scheduled_at: input.scheduled_at ? String(input.scheduled_at) : null,
        payload: Object.assign({}, input.payload || {}, {
            reason: input.reason || 'worker.search.reindex',
            requested_by_service: serviceId,
            requested_at: requestedAt || new Date().toISOString(),
        }),
    });

    return {
        ok: true,
        queued: true,
        requested_by_service: serviceId,
        job,
        counts: await contentStore.getCounts(),
    };
}

module.exports = {
    queueSearchReindex,
};
