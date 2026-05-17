'use strict';

// Periodically delete tmp files older than retention window.

const fs = require('fs');
const path = require('path');
const config = require('./config');

let timer = null;

function sweepOnce() {
    const now = Date.now();
    let deleted = 0;
    try {
        const files = fs.readdirSync(config.tmpDir);
        for (const f of files) {
            const fp = path.join(config.tmpDir, f);
            try {
                const stat = fs.statSync(fp);
                if (now - stat.mtimeMs > config.retentionMs) {
                    fs.unlinkSync(fp);
                    deleted++;
                }
            } catch (_) {}
        }
    } catch (_) {}
    if (deleted > 0) console.log(`[retention] swept ${deleted} tmp file(s)`);
}

function start() {
    if (timer) return;
    sweepOnce();
    timer = setInterval(sweepOnce, Math.max(60_000, config.retentionMs / 4));
    timer.unref();
}

function stop() {
    if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, sweepOnce };
