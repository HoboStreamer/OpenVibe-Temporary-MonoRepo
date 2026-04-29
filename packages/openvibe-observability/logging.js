'use strict';

const LEVEL_WEIGHT = Object.freeze({
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
});

function resolveLevel(level) {
    const normalized = String(level || process.env.LOG_LEVEL || 'info').trim().toLowerCase();
    return LEVEL_WEIGHT[normalized] || LEVEL_WEIGHT.info;
}

function normalizeFields(fields) {
    if (!fields || typeof fields !== 'object') return {};
    const normalized = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value instanceof Error) {
            normalized[key] = {
                name: value.name,
                message: value.message,
                stack: value.stack,
            };
            continue;
        }
        normalized[key] = value;
    }
    return normalized;
}

function createLogger(serviceName, options) {
    const service = String(serviceName || 'openvibe-service');
    const minimumLevel = resolveLevel(options && options.level);

    function write(level, message, fields) {
        if ((LEVEL_WEIGHT[level] || LEVEL_WEIGHT.info) < minimumLevel) return;
        const payload = Object.assign({
            timestamp: new Date().toISOString(),
            level,
            service,
            message: String(message || level),
        }, normalizeFields(fields));

        const line = JSON.stringify(payload);
        if (level === 'error') console.error(line);
        else if (level === 'warn') console.warn(line);
        else console.log(line);
    }

    function child(extraFields) {
        const extra = normalizeFields(extraFields);
        return {
            debug(message, fields) { write('debug', message, Object.assign({}, extra, fields || {})); },
            info(message, fields) { write('info', message, Object.assign({}, extra, fields || {})); },
            warn(message, fields) { write('warn', message, Object.assign({}, extra, fields || {})); },
            error(message, fields) { write('error', message, Object.assign({}, extra, fields || {})); },
            child(more) { return child(Object.assign({}, extra, more || {})); },
        };
    }

    return child();
}

function createRequestLoggerMiddleware(options) {
    const logger = options && options.logger ? options.logger : createLogger(options && options.serviceName);
    const skipPaths = new Set((options && options.skipPaths) || ['/health', '/ready', '/metrics']);

    return function requestLoggerMiddleware(req, res, next) {
        const started = process.hrtime.bigint();
        res.on('finish', () => {
            const target = String(req.originalUrl || req.url || '');
            for (const skip of skipPaths) {
                if (target.startsWith(skip)) return;
            }

            const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
            const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
            logger[level]('http_request', {
                request_id: req.requestId || null,
                method: req.method,
                path: target,
                status_code: res.statusCode,
                duration_ms: Number(durationMs.toFixed(2)),
                real_ip: req.realIp || null,
            });
        });
        next();
    };
}

module.exports = {
    createLogger,
    createRequestLoggerMiddleware,
};
