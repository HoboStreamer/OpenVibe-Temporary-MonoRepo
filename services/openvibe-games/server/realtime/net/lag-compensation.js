'use strict';

const MAX_REWIND_MS = 225;

function pushHistory(buffer, entry, options = {}) {
    const list = Array.isArray(buffer) ? buffer : [];
    const maxEntries = Math.max(4, Number(options.maxEntries) || 24);
    list.push(entry);
    while (list.length > maxEntries) list.shift();
    return list;
}

function rewindPosition(history, targetTimestampMs, currentFallback) {
    if (!Array.isArray(history) || history.length === 0) return currentFallback;
    const target = Math.max(0, Number(targetTimestampMs) || 0);
    let best = history[history.length - 1];
    let bestDelta = Math.abs((best.at || 0) - target);
    for (const entry of history) {
        const delta = Math.abs((entry.at || 0) - target);
        if (delta < bestDelta) {
            best = entry;
            bestDelta = delta;
        }
    }
    return best || currentFallback;
}

function resolveRewind(nowMs, sentAtMs) {
    if (!Number.isFinite(sentAtMs)) return 0;
    return Math.max(0, Math.min(MAX_REWIND_MS, nowMs - sentAtMs));
}

module.exports = { MAX_REWIND_MS, pushHistory, rewindPosition, resolveRewind };
