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

console.log('staff: OK');
fs.rmSync(tmp, { recursive: true, force: true });
