'use strict';

const assert = require('assert');
const { gateFor } = require('../run-cutover-rehearsal');

assert.strictEqual(gateFor([]), 'yellow', 'empty checks => yellow');
assert.strictEqual(gateFor([{ name: 'a', status: 'pass', severity: 'green' }]), 'green');
assert.strictEqual(gateFor([
    { name: 'a', status: 'pass', severity: 'green' },
    { name: 'b', status: 'warn', severity: 'yellow' },
]), 'yellow');
assert.strictEqual(gateFor([
    { name: 'a', status: 'fail', severity: 'red' },
    { name: 'b', status: 'pass', severity: 'green' },
]), 'red');

console.log('cutover-rehearsal: OK');
