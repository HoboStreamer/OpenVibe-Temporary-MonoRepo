'use strict';

const { normalize, clampVector } = require('../engine/vector');

const BASE_SPEED = 180;
const SPRINT_MULTIPLIER = 1.6;
const STAMINA_DRAIN_PER_SECOND = 24;
const STAMINA_REGEN_PER_SECOND = 18;
const MOVE_ACCELERATION = 1350;
const TURN_ACCELERATION = 1650;
const STOP_DRAG = 10.5;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function approach(current, target, maxDelta) {
    if (current < target) return Math.min(target, current + maxDelta);
    if (current > target) return Math.max(target, current - maxDelta);
    return target;
}

function movementVector(keys) {
    const x = (keys && keys.right ? 1 : 0) - (keys && keys.left ? 1 : 0);
    const y = (keys && keys.down ? 1 : 0) - (keys && keys.up ? 1 : 0);
    return normalize({ x, y });
}

function updatePlayerMovement(player, dt, bounds) {
    const keys = player.input && player.input.keys || {};
    const dir = movementVector(keys);
    const wantsSprint = !!keys.sprint && player.stamina > 0;
    const targetSpeed = BASE_SPEED * (wantsSprint ? SPRINT_MULTIPLIER : 1);
    const targetVx = dir.x * targetSpeed;
    const targetVy = dir.y * targetSpeed;
    const currentVx = Number(player.vx) || 0;
    const currentVy = Number(player.vy) || 0;
    const turning = (targetVx !== 0 && Math.sign(currentVx) !== Math.sign(targetVx)) || (targetVy !== 0 && Math.sign(currentVy) !== Math.sign(targetVy));
    const acceleration = (turning ? TURN_ACCELERATION : MOVE_ACCELERATION) * dt;
    player.vx = dir.x || dir.y ? approach(currentVx, targetVx, acceleration) : currentVx * Math.exp(-STOP_DRAG * dt);
    player.vy = dir.x || dir.y ? approach(currentVy, targetVy, acceleration) : currentVy * Math.exp(-STOP_DRAG * dt);
    if (Math.abs(player.vx) < 1) player.vx = 0;
    if (Math.abs(player.vy) < 1) player.vy = 0;

    const unclamped = {
        x: Number(player.x) + (player.vx * dt),
        y: Number(player.y) + (player.vy * dt),
    };
    const next = clampVector(unclamped, { x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.w, y: bounds.y + bounds.h });
    if (next.x !== unclamped.x) player.vx = 0;
    if (next.y !== unclamped.y) player.vy = 0;
    player.x = next.x;
    player.y = next.y;
    player.speed = Math.hypot(player.vx, player.vy);
    player.moving = player.speed > 1;
    player.sprinting = wantsSprint && player.moving && player.speed > (BASE_SPEED * 1.1);

    if (player.moving) {
        player.last_move_x = dir.x || player.last_move_x || 1;
        player.last_move_y = dir.y || 0;
        if (Math.abs(player.vx) > 3) player.facing = player.vx >= 0 ? 1 : -1;
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

    player.step_phase = Number(player.step_phase || 0) + (player.speed * dt * (player.sprinting ? 0.055 : 0.04));
    if (player.step_phase > Math.PI * 2000) player.step_phase = player.step_phase % (Math.PI * 2);

    if (player.sprinting) {
        player.stamina = Math.max(0, player.stamina - (STAMINA_DRAIN_PER_SECOND * dt));
    } else {
        player.stamina = Math.min(Number(player.max_stamina) || 100, Number(player.stamina) + (STAMINA_REGEN_PER_SECOND * dt));
    }

    player.vx = clamp(player.vx, -(BASE_SPEED * SPRINT_MULTIPLIER), BASE_SPEED * SPRINT_MULTIPLIER);
    player.vy = clamp(player.vy, -(BASE_SPEED * SPRINT_MULTIPLIER), BASE_SPEED * SPRINT_MULTIPLIER);
}

module.exports = {
    BASE_SPEED,
    SPRINT_MULTIPLIER,
    STAMINA_DRAIN_PER_SECOND,
    STAMINA_REGEN_PER_SECOND,
    MOVE_ACCELERATION,
    TURN_ACCELERATION,
    STOP_DRAG,
    movementVector,
    updatePlayerMovement,
};
