export function length(v) { return Math.sqrt((v.x * v.x) + (v.y * v.y)); }
export function normalize(v) {
    const len = length(v) || 1;
    return { x: v.x / len, y: v.y / len };
}
export function lerp(a, b, t) {
    return a + ((b - a) * t);
}
export function lerpPoint(a, b, t) {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}
