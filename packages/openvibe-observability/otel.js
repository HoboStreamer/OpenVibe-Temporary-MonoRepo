'use strict';

function resolveTraceContext(req) {
    return {
        traceparent: req && req.headers ? req.headers.traceparent || null : null,
        tracestate: req && req.headers ? req.headers.tracestate || null : null,
        request_id: req && req.requestId ? req.requestId : null,
    };
}

function attachTraceHeaders(req, res, next) {
    if (req && req.requestId && res && typeof res.setHeader === 'function') {
        res.setHeader('x-request-id', req.requestId);
    }
    if (req && req.headers && req.headers.traceparent && res && typeof res.setHeader === 'function') {
        res.setHeader('traceparent', req.headers.traceparent);
    }
    next();
}

module.exports = {
    attachTraceHeaders,
    resolveTraceContext,
};
