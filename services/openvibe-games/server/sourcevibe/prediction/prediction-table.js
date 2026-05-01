'use strict';

class PredictionTable {
    constructor() {
        this.tables = new Map();
    }

    Define(entityClass, field, options = {}) {
        const key = String(entityClass || '').trim().toLowerCase();
        if (!key) throw new Error('entityClass required');
        if (!this.tables.has(key)) this.tables.set(key, new Map());
        this.tables.get(key).set(String(field), Object.assign({ field }, options));
        return this.List(key);
    }

    Get(entityClass, field) {
        const table = this.tables.get(String(entityClass || '').trim().toLowerCase());
        const entry = table && table.get(String(field));
        return entry ? Object.assign({}, entry) : null;
    }

    List(entityClass) {
        const table = this.tables.get(String(entityClass || '').trim().toLowerCase());
        return table ? Array.from(table.values()).map((entry) => Object.assign({}, entry)) : [];
    }
}

module.exports = {
    PredictionTable,
};
