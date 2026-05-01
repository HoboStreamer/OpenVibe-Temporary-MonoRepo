'use strict';

const DEFAULT_RATE_LIMITS = Object.freeze({
    rate: 30000,
    cl_cmdrate: 30,
    cl_updaterate: 20,
    cl_interp: 0.1,
    cl_interp_ratio: 2,
    sv_tickrate: 30,
    sv_snapshotrate: 20,
    sv_maxunlag: 1,
});

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function clampRateSettings(overrides = {}) {
    return {
        rate: clamp(Number(overrides.rate) || DEFAULT_RATE_LIMITS.rate, 1000, 1000000),
        cl_cmdrate: clamp(Number(overrides.cl_cmdrate) || DEFAULT_RATE_LIMITS.cl_cmdrate, 1, 128),
        cl_updaterate: clamp(Number(overrides.cl_updaterate) || DEFAULT_RATE_LIMITS.cl_updaterate, 1, 128),
        cl_interp: clamp(Number(overrides.cl_interp) || DEFAULT_RATE_LIMITS.cl_interp, 0, 1),
        cl_interp_ratio: clamp(Number(overrides.cl_interp_ratio) || DEFAULT_RATE_LIMITS.cl_interp_ratio, 1, 8),
        sv_tickrate: clamp(Number(overrides.sv_tickrate) || DEFAULT_RATE_LIMITS.sv_tickrate, 20, 60),
        sv_snapshotrate: clamp(Number(overrides.sv_snapshotrate) || DEFAULT_RATE_LIMITS.sv_snapshotrate, 1, 60),
        sv_maxunlag: clamp(Number(overrides.sv_maxunlag) || DEFAULT_RATE_LIMITS.sv_maxunlag, 0, 1),
    };
}

module.exports = {
    DEFAULT_RATE_LIMITS,
    clampRateSettings,
};
