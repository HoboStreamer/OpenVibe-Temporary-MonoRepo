'use strict';

// Spatial hash for fast neighbour queries across the world. Cell size is the
// dominant interaction range (e.g. attack/aoi radius). Keys are computed with
// integer math so negative coordinates work the same as positive.

class SpatialHash {
    constructor(cellSize) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('SpatialHash: cellSize must be > 0');
        }
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    _key(cx, cy) { return `${cx}:${cy}`; }
    _cellOf(x, y) { return [Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)]; }

    insert(id, x, y) {
        const [cx, cy] = this._cellOf(x, y);
        const key = this._key(cx, cy);
        let bucket = this.cells.get(key);
        if (!bucket) { bucket = new Set(); this.cells.set(key, bucket); }
        bucket.add(id);
        return key;
    }

    remove(id, x, y) {
        const [cx, cy] = this._cellOf(x, y);
        const bucket = this.cells.get(this._key(cx, cy));
        if (bucket) {
            bucket.delete(id);
            if (bucket.size === 0) this.cells.delete(this._key(cx, cy));
        }
    }

    queryAabb(aabb) {
        const [cx0, cy0] = this._cellOf(aabb.x, aabb.y);
        const [cx1, cy1] = this._cellOf(aabb.x + aabb.w, aabb.y + aabb.h);
        const out = [];
        for (let cx = cx0; cx <= cx1; cx += 1) {
            for (let cy = cy0; cy <= cy1; cy += 1) {
                const bucket = this.cells.get(this._key(cx, cy));
                if (bucket) for (const id of bucket) out.push(id);
            }
        }
        return out;
    }

    queryRadius(x, y, r) {
        return this.queryAabb({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
    }

    clear() { this.cells.clear(); }
    size() {
        let total = 0;
        for (const bucket of this.cells.values()) total += bucket.size;
        return total;
    }
}

module.exports = { SpatialHash };
