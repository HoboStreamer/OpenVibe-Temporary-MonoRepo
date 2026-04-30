'use strict';

const { spawnSync } = require('child_process');

const { toRepoPath } = require('./discovery');

function runGit(root, args) {
    const result = spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
    });

    return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        error: result.error || null,
    };
}

function collectLines(target, text) {
    for (const line of String(text || '').split(/\r?\n/)) {
        const normalized = toRepoPath(line.trim());
        if (normalized) target.add(normalized);
    }
}

function getChangedFiles(root, baseRef = 'HEAD') {
    const files = new Set();
    const messages = [];
    const effectiveBase = baseRef === true || baseRef === 'true' || baseRef == null
        ? 'HEAD'
        : String(baseRef);

    const diff = runGit(root, ['diff', '--name-only', effectiveBase, '--']);
    if (diff.error) {
        messages.push(diff.error.message || String(diff.error));
    } else if (diff.status === 0) {
        collectLines(files, diff.stdout);
    } else if (diff.stderr.trim()) {
        messages.push(diff.stderr.trim());
    }

    const untracked = runGit(root, ['ls-files', '--others', '--exclude-standard']);
    if (untracked.error) {
        messages.push(untracked.error.message || String(untracked.error));
    } else if (untracked.status === 0) {
        collectLines(files, untracked.stdout);
    } else if (untracked.stderr.trim()) {
        messages.push(untracked.stderr.trim());
    }

    return {
        baseRef: effectiveBase,
        files: Array.from(files).sort((left, right) => left.localeCompare(right)),
        error: messages.length ? messages.join('\n') : null,
    };
}

module.exports = {
    getChangedFiles,
};
