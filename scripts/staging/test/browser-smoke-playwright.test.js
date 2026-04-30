'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { DEFAULT_URLS } = require('../browser-smoke');
const {
    ADMIN_RUNTIME_SELECTORS,
    buildScreenshotPath,
    buildPlaywrightPlan,
    capturePageScreenshot,
    DEFAULT_SCREENSHOT_DIR,
    toBrowserNavigationUrl,
} = require('../browser-smoke-playwright');

(async function run() {
    const selected = buildPlaywrightPlan({
        only: 'network-shell,billing-shell,realtime-health',
    });

    assert.deepStrictEqual(
        selected.checks.map((check) => check.id),
        ['network-shell', 'billing-shell', 'realtime-health'],
        'playwright plan should preserve smoke-check order when filtering',
    );

    const networkShell = selected.checks.find((check) => check.id === 'network-shell');
    assert(networkShell, 'network-shell should be present in the filtered plan');
    assert.strictEqual(
        networkShell.browserUrl,
        'http://openvibe.network.localhost:4100/',
        'network-shell should navigate with the host-routed localhost domain',
    );

    assert.strictEqual(
        toBrowserNavigationUrl(`${DEFAULT_URLS.billingUrl}/health`, 'billing.openvibe.network.localhost'),
        'http://billing.openvibe.network.localhost:5001/health',
        'browser navigation URLs should swap the hostname while preserving port and path',
    );

    assert.strictEqual(
        buildScreenshotPath('admin-shell', DEFAULT_SCREENSHOT_DIR).endsWith('data/readiness/playwright/admin-shell.png'),
        true,
        'Playwright screenshots should default into the readiness/playwright artifact directory',
    );

    assert.strictEqual(
        ADMIN_RUNTIME_SELECTORS.workerProcessorMatrix,
        '#tab-runtime [data-runtime-panel="worker-processor-matrix"]',
        'admin runtime assertions should target the worker processor matrix container explicitly',
    );

    const screenshotCalls = [];
    const fallbackCapture = await capturePageScreenshot({
        screenshot: async (options) => {
            screenshotCalls.push(options);
            if (options.fullPage) {
                throw new Error('full page capture exploded');
            }
        },
    }, path.join(DEFAULT_SCREENSHOT_DIR, 'fallback-test.png'));
    assert.deepStrictEqual(
        screenshotCalls,
        [
            { path: path.join(DEFAULT_SCREENSHOT_DIR, 'fallback-test.png'), fullPage: true },
            { path: path.join(DEFAULT_SCREENSHOT_DIR, 'fallback-test.png') },
        ],
        'screenshot capture should retry with a viewport screenshot after a full-page failure',
    );
    assert.strictEqual(
        fallbackCapture.screenshotMode,
        'viewport',
        'fallback capture should report viewport mode after retrying',
    );
    assert.strictEqual(
        fallbackCapture.screenshotError,
        null,
        'successful viewport fallback should not be reported as a hard screenshot error',
    );
    assert.ok(
        /full page capture exploded/.test(fallbackCapture.screenshotWarning || ''),
        'fallback capture should retain the original full-page error as non-gating metadata',
    );

    const adminHtml = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'services', 'openvibe-network', 'public', 'admin.html'),
        'utf8',
    );
    assert(
        adminHtml.includes('data-runtime-panel="distributed-runtime-status"'),
        'admin runtime UI should mark the distributed runtime status panel for Playwright assertions',
    );
    assert(
        adminHtml.includes('data-runtime-panel="worker-processor-matrix"'),
        'admin runtime UI should mark the worker processor matrix for Playwright assertions',
    );
    assert(
        adminHtml.includes('Worker processor matrix'),
        'admin runtime UI should expose a visible worker processor matrix heading',
    );
    assert(
        adminHtml.includes('data-runtime-panel="product-capability-matrix"'),
        'admin runtime UI should mark the Phase 16 product capability matrix for Playwright assertions',
    );
    assert(
        adminHtml.includes('Product capability matrix'),
        'admin runtime UI should expose a visible product capability matrix heading',
    );

    console.log('browser smoke playwright tests OK');
}()).catch((error) => {
    console.error(error);
    process.exit(1);
});
