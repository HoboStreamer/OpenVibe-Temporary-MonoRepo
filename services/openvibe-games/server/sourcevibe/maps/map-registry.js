'use strict';

class MapRegistry {
    constructor() {
        this.maps = new Map();
    }

    Register(descriptor = {}) {
        const id = String(descriptor.id || '').trim().toLowerCase();
        if (!id) throw new Error('map id required');
        const entry = Object.assign({}, descriptor, { id });
        this.maps.set(id, entry);
        return this.Get(id);
    }

    Get(id) {
        const entry = this.maps.get(String(id || '').trim().toLowerCase());
        return entry ? JSON.parse(JSON.stringify(entry)) : null;
    }

    List() {
        return Array.from(this.maps.values())
            .map((entry) => JSON.parse(JSON.stringify(entry)))
            .sort((a, b) => a.id.localeCompare(b.id));
    }
}

module.exports = {
    MapRegistry,
};
