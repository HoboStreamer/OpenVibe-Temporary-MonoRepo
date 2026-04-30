'use strict';

const fs = require('fs');
const path = require('path');

const Database = require('better-sqlite3');

const { describePersistence, readServiceDatabaseUrl, warnIfUnsupported } = require('@openvibe/sdk');

const { createPostgresCompatDatabase } = require('./compat');

function createLegacySqliteStore(options) {
    const opts = Object.assign({}, options || {});
    if (!opts.serviceName) throw new Error('serviceName is required');
    if (typeof opts.sqlitePath !== 'string' || !opts.sqlitePath.trim()) {
        throw new Error('sqlitePath is required');
    }

    let database = null;
    let descriptor = null;

    function init(sqlitePath) {
        const resolvedPath = path.resolve(String(sqlitePath || opts.sqlitePath));
        descriptor = warnIfUnsupported(opts.serviceName, resolvedPath, {
            postgresRuntimeImplemented: true,
        });
        const dir = path.dirname(resolvedPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const db = new Database(resolvedPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');

        const bootstrap = [];
        if (opts.schemaSql) bootstrap.push(opts.schemaSql);
        if (Array.isArray(opts.bootstrapSql)) bootstrap.push(...opts.bootstrapSql);
        else if (opts.bootstrapSql) bootstrap.push(opts.bootstrapSql);
        for (const sql of bootstrap) {
            if (sql) db.exec(sql);
        }

        if (typeof opts.afterInit === 'function') {
            opts.afterInit(db);
        }

        database = db;
        return db;
    }

    function get() {
        if (!database) {
            throw new Error(`${opts.serviceName} db not initialized — call db.init(path) first`);
        }
        return database;
    }

    function getStatus() {
        return {
            ready: !!database,
            error: null,
            adapter: 'sqlite',
        };
    }

    function describeActivePersistence() {
        return descriptor || { service: opts.serviceName, mode: 'sqlite', database_url_configured: false };
    }

    return {
        adapter: 'sqlite',
        init,
        get,
        getStatus,
        describePersistence: describeActivePersistence,
    };
}

function createLegacyPostgresStore(options) {
    const opts = Object.assign({}, options || {});
    const database = createPostgresCompatDatabase({
        serviceName: opts.serviceName,
        connectionString: opts.databaseUrl || readServiceDatabaseUrl(opts.serviceName),
        migrationsDir: opts.migrationsDir,
        timeoutMs: opts.timeoutMs,
    });

    return {
        adapter: 'postgres',
        init() {
            const bootstrap = [];
            if (opts.schemaSql) bootstrap.push(opts.schemaSql);
            if (Array.isArray(opts.bootstrapSql)) bootstrap.push(...opts.bootstrapSql);
            else if (opts.bootstrapSql) bootstrap.push(opts.bootstrapSql);
            for (const sql of bootstrap) {
                if (sql) database.exec(sql);
            }
            if (typeof opts.afterInit === 'function') {
                opts.afterInit(database);
            }
            return database;
        },
        get() {
            return database;
        },
        getStatus() {
            return database.getStatus();
        },
        describePersistence(baseDescriptor) {
            const status = database.getStatus();
            const migrations = status.migrations || {
                migrations_dir: opts.migrationsDir || null,
                migration_count: 0,
                applied_count: 0,
                pending_count: 0,
                latest_applied: null,
                latest_applied_at: null,
                latest_available: null,
                migration_source: 'schema_sql_fallback',
                has_checked_in_migrations: false,
            };
            return Object.assign({}, baseDescriptor || {}, {
                adapter: 'postgres',
                compat_runtime: true,
                compat_runtime_ready: !!status.ready,
                compat_runtime_error: status.error || null,
                compat_runtime_migrations: migrations,
                migration_source: migrations.migration_source || 'schema_sql_fallback',
                schema_sql_reconciled: !!(opts.schemaSql || opts.bootstrapSql),
            });
        },
    };
}

function createLegacyPersistenceRuntime(options) {
    const opts = Object.assign({}, options || {});
    if (!opts.serviceName) throw new Error('serviceName is required');
    if (typeof opts.defaultSqlitePath !== 'function') throw new Error('defaultSqlitePath() is required');
    if (!opts.sqlite) throw new Error('sqlite adapter is required');
    if (typeof opts.createPostgres !== 'function') throw new Error('createPostgres() is required');

    let activeStore = null;
    let descriptor = null;

    function currentDescriptor(dbPath) {
        const sqlitePath = dbPath || opts.defaultSqlitePath();
        return describePersistence(opts.serviceName, sqlitePath, {
            postgresRuntimeImplemented: true,
            bootstrap: opts.bootstrap || null,
        });
    }

    function init(dbPath) {
        const sqlitePath = dbPath ? String(dbPath) : opts.defaultSqlitePath();
        descriptor = currentDescriptor(sqlitePath);

        if (descriptor.mode !== 'sqlite') {
            if (!descriptor.database_url_configured) {
                throw new Error(
                    `[${opts.serviceName}] persistence mode '${descriptor.mode}' requires OPENVIBE_DATABASE_URL or OPENVIBE_STAGING_DATABASE_URL.`,
                );
            }
            activeStore = opts.createPostgres({
                databaseUrl: readServiceDatabaseUrl(opts.serviceName),
                descriptor,
                sqlitePath,
            });
            if (activeStore && typeof activeStore.init === 'function') {
                activeStore.init();
            }
            return activeStore && typeof activeStore.get === 'function'
                ? activeStore.get()
                : activeStore;
        }

        opts.sqlite.init(sqlitePath);
        activeStore = opts.sqlite;
        return activeStore.get();
    }

    function get() {
        if (!activeStore) {
            throw new Error(`${opts.serviceName} db not initialized — call db.init(path) first`);
        }
        return activeStore.get();
    }

    function describeActivePersistence() {
        const base = descriptor || currentDescriptor();
        if (!activeStore) return base;
        if (typeof activeStore.describePersistence === 'function' && activeStore !== opts.sqlite) {
            return activeStore.describePersistence(base);
        }
        if (typeof activeStore.getStatus === 'function') {
            const status = activeStore.getStatus();
            return Object.assign({}, base, {
                adapter: activeStore.adapter || base.effective_mode,
                runtime_ready: !!status.ready,
                runtime_error: status.error || null,
            });
        }
        return typeof activeStore.describePersistence === 'function'
            ? activeStore.describePersistence()
            : base;
    }

    return {
        init,
        get,
        describePersistence: describeActivePersistence,
    };
}

module.exports = {
    createLegacyPersistenceRuntime,
    createLegacySqliteStore,
    createLegacyPostgresStore,
};
