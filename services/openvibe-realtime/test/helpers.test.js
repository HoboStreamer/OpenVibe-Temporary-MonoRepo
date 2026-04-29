'use strict';

const assert = require('assert');

const config = require('../server/config');
const { buildApp } = require('../server/index');

(function serviceBuildsWithoutRedis() {
    const { socketRuntime } = buildApp();
    const summary = socketRuntime.summary();
    assert.ok(Array.isArray(summary.namespaces));
    assert.ok(summary.namespaces.length >= 4);
    assert.strictEqual(config.serviceId, 'openvibe-realtime');
})();

console.log('openvibe-realtime service helpers: OK');