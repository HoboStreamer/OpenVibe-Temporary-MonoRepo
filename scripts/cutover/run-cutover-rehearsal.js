#!/usr/bin/env node
'use strict';

// scripts/cutover/run-cutover-rehearsal.js
//
// Phase 8 cutover rehearsal orchestrator.
// Sequences:
//   1. Hobo reference audit (read-only).
//   2. Staging cutover rehearsal (export → import → validate → load → backfill → readiness).
//   3. Aggregate the produced artifacts into data/migrations/cutover-report.json
//      with red/yellow/green gates for the operator.
//
// The actual heavy-lifting scripts already live under scripts/migrate-hobo/. This
// file is the single entry point referenced by docs/openvibe/cutover-runbook.md
// and the Phase 8 readiness gates.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'migrations');
const AUDIT_DIR = path.join(OUT_DIR, 'audit');
const STAGING_DIR = path.join(OUT_DIR, 'hobo-production-staging');
const STAGING_AUDIT = path.join(STAGING_DIR, 'openvibe-target', 'audit');

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const eq = a.indexOf('=');
        const key = (eq === -1 ? a.slice(2) : a.slice(2, eq)).replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
        const val = eq === -1 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true) : a.slice(eq + 1);
        out[key] = val;
    }
    return out;
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function readJsonOrNull(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function runStep(name, cmd, args, opts = {}) {
    process.stdout.write(`\n▶ ${name}\n  $ ${cmd} ${args.join(' ')}\n`);
    const res = spawnSync(cmd, args, { stdio: opts.silent ? 'pipe' : 'inherit', cwd: ROOT });
    return { name, cmd, args, status: res.status, ok: res.status === 0 };
}

function gateFor(checks) {
    if (!checks || !checks.length) return 'yellow';
    let red = false, yellow = false;
    for (const c of checks) {
        if (c.severity === 'red' || c.status === 'fail' || c.status === 'error') red = true;
        else if (c.severity === 'yellow' || c.status === 'warn') yellow = true;
    }
    return red ? 'red' : yellow ? 'yellow' : 'green';
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const skipStaging = !!args.skipStaging || !!args.auditOnly;

    ensureDir(AUDIT_DIR);

    const steps = [];

    // 1. Hobo reference audit.
    steps.push(runStep('audit-hobo-references',
        process.execPath,
        [path.join('scripts', 'migrate-hobo', 'audit-hobo-references.js'),
         '--out', AUDIT_DIR, '--compact']));

    // 2. Staging cutover rehearsal (optional — heavy).
    if (!skipStaging) {
        const stagingArgs = [path.join('scripts', 'migrate-hobo', 'staging-cutover-rehearsal.js')];
        if (args.host) stagingArgs.push('--host', String(args.host));
        if (args.dryRun) stagingArgs.push('--dry-run');
        if (args.skipMedia) stagingArgs.push('--skip-media');
        if (args.skipFetch) stagingArgs.push('--skip-fetch');
        steps.push(runStep('staging-cutover-rehearsal', process.execPath, stagingArgs));
    }

    // 3. Aggregate artifacts.
    const auditSummary = readJsonOrNull(path.join(AUDIT_DIR, 'hobo-ref-list.json'));
    const importReport = readJsonOrNull(path.join(STAGING_AUDIT, 'import-report.json'));
    const validationSummary = readJsonOrNull(path.join(STAGING_AUDIT, 'validation-summary.json'));
    const stagingLoad = readJsonOrNull(path.join(STAGING_AUDIT, 'staging-load-report.json'));
    const postgresLoad = readJsonOrNull(path.join(STAGING_AUDIT, 'postgres-load-report.json'));
    const backfill = readJsonOrNull(path.join(STAGING_AUDIT, 'media-backfill-report.json'));
    const readiness = readJsonOrNull(path.join(STAGING_AUDIT, 'readiness-report.json'))
                   || readJsonOrNull(path.join(OUT_DIR, 'readiness-phase8.json'));

    // Build gates.
    const stepsOk = steps.every(s => s.ok);
    const checks = [];
    checks.push({ name: 'orchestration_steps', status: stepsOk ? 'pass' : 'fail', severity: stepsOk ? 'green' : 'red',
                  detail: { steps } });
    checks.push({ name: 'hobo_ref_audit_artifact', status: auditSummary ? 'pass' : 'warn', severity: auditSummary ? 'green' : 'yellow',
                  detail: auditSummary ? { occurrences: auditSummary.totals && auditSummary.totals.occurrences } : null });
    if (!skipStaging) {
        checks.push({ name: 'import_report_present',     status: importReport ? 'pass' : 'fail',     severity: importReport ? 'green' : 'red' });
        checks.push({ name: 'validation_summary_present',status: validationSummary ? 'pass' : 'fail',severity: validationSummary ? 'green' : 'red' });
        checks.push({ name: 'staging_load_present',      status: stagingLoad ? 'pass' : 'warn',      severity: stagingLoad ? 'green' : 'yellow' });
        checks.push({ name: 'postgres_load_present',     status: postgresLoad ? 'pass' : 'warn',     severity: postgresLoad ? 'green' : 'yellow' });
        checks.push({ name: 'media_backfill_present',    status: backfill ? 'pass' : 'warn',         severity: backfill ? 'green' : 'yellow' });
        checks.push({ name: 'readiness_report_present',  status: readiness ? 'pass' : 'fail',        severity: readiness ? 'green' : 'red' });
    }

    // Hobo Bucks must remain excluded from spendable balances.
    if (importReport && importReport.financial_safety) {
        const hb = importReport.financial_safety.hobo_bucks_excluded === true;
        checks.push({ name: 'hobo_bucks_excluded', status: hb ? 'pass' : 'fail', severity: hb ? 'green' : 'red',
                      detail: importReport.financial_safety });
    }

    const report = {
        generated_at: new Date().toISOString(),
        phase: 8,
        gate: gateFor(checks),
        skip_staging: skipStaging,
        steps,
        checks,
        artifacts: {
            audit: auditSummary ? path.relative(ROOT, path.join(AUDIT_DIR, 'hobo-ref-list.json')) : null,
            import_report: importReport ? path.relative(ROOT, path.join(STAGING_AUDIT, 'import-report.json')) : null,
            validation_summary: validationSummary ? path.relative(ROOT, path.join(STAGING_AUDIT, 'validation-summary.json')) : null,
            staging_load_report: stagingLoad ? path.relative(ROOT, path.join(STAGING_AUDIT, 'staging-load-report.json')) : null,
            postgres_load_report: postgresLoad ? path.relative(ROOT, path.join(STAGING_AUDIT, 'postgres-load-report.json')) : null,
            media_backfill_report: backfill ? path.relative(ROOT, path.join(STAGING_AUDIT, 'media-backfill-report.json')) : null,
            readiness_report: readiness ? path.relative(ROOT, path.join(STAGING_AUDIT, 'readiness-report.json')) : null,
        },
    };

    const outPath = path.join(OUT_DIR, 'cutover-report.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.stdout.write(`\n✔ wrote ${path.relative(ROOT, outPath)}  gate=${report.gate}\n`);
    if (report.gate === 'red') process.exitCode = 2;
}

if (require.main === module) {
    main().catch((err) => { console.error('cutover rehearsal failed:', err); process.exit(1); });
}

module.exports = { main, gateFor };
