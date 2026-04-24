#!/usr/bin/env node
'use strict';

// OpenVibe — syntax check. Walks every JS file under packages/ and services/
// and runs `node --check` on it. Skips node_modules, data dirs, and dotfiles.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ROOTS = ['packages', 'services'];
const SKIP_DIRS = new Set(['node_modules', 'data', '.git']);

function* walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const ent of entries) {
        if (ent.name.startsWith('.')) continue;
        if (SKIP_DIRS.has(ent.name)) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) yield* walk(full);
        else if (ent.isFile() && ent.name.endsWith('.js')) yield full;
    }
}

let total = 0, failed = 0;
for (const r of ROOTS) {
    for (const file of walk(path.join(ROOT, r))) {
        total += 1;
        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        if (result.status !== 0) {
            failed += 1;
            console.error(`✗ ${path.relative(ROOT, file)}`);
            if (result.stderr) console.error(result.stderr.trim());
        }
    }
}
console.log(`\n[check] ${total} files, ${failed} failures`);
process.exit(failed === 0 ? 0 : 1);
