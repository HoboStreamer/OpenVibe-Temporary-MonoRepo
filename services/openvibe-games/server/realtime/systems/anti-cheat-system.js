'use strict';

function validateInput(input) {
    if (!input || typeof input !== 'object') return { ok: false, reason: 'input payload required' };
    const seq = Number(input.seq);
    if (!Number.isFinite(seq) || seq < 0) return { ok: false, reason: 'seq must be a non-negative number' };
    const dt = input.dt == null ? 16 : Number(input.dt);
    if (!Number.isFinite(dt) || dt < 0 || dt > 250) return { ok: false, reason: 'dt must be between 0 and 250 ms' };
    return { ok: true, seq, dt };
}

module.exports = { validateInput };
