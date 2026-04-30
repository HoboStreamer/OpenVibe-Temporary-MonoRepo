'use strict';

const assert = require('assert');

const { classifyRelativePath } = require('../lib/discovery');
const { buildMatcher, resolvePathSelection, selectTests } = require('../lib/selection');

const TESTS = [
    classifyRelativePath('services/openvibe-content/test/content-api.test.js'),
    classifyRelativePath('services/openvibe-content/test/content-ssr.test.js'),
    classifyRelativePath('services/openvibe-network/test/native-auth.test.js'),
    classifyRelativePath('packages/openvibe-sdk/test/url-defaults.test.js'),
    classifyRelativePath('scripts/staging/test/browser-smoke.test.js'),
];

(function run() {
    const matcherSelection = selectTests(TESTS, { matcher: buildMatcher('content') });
    assert.deepStrictEqual(
        matcherSelection.tests.map((test) => test.relativePath),
        [
            'services/openvibe-content/test/content-api.test.js',
            'services/openvibe-content/test/content-ssr.test.js',
        ],
    );

    const componentSelection = selectTests(TESTS, { components: 'openvibe-content' });
    assert.strictEqual(componentSelection.tests.length, 2);

    const scopeSelection = selectTests(TESTS, { scopes: 'packages/openvibe-sdk' });
    assert.deepStrictEqual(scopeSelection.tests.map((test) => test.relativePath), ['packages/openvibe-sdk/test/url-defaults.test.js']);

    const changedSelection = resolvePathSelection(TESTS, 'services/openvibe-content/server/routes.js');
    assert.strictEqual(changedSelection.components.has('services/openvibe-content'), true);

    const fileSelection = selectTests(TESTS, { files: 'scripts/staging/test/browser-smoke.test.js' });
    assert.deepStrictEqual(fileSelection.tests.map((test) => test.relativePath), ['scripts/staging/test/browser-smoke.test.js']);

    const typeSelection = selectTests(TESTS, { types: 'script' });
    assert.deepStrictEqual(typeSelection.tests.map((test) => test.relativePath), ['scripts/staging/test/browser-smoke.test.js']);

    console.log('test selection OK');
}());
