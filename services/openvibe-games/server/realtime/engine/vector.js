'use strict';

// 2D vector helpers — pure, allocation-free where convenient. Keep simple.

function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function scale(v, s) { return { x: v.x * s, y: v.y * s }; }
function dot(a, b) { return a.x * b.x + a.y * b.y; }
function lengthSq(v) { return v.x * v.x + v.y * v.y; }
function length(v) { return Math.sqrt(lengthSq(v)); }
function distanceSq(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
function distance(a, b) { return Math.sqrt(distanceSq(a, b)); }
function normalize(v) {
    const len = length(v);
    if (len <= 1e-9) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
}
function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}
function clampVector(v, min, max) {
    return { x: clamp(v.x, min.x, max.x), y: clamp(v.y, min.y, max.y) };
}

module.exports = {
    add, sub, scale, dot, lengthSq, length, distanceSq, distance, normalize, clamp, clampVector,
};
