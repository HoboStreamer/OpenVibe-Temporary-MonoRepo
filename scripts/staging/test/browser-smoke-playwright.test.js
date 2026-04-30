'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { DEFAULT_URLS } = require('../browser-smoke');
const {
    ADMIN_RUNTIME_SELECTORS,
    buildScreenshotPath,
    buildPlaywrightPlan,
    DEFAULT_SCREENSHOT_DIR,
    toBrowserNavigationUrl,
} = require('../browser-smoke-playwright');

(function run() {
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

    console.log('browser smoke playwright tests OK');
}());
