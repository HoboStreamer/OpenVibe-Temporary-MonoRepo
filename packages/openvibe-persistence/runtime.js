'use strict';

const {
    describePersistence,
    readServiceDatabaseUrl,
} = require('@openvibe/sdk');

const { createPostgresPool } = require('./postgres');
const { createRepositoryFactory } = require('./repository-factory');
const { createSqliteAdapter } = require('./sqlite');

function createRuntimePersistence(options) {
    const opts = options || {};
    const serviceName = String(opts.serviceName || '').trim();
    if (!serviceName) throw new Error('serviceName is required');

    const descriptor = describePersistence(serviceName, opts.sqlitePath || '', {
        postgresRuntimeImplemented: opts.postgresRuntimeImplemented,
    });

    const createSqlite = typeof opts.createSqlite === 'function'
        ? opts.createSqlite
        : ({ serviceName, sqlitePath, descriptor, options }) => createSqliteAdapter(serviceName, process.env, {
            sqlitePath,
            descriptor,
            options,
        });

    const createPostgres = typeof opts.createPostgres === 'function'
        ? opts.createPostgres
        : ({ serviceName, databaseUrl, descriptor, options }) => createPostgresPool({
            serviceName,
            connectionString: databaseUrl,
            role: 'primary',
            onTiming: options && options.onTiming,
        });

    if (descriptor.mode !== 'sqlite' && !descriptor.database_url_configured) {
        throw new Error(
            `[${serviceName}] persistence mode '${descriptor.mode}' requires OPENVIBE_DATABASE_URL or OPENVIBE_STAGING_DATABASE_URL.`,
        );
    }

    let adapterType = 'sqlite';
    let adapter = null;

    if (descriptor.mode !== 'sqlite' && descriptor.adapter_status === 'implemented') {
        const databaseUrl = readServiceDatabaseUrl(serviceName);
        adapterType = 'postgres';
        adapter = createPostgres({
            serviceName,
            databaseUrl,
            descriptor,
            sqlitePath: opts.sqlitePath || '',
            options: opts.adapterOptions || {},
        });
    } else {
        adapter = createSqlite({
            serviceName,
            sqlitePath: opts.sqlitePath || '',
            descriptor,
            options: opts.adapterOptions || {},
        });
    }

    const result = {
        adapterType,
        descriptor,
        adapter,
    };

    if (opts.repositories) {
        result.repositories = createRepositoryFactory({ adapter, repositories: opts.repositories });
    }

    return result;
}

function describeRuntimePersistence(options) {
    const opts = options || {};
    return describePersistence(opts.serviceName || '', opts.sqlitePath || '', {
        postgresRuntimeImplemented: opts.postgresRuntimeImplemented,
    });
}

module.exports = {
    createRuntimePersistence,
    describeRuntimePersistence,
};
