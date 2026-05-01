'use strict';

class ReplayBuffer {
    constructor(limit = 128) {
        this.limit = Math.max(8, Number(limit) || 128);
        this.entries = [];
    }

    push(entry) {
        this.entries.push(entry);
        if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
        return entry;
    }

    since(sequence) {
        return this.entries.filter((entry) => Number(entry.seq) >= Number(sequence));
    }

    latest() {
        return this.entries.length ? this.entries[this.entries.length - 1] : null;
    }

    all() {
        return this.entries.slice();
    }
}

module.exports = {
    ReplayBuffer,
};
