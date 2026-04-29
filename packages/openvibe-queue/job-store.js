'use strict';

function normalizeJobName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '.')
        .replace(/^\.+|\.+$/g, '');
}

function buildJobId(queueName, jobName, objectId) {
    return [queueName, normalizeJobName(jobName), String(objectId || 'item')].join(':');
}

module.exports = {
    buildJobId,
    normalizeJobName,
};
