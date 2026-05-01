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

function sha256ReadableStream(readable) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        readable.on('data', (chunk) => hash.update(chunk));
        readable.on('end', () => resolve(hash.digest('hex')));
        readable.on('error', reject);
    });
}

function sha256FileAsync(filePath) {
    return sha256ReadableStream(fs.createReadStream(filePath));
}

function verifyChecksum(expected, actual) {
    if (!expected || !actual) return false;
    return String(expected).trim().toLowerCase() === String(actual).trim().toLowerCase();
}

module.exports = {
    sha256Buffer,
    sha256File,
    sha256FileAsync,
    sha256ReadableStream,
    verifyChecksum,
};