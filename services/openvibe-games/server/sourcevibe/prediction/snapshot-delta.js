'use strict';

function diffSnapshots(previous = {}, next = {}) {
    const delta = {};
    const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
    for (const key of keys) {
        const before = previous ? previous[key] : undefined;
        const after = next ? next[key] : undefined;
        if (JSON.stringify(before) !== JSON.stringify(after)) delta[key] = after;
    }
    return delta;
}

module.exports = {
    diffSnapshots,
};
