'use strict';

const crypto = require('crypto');

const RATE_LIMIT_WINDOWS = new Map();

function getRealIp(req) {
    const forwardedFor = req && req.headers && (req.headers['cf-connecting-ip']
        || req.headers['x-real-ip']
        || req.headers['x-forwarded-for']);
    return forwardedFor
        ? String(forwardedFor).split(',')[0].trim()
        : (req && (req.ip || (req.socket && req.socket.remoteAddress)) || null);
}

function requestIdMiddleware(options) {
    const serviceName = String(options && options.serviceName || 'openvibe-service');

    return function requestId(req, res, next) {
        req.requestId = req && req.headers && req.headers['x-request-id']
            ? String(req.headers['x-request-id'])
            : crypto.randomUUID();
        req.startedAt = Date.now();
        req.serviceName = serviceName;
        if (typeof res.setHeader === 'function') {
            res.setHeader('x-request-id', req.requestId);
        }
        next();
    };
}

function realIpMiddleware() {
    return function realIp(req, _res, next) {
        req.realIp = getRealIp(req);
        next();
    };
}

function createRequestContextMiddleware(options) {
    const assignRequestId = requestIdMiddleware(options);
    const assignRealIp = realIpMiddleware(options);

    return function requestContextMiddleware(req, res, next) {
        assignRequestId(req, res, () => assignRealIp(req, res, next));
    };
}

function asyncRoute(handler) {
    if (typeof handler !== 'function') throw new Error('asyncRoute requires a handler function');
    return function wrappedAsyncRoute(req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function cacheControl(valueOrResolver, options) {
    const opts = options || {};
    return function cacheControlMiddleware(req, res, next) {
        const value = typeof valueOrResolver === 'function'
            ? valueOrResolver(req, res)
            : valueOrResolver;
        if (value) res.setHeader('Cache-Control', value);
        if (opts.surrogateControl) res.setHeader('Surrogate-Control', opts.surrogateControl);
        if (opts.vary) res.setHeader('Vary', opts.vary);
        next();
    };
}

function defaultRateLimitKey(req) {
    return req && (req.realIp || req.ip || 'anonymous') || 'anonymous';
}

function rateLimit(options) {
    const opts = options || {};
    const windowMs = Math.max(1000, Number(opts.windowMs || 60000));
    const limit = Math.max(1, Number(opts.limit || 60));
    const keyFn = typeof opts.keyFn === 'function' ? opts.keyFn : defaultRateLimitKey;
    const scope = String(opts.scope || 'default');

    return function rateLimitMiddleware(req, res, next) {
        const key = `${scope}:${keyFn(req)}`;
        const now = Date.now();
        const entry = RATE_LIMIT_WINDOWS.get(key);
        if (!entry || now >= entry.resetAt) {
            RATE_LIMIT_WINDOWS.set(key, { count: 1, resetAt: now + windowMs });
            res.setHeader('x-ratelimit-limit', String(limit));
            res.setHeader('x-ratelimit-remaining', String(Math.max(limit - 1, 0)));
            res.setHeader('x-ratelimit-reset-ms', String(windowMs));
            return next();
        }

        entry.count += 1;
        RATE_LIMIT_WINDOWS.set(key, entry);
        const remaining = Math.max(limit - entry.count, 0);
        res.setHeader('x-ratelimit-limit', String(limit));
        res.setHeader('x-ratelimit-remaining', String(remaining));
        res.setHeader('x-ratelimit-reset-ms', String(Math.max(entry.resetAt - now, 0)));

        if (entry.count > limit) {
            return res.status(429).json({
                error: opts.message || 'rate limit exceeded',
                key,
                scope,
            });
        }
        return next();
    };
}

function errorHandler(options) {
    const opts = options || {};
    const logger = opts.logger || console;
    return function openvibeErrorHandler(err, req, res, _next) {
        const status = Number(err && err.status || 500);
        const payload = {
            error: status >= 500 ? (opts.internalMessage || 'internal error') : (err && err.message) || 'request failed',
            code: err && err.code || null,
            request_id: req && req.requestId || null,
        };
        const fields = {
            request_id: req && req.requestId || null,
            method: req && req.method || null,
            path: req && (req.originalUrl || req.url) || null,
            real_ip: req && req.realIp || null,
            error: err,
        };
        if (status >= 500 && typeof logger.error === 'function') logger.error('request_failed', fields);
        else if (typeof logger.warn === 'function') logger.warn('request_failed', fields);
        res.status(status).json(payload);
    };
}

function setMetricLabel(req, label) {
    if (req) req.openvibeMetricLabel = label;
}

module.exports = {
    asyncRoute,
    cacheControl,
    createRequestContextMiddleware,
    errorHandler,
    getRealIp,
    rateLimit,
    realIpMiddleware,
    requestIdMiddleware,
    setMetricLabel,
};
