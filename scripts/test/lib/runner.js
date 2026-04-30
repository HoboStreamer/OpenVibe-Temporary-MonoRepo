'use strict';

const { spawn } = require('child_process');

const { formatDuration, indentBlock } = require('./format');
const { getHistoricalDurationMs } = require('./timings');

function runSingleTest(root, test) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const child = spawn(process.execPath, [test.absolutePath], {
            cwd: root,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });

        child.on('error', (error) => {
            stderr += `${error && error.stack || String(error)}\n`;
        });

        child.on('close', (code, signal) => {
            resolve({
                code: code == null ? 1 : code,
                signal: signal || null,
                stdout,
                stderr,
                durationMs: Date.now() - startedAt,
            });
        });
    });
}

function emitCapturedOutput(reporter, label, text, method = 'line') {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    reporter[method](`${label}:`);
    for (const line of indentBlock(trimmed).split('\n')) {
        reporter[method](line);
    }
}

function estimateRemainingMs(queue, active, cache, elapsedMs, completedCount, jobs) {
    const fallbackMs = completedCount > 0 ? elapsedMs / completedCount : 1000;
    const queuedWorkMs = queue.reduce((sum, test) => {
        return sum + (getHistoricalDurationMs(cache, test.relativePath) || fallbackMs);
    }, 0);
    const activeWorkMs = Array.from(active.values()).reduce((sum, activeTest) => {
        const historical = getHistoricalDurationMs(cache, activeTest.test.relativePath) || fallbackMs;
        const elapsed = Date.now() - activeTest.startedAt;
        return sum + Math.max(0, historical - elapsed);
    }, 0);
    return Math.max(0, Math.ceil((queuedWorkMs + activeWorkMs) / Math.max(1, jobs)));
}

async function runTests(root, tests, options = {}) {
    const jobs = Math.max(1, options.jobs || 1);
    const bail = !!options.bail;
    const verbose = !!options.verbose;
    const slowCount = Math.max(1, options.slowCount || 8);
    const reporter = options.reporter;
    const statusWriter = options.statusWriter || null;
    const timingCache = options.timingCache || null;
    const queue = tests.slice();
    const results = [];
    const active = new Map();
    const suiteStartedAt = Date.now();
    let pass = 0;
    let fail = 0;
    let startedCount = 0;
    let completedCount = 0;
    let aborted = false;

    function writeStatus() {
        if (!statusWriter) return;
        const elapsedMs = Date.now() - suiteStartedAt;
        statusWriter.write({
            started_at: new Date(suiteStartedAt).toISOString(),
            updated_at: new Date().toISOString(),
            total: tests.length,
            started: startedCount,
            completed: completedCount,
            pass,
            fail,
            jobs,
            bail,
            elapsed_ms: elapsedMs,
            eta_ms: estimateRemainingMs(queue, active, timingCache, elapsedMs, completedCount, jobs),
            queue_remaining: queue.map((test) => test.relativePath),
            active: Array.from(active.values()).map((entry) => ({
                worker_id: entry.workerId,
                relative_path: entry.test.relativePath,
                started_at: new Date(entry.startedAt).toISOString(),
                elapsed_ms: Date.now() - entry.startedAt,
            })),
        });
    }

    writeStatus();

    async function workerLoop(workerId) {
        while (queue.length) {
            if (aborted) return;
            const test = queue.shift();
            if (!test) return;

            startedCount += 1;
            active.set(test.relativePath, { workerId, test, startedAt: Date.now() });
            reporter.line(`[test ${startedCount}/${tests.length}] start ${test.relativePath} (worker ${workerId})`);
            writeStatus();

            const result = await runSingleTest(root, test);

            active.delete(test.relativePath);
            completedCount += 1;
            if (result.code === 0) pass += 1;
            else fail += 1;
            results.push(Object.assign({ rel: test.relativePath }, result));

            const elapsedMs = Date.now() - suiteStartedAt;
            const etaMs = estimateRemainingMs(queue, active, timingCache, elapsedMs, completedCount, jobs);
            const statusIcon = result.code === 0 ? '✓' : '✗';
            const statusLabel = result.code === 0 ? 'PASS' : 'FAIL';
            const signalSuffix = result.signal ? `, signal=${result.signal}` : '';
            reporter.line(
                `${statusIcon} [test ${completedCount}/${tests.length}] ${statusLabel} ${test.relativePath} `
                + `(${formatDuration(result.durationMs)}) | pass=${pass} fail=${fail} `
                + `| elapsed=${formatDuration(elapsedMs)} eta=${formatDuration(etaMs)}${signalSuffix}`,
            );

            if (result.code !== 0 || verbose) {
                emitCapturedOutput(reporter, `${test.relativePath} stdout`, result.stdout, 'line');
                emitCapturedOutput(reporter, `${test.relativePath} stderr`, result.stderr, 'error');
            }

            writeStatus();
            if (result.code !== 0 && bail) {
                aborted = true;
                return;
            }
        }
    }

    const workers = [];
    for (let workerId = 1; workerId <= jobs; workerId += 1) {
        workers.push(workerLoop(workerId));
    }
    await Promise.all(workers);

    const elapsedMs = Date.now() - suiteStartedAt;
    const slowest = results
        .slice()
        .sort((left, right) => right.durationMs - left.durationMs)
        .slice(0, slowCount);

    reporter.line(``);
    reporter.line(`[test] ${results.length} run, ${pass} pass, ${fail} fail, elapsed ${formatDuration(elapsedMs)}, jobs=${jobs}`);
    if (aborted && results.length < tests.length) {
        reporter.line(`[test] bail stopped scheduling after first failure; ${tests.length - results.length} files not started`);
    }
    if (slowest.length) {
        reporter.line('[test] slowest files:');
        for (const entry of slowest) {
            reporter.line(`  - ${entry.rel} (${formatDuration(entry.durationMs)})`);
        }
    }

    writeStatus();
    return {
        pass,
        fail,
        elapsedMs,
        aborted,
        results,
        slowest,
    };
}

module.exports = {
    runTests,
};
