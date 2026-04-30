#!/usr/bin/env node
'use strict';

const path = require('path');

const { checkSchemaDrift } = require('../../packages/openvibe-persistence/schema-drift');
const { ensureDir, parseArgs, writeJson } = require('../migrate-hobo/lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'schema-drift-report.json');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = checkSchemaDrift();
    const outFile = path.resolve(args.out || DEFAULT_OUT);
    ensureDir(path.dirname(outFile));
    writeJson(outFile, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.gate === 'red' ? 1 : 0);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    checkSchemaDrift,
};
