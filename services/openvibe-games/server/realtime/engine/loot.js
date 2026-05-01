'use strict';

// Server-owned loot rolling. Entries:
//   { item_id, weight, min, max, chance? }
// chance: optional 0..1 independent gate evaluated before weighted selection.
// Returns array of { item_id, quantity }. Deterministic when seeded.

function mulberry32(seed) {
    let a = seed | 0;
    return function next() {
        a = (a + 0x6D2B79F5) | 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function rollLoot(entries, options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const rng = options.rng || (Number.isFinite(options.seed) ? mulberry32(options.seed) : Math.random);
    const rolls = Math.max(1, Math.floor(Number(options.rolls) || 1));
    const drops = new Map();

    const candidates = entries.filter((entry) => {
        if (!entry || typeof entry.item_id !== 'string') return false;
        if (entry.chance != null) return rng() <= Number(entry.chance);
        return true;
    });
    if (candidates.length === 0) return [];

    const totalWeight = candidates.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight) || 1), 0);
    if (totalWeight <= 0) return [];

    for (let r = 0; r < rolls; r += 1) {
        let pick = rng() * totalWeight;
        let chosen = candidates[0];
        for (const entry of candidates) {
            const weight = Math.max(0, Number(entry.weight) || 1);
            if (pick < weight) { chosen = entry; break; }
            pick -= weight;
        }
        const min = Math.max(1, Math.floor(Number(chosen.min) || 1));
        const max = Math.max(min, Math.floor(Number(chosen.max) || min));
        const qty = min + Math.floor(rng() * (max - min + 1));
        drops.set(chosen.item_id, (drops.get(chosen.item_id) || 0) + qty);
    }

    return Array.from(drops.entries()).map(([item_id, quantity]) => ({ item_id, quantity }));
}

module.exports = { rollLoot, mulberry32 };
