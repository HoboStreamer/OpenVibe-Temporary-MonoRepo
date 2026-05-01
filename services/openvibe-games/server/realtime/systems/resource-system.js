'use strict';

function applyGatherDamage(node, amount) {
    node.hp = Math.max(0, node.hp - Math.max(1, Number(amount) || 1));
    if (node.hp === 0 && !node.respawn_at) {
        node.depleted_at = Date.now();
        node.respawn_at = node.depleted_at + ((Number(node.respawn_ms) || 15000));
    }
    return node.hp;
}

function maybeRespawn(node, now) {
    if (!node.respawn_at || now < node.respawn_at) return false;
    node.hp = node.max_hp;
    node.respawn_at = null;
    node.depleted_at = null;
    return true;
}

module.exports = { applyGatherDamage, maybeRespawn };
