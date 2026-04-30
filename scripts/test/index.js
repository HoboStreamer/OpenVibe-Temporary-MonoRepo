#!/usr/bin/env node
'use strict';

const path = require('path');

const {
    getAvailableParallelism,
    parseArgs,
    readFlag,
    resolveJobCount,
    splitList,
    toInt,
} = require('./lib/args');
const { buildComponentSummary, collectTests } = require('./lib/discovery');
const { toRepoDisplayPath } = require('./lib/format');
const { getChangedFiles } = require('./lib/git');
const { createReporter } = require('./lib/reporter');
const { selectTests, buildMatcher } = require('./lib/selection');
const { createStatusWriter } = require('./lib/status-file');
const {
    loadTimingCache,
    sortTestsByHistoricalDuration,
    updateTimingCache,
    writeTimingCache,
} = require('./lib/timings');
const { runTests } = require('./lib/runner');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SLOW_COUNT = 8;

function printUsage(reporter) {
    const available = getAvailableParallelism();
    [
        'Usage: node scripts/run-tests.js [filters] [options]',
        '',
        'Filters:',
        '  --match=REGEX                    Match test file paths by regex/substr.',
        '  --component=name                 Run one component (service/package/script).',
        '  --scope=path                     Run a subtree such as services/openvibe-content.',
        '  --type=service|package|script    Restrict by component type.',
        '  --file=path/to/file.test.js      Run one or more exact test files.',
        '  --changed[=REF]                  Run tests related to changed files vs REF (default HEAD).',
        '  --related=path/to/source.js      Run tests related to one or more source paths.',
        '',
        'Options:',
        '  --jobs=N|auto|half|75%           Parallel worker count. auto caps at 8.',
        '  --bail                           Stop scheduling after the first failure.',
        '  --verbose                        Print stdout for passing tests too.',
        '  --list                           Print selected test files and exit.',
        '  --list-components                Print selected components and exit.',
        '  --slow-count=N                   Show the N slowest files in the summary.',
        '  --no-status-file                 Disable .cache/openvibe/test-runner/status.json.',
        '  --no-log-file                    Disable .cache/openvibe/test-runner/latest.log.',
        '  --no-timing-cache                Disable historical timing cache and slow-first ordering.',
        '  --help                           Show this help.',
        '',
        'NPM shortcuts:',
        '  npm test                         Full suite, serial, deterministic order.',
        `  npm run test:fast                Full suite with auto parallelism (up to ${Math.min(available, 8)} workers here).`,
        '  npm run test:changed             Run tests for changed components only.',
        '  npm run test:services            Run all service tests.',
        '  npm run test:packages            Run all package tests.',
        '  npm run test:scripts             Run all script tests.',
        '  npm run test:list                List selected test files.',
        '  npm run test:list:components     List components and their test counts.',
        '',
        'Important:',
        '  `... | tail -40` is not live progress. `tail -40` waits for EOF, so it looks stuck.',
        '  For live output, run the command directly or follow `.cache/openvibe/test-runner/latest.log`.',
        '',
        'Examples:',
        '  npm run test:fast',
        '  npm test -- --component=openvibe-content',
        '  npm test -- --scope=services/openvibe-network --jobs=half',
        '  npm test -- --file=services/openvibe-content/test/content-api.test.js',
        '  npm run test:changed',
        '  npm run test:list:components',
    ].forEach((line) => reporter.line(line));
}

function printComponentSummary(reporter, components) {
    for (const component of components) {
        reporter.line(`- [${component.componentType}] ${component.componentKey} (${component.count} files)`);
    }
}

async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const reporter = createReporter(ROOT, {
        logFile: readFlag(args.logFile, true) ? (args.logFile === true ? undefined : args.logFile) : false,
    });

    try {
        if (args.help) {
            printUsage(reporter);
            return 0;
        }

        const allTests = collectTests(ROOT);
        let changedInfo = null;
        if (args.changed !== undefined) {
            changedInfo = getChangedFiles(ROOT, args.changed);
            if (changedInfo.error) {
                reporter.error(`[test] could not resolve changed files:\n${changedInfo.error}`);
                return 1;
            }
        }

        const selection = selectTests(allTests, {
            matcher: buildMatcher(args.match || args.grep || null),
            scopes: args.scope,
            files: args.file,
            types: args.type,
            components: args.component,
            relatedPaths: args.related,
            changedPaths: changedInfo ? changedInfo.files : [],
        });

        let selectedTests = selection.tests;
        const timingCacheEnabled = readFlag(args.timingCache, true);
        const timingCache = timingCacheEnabled ? loadTimingCache(ROOT) : null;
        const requestedJobs = args.jobs || process.env.OPENVIBE_TEST_JOBS || process.env.TEST_JOBS || 1;
        const jobs = resolveJobCount(requestedJobs, {
            defaultJobs: 1,
            maxTests: selectedTests.length || 1,
        });

        if (timingCache && jobs > 1) {
            selectedTests = sortTestsByHistoricalDuration(selectedTests, timingCache);
        }

        const selectedComponents = buildComponentSummary(selectedTests);
        reporter.line(`[test] discovered ${allTests.length} test files in the monorepo`);
        if (reporter.logFile) reporter.line(`[test] log file ${toRepoDisplayPath(ROOT, reporter.logFile)}`);
        if (changedInfo) {
            reporter.line(`[test] changed-file mode (${changedInfo.baseRef}) found ${changedInfo.files.length} changed paths`);
        }
        reporter.line(`[test] selected ${selectedTests.length} files across ${selectedComponents.length} components`);
        if (selection.changedSelection.unmatched.length) {
            reporter.line(`[test] ignored unmatched changed paths: ${selection.changedSelection.unmatched.join(', ')}`);
        }
        if (selection.relatedSelection.unmatched.length) {
            reporter.line(`[test] ignored unmatched related paths: ${selection.relatedSelection.unmatched.join(', ')}`);
        }

        if (args.listComponents) {
            printComponentSummary(reporter, selectedComponents);
            return 0;
        }

        if (args.list) {
            for (const test of selectedTests) {
                reporter.line(test.relativePath);
            }
            return 0;
        }

        if (!selectedTests.length) {
            if (args.changed !== undefined || splitList(args.related).length) {
                reporter.line('[test] no related test files were selected; nothing to run');
                return 0;
            }
            reporter.error('[test] 0 matching test files');
            return 1;
        }

        if (selectedComponents.length) {
            reporter.line('[test] selected components:');
            printComponentSummary(reporter, selectedComponents);
        }

        const statusWriter = readFlag(args.statusFile, true)
            ? createStatusWriter(ROOT, args.statusFile === true ? undefined : args.statusFile)
            : null;
        if (statusWriter) {
            reporter.line(`[test] status file ${toRepoDisplayPath(ROOT, statusWriter.filePath)}`);
        }

        const result = await runTests(ROOT, selectedTests, {
            jobs,
            bail: readFlag(args.bail, false),
            verbose: readFlag(args.verbose != null ? args.verbose : process.env.VERBOSE, false),
            slowCount: toInt(args.slowCount, DEFAULT_SLOW_COUNT),
            reporter,
            statusWriter,
            timingCache,
        });

        if (timingCache) {
            updateTimingCache(timingCache, result.results);
            writeTimingCache(timingCache);
            reporter.line(`[test] timing cache ${toRepoDisplayPath(ROOT, timingCache.filePath)}`);
        }

        return result.fail === 0 ? 0 : 1;
    } finally {
        await reporter.close();
    }
}

if (require.main === module) {
    main().then((code) => {
        process.exit(code);
    }).catch((error) => {
        console.error(error && error.stack || String(error));
        process.exit(1);
    });
}

module.exports = {
    ROOT,
    main,
};
