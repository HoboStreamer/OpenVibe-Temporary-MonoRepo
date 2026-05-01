import { normalize } from '../engine/vector.js';

const BASE_SPEED = 180;
const SPRINT_MULTIPLIER = 1.6;
const STAMINA_DRAIN_PER_SECOND = 24;
const STAMINA_REGEN_PER_SECOND = 18;

function defaultHeldItem(state) {
    const equipment = state && state.equipment || {};
    switch (Number(state && state.quick_slot) || 1) {
    case 2: return equipment.axe || state.equip_axe || equipment.weapon || state.equip_weapon || 'hands';
    case 3: return equipment.pickaxe || state.equip_pickaxe || equipment.weapon || state.equip_weapon || 'hands';
    case 4: return equipment.rod || state.equip_rod || equipment.weapon || state.equip_weapon || 'hands';
    case 5: return 'hammer';
    default: return state && state.held_item || equipment.weapon || state.equip_weapon || equipment.axe || state.equip_axe || equipment.pickaxe || state.equip_pickaxe || 'hands';
    }
}

function movementVector(keys) {
    const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    return normalize({ x, y });
}

export function applyPredictedInput(state, input, dtMs, bounds = { x: 0, y: 0, w: 8192, h: 8192 }) {
    if (!state) return state;
    const now = Date.now();
    const dt = Math.max(0, Math.min(0.25, (dtMs || 0) / 1000));
    const dir = movementVector(input.keys || {});
    const sprinting = !!input.keys.sprint && state.stamina > 0;
    const speed = BASE_SPEED * (sprinting ? SPRINT_MULTIPLIER : 1);
    if (input.quickSlot != null) state.quick_slot = Number(input.quickSlot);
    state.x = Math.max(bounds.x, Math.min(bounds.x + bounds.w, state.x + (dir.x * speed * dt)));
    state.y = Math.max(bounds.y, Math.min(bounds.y + bounds.h, state.y + (dir.y * speed * dt)));
    state.vx = dir.x * speed;
    state.vy = dir.y * speed;
    state.moving = dir.x !== 0 || dir.y !== 0;
    state.sprinting = sprinting && state.moving;
    state.step_phase = Number(state.step_phase || 0) + (Math.sqrt((state.vx * state.vx) + (state.vy * state.vy)) * dt * (state.sprinting ? 0.055 : 0.04));
    if (input.aim) {
        state.aim_x = Number(input.aim.x) || state.x;
        state.aim_y = Number(input.aim.y) || state.y;
        if (Math.abs(state.aim_x - state.x) > 4) state.facing = state.aim_x >= state.x ? 1 : -1;
    } else if (dir.x !== 0) {
        state.facing = dir.x >= 0 ? 1 : -1;
    }

    if (!state.hold_until || now >= state.hold_until) {
        state.held_item = defaultHeldItem(state);
    }

    if (input.action === 'attack') {
        state.attack_anim_until = now + 240;
        state.held_item = state.equipment && state.equipment.weapon || state.equip_weapon || defaultHeldItem(state);
        state.hold_until = now + 420;
    } else if (input.action === 'build') {
        state.held_item = 'hammer';
        state.hold_until = now + 500;
    }

    if (sprinting && (dir.x || dir.y)) {
        state.stamina = Math.max(0, state.stamina - (STAMINA_DRAIN_PER_SECOND * dt));
    } else {
        state.stamina = Math.min(state.max_stamina || 100, state.stamina + (STAMINA_REGEN_PER_SECOND * dt));
    }
    return state;
}
