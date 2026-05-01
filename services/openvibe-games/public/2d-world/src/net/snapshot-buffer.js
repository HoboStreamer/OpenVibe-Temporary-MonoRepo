export class SnapshotBuffer {
    constructor(limit = 24) {
        this.limit = limit;
        this.buffers = new Map();
    }

    push(id, snapshot) {
        const list = this.buffers.get(id) || [];
        list.push(snapshot);
        while (list.length > this.limit) list.shift();
        this.buffers.set(id, list);
    }

    get(id) {
        return this.buffers.get(id) || [];
    }

    clearMissing(activeIds) {
        const set = new Set(activeIds || []);
        for (const key of this.buffers.keys()) {
            if (!set.has(key)) this.buffers.delete(key);
        }
    }
}
