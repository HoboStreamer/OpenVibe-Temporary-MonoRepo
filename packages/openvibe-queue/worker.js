'use strict';

function summarizeWorkerRegistry(items) {
    const list = Array.isArray(items) ? items : [];
    const queueNames = Array.from(new Set(list.map((item) => item.queue))).sort();
    return {
        queue_count: queueNames.length,
        job_count: list.length,
        critical_job_count: list.filter((item) => item.critical !== false).length,
        queue_names: queueNames,
        jobs: list,
    };
}

module.exports = {
    summarizeWorkerRegistry,
};
