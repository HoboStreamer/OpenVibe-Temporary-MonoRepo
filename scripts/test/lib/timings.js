'use strict';

const fs = require('fs');
const path = require('path');

const { ensureDir } = require('./reporter');

const DEFAULT_TIMINGS_FILE = path.join('.cache', 'openvibe', 'test-runner', 'timings.json');

function loadTimingCache(root, filePath = DEFAULT_TIMINGS_FILE) {
    const resolvedPath = path.resolve(root, filePath);
    try {
        return {
            filePath: resolvedPath,
            entries: JSON.parse(fs.readFileSync(resolvedPath, 'utf8')),
        };
    } catch {
        return {
            filePath: resolvedPath,
            entries: {},
        };
    }
}

function getHistoricalDurationMs(cache, relativePath) {
    if (!cache || !cache.entries) return 0;
    const record = cache.entries[relativePath];
    return record && Number.isFinite(record.durationMs) ? record.durationMs : 0;
}

function sortTestsByHistoricalDuration(tests, cache) {
    return tests.slice().sort((left, right) => {
        const rightDuration = getHistoricalDurationMs(cache, right.relativePath);
        const leftDuration = getHistoricalDurationMs(cache, left.relativePath);
        if (rightDuration !== leftDuration) return rightDuration - leftDuration;
        return left.relativePath.localeCompare(right.relativePath);
    });
}

function updateTimingCache(cache, results) {
    if (!cache) return cache;
    const now = new Date().toISOString();
    for (const result of results) {
        cache.entries[result.rel] = {
            durationMs: result.durationMs,
            lastStatus: result.code === 0 ? 'pass' : 'fail',
            updatedAt: now,
        };
    }
    return cache;
}

function writeTimingCache(cache) {
    if (!cache) return;
    ensureDir(path.dirname(cache.filePath));
    fs.writeFileSync(cache.filePath, `${JSON.stringify(cache.entries, null, 2)}\n`, 'utf8');
}

module.exports = {
    DEFAULT_TIMINGS_FILE,
    getHistoricalDurationMs,
    loadTimingCache,
    sortTestsByHistoricalDuration,
    updateTimingCache,
    writeTimingCache,
};
