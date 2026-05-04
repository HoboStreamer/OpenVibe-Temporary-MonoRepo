'use strict';

const { parentPort, workerData } = require('worker_threads');

const { createPostgresPool, runMigrations } = require('./postgres');
const { splitSqlStatements, translateSqliteToPostgres, translateNamedParameters } = require('./sql-compat');

if (!parentPort) {
    throw new Error('pg-sync-worker must run in a worker thread');
}

const pool = createPostgresPool({
    serviceName: workerData && workerData.serviceName || 'openvibe-service',
    connectionString: workerData && workerData.connectionString,
    max: 1,
    allowExitOnIdle: true,
});

let replyPort = null;
let activeClient = null;
const savepointStack = [];

function send(id, ok, payload) {
    if (!replyPort) return;
    replyPort.postMessage(ok
        ? { id, ok: true, result: payload }
        : { id, ok: false, error: { message: payload && payload.message || String(payload), stack: payload && payload.stack || null } });
}

function currentQueryable() {
    return activeClient || pool;
}

function normalizeValue(value) {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(normalizeValue);
    if (value && typeof value === 'object') {
        const clone = {};
        for (const [key, entry] of Object.entries(value)) clone[key] = normalizeValue(entry);
        return clone;
    }
    return value;
}

function normalizeRow(row) {
    if (!row || typeof row !== 'object') return row;
    const clone = {};
    for (const [key, value] of Object.entries(row)) clone[key] = normalizeValue(value);
    return clone;
}

async function beginTransaction() {
    if (!activeClient) {
        activeClient = await pool.connect();
        await activeClient.query('SET search_path TO public');
        await activeClient.query('BEGIN');
        return { depth: 1 };
    }
    const savepoint = `ov_sync_sp_${savepointStack.length + 1}`;
    await activeClient.query(`SAVEPOINT ${savepoint}`);
    savepointStack.push(savepoint);
    return { depth: savepointStack.length + 1 };
}

async function commitTransaction() {
    if (!activeClient) return { depth: 0 };
    if (!savepointStack.length) {
        await activeClient.query('COMMIT');
        activeClient.release();
        activeClient = null;
        return { depth: 0 };
    }
    const savepoint = savepointStack.pop();
    await activeClient.query(`RELEASE SAVEPOINT ${savepoint}`);
    return { depth: savepointStack.length + 1 };
}

async function rollbackTransaction() {
    if (!activeClient) return { depth: 0 };
    if (!savepointStack.length) {
        await activeClient.query('ROLLBACK');
        activeClient.release();
        activeClient = null;
        return { depth: 0 };
    }
    const savepoint = savepointStack.pop();
    await activeClient.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await activeClient.query(`RELEASE SAVEPOINT ${savepoint}`);
    return { depth: savepointStack.length + 1 };
}

async function execStatements(sql) {
    const statements = splitSqlStatements(sql).map((entry) => translateSqliteToPostgres(entry, { mode: 'exec' })).filter(Boolean);
    let executed = 0;
    for (const statement of statements) {
        await currentQueryable().query(statement);
        executed += 1;
    }
    return { executed };
}

async function runPrepared(sql, values, mode) {
    let text = translateSqliteToPostgres(sql, { mode });
    if (!text) return mode === 'run' ? { changes: 0, lastInsertRowid: null } : (mode === 'get' ? undefined : []);
    // Handle SQLite named params: run({@key: val}) or run(@obj) style
    let positionalValues = Array.isArray(values) ? values : [];
    const namedObj = positionalValues.length === 1 && positionalValues[0] !== null && typeof positionalValues[0] === 'object' && !Array.isArray(positionalValues[0])
        ? positionalValues[0] : null;
    if (namedObj) {
        const named = translateNamedParameters(text, namedObj);
        if (named) { text = named.sql; positionalValues = named.values; }
    }
    const result = await currentQueryable().query(text, positionalValues);

    if (mode === 'get') {
        return normalizeRow(result.rows && result.rows[0]);
    }
    if (mode === 'all') {
        return (result.rows || []).map(normalizeRow);
    }
    if (mode === 'run') {
        const first = result.rows && result.rows[0] ? normalizeRow(result.rows[0]) : null;
        let lastInsertRowid = first && (first.rowid != null ? first.rowid : first.id);
        if (typeof lastInsertRowid === 'string' && /^-?\d+$/.test(lastInsertRowid)) {
            lastInsertRowid = Number(lastInsertRowid);
        }
        return {
            changes: typeof result.rowCount === 'number' ? result.rowCount : 0,
            lastInsertRowid: lastInsertRowid == null ? null : lastInsertRowid,
        };
    }
    return null;
}

parentPort.on('message', async (message) => {
    if (!message || typeof message !== 'object') return;
    const { id, command, payload } = message;
    try {
        if (command === 'connect') {
            replyPort = payload && payload.port || message.port || null;
            send(id, true, { ready: true, service: workerData && workerData.serviceName || 'openvibe-service' });
            return;
        }
        if (!replyPort) {
            throw new Error('reply port not initialized');
        }

        let result = null;
        if (command === 'migrate') {
            result = await runMigrations(workerData && workerData.serviceName || 'openvibe-service', {
                pool,
                migrationsDir: payload && payload.migrationsDir,
            });
        } else if (command === 'exec') {
            result = await execStatements(payload && payload.sql || '');
        } else if (command === 'query') {
            result = await runPrepared(payload && payload.sql || '', payload && payload.values || [], payload && payload.mode || 'all');
        } else if (command === 'begin') {
            result = await beginTransaction();
        } else if (command === 'commit') {
            result = await commitTransaction();
        } else if (command === 'rollback') {
            result = await rollbackTransaction();
        } else if (command === 'close') {
            if (activeClient) {
                await activeClient.query('ROLLBACK');
                activeClient.release();
                activeClient = null;
            }
            await pool.end();
            result = { closed: true };
        } else {
            throw new Error(`Unknown worker command: ${command}`);
        }
        send(id, true, result);
    } catch (error) {
        send(id, false, error);
    }
});
