'use strict';

const crypto = require('crypto');
const fs = require('fs');

function sha256Buffer(buffer) {
    return crypto.createHash('sha256').update(buffer || Buffer.alloc(0)).digest('hex');
}

function sha256File(filePath) {
    const buffer = fs.readFileSync(filePath);
    return sha256Buffer(buffer);
}

function verifyChecksum(expected, actual) {
    if (!expected || !actual) return false;
    return String(expected).trim().toLowerCase() === String(actual).trim().toLowerCase();
}

module.exports = {
    sha256Buffer,
    sha256File,
    verifyChecksum,
};