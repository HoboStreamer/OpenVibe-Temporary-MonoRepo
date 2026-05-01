'use strict';

// Lightweight collision primitives used by the authoritative simulator.

function aabbContains(a, p) {
    return p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h;
}

function aabbIntersects(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function circleIntersects(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const r = a.r + b.r;
    return (dx * dx + dy * dy) <= (r * r);
}

function circleContainsPoint(c, p) {
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    return (dx * dx + dy * dy) <= (c.r * c.r);
}

function circleAabbIntersects(circle, aabb) {
    const cx = Math.max(aabb.x, Math.min(circle.x, aabb.x + aabb.w));
    const cy = Math.max(aabb.y, Math.min(circle.y, aabb.y + aabb.h));
    const dx = circle.x - cx;
    const dy = circle.y - cy;
    return (dx * dx + dy * dy) <= (circle.r * circle.r);
}

function withinRange(a, b, range) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return (dx * dx + dy * dy) <= (range * range);
}

module.exports = {
    aabbContains, aabbIntersects, circleIntersects, circleContainsPoint,
    circleAabbIntersects, withinRange,
};
