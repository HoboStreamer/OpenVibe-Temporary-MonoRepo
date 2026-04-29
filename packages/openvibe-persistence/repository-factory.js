'use strict';

const { createSqliteAdapter } = require('./sqlite');

function normalizeFactoryOptions(serviceNameOrOptions, env) {
    if (typeof serviceNameOrOptions === 'string') {
        return {
            adapter: createSqliteAdapter(serviceNameOrOptions, env),
            repositories: {},
        };
    }
    return Object.assign({ repositories: {} }, serviceNameOrOptions || {});
}

function createRepositoryFactory(serviceNameOrOptions, env) {
    const options = normalizeFactoryOptions(serviceNameOrOptions, env);
    const adapter = options.adapter;
    const repositories = Object.assign({}, options.repositories || {});

    return {
        adapter,
        register(name, builder) {
            const key = String(name || '').trim();
            if (!key) throw new Error('repository name is required');
            if (typeof builder !== 'function') throw new Error(`Repository builder for ${key} must be a function`);
            repositories[key] = builder;
            return this;
        },
        create(name, adapterOverride) {
            const key = String(name || '').trim();
            if (!repositories[key]) throw new Error(`Unknown repository: ${key}`);
            return repositories[key](adapterOverride || adapter);
        },
        get(name) {
            return this.create(name);
        },
        has(name) {
            return !!repositories[String(name || '').trim()];
        },
        list() {
            return Object.keys(repositories).sort();
        },
    };
}

module.exports = {
    createRepositoryFactory,
};
