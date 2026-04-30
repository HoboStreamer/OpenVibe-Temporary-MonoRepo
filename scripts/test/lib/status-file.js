'use strict';

const fs = require('fs');
const path = require('path');

const { ensureDir } = require('./reporter');

const DEFAULT_STATUS_FILE = path.join('.cache', 'openvibe', 'test-runner', 'status.json');

function createStatusWriter(root, filePath = DEFAULT_STATUS_FILE) {
    const resolvedPath = path.resolve(root, filePath);
    ensureDir(path.dirname(resolvedPath));
    return {
        filePath: resolvedPath,
        write(snapshot) {
            fs.writeFileSync(resolvedPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
        },
    };
}

module.exports = {
    DEFAULT_STATUS_FILE,
    createStatusWriter,
};
