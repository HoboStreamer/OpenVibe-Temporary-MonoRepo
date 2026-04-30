#!/usr/bin/env node
'use strict';

const path = require('path');
const { chromium } = require('playwright');

const {
    ensureDir,
    parseArgs,
    toInt,
    writeJson,
} = require('../migrate-hobo/lib/common');
const {
    DEFAULT_URLS,
    FORBIDDEN_LOCAL_PRODUCTION_ORIGINS,
    evaluateJsonCheck,
    requestUrl,
    resolveCheckTarget,
    splitSelection,
    SURFACE_CHECKS,
} = require('./browser-smoke');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'browser-smoke-playwright-report.json');
const FALSEY = new Set(['0', 'false', 'no', 'off', '']);
const DEFAULT_PAGE_TIMEOUT_MS = 15000;

function readFlag(value, fallbackValue) {
    if (value == null) return fallbackValue;
    if (typeof value === 'boolean') return value;
    return !FALSEY.has(String(value).trim().toLowerCase());
}

function isLocalUrl(rawUrl) {
    try {
        const hostname = new URL(rawUrl).hostname.toLowerCase();
        return hostname === '127.0.0.1' || hostname === 'localhost' || hostname.endsWith('.localhost');
    } catch {
        return false;
    }
}

function toBrowserNavigationUrl(targetUrl, host) {
    const browserUrl = new URL(targetUrl);
    browserUrl.hostname = host;
    return browserUrl.toString();
}

function buildPlaywrightPlan(options = {}) {
    const resolved = Object.assign({}, DEFAULT_URLS, options);
    if (resolved.expectLocalhost == null) {
        resolved.expectLocalhost = Object.keys(DEFAULT_URLS).some((key) => isLocalUrl(resolved[key]));
    }

    const selected = splitSelection(resolved.only);
    const checks = [];
    for (const check of SURFACE_CHECKS) {
        if (selected && !selected.has(check.id)) continue;
        const targetUrl = resolveCheckTarget(check, resolved);
        checks.push({
            ...check,
            targetUrl,
            browserUrl: toBrowserNavigationUrl(targetUrl, check.host),
        });
    }

    return {
        selected: selected ? Array.from(selected) : [],
        options: resolved,
        checks,
    };
}

async function runHtmlAttempt(browser, plan, options, strategy) {
    const startedAt = Date.now();
    const useHostHeader = strategy === 'host-header';
    const targetUrl = useHostHeader ? plan.targetUrl : plan.browserUrl;
    const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: useHostHeader
            ? { Host: plan.host, Accept: 'text/html' }
            : { Accept: 'text/html' },
    });

    try {
        const page = await context.newPage();
        const response = await page.goto(targetUrl, {
            timeout: options.pageTimeoutMs,
            waitUntil: 'domcontentloaded',
        });
        await page.waitForLoadState('networkidle', {
            timeout: Math.min(options.pageTimeoutMs, 4000),
        }).catch(() => {});

        const status = response ? response.status() : 0;
        const headers = response ? response.headers() : {};
        const contentType = String(headers['content-type'] || '').toLowerCase();
        const html = await page.content();
        const bodyText = await page.locator('body').innerText().catch(() => '');
        const title = await page.title().catch(() => '');

        if (status < 200 || status >= 300) {
            return {
                status: 'red',
                detail: `HTTP ${status || 'navigation failed'}`,
                httpStatus: status,
                durationMs: Date.now() - startedAt,
                navigationUrl: targetUrl,
                strategy,
                title,
            };
        }
        if (!contentType.includes('text/html')) {
            return {
                status: 'red',
                detail: `expected text/html but received ${contentType || 'unknown content-type'}`,
                httpStatus: status,
                durationMs: Date.now() - startedAt,
                navigationUrl: targetUrl,
                strategy,
                title,
            };
        }
        if (!html.includes(plan.marker) && !bodyText.includes(plan.marker)) {
            return {
                status: 'red',
                detail: `expected marker not found: ${plan.marker}`,
                httpStatus: status,
                durationMs: Date.now() - startedAt,
                navigationUrl: targetUrl,
                strategy,
                title,
            };
        }

        const forbiddenOrigins = options.expectLocalhost
            ? FORBIDDEN_LOCAL_PRODUCTION_ORIGINS.filter((origin) => html.includes(origin))
            : [];
        if (forbiddenOrigins.length) {
            return {
                status: 'red',
                detail: `HTML leaked production origins: ${forbiddenOrigins.join(', ')}`,
                forbiddenOrigins,
                httpStatus: status,
                durationMs: Date.now() - startedAt,
                navigationUrl: targetUrl,
                strategy,
                title,
            };
        }

        return {
            status: 'green',
            detail: `HTML responded with expected marker: ${plan.marker}`,
            forbiddenOrigins: [],
            httpStatus: status,
            durationMs: Date.now() - startedAt,
            navigationUrl: targetUrl,
            strategy,
            title,
        };
    } catch (error) {
        return {
            status: 'red',
            detail: error.message,
            forbiddenOrigins: [],
            httpStatus: 0,
            durationMs: Date.now() - startedAt,
            navigationUrl: targetUrl,
            strategy,
            title: '',
        };
    } finally {
        await context.close();
    }
}

async function runHtmlCheckWithPlaywright(browser, plan, options) {
    const attempts = ['host-header'];
    if (plan.browserUrl !== plan.targetUrl) {
        attempts.push('localhost-domain');
    }

    let lastResult = null;
    for (const strategy of attempts) {
        const attempt = await runHtmlAttempt(browser, plan, options, strategy);
        if (attempt.status === 'green') {
            return attempt;
        }
        lastResult = attempt;
    }

    if (lastResult && attempts.length > 1) {
        return Object.assign({}, lastResult, {
            detail: `${lastResult.detail} (tried host-header and localhost-domain navigation)`,
        });
    }
    return lastResult;
}

async function runBrowserSmokePlaywright(options = {}) {
    const resolved = Object.assign({}, DEFAULT_URLS, options);
    if (resolved.expectLocalhost == null) {
        resolved.expectLocalhost = Object.keys(DEFAULT_URLS).some((key) => isLocalUrl(resolved[key]));
    }
    resolved.pageTimeoutMs = toInt(resolved.pageTimeoutMs, DEFAULT_PAGE_TIMEOUT_MS);

    const plan = buildPlaywrightPlan(resolved);
    const htmlChecks = plan.checks.filter((check) => check.type === 'html');
    const browser = htmlChecks.length
        ? await chromium.launch({ headless: readFlag(resolved.headless, true) })
        : null;

    try {
        const checks = [];

        for (const check of plan.checks) {
            if (check.type === 'json') {
                const response = await requestUrl(check.targetUrl, {
                    headers: {
                        Host: check.host,
                        Accept: 'application/json',
                    },
                });
                const evaluation = evaluateJsonCheck(check, response);
                checks.push({
                    id: check.id,
                    host: check.host,
                    url: check.targetUrl,
                    browser_url: check.browserUrl,
                    status: evaluation.status,
                    detail: evaluation.detail,
                    http_status: response.status,
                    duration_ms: response.durationMs,
                    forbidden_origins: evaluation.forbiddenOrigins || [],
                    strategy: 'http',
                });
                continue;
            }

            const evaluation = await runHtmlCheckWithPlaywright(browser, check, resolved);
            checks.push({
                id: check.id,
                host: check.host,
                url: check.targetUrl,
                browser_url: evaluation.navigationUrl || check.browserUrl,
                status: evaluation.status,
                detail: evaluation.detail,
                http_status: evaluation.httpStatus,
                duration_ms: evaluation.durationMs,
                forbidden_origins: evaluation.forbiddenOrigins || [],
                strategy: evaluation.strategy || 'playwright',
                page_title: evaluation.title || '',
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
                events_url: resolved.eventsUrl,
                media_url: resolved.mediaUrl,
                live_url: resolved.liveUrl,
                restream_url: resolved.restreamUrl,
                chat_url: resolved.chatUrl,
                community_url: resolved.communityUrl,
                billing_url: resolved.billingUrl,
                ai_url: resolved.aiUrl,
                games_url: resolved.gamesUrl,
                workers_url: resolved.workersUrl,
                realtime_url: resolved.realtimeUrl,
                content_url: resolved.contentUrl,
                expect_localhost: !!resolved.expectLocalhost,
                headless: readFlag(resolved.headless, true),
                page_timeout_ms: resolved.pageTimeoutMs,
                only: plan.selected,
            },
            checks,
        };

        if (resolved.outFile) {
            ensureDir(path.dirname(resolved.outFile));
            writeJson(resolved.outFile, report);
        }

        return report;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await runBrowserSmokePlaywright({
        networkUrl: args.networkUrl || DEFAULT_URLS.networkUrl,
        eventsUrl: args.eventsUrl || DEFAULT_URLS.eventsUrl,
        mediaUrl: args.mediaUrl || DEFAULT_URLS.mediaUrl,
        liveUrl: args.liveUrl || DEFAULT_URLS.liveUrl,
        restreamUrl: args.restreamUrl || DEFAULT_URLS.restreamUrl,
        chatUrl: args.chatUrl || DEFAULT_URLS.chatUrl,
        communityUrl: args.communityUrl || DEFAULT_URLS.communityUrl,
        billingUrl: args.billingUrl || DEFAULT_URLS.billingUrl,
        aiUrl: args.aiUrl || DEFAULT_URLS.aiUrl,
        gamesUrl: args.gamesUrl || DEFAULT_URLS.gamesUrl,
        workersUrl: args.workersUrl || DEFAULT_URLS.workersUrl,
        realtimeUrl: args.realtimeUrl || DEFAULT_URLS.realtimeUrl,
        contentUrl: args.contentUrl || DEFAULT_URLS.contentUrl,
        expectLocalhost: readFlag(args.expectLocalhost, undefined),
        headless: readFlag(args.headless, true),
        pageTimeoutMs: toInt(args.pageTimeoutMs, DEFAULT_PAGE_TIMEOUT_MS),
        only: args.only || null,
        outFile: path.resolve(args.out || DEFAULT_OUT),
    });

    console.log(`[browser-smoke-playwright] gate=${report.gate} green=${report.summary.green} yellow=${report.summary.yellow} red=${report.summary.red}`);
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
        console.error(`[browser-smoke-playwright] ❌ ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    buildPlaywrightPlan,
    runBrowserSmokePlaywright,
    toBrowserNavigationUrl,
};
