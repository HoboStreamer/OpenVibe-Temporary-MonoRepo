#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { parseArgs, ensureDir, writeJson, createLogger } = require('./lib/common');
const { auditReferences, summaryMarkdown } = require('./lib/hobo-audit');

const ROOT = path.resolve(__dirname, '..', '..');

function main() {
    const args = parseArgs(process.argv.slice(2));
    const logger = createLogger('audit-hobo-references');

    const root = path.resolve(args.root || ROOT);
    const outDir = path.resolve(args.out || path.join(ROOT, 'data', 'migrations', 'audit'));

    logger.info(`Scanning ${root}`);
    const { summary, occurrences } = auditReferences({ root });

    ensureDir(outDir);
    const refList = {
        ...summary,
        occurrences: args.includeOccurrences === false || args.compact ? undefined : occurrences,
    };
    writeJson(path.join(outDir, 'hobo-ref-list.json'), refList);
    fs.writeFileSync(path.join(outDir, 'hobo-ref-summary.md'), summaryMarkdown(summary), 'utf8');

    logger.info(`Wrote ${path.join(outDir, 'hobo-ref-list.json')}`);
    logger.info(`Wrote ${path.join(outDir, 'hobo-ref-summary.md')}`);
    logger.info(`Total occurrences: ${summary.total_occurrences} in ${summary.total_files} files`);

    const remediation = summary.by_classification['runtime-default-dependency'] || 0;
    if (remediation > 0) {
        logger.warn(`runtime-default-dependency files: ${remediation} — review required`);
    }
    if (args.strict && remediation > 0) {
        process.exitCode = 2;
    }
}

main();
