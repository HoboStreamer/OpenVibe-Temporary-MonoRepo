'use strict';

const path = require('path');

const {
    describePersistence,
    readServiceDatabaseUrl,
} = require('@openvibe/sdk');

const { createSqliteContentStore } = require('./sqlite');
const { createPostgresContentStore } = require('./postgres');

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', '..', 'data', 'openvibe-content.db');
}

function createContentStore(config) {
    const sqlitePath = config && config.db && config.db.path
        ? String(config.db.path)
        : defaultSqlitePath();
    const descriptor = describePersistence('openvibe-content', sqlitePath, {
        postgresRuntimeImplemented: true,
    });

    if (descriptor.mode !== 'sqlite' && !descriptor.database_url_configured) {
        throw new Error(
            `[openvibe-content] persistence mode '${descriptor.mode}' requires OPENVIBE_DATABASE_URL or OPENVIBE_STAGING_DATABASE_URL.`,
        );
    }

    const store = descriptor.mode !== 'sqlite'
        ? createPostgresContentStore({
            databaseUrl: readServiceDatabaseUrl('openvibe-content'),
        })
        : createSqliteContentStore({ sqlitePath });

    return Object.assign(store, {
        descriptor,
        describePersistence() {
            return Object.assign({}, descriptor, {
                adapter: store.adapter,
                content_store_ready: !!(store.getStatus && store.getStatus().ready),
                content_store_error: store.getStatus && store.getStatus().error || null,
            });
        },
    });
}

module.exports = {
    createContentStore,
    defaultSqlitePath,
};
