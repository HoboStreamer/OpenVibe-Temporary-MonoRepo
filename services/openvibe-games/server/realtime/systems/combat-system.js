'use strict';

const { withinRange } = require('../engine/collision');
const { resolveRewind, rewindPosition } = require('../net/lag-compensation');

function defaultWeapon(player) {
    const weaponId = player.equip_weapon || 'fists';
    switch (weaponId) {
    case 'iron_sword': return { item_id: weaponId, damage: 10, range: 38, cooldown_ms: 650, projectile: false };
    case 'stone_spear': return { item_id: weaponId, damage: 7, range: 52, cooldown_ms: 800, projectile: false };
    case 'short_bow': return { item_id: weaponId, damage: 7, range: 220, cooldown_ms: 1000, projectile: true, projectile_speed: 360 };
    case 'wooden_club': return { item_id: weaponId, damage: 4, range: 28, cooldown_ms: 700, projectile: false };
    default: return { item_id: 'fists', damage: 2, range: 22, cooldown_ms: 500, projectile: false };
    }
}

function computeDamage(player, weapon) {
    const combatLevel = Math.max(1, Number(player.levels && player.levels.attack || 1));
    return Math.max(1, Math.round((weapon.damage || 1) + (combatLevel * 0.35)));
}

function canAttack(now, player, weapon) {
    return now >= (player.cooldowns && player.cooldowns.attack || 0) && player.dead !== true;
}

function markAttack(now, player, weapon) {
    player.cooldowns.attack = now + Math.max(100, Number(weapon.cooldown_ms) || 500);
}

function findRewoundTarget(now, input, candidates, histories, fallbackResolver) {
    const sentAt = Number(input && input.sent_at) || NaN;
    const rewindMs = resolveRewind(now, sentAt);
    const targetTime = now - rewindMs;
    const targetId = input && input.targetId ? String(input.targetId) : null;
    if (targetId) {
        const exact = candidates.find((entry) => entry.id === targetId);
        if (!exact) return null;
        const hist = histories.get(exact.id);
        return Object.assign({}, exact, rewindPosition(hist, targetTime, exact));
    }
    return typeof fallbackResolver === 'function' ? fallbackResolver(targetTime) : null;
}

function targetInRange(source, target, range) {
    return !!(source && target) && withinRange(source, target, range);
}

module.exports = {
    defaultWeapon,
    computeDamage,
    canAttack,
    markAttack,
    findRewoundTarget,
    targetInRange,
};
