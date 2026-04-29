'use strict';

const assert = require('assert');

const config = require('../server/config');
const { buildApp } = require('../server/index');

const REQUIRED_NAMESPACES = [
    '/realtime',
    '/chat',
    '/live',
    '/media',
    '/clips',
    '/notifications',
    '/admin',
    '/games',
];

(function serviceBuildsWithoutRedis() {
    const { socketRuntime } = buildApp();
    const summary = socketRuntime.summary();
    assert.ok(Array.isArray(summary.namespaces));
    assert.ok(summary.namespaces.length >= REQUIRED_NAMESPACES.length);
    const namespaces = summary.namespaces.map((entry) => entry.namespace);
    for (const required of REQUIRED_NAMESPACES) {
        assert.ok(namespaces.includes(required), `expected namespace ${required}`);
    }
    assert.strictEqual(config.serviceId, 'openvibe-realtime');
    assert.strictEqual(config.enablePollingTransport, false);
})();

console.log('openvibe-realtime service helpers: OK');