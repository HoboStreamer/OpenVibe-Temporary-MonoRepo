'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const db = require('../server/db');
const staff = require('../server/api/staff');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-test-'));
const dbPath = path.join(tmp, 'staff.db');
db.init(dbPath);
staff.ensureTables();

assert.strictEqual(staff.getRole('u1'), 'user');
assert.strictEqual(staff.rankOf('admin'), 3);
assert.ok(staff.capabilitiesOf('admin').includes('admin_panel'));
assert.ok(!staff.capabilitiesOf('user').includes('admin_panel'));
assert.ok(staff.capabilitiesOf('global_mod').includes('moderate_global'));

staff.setRole({ userId: 'u1', role: 'admin', actor: { id: 'system', role: 'admin' } });
assert.strictEqual(staff.getRole('u1'), 'admin');

const audit = staff.recentAudit({ limit: 10 });
assert.ok(audit.length >= 1, 'audit recorded');
assert.strictEqual(audit[0].action, 'role.update');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-migration-status-'));
const auditRoot = path.join(tmpRoot, 'data', 'migrations', 'hobo-production-staging', 'openvibe-target', 'audit');
fs.mkdirSync(auditRoot, { recursive: true });
fs.writeFileSync(path.join(auditRoot, 'import-report.json'), JSON.stringify({ datasets: { 'identity/users': {}, 'live/channels': {} }, exclusions: [{ entity: 'users.hobo_bucks_balance' }] }), 'utf8');
fs.writeFileSync(path.join(auditRoot, 'staging-load-report.json'), JSON.stringify({ manual_actions: ['needs review'], datasets: { 'identity/users': {} }, dry_run: false, load_scope: 'staged-and-holding-only' }), 'utf8');
fs.writeFileSync(path.join(auditRoot, 'media-backfill-report.json'), JSON.stringify({ copied_records: 2, missing_files: [{ id: 1 }] }), 'utf8');
fs.writeFileSync(path.join(auditRoot, 'readiness-report.json'), JSON.stringify({ summary: { green: 1, yellow: 2, red: 0 } }), 'utf8');
fs.writeFileSync(path.join(tmpRoot, 'data', 'migrations', 'cutover-report.json'), JSON.stringify({ gate: 'yellow', summary: { green: 2, yellow: 1, red: 0 }, checks: [{ status: 'yellow' }] }), 'utf8');

const migration = staff.buildMigrationStatus(tmpRoot);
assert.strictEqual(migration.import.dataset_count, 2);
assert.strictEqual(migration.media.missing_files, 1);
assert.strictEqual(migration.cutover.gate, 'yellow');
assert.strictEqual(migration.artifacts.filter((artifact) => artifact.exists).length >= 4, true);

console.log('staff: OK');
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(tmpRoot, { recursive: true, force: true });
