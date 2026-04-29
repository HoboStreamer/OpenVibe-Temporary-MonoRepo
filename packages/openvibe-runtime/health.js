'use strict';

function buildHealthPayload(options) {
    const opts = options || {};
    return Object.assign({
        ok: true,
        service: String(opts.serviceName || 'openvibe-service'),
        checked_at: new Date().toISOString(),
    }, opts.extra || {});
}

module.exports = {
    buildHealthPayload,
};
