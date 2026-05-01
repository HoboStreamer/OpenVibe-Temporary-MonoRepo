'use strict';

function createFixedTicker({ tickRate, onTick }) {
    const rate = Math.max(1, Number(tickRate) || 20);
    const intervalMs = Math.round(1000 / rate);
    let timer = null;
    let lastAt = 0;

    function start() {
        if (timer) return;
        lastAt = Date.now();
        timer = setInterval(() => {
            const now = Date.now();
            const dt = Math.min(0.25, (now - lastAt) / 1000);
            lastAt = now;
            onTick(dt, now);
        }, intervalMs);
        if (typeof timer.unref === 'function') timer.unref();
    }

    function stop() {
        if (!timer) return;
        clearInterval(timer);
        timer = null;
    }

    return { tickRate: rate, intervalMs, start, stop };
}

module.exports = { createFixedTicker };
