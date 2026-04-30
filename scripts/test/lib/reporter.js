'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_LOG_FILE = path.join('.cache', 'openvibe', 'test-runner', 'latest.log');

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function createReporter(root, options = {}) {
    const logFile = options.logFile === false
        ? null
        : path.resolve(root, options.logFile || DEFAULT_LOG_FILE);
    const logStream = logFile
        ? (ensureDir(path.dirname(logFile)), fs.createWriteStream(logFile, { flags: 'w', encoding: 'utf8' }))
        : null;

    function writeLine(text, stream = process.stdout) {
        const line = text == null ? '' : String(text);
        stream.write(`${line}\n`);
        if (logStream) logStream.write(`${line}\n`);
    }

    return {
        logFile,
        line(text) {
            writeLine(text, process.stdout);
        },
        error(text) {
            writeLine(text, process.stderr);
        },
        close() {
            return new Promise((resolve, reject) => {
                if (!logStream) {
                    resolve();
                    return;
                }
                logStream.end((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        },
    };
}

module.exports = {
    DEFAULT_LOG_FILE,
    createReporter,
    ensureDir,
};
