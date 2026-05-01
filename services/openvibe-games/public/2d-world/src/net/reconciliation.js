import { applyPredictedInput } from './prediction.js';

export function reconcileLocalState(localState, authoritative, pendingInputs, bounds) {
    const next = Object.assign({}, authoritative);
    const keep = [];
    for (const input of pendingInputs) {
        if (input.seq <= authoritative.lastProcessedInputSeq) continue;
        keep.push(input);
        applyPredictedInput(next, input, input.dt, bounds);
    }
    return { state: next, pendingInputs: keep };
}
