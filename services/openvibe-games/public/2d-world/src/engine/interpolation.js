import { lerp, lerpPoint } from './vector.js';

export function interpolateEntity(buffer, renderTime) {
    if (!buffer || buffer.length === 0) return null;
    if (buffer.length === 1) return buffer[0];
    if (renderTime <= buffer[0].server_time) return buffer[0];
    let previous = buffer[0];
    let next = buffer[buffer.length - 1];
    for (let index = 0; index < buffer.length - 1; index += 1) {
        const current = buffer[index];
        const candidate = buffer[index + 1];
        if (current.server_time <= renderTime && candidate.server_time >= renderTime) {
            previous = current;
            next = candidate;
            break;
        }
    }
    if (renderTime >= next.server_time) {
        const dt = Math.max(0, Math.min(0.12, (renderTime - next.server_time) / 1000));
        return Object.assign({}, next, {
            x: next.x + ((next.vx || 0) * dt),
            y: next.y + ((next.vy || 0) * dt),
        });
    }
    const span = Math.max(1, next.server_time - previous.server_time);
    const t = Math.max(0, Math.min(1, (renderTime - previous.server_time) / span));
    const point = lerpPoint(previous, next, t);
    return Object.assign({}, previous, next, point, {
        vx: lerp(previous.vx || 0, next.vx || 0, t),
        vy: lerp(previous.vy || 0, next.vy || 0, t),
        step_phase: lerp(previous.step_phase || 0, next.step_phase || 0, t),
    });
}
