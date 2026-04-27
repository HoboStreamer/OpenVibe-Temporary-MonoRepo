#!/usr/bin/env node
'use strict';

// scripts/cutover/verify-cutover.js
//
// Read-only verification that re-reads the produced cutover artifacts and
// confirms the gate without re-running the rehearsal.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT = path.join(ROOT, 'data', 'migrations', 'cutover-report.json');

function main() {
    if (!fs.existsSync(REPORT)) {
        console.error('cutover-report.json missing — run scripts/cutover/run-cutover-rehearsal.js first');
        process.exit(2);
    }
    const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
    const failed = (report.checks || []).filter(c => c.severity === 'red' || c.status === 'fail');
    const warned = (report.checks || []).filter(c => c.severity === 'yellow' || c.status === 'warn');
    process.stdout.write(`gate=${report.gate} failed=${failed.length} warn=${warned.length}\n`);
    for (const c of failed) process.stdout.write(`  ✗ ${c.name}\n`);
    for (const c of warned) process.stdout.write(`  ! ${c.name}\n`);
    process.exit(report.gate === 'red' ? 2 : 0);
}

if (require.main === module) main();
module.exports = { main };
