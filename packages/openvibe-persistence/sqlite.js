'use strict';

const path = require('path');

function createSqliteAdapter(serviceName, env, options) {
    const runtimeEnv = env && typeof env === 'object' ? env : process.env;
    const opts = options || {};
    const sqlitePath = opts.sqlitePath
        || runtimeEnv.DB_PATH
        || path.resolve(process.cwd(), 'data', `${String(serviceName || 'openvibe-service')}.db`);

    return {
        kind: 'sqlite',
        service_name: String(serviceName || 'openvibe-service'),
        sqlite_path: sqlitePath,
        descriptor: opts.descriptor || null,
        options: opts.options || {},
    };
}

function describeSqliteBootstrap(sqlitePath) {
    return {
        ok: true,
        adapter: 'sqlite',
        sqlite_path: sqlitePath || '',
        local_bootstrap: true,
    };
}

module.exports = {
    createSqliteAdapter,
    describeSqliteBootstrap,
};
