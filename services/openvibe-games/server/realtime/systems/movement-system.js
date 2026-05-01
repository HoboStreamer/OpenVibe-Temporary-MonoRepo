'use strict';

const { normalize, scale, add, clampVector } = require('../engine/vector');

const BASE_SPEED = 180;
const SPRINT_MULTIPLIER = 1.6;
const STAMINA_DRAIN_PER_SECOND = 24;
const STAMINA_REGEN_PER_SECOND = 18;

function movementVector(keys) {
    const x = (keys && keys.right ? 1 : 0) - (keys && keys.left ? 1 : 0);
    const y = (keys && keys.down ? 1 : 0) - (keys && keys.up ? 1 : 0);
    return normalize({ x, y });
}

function updatePlayerMovement(player, dt, bounds) {
    const keys = player.input && player.input.keys || {};
    const dir = movementVector(keys);
    const sprinting = !!keys.sprint && player.stamina > 0;
    const speed = BASE_SPEED * (sprinting ? SPRINT_MULTIPLIER : 1);
    const delta = scale(dir, speed * dt);
    const next = clampVector(add(player, delta), { x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.w, y: bounds.y + bounds.h });
    player.vx = delta.x / Math.max(dt, 1e-6);
    player.vy = delta.y / Math.max(dt, 1e-6);
    player.x = next.x;
    player.y = next.y;
    player.moving = dir.x !== 0 || dir.y !== 0;
    player.sprinting = sprinting && player.moving;
    player.speed = speed;

    if (player.moving) {
        player.last_move_x = dir.x || player.last_move_x || 1;
        player.last_move_y = dir.y || 0;
        if (dir.x !== 0) player.facing = dir.x >= 0 ? 1 : -1;
    }

    if (player.input && player.input.aim) {
        player.aim_x = Number(player.input.aim.x) || player.x;
        player.aim_y = Number(player.input.aim.y) || player.y;
        if (Math.abs(player.aim_x - player.x) > 4) {
            player.facing = player.aim_x >= player.x ? 1 : -1;
        }
    } else {
        player.aim_x = player.x + ((player.facing || 1) * 72);
        player.aim_y = player.y;
    }

    player.step_phase = Number(player.step_phase || 0) + (Math.sqrt((player.vx * player.vx) + (player.vy * player.vy)) * dt * (player.sprinting ? 0.055 : 0.04));
    if (player.step_phase > Math.PI * 2000) player.step_phase = player.step_phase % (Math.PI * 2);

    if (sprinting && (dir.x !== 0 || dir.y !== 0)) {
        player.stamina = Math.max(0, player.stamina - (STAMINA_DRAIN_PER_SECOND * dt));
    } else {
        player.stamina = Math.min(player.max_stamina, player.stamina + (STAMINA_REGEN_PER_SECOND * dt));
    }
}

module.exports = {
    BASE_SPEED,
    SPRINT_MULTIPLIER,
    STAMINA_DRAIN_PER_SECOND,
    STAMINA_REGEN_PER_SECOND,
    movementVector,
    updatePlayerMovement,
};
