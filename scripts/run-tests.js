#!/usr/bin/env node
'use strict';

// OpenVibe — minimal test runner. Discovers every *.test.js under
// packages/*/test and services/*/test, runs each in its own subprocess,
// summarises, and exits non-zero on failure.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ROOTS = ['packages', 'services'];

function* walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const ent of entries) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) yield* walk(full);
        else if (ent.isFile() && ent.name.endsWith('.test.js')) yield full;
    }
}

const tests = [];
for (const r of ROOTS) {
    for (const f of walk(path.join(ROOT, r))) {
        if (f.includes(`${path.sep}test${path.sep}`) || f.endsWith('.test.js')) tests.push(f);
    }
}

let pass = 0, fail = 0;
for (const t of tests) {
    const rel = path.relative(ROOT, t);
    process.stdout.write(`▶ ${rel} ... `);
    const r = spawnSync(process.execPath, [t], { encoding: 'utf8', stdio: 'pipe' });
    if (r.status === 0) {
        pass += 1;
        console.log('ok');
        if (r.stdout && process.env.VERBOSE) console.log(r.stdout);
    } else {
        fail += 1;
        console.log('FAIL');
        if (r.stdout) console.log(r.stdout);
        if (r.stderr) console.error(r.stderr);
    }
}

console.log(`\n[test] ${tests.length} files, ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
