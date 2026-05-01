'use strict';

// Skill / XP math. Keep formulas deterministic and inexpensive so server tick
// can call them freely.
//
// Curve: xp(level) = round(60 * level^1.6). Matches a RuneScape-like feel
// without copying the canonical table. levelForXp inverts via binary search.

const MAX_LEVEL = 99;

function xpForLevel(level) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    if (lvl <= 1) return 0;
    return Math.round(60 * Math.pow(lvl, 1.6));
}

function levelForXp(xp) {
    const value = Math.max(0, Math.floor(Number(xp) || 0));
    let lo = 1;
    let hi = MAX_LEVEL;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi + 1) / 2);
        if (xpForLevel(mid) <= value) lo = mid; else hi = mid - 1;
    }
    return lo;
}

function xpRequiredForNext(xp) {
    const level = levelForXp(xp);
    if (level >= MAX_LEVEL) return 0;
    return xpForLevel(level + 1) - xp;
}

module.exports = { MAX_LEVEL, xpForLevel, levelForXp, xpRequiredForNext };
