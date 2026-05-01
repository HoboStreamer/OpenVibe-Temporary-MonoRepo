'use strict';

function computeCommandExecutionTime({ nowMs = Date.now(), latencyMs = 0, interpMs = 0, cmdTimestampMs = 0 }) {
    if (cmdTimestampMs) return Math.max(0, Number(cmdTimestampMs));
    return Math.max(0, Number(nowMs) - Number(latencyMs) - Number(interpMs));
}

function createLagCompensationTracker(options = {}) {
    const maxUnlagMs = Math.max(0, Math.min(1000, Number(options.maxUnlagMs) || 1000));
    const history = new Map();

    function pushSample(entityId, state, atMs = Date.now()) {
        const key = String(entityId || '');
        if (!key) throw new Error('entityId required');
        const samples = history.get(key) || [];
        samples.push({ atMs: Number(atMs), state: JSON.parse(JSON.stringify(state || {})) });
        const cutoff = Number(atMs) - maxUnlagMs;
        while (samples.length && samples[0].atMs < cutoff) samples.shift();
        history.set(key, samples);
        return samples.length;
    }

    function rewind(entityId, executionTimeMs) {
        const samples = history.get(String(entityId || '')) || [];
        if (!samples.length) return null;
        let candidate = samples[0];
        for (const sample of samples) {
            if (sample.atMs <= executionTimeMs) candidate = sample;
            else break;
        }
        return candidate ? JSON.parse(JSON.stringify(candidate.state)) : null;
    }

    function summary() {
        return {
            entities: history.size,
            maxUnlagMs,
        };
    }

    return {
        maxUnlagMs,
        pushSample,
        rewind,
        summary,
    };
}

module.exports = {
    computeCommandExecutionTime,
    createLagCompensationTracker,
};
