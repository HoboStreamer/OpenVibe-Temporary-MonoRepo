'use strict';

function trimUrl(value) {
    return String(value || '').trim().replace(/\/$/, '');
}

function buildInternalHeaders(config, extraHeaders) {
    return Object.assign({
        'x-internal-key': config.internalKey,
        'x-openvibe-service': config.serviceId || 'openvibe-workers',
    }, extraHeaders || {});
}

function dependencyFromHttp(service, baseUrl, endpointPath, options) {
    const url = trimUrl(baseUrl);
    const opts = options || {};
    return {
        type: 'http',
        service,
        method: String(opts.method || 'POST').toUpperCase(),
        endpoint_path: endpointPath,
        expects: opts.expects || null,
        url: url ? `${url}${endpointPath}` : null,
        configured: !!url,
        status: url ? 'configured' : 'missing-config',
        message: url ? null : `${service} URL is not configured`,
        available: !!url,
    };
}

async function readResponseBody(response) {
    const raw = await response.text();
    if (!raw) {
        return { body: {}, raw: '' };
    }
    try {
        return { body: JSON.parse(raw), raw };
    } catch {
        return { body: raw, raw };
    }
}

async function postProcessorJson(definition, payload, config, options) {
    const opts = options || {};
    const dependency = definition && definition.dependency ? Object.assign({}, definition.dependency) : null;
    const request = {
        service: dependency && dependency.service || null,
        method: dependency && dependency.method || 'POST',
        endpoint_path: dependency && dependency.endpoint_path || null,
        url: dependency && dependency.url || null,
        payload_keys: payload && typeof payload === 'object' && !Array.isArray(payload)
            ? Object.keys(payload).sort()
            : [],
        timeout_ms: Number(opts.timeoutMs || config.requestTimeoutMs || 0),
        duration_ms: null,
    };

    if (typeof fetch !== 'function') {
        return {
            ok: false,
            skipped: true,
            reason: 'global fetch unavailable',
            dependency,
            request,
        };
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    const startedAt = Date.now();

    try {
        if (controller && request.timeout_ms > 0) {
            timer = setTimeout(() => controller.abort(), request.timeout_ms);
            if (typeof timer.unref === 'function') timer.unref();
        }

        const response = await fetch(request.url, {
            method: request.method,
            headers: Object.assign({
                'accept': 'application/json',
                'content-type': 'application/json',
            }, buildInternalHeaders(config, opts.headers)),
            body: JSON.stringify(payload || {}),
            signal: controller ? controller.signal : undefined,
        });
        const parsed = await readResponseBody(response);
        request.duration_ms = Date.now() - startedAt;

        if (!response.ok) {
            return {
                ok: false,
                status: response.status,
                error: parsed.body && typeof parsed.body === 'object' && parsed.body.error || `http_${response.status}`,
                body: parsed.body,
                raw_body: parsed.raw,
                dependency,
                request,
            };
        }

        if (!parsed.body || typeof parsed.body !== 'object' || Array.isArray(parsed.body)) {
            return {
                ok: false,
                status: response.status,
                error: 'invalid_response',
                reason: `expected JSON object but received ${Array.isArray(parsed.body) ? 'array' : typeof parsed.body}`,
                body: parsed.body,
                raw_body: parsed.raw,
                dependency,
                request,
            };
        }

        const validationError = typeof opts.validate === 'function' ? opts.validate(parsed.body) : null;
        if (validationError) {
            return {
                ok: false,
                status: response.status,
                error: 'invalid_response',
                reason: validationError,
                body: parsed.body,
                dependency,
                request,
            };
        }

        return Object.assign({}, parsed.body, {
            dependency,
            request,
        });
    } catch (error) {
        request.duration_ms = Date.now() - startedAt;
        const timedOut = error && error.name === 'AbortError';
        return {
            ok: false,
            status: 0,
            error: timedOut ? 'timeout' : error && error.message || 'request_failed',
            reason: timedOut ? `request timed out after ${request.timeout_ms}ms` : error && error.message || 'request failed',
            dependency,
            request,
        };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

module.exports = {
    buildInternalHeaders,
    dependencyFromHttp,
    postProcessorJson,
    trimUrl,
};