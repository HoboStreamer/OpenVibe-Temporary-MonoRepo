'use strict';

function computeInterpolationPeriod(settings = {}) {
    const updaterate = Math.max(1, Number(settings.cl_updaterate) || 20);
    const explicit = Number(settings.cl_interp);
    const ratio = Math.max(1, Number(settings.cl_interp_ratio) || 2);
    return Math.max(Number.isFinite(explicit) ? explicit : 0, ratio / updaterate);
}

module.exports = {
    computeInterpolationPeriod,
};
