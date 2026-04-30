'use strict';

const assert = require('assert');

const { parseArgs, resolveJobCount, splitList } = require('../lib/args');

(function run() {
    const args = parseArgs(['--component=openvibe-content', '--type', 'service', '--no-status-file', '--jobs=75%', 'freeform']);
    assert.strictEqual(args.component, 'openvibe-content');
    assert.strictEqual(args.type, 'service');
    assert.strictEqual(args.statusFile, false);
    assert.strictEqual(args.jobs, '75%');
    assert.deepStrictEqual(args._, ['freeform']);

    assert.deepStrictEqual(splitList(['a,b', 'c', '', false]), ['a', 'b', 'c']);
    assert.strictEqual(resolveJobCount('auto', { defaultJobs: 1, maxTests: 99 }) >= 1, true);
    assert.strictEqual(resolveJobCount('50%', { defaultJobs: 1, maxTests: 10 }) >= 1, true);
    assert.strictEqual(resolveJobCount('3', { defaultJobs: 1, maxTests: 2 }), 2);

    console.log('test args OK');
}());
