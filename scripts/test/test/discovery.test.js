'use strict';

const assert = require('assert');

const { buildComponentSummary, classifyRelativePath } = require('../lib/discovery');

(function run() {
    assert.deepStrictEqual(
        classifyRelativePath('services/openvibe-content/test/content-api.test.js'),
        {
            relativePath: 'services/openvibe-content/test/content-api.test.js',
            componentType: 'service',
            componentName: 'openvibe-content',
            componentKey: 'services/openvibe-content',
        },
    );

    assert.deepStrictEqual(
        classifyRelativePath('packages/openvibe-sdk/test/url-defaults.test.js'),
        {
            relativePath: 'packages/openvibe-sdk/test/url-defaults.test.js',
            componentType: 'package',
            componentName: 'openvibe-sdk',
            componentKey: 'packages/openvibe-sdk',
        },
    );

    assert.deepStrictEqual(
        classifyRelativePath('scripts/staging/test/browser-smoke.test.js'),
        {
            relativePath: 'scripts/staging/test/browser-smoke.test.js',
            componentType: 'script',
            componentName: 'staging',
            componentKey: 'scripts/staging',
        },
    );

    const summary = buildComponentSummary([
        classifyRelativePath('services/openvibe-content/test/content-api.test.js'),
        classifyRelativePath('services/openvibe-content/test/content-ssr.test.js'),
        classifyRelativePath('packages/openvibe-sdk/test/url-defaults.test.js'),
    ]);
    assert.strictEqual(summary.find((entry) => entry.componentKey === 'services/openvibe-content').count, 2);
    assert.strictEqual(summary.find((entry) => entry.componentKey === 'packages/openvibe-sdk').count, 1);

    console.log('test discovery OK');
}());
