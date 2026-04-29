#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const path = require('path');

const { ensureDir, parseArgs, writeJson } = require('../migrate-hobo/lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'migrations', 'browser-smoke-report.json');
const DEFAULT_URLS = Object.freeze({
    networkUrl: 'http://127.0.0.1:4100',
    liveUrl: 'http://127.0.0.1:4600',
    chatUrl: 'http://127.0.0.1:4800',
    communityUrl: 'http://127.0.0.1:4900',
    mediaUrl: 'http://127.0.0.1:4500',
});
const FALSEY = new Set(['0', 'false', 'no', 'off', '']);
const FORBIDDEN_LOCAL_PRODUCTION_ORIGINS = Object.freeze([
    'https://openvibe.network',
    'https://openvibe.live',
    'https://openvibe.chat',
    'https://openvibe.community',
    'https://openvibe.media',
    'https://openvibe.tools',
    'https://openre.stream',
    'https://hobo.tools',
]);

const SURFACE_CHECKS = Object.freeze([
    {
        id: 'network-shell',
        type: 'html',
        baseKey: 'networkUrl',
        host: 'openvibe.network.localhost',
        path: '/',
        marker: 'OpenVibe Network — One account. Every OpenVibe service.',
    },
    {
        id: 'tools-shell',
        type: 'html',
        baseKey: 'networkUrl',
        host: 'openvibe.tools.localhost',
        path: '/',
        marker: 'OpenVibe Tools — Search every service',
    },
    {
        id: 'admin-shell',
        type: 'html',
        baseKey: 'networkUrl',
        host: 'admin.openvibe.network.localhost',
        path: '/',
        marker: 'admin.openvibe.network — operator console',
    },
    {
        id: 'my-shell',
        type: 'html',
        baseKey: 'networkUrl',
        host: 'my.openvibe.network.localhost',
        path: '/',
        marker: 'my.openvibe.network — your account',
    },
    {
        id: 'themes-shell',
        type: 'html',
        baseKey: 'networkUrl',
        host: 'themes.openvibe.network.localhost',
        path: '/',
        marker: 'themes.openvibe.network — themes catalog',
    },
    {
        id: 'auth-oidc',
        type: 'json',
        baseKey: 'networkUrl',
        host: 'auth.openvibe.network.localhost',
        path: '/.well-known/openid-configuration',
        validate(body) {
            if (!body || typeof body !== 'object') return 'OIDC discovery did not return a JSON object';
            if (!body.issuer) return 'OIDC discovery omitted issuer';
            if (!body.jwks_uri) return 'OIDC discovery omitted jwks_uri';
            if (!body.authorization_endpoint) return 'OIDC discovery omitted authorization_endpoint';
            return null;
        },
    },
    {
        id: 'session-api',
        type: 'json',
        baseKey: 'networkUrl',
        host: 'my.openvibe.network.localhost',
        path: '/api/v1/session',
        validate(body) {
            return body && Object.prototype.hasOwnProperty.call(body, 'authenticated')
                ? null
                : 'session endpoint omitted authenticated flag';
        },
    },
    {
        id: 'live-shell',
        type: 'html',
        baseKey: 'liveUrl',
        host: 'openvibe.live.localhost',
        path: '/',
        marker: 'openvibe.live — native fallback shell',
    },
    {
        id: 'chat-shell',
        type: 'html',
        baseKey: 'chatUrl',
        host: 'openvibe.chat.localhost',
        path: '/',
        marker: 'OpenVibe Chat',
    },
    {
        id: 'community-shell',
        type: 'html',
        baseKey: 'communityUrl',
        host: 'openvibe.community.localhost',
        path: '/',
        marker: 'OpenVibe Community',
    },
    {
        id: 'media-shell',
        type: 'html',
        baseKey: 'mediaUrl',
        host: 'openvibe.media.localhost',
        path: '/',
        marker: 'OpenVibe Media',
    },
]);

function readFlag(value, fallbackValue) {
    if (value == null) return fallbackValue;
    if (typeof value === 'boolean') return value;
    return !FALSEY.has(String(value).trim().toLowerCase());
}

function splitSelection(value) {
    if (!value) return null;
    const parts = String(value)
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    return parts.length ? new Set(parts) : null;
}

function isLocalUrl(rawUrl) {
    try {
        const hostname = new URL(rawUrl).hostname.toLowerCase();
        return hostname === '127.0.0.1' || hostname === 'localhost' || hostname.endsWith('.localhost');
    } catch {
        return false;
    }
}

function requestUrl(targetUrl, options = {}) {
    const maxRedirects = options.maxRedirects == null ? 4 : options.maxRedirects;

    return new Promise((resolve) => {
        const startedAt = Date.now();

        function run(urlString, redirectsRemaining) {
            const parsed = new URL(urlString);
            const transport = parsed.protocol === 'https:' ? https : http;
            const req = transport.request({
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                port: parsed.port,
                path: `${parsed.pathname}${parsed.search}`,
                method: 'GET',
                headers: options.headers || {},
            }, (res) => {
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsRemaining > 0) {
                        const redirected = new URL(res.headers.location, urlString).toString();
                        return run(redirected, redirectsRemaining - 1);
                    }
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        headers: res.headers,
                        body,
                        finalUrl: urlString,
                        durationMs: Date.now() - startedAt,
                    });
                });
            });
            req.on('error', (error) => {
                resolve({
                    ok: false,
                    status: 0,
                    headers: {},
                    body: '',
                    finalUrl: urlString,
                    durationMs: Date.now() - startedAt,
                    error: error.message,
                });
            });
            req.end();
        }

        run(targetUrl, maxRedirects);
    });
}

function resolveCheckTarget(check, options) {
    const baseUrl = options[check.baseKey];
    const target = new URL(check.path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    return target.toString();
}

function evaluateHtmlCheck(check, response, options) {
    if (!response.ok) {
        return { status: 'red', detail: response.error || `HTTP ${response.status}` };
    }
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('text/html')) {
        return { status: 'red', detail: `expected text/html but received ${contentType || 'unknown content-type'}` };
    }
    if (!response.body.includes(check.marker)) {
        return { status: 'red', detail: `expected marker not found: ${check.marker}` };
    }

    if (options.expectLocalhost) {
        const forbiddenOrigins = FORBIDDEN_LOCAL_PRODUCTION_ORIGINS.filter((origin) => response.body.includes(origin));
        if (forbiddenOrigins.length) {
            return { status: 'red', detail: `HTML leaked production origins: ${forbiddenOrigins.join(', ')}`, forbiddenOrigins };
        }
    }

    return { status: 'green', detail: `HTML responded with expected marker: ${check.marker}` };
}

function evaluateJsonCheck(check, response) {
    if (!response.ok) {
        return { status: 'red', detail: response.error || `HTTP ${response.status}` };
    }
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
        return { status: 'red', detail: `expected application/json but received ${contentType || 'unknown content-type'}` };
    }
    let body = null;
    try {
        body = JSON.parse(response.body || '{}');
    } catch (error) {
        return { status: 'red', detail: `invalid JSON response: ${error.message}` };
    }
    const validationError = typeof check.validate === 'function' ? check.validate(body) : null;
    return validationError
        ? { status: 'red', detail: validationError }
        : { status: 'green', detail: 'JSON endpoint responded with the expected shape', parsedBody: body };
}

async function runBrowserSmoke(options = {}) {
    const resolved = Object.assign({}, DEFAULT_URLS, options);
    if (resolved.expectLocalhost == null) {
        resolved.expectLocalhost = Object.keys(DEFAULT_URLS).some((key) => isLocalUrl(resolved[key]));
    }

    const selected = splitSelection(resolved.only);
    const checks = [];

    for (const check of SURFACE_CHECKS) {
        if (selected && !selected.has(check.id)) {
            continue;
        }

        const url = resolveCheckTarget(check, resolved);
        const headers = {
            Host: check.host,
            Accept: check.type === 'json' ? 'application/json' : 'text/html',
        };
        const response = await requestUrl(url, { headers });
        const evaluation = check.type === 'json'
            ? evaluateJsonCheck(check, response)
            : evaluateHtmlCheck(check, response, resolved);

        checks.push({
            id: check.id,
            host: check.host,
            url,
            status: evaluation.status,
            detail: evaluation.detail,
            http_status: response.status,
            duration_ms: response.durationMs,
            forbidden_origins: evaluation.forbiddenOrigins || [],
        });
    }

    const summary = checks.reduce((acc, entry) => {
        acc[entry.status] = (acc[entry.status] || 0) + 1;
        return acc;
    }, { green: 0, yellow: 0, red: 0 });
    const gate = summary.red > 0 ? 'red' : (summary.yellow > 0 ? 'yellow' : 'green');

    const report = {
        generated_at: new Date().toISOString(),
        gate,
        summary,
        options: {
            network_url: resolved.networkUrl,
            live_url: resolved.liveUrl,
            chat_url: resolved.chatUrl,
            community_url: resolved.communityUrl,
            media_url: resolved.mediaUrl,
            expect_localhost: !!resolved.expectLocalhost,
            only: selected ? Array.from(selected) : [],
        },
        checks,
    };

    if (resolved.outFile) {
        ensureDir(path.dirname(resolved.outFile));
        writeJson(resolved.outFile, report);
    }

    return report;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await runBrowserSmoke({
        networkUrl: args.networkUrl || DEFAULT_URLS.networkUrl,
        liveUrl: args.liveUrl || DEFAULT_URLS.liveUrl,
        chatUrl: args.chatUrl || DEFAULT_URLS.chatUrl,
        communityUrl: args.communityUrl || DEFAULT_URLS.communityUrl,
        mediaUrl: args.mediaUrl || DEFAULT_URLS.mediaUrl,
        expectLocalhost: readFlag(args.expectLocalhost, undefined),
        only: args.only || null,
        outFile: path.resolve(args.out || DEFAULT_OUT),
    });

    console.log(`[browser-smoke] gate=${report.gate} green=${report.summary.green} yellow=${report.summary.yellow} red=${report.summary.red}`);
    for (const check of report.checks) {
        const prefix = check.status === 'green' ? '✓' : check.status === 'yellow' ? '!' : '✗';
        console.log(`  ${prefix} ${check.id}: ${check.detail}`);
    }

    if (report.gate === 'red') {
        process.exitCode = 2;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[browser-smoke] ❌ ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    requestUrl,
    runBrowserSmoke,
    SURFACE_CHECKS,
};