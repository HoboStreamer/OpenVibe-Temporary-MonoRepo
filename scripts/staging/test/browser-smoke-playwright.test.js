'use strict';

const assert = require('assert');

const { DEFAULT_URLS } = require('../browser-smoke');
const {
    buildPlaywrightPlan,
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
        'http://billing.openvibe.network.localhost:5000/health',
        'browser navigation URLs should swap the hostname while preserving port and path',
    );

    console.log('browser smoke playwright tests OK');
}());
