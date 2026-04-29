'use strict';

const fs = require('fs');
const path = require('path');

const { Pool } = require('pg');

const {
    envPrefixForService,
    readServiceDatabaseUrl,
} = require('@openvibe/sdk');

const { ensureMigrationsTable, listAppliedMigrations, recordMigration } = require('./migrations');

const SHARED_READ_POOLS = new Map();

function asEnv(source) {
    return source && typeof source === 'object' ? source : process.env;
}

function sanitizeIsolationLevel(value) {
    const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const allowed = new Set(['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']);
    if (!normalized) return null;
    if (!allowed.has(normalized)) {
        throw new Error(`Unsupported isolation level: ${value}`);
    }
    return normalized;
}

function normalizeServicePoolOptions(serviceNameOrOptions, env) {
    if (typeof serviceNameOrOptions === 'string') {
        const serviceName = String(serviceNameOrOptions).trim();
        const runtimeEnv = asEnv(env);
        const envPrefix = envPrefixForService(serviceName);
        const connectionString = runtimeEnv[`${envPrefix}_DATABASE_URL`]
            || readServiceDatabaseUrl(serviceName)
            || runtimeEnv.OPENVIBE_DATABASE_URL
            || runtimeEnv.OPENVIBE_STAGING_DATABASE_URL
            || '';
        const readConnectionString = runtimeEnv[`${envPrefix}_READ_DATABASE_URL`]
            || runtimeEnv.OPENVIBE_READ_DATABASE_URL
            || runtimeEnv.OPENVIBE_REPLICA_DATABASE_URL
            || '';
        return {
            serviceName,
            env: runtimeEnv,
            connectionString,
            readConnectionString,
            applicationName: serviceName,
        };
    }

    const opts = Object.assign({}, serviceNameOrOptions || {});
    const runtimeEnv = asEnv(env || opts.env);
    return {
        serviceName: String(opts.serviceName || opts.applicationName || 'openvibe-service').trim(),
        env: runtimeEnv,
        connectionString: opts.connectionString || opts.databaseUrl || '',
        readConnectionString: opts.readConnectionString || opts.readDatabaseUrl || '',
        applicationName: opts.applicationName || opts.serviceName || 'openvibe-service',
        max: opts.max,
        idleTimeoutMillis: opts.idleTimeoutMillis,
        connectionTimeoutMillis: opts.connectionTimeoutMillis,
        statementTimeoutMillis: opts.statementTimeoutMillis,
        ssl: opts.ssl,
        allowExitOnIdle: opts.allowExitOnIdle,
        role: opts.role,
        onTiming: opts.onTiming,
    };
}

function resolveConnectionString(options, role) {
    if (role === 'read') {
        return options.readConnectionString || options.connectionString || '';
    }
    return options.connectionString || '';
}

function annotatePool(pool, options, role) {
    if (!pool) return pool;
    Object.defineProperty(pool, '__openvibe', {
        value: {
            serviceName: options.serviceName,
            role,
            onTiming: options.onTiming || null,
            applicationName: options.applicationName || options.serviceName,
        },
        configurable: true,
        enumerable: false,
        writable: true,
    });
    return pool;
}

function resolveMigrationsDir(serviceName, options) {
    const opts = options || {};
    if (opts.migrationsDir) return path.resolve(String(opts.migrationsDir));

    const baseDirs = [
        opts.baseDir,
        process.cwd(),
    ].filter(Boolean).map((value) => path.resolve(String(value)));

    const candidates = [];
    for (const baseDir of baseDirs) {
        if (serviceName) {
            candidates.push(path.join(baseDir, 'services', serviceName, 'server', 'migrations'));
            candidates.push(path.join(baseDir, 'services', serviceName, 'migrations'));
        }
        candidates.push(path.join(baseDir, 'migrations'));
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    return candidates[0] || path.resolve(process.cwd(), 'migrations');
}

function listSqlMigrationFiles(migrationsDir) {
    if (!migrationsDir || !fs.existsSync(migrationsDir)) return [];
    return fs.readdirSync(migrationsDir)
        .filter((entry) => entry.endsWith('.sql'))
        .sort((left, right) => left.localeCompare(right))
        .map((entry) => ({
            name: entry,
            filePath: path.join(migrationsDir, entry),
        }));
}

function resolveQueryable(target) {
    if (!target || typeof target.query !== 'function') {
        throw new Error('A pg client or pool with a query() method is required');
    }
    return target;
}

function resolveTimingCallback(target, options) {
    return (options && options.onTiming)
        || (target && target.__openvibe && target.__openvibe.onTiming)
        || null;
}

function createPostgresPool(options) {
    const opts = normalizeServicePoolOptions(options);
    const connectionString = resolveConnectionString(opts, opts.role || 'primary');
    if (!connectionString) throw new Error('connectionString is required');

    const pool = new Pool({
        connectionString,
        max: opts.max || 10,
        idleTimeoutMillis: opts.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: opts.connectionTimeoutMillis || 5000,
        statement_timeout: opts.statementTimeoutMillis || 10000,
        application_name: opts.applicationName || opts.serviceName || 'openvibe-service',
        ssl: opts.ssl === undefined ? undefined : opts.ssl,
        allowExitOnIdle: !!opts.allowExitOnIdle,
    });

    pool.on('error', (error) => {
        console.warn(`[postgres:${opts.applicationName || opts.serviceName}] ${error.message}`);
    });

    return annotatePool(pool, opts, opts.role || 'primary');
}

function getSharedReadPool(serviceName, env, options) {
    const opts = Object.assign({}, normalizeServicePoolOptions(serviceName, env), options || {});
    const connectionString = resolveConnectionString(opts, 'read');
    if (!connectionString) {
        return opts.connectionString && opts.fallbackToPrimary !== false
            ? createPostgresPool(Object.assign({}, opts, { role: 'primary' }))
            : null;
    }

    const key = `${opts.serviceName}:${connectionString}`;
    if (!SHARED_READ_POOLS.has(key)) {
        SHARED_READ_POOLS.set(key, createPostgresPool(Object.assign({}, opts, {
            connectionString,
            role: 'read',
        })));
    }
    return SHARED_READ_POOLS.get(key);
}

async function query(queryable, text, values, options) {
    const target = resolveQueryable(queryable);
    const started = process.hrtime.bigint();
    const result = await target.query(text, values);
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const onTiming = resolveTimingCallback(target, options);
    if (typeof onTiming === 'function') {
        onTiming({
            text,
            values: Array.isArray(values) ? values : [],
            duration_ms: Number(durationMs.toFixed(3)),
            row_count: typeof result.rowCount === 'number' ? result.rowCount : (result.rows || []).length,
            service_name: target && target.__openvibe ? target.__openvibe.serviceName : null,
            role: target && target.__openvibe ? target.__openvibe.role : null,
        });
    }
    return Object.assign({}, result, {
        duration_ms: Number(durationMs.toFixed(3)),
    });
}

async function withTransaction(poolOrClient, fn, options) {
    if (typeof fn !== 'function') throw new Error('transaction callback is required');

    const isolationLevel = sanitizeIsolationLevel(options && options.isolationLevel);
    const readOnly = !!(options && options.readOnly);
    const ownsClient = !!(poolOrClient && typeof poolOrClient.connect === 'function');
    const client = ownsClient ? await poolOrClient.connect() : resolveQueryable(poolOrClient);

    try {
        if (isolationLevel) {
            await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
        } else {
            await client.query('BEGIN');
        }
        if (readOnly) {
            await client.query('SET TRANSACTION READ ONLY');
        }
        const value = await fn(client);
        await client.query('COMMIT');
        return value;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // Prefer the original failure; rollback errors are just rude echoes.
        }
        throw error;
    } finally {
        if (ownsClient && client && typeof client.release === 'function') {
            client.release();
        }
    }
}

async function readReplicaQuery(text, values, options) {
    const opts = options || {};
    const pool = opts.pool
        || getSharedReadPool(opts.serviceName || 'openvibe-service', opts.env, opts);
    if (!pool) throw new Error('No read replica or primary pool is configured');
    return query(pool, text, values, opts);
}

async function healthCheck(poolOrOptions, options) {
    const opts = options || {};
    const source = poolOrOptions && typeof poolOrOptions.query === 'function'
        ? { pool: poolOrOptions }
        : (poolOrOptions || {});
    const pool = source.pool || source.client || null;
    const mode = String(source.mode || opts.mode || 'read').trim().toLowerCase();
    const configured = !!(pool || source.connectionString || source.databaseUrl || source.configured);

    if (mode === 'headonly') {
        return {
            ok: configured,
            mode: 'headOnly',
            configured,
            checked_at: new Date().toISOString(),
        };
    }

    if (!pool) {
        return {
            ok: false,
            mode,
            configured: false,
            checked_at: new Date().toISOString(),
            error: 'database pool not configured',
        };
    }

    const started = Date.now();
    const result = await query(pool, `
        SELECT
            current_database() AS database_name,
            now() AS checked_at,
            current_setting('transaction_read_only', true) AS transaction_read_only,
            pg_is_in_recovery() AS in_recovery
    `, []);
    const row = result.rows && result.rows[0] ? result.rows[0] : {};
    const canWrite = row.transaction_read_only !== 'on' && row.in_recovery !== true;
    const ok = mode === 'write' ? canWrite : true;

    return {
        ok,
        mode,
        configured: true,
        latency_ms: Date.now() - started,
        database: row.database_name || null,
        checked_at: row.checked_at || new Date().toISOString(),
        read_only: row.transaction_read_only === 'on',
        in_recovery: row.in_recovery === true,
    };
}

async function runMigrations(serviceName, options) {
    const opts = options || {};
    const pool = opts.pool || createPostgresPool(serviceName, opts.env || process.env);
    const ownsPool = !opts.pool;
    const migrationsDir = resolveMigrationsDir(serviceName, opts);
    const files = listSqlMigrationFiles(migrationsDir);
    const appliedNames = [];

    try {
        await withTransaction(pool, async (client) => {
            await ensureMigrationsTable(client, opts.migrationsTable);
            const applied = await listAppliedMigrations(client, opts.migrationsTable);
            const seen = new Set(applied.map((row) => row.name));

            for (const file of files) {
                if (seen.has(file.name)) continue;
                const sql = fs.readFileSync(file.filePath, 'utf8');
                if (!sql.trim()) continue;
                await client.query(sql);
                await recordMigration(client, file.name, opts.migrationsTable);
                appliedNames.push(file.name);
            }
        }, { isolationLevel: opts.isolationLevel || 'READ COMMITTED' });

        const version = await getSchemaVersion(serviceName, Object.assign({}, opts, { pool, migrationsDir }));
        return Object.assign({}, version, {
            applied_names: appliedNames,
        });
    } finally {
        if (ownsPool && pool && typeof pool.end === 'function') {
            await pool.end();
        }
    }
}

async function getSchemaVersion(serviceName, options) {
    const opts = options || {};
    const pool = opts.pool || createPostgresPool(serviceName, opts.env || process.env);
    const ownsPool = !opts.pool;
    const migrationsDir = resolveMigrationsDir(serviceName, opts);
    const files = listSqlMigrationFiles(migrationsDir);

    try {
        await ensureMigrationsTable(pool, opts.migrationsTable);
        const applied = await listAppliedMigrations(pool, opts.migrationsTable);
        const appliedNames = new Set(applied.map((row) => row.name));
        const last = applied.length ? applied[applied.length - 1] : null;
        return {
            service: serviceName || null,
            migrations_dir: migrationsDir,
            migration_count: files.length,
            applied_count: applied.length,
            pending_count: files.filter((file) => !appliedNames.has(file.name)).length,
            latest_applied: last ? last.name : null,
            latest_applied_at: last ? last.applied_at : null,
            latest_available: files.length ? files[files.length - 1].name : null,
        };
    } finally {
        if (ownsPool && pool && typeof pool.end === 'function') {
            await pool.end();
        }
    }
}

async function assertSchemaReady(serviceName, options) {
    const version = await getSchemaVersion(serviceName, options);
    const expectedVersion = options && options.expectedVersion;

    if (expectedVersion && version.latest_applied !== expectedVersion) {
        throw new Error(`[${serviceName}] expected schema version ${expectedVersion}, got ${version.latest_applied || 'none'}`);
    }

    if (version.pending_count > 0) {
        throw new Error(`[${serviceName}] schema has ${version.pending_count} pending migrations in ${version.migrations_dir}`);
    }

    return version;
}

async function checkPostgresPool(pool) {
    return healthCheck(pool, { mode: 'read' });
}

module.exports = {
    assertSchemaReady,
    checkPostgresPool,
    createPostgresPool,
    getSchemaVersion,
    healthCheck,
    query,
    readReplicaQuery,
    runMigrations,
    withTransaction,
};
