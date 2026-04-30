'use strict';

function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '0ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;

    const totalSeconds = ms / 1000;
    if (totalSeconds < 60) {
        return `${totalSeconds.toFixed(totalSeconds < 10 ? 1 : 0)}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    if (minutes < 60) {
        return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${String(remainingMinutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function indentBlock(text) {
    return String(text || '')
        .split(/\r?\n/)
        .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
        .map((line) => `    ${line}`)
        .join('\n');
}

function toRepoDisplayPath(root, targetPath) {
    const path = require('path');
    return path.relative(root, targetPath).split(path.sep).join('/') || '.';
}

module.exports = {
    formatDuration,
    indentBlock,
    toRepoDisplayPath,
};
