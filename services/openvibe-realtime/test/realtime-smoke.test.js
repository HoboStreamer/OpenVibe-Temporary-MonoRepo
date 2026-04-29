'use strict';

const assert = require('assert');

const { REALTIME_NAMESPACES } = require('@openvibe/realtime');
const { buildApp } = require('../server/index');

(function exposesProductionNamespaces() {
    const { socketRuntime } = buildApp();
    const namespaces = socketRuntime.summary().namespaces.map((entry) => entry.namespace);
    for (const required of REALTIME_NAMESPACES) {
        assert.ok(namespaces.includes(required), `expected realtime namespace ${required}`);
    }
})();

console.log('openvibe-realtime smoke tests OK');
