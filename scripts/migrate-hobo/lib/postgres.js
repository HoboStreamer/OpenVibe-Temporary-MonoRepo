'use strict';

// Postgres adapter for the OpenVibe migration tooling.
//
// The real `pg` driver is loaded lazily so unit tests can run without it.
// Tests can supply a mock client by passing `{ client }` to functions
// here. The adapter intentionally exposes a tiny API: query(), exec(), tx().

const fs = require('fs');
const path = require('path');

function loadPg() {
    try { return require('pg'); }
    catch (err) {
        const friendly = new Error(
            'pg driver not installed. Run `npm install pg` or pass a mock client to the loader.',
        );
        friendly.cause = err;
        throw friendly;
    }
}

function createClient({ databaseUrl, client }) {
    if (client) return { client, owned: false };
    if (!databaseUrl) {
        throw new Error('databaseUrl is required to create a Postgres client');
    }
    const { Client } = loadPg();
    const c = new Client({ connectionString: databaseUrl });
    return { client: c, owned: true };
}

async function withClient({ databaseUrl, client }, fn) {
    const { client: c, owned } = createClient({ databaseUrl, client });
    if (owned) await c.connect();
    try {
        return await fn(c);
    } finally {
        if (owned) {
            try { await c.end(); } catch { /* ignore */ }
        }
    }
}

async function applySchemaFile(client, filePath) {
    const sql = fs.readFileSync(filePath, 'utf8');
    await client.query(sql);
    return { file: filePath, applied: true };
}

async function applySchemaDirectory(client, dir) {
    const files = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    const applied = [];
    for (const f of files) {
        applied.push(await applySchemaFile(client, path.join(dir, f)));
    }
    return applied;
}

function buildUpsert(table, columns, conflictKeys) {
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const updates = columns
        .filter((c) => !conflictKeys.includes(c))
        .map((c) => `${c} = EXCLUDED.${c}`);
    const onConflict = updates.length
        ? `ON CONFLICT (${conflictKeys.join(', ')}) DO UPDATE SET ${updates.join(', ')}`
        : `ON CONFLICT (${conflictKeys.join(', ')}) DO NOTHING`;
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ${onConflict}`;
}

module.exports = {
    applySchemaDirectory,
    applySchemaFile,
    buildUpsert,
    createClient,
    loadPg,
    withClient,
};
