'use strict';

const assert = require('assert');
const {
    gateFor,
    gateCheckFromArtifact,
    gateCheckFromMediaBackfillReport,
    gateCheckFromPostgresLoadReport,
    gateCheckFromStagingLoadReport,
    gateCheckFromValidationSummary,
} = require('../run-cutover-rehearsal');

assert.strictEqual(gateFor([]), 'yellow', 'empty checks => yellow');
assert.strictEqual(gateFor([{ name: 'a', status: 'pass', severity: 'green' }]), 'green');
assert.strictEqual(gateFor([{ name: 'a', status: 'yellow' }]), 'yellow');
assert.strictEqual(gateFor([{ name: 'a', status: 'red' }]), 'red');
assert.strictEqual(gateFor([
    { name: 'a', status: 'pass', severity: 'green' },
    { name: 'b', status: 'warn', severity: 'yellow' },
]), 'yellow');
assert.strictEqual(gateFor([
    { name: 'a', status: 'fail', severity: 'red' },
    { name: 'b', status: 'pass', severity: 'green' },
]), 'red');

assert.deepStrictEqual(
    gateCheckFromArtifact('browser_smoke_gate', { gate: 'green', summary: { green: 9, yellow: 0, red: 0 } }),
    { name: 'browser_smoke_gate', status: 'pass', severity: 'green', detail: { green: 9, yellow: 0, red: 0 } }
);
assert.deepStrictEqual(
    gateCheckFromArtifact('browser_smoke_gate', { gate: 'yellow', summary: { green: 7, yellow: 2, red: 0 } }),
    { name: 'browser_smoke_gate', status: 'warn', severity: 'yellow', detail: { green: 7, yellow: 2, red: 0 } }
);
assert.deepStrictEqual(
    gateCheckFromArtifact('browser_smoke_gate', null, { required: true, missingDetail: 'missing' }),
    { name: 'browser_smoke_gate', status: 'fail', severity: 'red', detail: 'missing' }
);
assert.deepStrictEqual(
    gateCheckFromArtifact('readiness_gate', { summary: { green: 4, yellow: 1, red: 0 } }),
    { name: 'readiness_gate', status: 'warn', severity: 'yellow', detail: { green: 4, yellow: 1, red: 0 } }
);
assert.deepStrictEqual(
    gateCheckFromValidationSummary('validation_summary_gate', {
        ok: false,
        mismatches: [{ type: 'missing-exclusion' }],
        duplicates: [],
        missing_refs: [{ row_id: 'x' }],
        exclusion_checks: [{ entity: 'transactions', present: false }],
    }),
    {
        name: 'validation_summary_gate',
        status: 'fail',
        severity: 'red',
        detail: { ok: false, mismatches: 1, duplicates: 0, missing_refs: 1, exclusion_failures: 1 },
    }
);
assert.deepStrictEqual(
    gateCheckFromStagingLoadReport('staging_load_gate', {
        dry_run: false,
        effective_mode: 'sqlite-staging',
        native_runtime_claim: false,
        manual_actions: ['rerun this step'],
        gates: {
            allow_staging_load_env: true,
            staging_confirm_env: true,
            confirm_load_flag: true,
        },
    }),
    {
        name: 'staging_load_gate',
        status: 'warn',
        severity: 'yellow',
        detail: {
            dry_run: false,
            effective_mode: 'sqlite-staging',
            native_runtime_claim: false,
            manual_actions: 1,
            missing_gate_flags: [],
            false_gate_flags: [],
        },
    }
);
assert.deepStrictEqual(
    gateCheckFromPostgresLoadReport('postgres_load_gate', {
        dry_run: true,
        datasets: {
            'identity/users': { status: 'planned' },
            'chat/messages': { status: 'missing' },
        },
        hobo_bucks_excluded: true,
        loyalty_imported_as_progression: true,
        manual_actions: [],
    }),
    {
        name: 'postgres_load_gate',
        status: 'warn',
        severity: 'yellow',
        detail: {
            dry_run: true,
            manual_actions: 0,
            loaded_datasets: 0,
            planned_datasets: 1,
            missing_datasets: 1,
            other_dataset_statuses: 0,
            hobo_bucks_excluded: true,
            loyalty_imported_as_progression: true,
        },
    }
);
assert.deepStrictEqual(
    gateCheckFromMediaBackfillReport('media_backfill_gate', {
        dry_run: false,
        copied_records: 12,
        missing_files: [{ media_id: 'm1' }],
        skipped_records: [],
    }),
    {
        name: 'media_backfill_gate',
        status: 'fail',
        severity: 'red',
        detail: { dry_run: false, copied_records: 12, missing_files: 1, skipped_records: 0 },
    }
);

console.log('cutover-rehearsal: OK');
