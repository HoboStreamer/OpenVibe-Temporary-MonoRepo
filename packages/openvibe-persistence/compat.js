'use strict';

const path = require('path');
const { Worker, MessageChannel, receiveMessageOnPort } = require('worker_threads');

const { readServiceDatabaseUrl } = require('@openvibe/sdk');
const { normalizeSchemaSql } = require('./sql-compat');

const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

function idleWait(ms) {
    Atomics.wait(WAIT_BUFFER, 0, 0, Math.max(1, ms || 10));
}

function reviveWorkerError(error) {
    const revived = new Error(error && error.message || 'Unknown Postgres compatibility error');
    if (error && error.stack) revived.stack = error.stack;
    return revived;
}

function createSyncRpcWorker(options) {
    const opts = Object.assign({ timeoutMs: 15000 }, options || {});
    const worker = new Worker(path.join(__dirname, 'pg-sync-worker.js'), {
        workerData: {
            serviceName: opts.serviceName,
            connectionString: opts.connectionString,
        },
    });
    const channel = new MessageChannel();
    const pending = new Map();
    let nextId = 0;

    function waitFor(id) {
        const deadline = Date.now() + opts.timeoutMs;
        for (;;) {
            const queued = pending.get(id);
            if (queued) {
                pending.delete(id);
                return queued;
            }
            const message = receiveMessageOnPort(channel.port1);
            if (message && message.message) {
                pending.set(message.message.id, message.message);
                continue;
            }
            if (Date.now() > deadline) {
                throw new Error(`[${opts.serviceName}] timed out waiting for Postgres compatibility worker response`);
            }
            idleWait(10);
        }
    }

    function call(command, payload) {
        const id = ++nextId;
        worker.postMessage({ id, command, payload });
        const response = waitFor(id);
        if (!response.ok) throw reviveWorkerError(response.error);
        return response.result;
    }

    const readyId = ++nextId;
    worker.postMessage({ id: readyId, command: 'connect', payload: { port: channel.port2 } }, [channel.port2]);
    const ready = waitFor(readyId);
    if (!ready.ok) throw reviveWorkerError(ready.error);

    return {
        call,
        terminate() {
            try { call('close', {}); } catch {}
            worker.terminate().catch(() => {});
        },
    };
}

class CompatStatement {
    constructor(database, sql) {
        this.database = database;
        this.sql = String(sql || '');
    }

    all(...values) {
        return this.database.__call('query', { sql: this.sql, values, mode: 'all' });
    }

    get(...values) {
        return this.database.__call('query', { sql: this.sql, values, mode: 'get' });
    }

    run(...values) {
        return this.database.__call('query', { sql: this.sql, values, mode: 'run' });
    }
}

class PostgresCompatDatabase {
    constructor(options) {
        const opts = Object.assign({}, options || {});
        this.serviceName = String(opts.serviceName || '').trim();
        if (!this.serviceName) throw new Error('serviceName is required');
        this.connectionString = String(opts.connectionString || readServiceDatabaseUrl(this.serviceName) || '').trim();
        if (!this.connectionString) throw new Error(`[${this.serviceName}] databaseUrl is required`);
        this.migrationsDir = opts.migrationsDir ? path.resolve(String(opts.migrationsDir)) : null;
        this.rpc = createSyncRpcWorker({
            serviceName: this.serviceName,
            connectionString: this.connectionString,
            timeoutMs: opts.timeoutMs || 20000,
        });
        this.ready = false;
        this.error = null;
        try {
            if (this.migrationsDir) {
                this.migrationStatus = this.rpc.call('migrate', { migrationsDir: this.migrationsDir });
            } else {
                this.migrationStatus = null;
            }
            this.ready = true;
        } catch (error) {
            this.error = error.message;
            throw error;
        }
    }

    __call(command, payload) {
        return this.rpc.call(command, payload);
    }

    prepare(sql) {
        return new CompatStatement(this, sql);
    }

    exec(sql) {
        const translated = normalizeSchemaSql(String(sql || ''));
        return this.__call('exec', { sql: translated });
    }

    pragma() {
        return null;
    }

    transaction(fn) {
        if (typeof fn !== 'function') throw new Error('transaction callback is required');
        const database = this;
        return function wrappedTransaction(...args) {
            database.__call('begin', {});
            try {
                const value = fn(...args);
                database.__call('commit', {});
                return value;
            } catch (error) {
                try {
                    database.__call('rollback', {});
                } catch {
                    // Prefer the original error.
                }
                throw error;
            }
        };
    }

    close() {
        this.rpc.terminate();
    }

    getStatus() {
        return {
            ready: this.ready,
            error: this.error,
            adapter: 'postgres',
            migrations: this.migrationStatus || null,
        };
    }
}

function createPostgresCompatDatabase(options) {
    return new PostgresCompatDatabase(options);
}

module.exports = {
    CompatStatement,
    PostgresCompatDatabase,
    createPostgresCompatDatabase,
};
