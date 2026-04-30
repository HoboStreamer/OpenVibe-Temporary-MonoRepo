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
const DEFAULT_SCREENSHOT_DIR = path.join(ROOT, 'data', 'readiness', 'playwright');
const FALSEY = new Set(['0', 'false', 'no', 'off', '']);
const DEFAULT_PAGE_TIMEOUT_MS = 15000;
const ADMIN_RUNTIME_SELECTORS = Object.freeze({
    tabButton: '#admin-tabs .ov-tab[data-tab="runtime"]',
    visiblePanel: '#tab-runtime:not([hidden])',
    distributedRuntimeStatus: '#tab-runtime [data-runtime-panel="distributed-runtime-status"]',
    workerProcessorMatrix: '#tab-runtime [data-runtime-panel="worker-processor-matrix"]',
    workerProcessorTableHead: '#tab-runtime [data-runtime-panel="worker-processor-matrix"] thead',
    productCapabilityMatrix: '#tab-runtime [data-runtime-panel="product-capability-matrix"]',
});

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

function toArtifactPath(filePath) {
    return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function buildScreenshotPath(checkId, screenshotDir) {
    const dir = path.resolve(screenshotDir || DEFAULT_SCREENSHOT_DIR);
    const fileName = String(checkId || 'check')
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'check';
    return path.join(dir, `${fileName}.png`);
}

async function capturePageScreenshot(page, targetScreenshot) {
    try {
        await page.screenshot({ path: targetScreenshot, fullPage: true });
        return {
            screenshotPath: toArtifactPath(targetScreenshot),
            screenshotMode: 'full-page',
            screenshotError: null,
            screenshotWarning: null,
        };
    } catch (error) {
        const fullPageError = error && error.message || String(error);
        try {
            await page.screenshot({ path: targetScreenshot });
            return {
                screenshotPath: toArtifactPath(targetScreenshot),
                screenshotMode: 'viewport',
                screenshotError: null,
                screenshotWarning: fullPageError,
            };
        } catch (fallbackError) {
            return {
                screenshotPath: null,
                screenshotMode: null,
                screenshotError: `full-page: ${fullPageError}; viewport: ${fallbackError && fallbackError.message || String(fallbackError)}`,
                screenshotWarning: null,
            };
        }
    }
}

function shouldIgnoreRequestFailure(url) {
    return /^data:/i.test(url)
        || /\/favicon\.ico(?:$|\?)/i.test(url);
}

function createPageDiagnostics(page) {
    const diagnostics = {
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
    };

    page.on('console', (message) => {
        if (message.type() === 'error') {
            diagnostics.consoleErrors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        diagnostics.pageErrors.push(error && error.message || String(error));
    });
    page.on('requestfailed', (request) => {
        if (shouldIgnoreRequestFailure(request.url())) return;
        const failure = request.failure();
        diagnostics.failedRequests.push({
            method: request.method(),
            url: request.url(),
            error: failure && failure.errorText || 'request failed',
        });
    });

    return diagnostics;
}

async function inspectIconRuntime(page) {
    return page.evaluate(() => {
        const scriptUrls = Array.from(document.scripts || [])
            .map((script) => script.src || '')
            .filter(Boolean);
        const iconScriptPresent = scriptUrls.some((src) => /openvibe-icons\.js(?:$|\?)/.test(src));
        const iconStylePresent = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).some((node) => {
            const href = node.href || '';
            return /openvibe-icons\.css(?:$|\?)/.test(href) || node.id === 'openvibe-icons-style';
        });
        const iconElementCount = document.querySelectorAll('.ov-icon,.ov-icon-fallback,.icon-inline svg,.icon-inline .ov-icon').length;
        return {
            icon_script_present: iconScriptPresent,
            icon_style_present: iconStylePresent,
            openvibe_icons_ready: !!window.OpenVibeIcons && typeof window.OpenVibeIcons.icon === 'function',
            icon_element_count: iconElementCount,
        };
    });
}

async function runUiAssertions(page, plan, options) {
    const timeout = Math.min(options.pageTimeoutMs, 5000);

    switch (plan.id) {
        case 'admin-shell': {
            await page.click(ADMIN_RUNTIME_SELECTORS.tabButton);
            await page.waitForSelector(ADMIN_RUNTIME_SELECTORS.visiblePanel, { timeout });
            await page.waitForSelector(ADMIN_RUNTIME_SELECTORS.distributedRuntimeStatus, { timeout });
            await page.waitForSelector(ADMIN_RUNTIME_SELECTORS.workerProcessorMatrix, { timeout });
            const runtimeText = await page.locator(ADMIN_RUNTIME_SELECTORS.visiblePanel).innerText();
            const processorHeaderText = await page.locator(ADMIN_RUNTIME_SELECTORS.workerProcessorTableHead).innerText().catch(() => '');
            if (!/Distributed runtime status/.test(runtimeText)
                || !/Worker processor matrix/.test(runtimeText)
                || !/processor/i.test(processorHeaderText)
                || !/dependency/i.test(processorHeaderText)) {
                return {
                    status: 'red',
                    detail: 'runtime tab did not render the expected distributed-runtime panels',
                };
            }
            return {
                status: 'green',
                detail: 'admin runtime tab rendered the distributed runtime panels',
            };
        }
        case 'ai-shell': {
            await page.click('button[data-icon="health"]');
            await page.waitForFunction(() => {
                const target = document.getElementById('status');
                return !!target && !/click a button/i.test(target.textContent || '') && /\{/.test(target.textContent || '');
            }, null, { timeout });
            return {
                status: 'green',
                detail: 'AI runtime status interaction returned live JSON',
            };
        }
        case 'billing-shell': {
            const panelCount = await page.locator('.panel').count();
            if (panelCount < 3) {
                return {
                    status: 'red',
                    detail: `expected at least 3 billing panels but found ${panelCount}`,
                };
            }
            return {
                status: 'green',
                detail: 'billing shell rendered the expected panel set',
            };
        }
        default:
            return {
                status: 'green',
                detail: 'no extra UI assertion required for this shell',
            };
    }
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
        const diagnostics = createPageDiagnostics(page);
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

        const iconRuntime = await inspectIconRuntime(page);
        if (iconRuntime.icon_script_present && !iconRuntime.openvibe_icons_ready) {
            return {
                status: 'red',
                detail: 'page included openvibe-icons.js but did not expose window.OpenVibeIcons',
                forbiddenOrigins: [],
                httpStatus: status,
                durationMs: Date.now() - startedAt,
                navigationUrl: targetUrl,
                strategy,
                title,
                iconRuntime,
                consoleErrors: diagnostics.consoleErrors,
                pageErrors: diagnostics.pageErrors,
                failedRequests: diagnostics.failedRequests,
            };
        }

        const uiAssertions = await runUiAssertions(page, plan, options);
        if (uiAssertions.status === 'red') {
            return {
                status: 'red',
                detail: uiAssertions.detail,
                forbiddenOrigins: [],
                httpStatus: status,
                durationMs: Date.now() - startedAt,
                navigationUrl: targetUrl,
                strategy,
                title,
                iconRuntime,
                uiAssertions,
                consoleErrors: diagnostics.consoleErrors,
                pageErrors: diagnostics.pageErrors,
                failedRequests: diagnostics.failedRequests,
            };
        }

        const targetScreenshot = buildScreenshotPath(plan.id, options.screenshotDir);
        ensureDir(path.dirname(targetScreenshot));
        const screenshot = await capturePageScreenshot(page, targetScreenshot);
        const screenshotPath = screenshot.screenshotPath;
        const screenshotMode = screenshot.screenshotMode;
        const screenshotError = screenshot.screenshotError;
        const screenshotWarning = screenshot.screenshotWarning;

        const diagnosticSignals = diagnostics.consoleErrors.length || diagnostics.pageErrors.length || diagnostics.failedRequests.length;
        const detailParts = [`HTML responded with expected marker: ${plan.marker}`];
        if (uiAssertions.detail && uiAssertions.detail !== 'no extra UI assertion required for this shell') {
            detailParts.push(uiAssertions.detail);
        }
        if (diagnosticSignals) {
            detailParts.push(`browser diagnostics: console=${diagnostics.consoleErrors.length}, page=${diagnostics.pageErrors.length}, request=${diagnostics.failedRequests.length}`);
        }
        if (screenshotError) {
            detailParts.push(`screenshot capture failed: ${screenshotError}`);
        }

        return {
            status: diagnosticSignals ? 'yellow' : uiAssertions.status,
            detail: detailParts.join('; '),
            forbiddenOrigins: [],
            httpStatus: status,
            durationMs: Date.now() - startedAt,
            navigationUrl: targetUrl,
            strategy,
            title,
            iconRuntime,
            uiAssertions,
            screenshotPath,
            screenshotMode,
            screenshotError,
            screenshotWarning,
            consoleErrors: diagnostics.consoleErrors,
            pageErrors: diagnostics.pageErrors,
            failedRequests: diagnostics.failedRequests,
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
    resolved.screenshotDir = path.resolve(resolved.screenshotDir || DEFAULT_SCREENSHOT_DIR);

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
                console_errors: evaluation.consoleErrors || [],
                page_errors: evaluation.pageErrors || [],
                failed_requests: evaluation.failedRequests || [],
                icon_runtime: evaluation.iconRuntime || null,
                ui_assertions: evaluation.uiAssertions || null,
                screenshot_path: evaluation.screenshotPath || null,
                screenshot_mode: evaluation.screenshotMode || null,
                screenshot_error: evaluation.screenshotError || null,
                screenshot_warning: evaluation.screenshotWarning || null,
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
                screenshot_dir: toArtifactPath(resolved.screenshotDir),
                only: plan.selected,
            },
            artifacts: {
                screenshot_dir: toArtifactPath(resolved.screenshotDir),
                screenshot_count: checks.filter((check) => !!check.screenshot_path).length,
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
        screenshotDir: args.screenshotDir || DEFAULT_SCREENSHOT_DIR,
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
    ADMIN_RUNTIME_SELECTORS,
    buildScreenshotPath,
    buildPlaywrightPlan,
    capturePageScreenshot,
    DEFAULT_SCREENSHOT_DIR,
    runBrowserSmokePlaywright,
    toBrowserNavigationUrl,
};
