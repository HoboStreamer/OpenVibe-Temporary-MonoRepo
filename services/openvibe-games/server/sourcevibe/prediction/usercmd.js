'use strict';

const BUTTONS = Object.freeze({
    ATTACK: 1 << 0,
    USE: 1 << 1,
    JUMP: 1 << 2,
    SPRINT: 1 << 3,
    DUCK: 1 << 4,
    RELOAD: 1 << 5,
});

function normalizeButtons(input = {}) {
    let bits = 0;
    if (input.attack || input.primaryAttack || input.buttons && input.buttons.attack) bits |= BUTTONS.ATTACK;
    if (input.interact || input.use || input.buttons && input.buttons.use) bits |= BUTTONS.USE;
    if (input.jump || input.buttons && input.buttons.jump) bits |= BUTTONS.JUMP;
    if (input.sprint || input.buttons && input.buttons.sprint) bits |= BUTTONS.SPRINT;
    if (input.duck || input.buttons && input.buttons.duck) bits |= BUTTONS.DUCK;
    if (input.reload || input.buttons && input.buttons.reload) bits |= BUTTONS.RELOAD;
    return bits;
}

function normalizeUserCmd(input = {}, fallbackSequence = 0) {
    return {
        seq: Number.isInteger(input.seq) ? input.seq : Number.isInteger(input.sequence) ? input.sequence : fallbackSequence,
        dt: Math.max(0, Number(input.dt) || Number(input.msec) / 1000 || 0),
        buttons: normalizeButtons(input),
        move: {
            x: Number(input.moveX != null ? input.moveX : input.move && input.move.x) || 0,
            y: Number(input.moveY != null ? input.moveY : input.move && input.move.y) || 0,
        },
        view: {
            x: Number(input.viewX != null ? input.viewX : input.view && input.view.x) || 0,
            y: Number(input.viewY != null ? input.viewY : input.view && input.view.y) || 0,
        },
        selectedSlot: Number(input.quickSlot != null ? input.quickSlot : input.selectedSlot) || 0,
        timestampMs: Number(input.timestampMs || input.clientTime || Date.now()) || Date.now(),
        raw: input,
    };
}

module.exports = {
    BUTTONS,
    normalizeUserCmd,
};
