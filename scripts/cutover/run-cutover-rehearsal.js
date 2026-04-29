#!/usr/bin/env node
'use strict';

// scripts/cutover/run-cutover-rehearsal.js
//
// Phase 9 hard-cut rehearsal orchestrator.
// Sequences:
//   1. Hobo reference audit (read-only).
//   2. Staging cutover rehearsal (export → import → validate → load → backfill → readiness).
//   3. Optional browser smoke verification for native localhost/staging surfaces.
//   4. Aggregate the produced artifacts into data/migrations/cutover-report.json
//      with red/yellow/green gates for the operator.
//
// The actual heavy-lifting scripts already live under scripts/migrate-hobo/. This
// file is the single entry point referenced by docs/openvibe/cutover-runbook.md
// and the Phase 9 hardening/readiness gates.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'migrations');
const AUDIT_DIR = path.join(OUT_DIR, 'audit');
const STAGING_DIR = path.join(OUT_DIR, 'hobo-production-staging');
const STAGING_AUDIT = path.join(STAGING_DIR, 'openvibe-target', 'audit');
const BROWSER_SMOKE_REPORT = path.join(OUT_DIR, 'browser-smoke-report.json');

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

function readFirstJson(paths) {
    for (const candidate of paths) {
        const data = readJsonOrNull(candidate);
        if (data) {
            return { path: candidate, data };
        }
    }
    return { path: null, data: null };
}

function runStep(name, cmd, args, opts = {}) {
    process.stdout.write(`\n▶ ${name}\n  $ ${cmd} ${args.join(' ')}\n`);
    const res = spawnSync(cmd, args, { stdio: opts.silent ? 'pipe' : 'inherit', cwd: ROOT });
    return { name, cmd, args, status: res.status, ok: res.status === 0 };
}

function classifyGateValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'red' || normalized === 'fail' || normalized === 'error') return 'red';
    if (normalized === 'yellow' || normalized === 'warn' || normalized === 'warning') return 'yellow';
    if (normalized === 'green' || normalized === 'pass' || normalized === 'ok') return 'green';
    return null;
}

function gateFromSummary(summary) {
    if (!summary || typeof summary !== 'object') return null;
    const red = Number(summary.red) || 0;
    const yellow = Number(summary.yellow) || 0;
    const green = Number(summary.green) || 0;
    if (red > 0) return 'red';
    if (yellow > 0) return 'yellow';
    if (green > 0 || (!red && !yellow)) return 'green';
    return null;
}

function gateFor(checks) {
    if (!checks || !checks.length) return 'yellow';
    let red = false, yellow = false;
    for (const c of checks) {
        const gate = classifyGateValue(c.severity)
            || classifyGateValue(c.status)
            || classifyGateValue(c.gate);
        if (gate === 'red') red = true;
        else if (gate === 'yellow') yellow = true;
    }
    return red ? 'red' : yellow ? 'yellow' : 'green';
}

function gateCheckResult(name, gate, detail) {
    if (gate === 'red') {
        return { name, status: 'fail', severity: 'red', detail };
    }
    if (gate === 'yellow') {
        return { name, status: 'warn', severity: 'yellow', detail };
    }
    return { name, status: 'pass', severity: 'green', detail };
}

function gateCheckFromArtifact(name, artifact, options = {}) {
    if (!artifact) {
        return {
            name,
            status: options.required ? 'fail' : 'warn',
            severity: options.required ? 'red' : 'yellow',
            detail: options.missingDetail || 'artifact missing',
        };
    }

    if (typeof options.classifyArtifact === 'function') {
        const classified = options.classifyArtifact(artifact);
        if (classified) {
            return Object.assign({ name }, classified);
        }
    }

    const artifactGate = classifyGateValue(artifact.gate)
        || gateFromSummary(artifact.summary)
        || gateFor(artifact.checks || []);
    if (artifactGate === 'green') {
        return { name, status: 'pass', severity: 'green', detail: artifact.summary || artifactGate };
    }
    if (artifactGate === 'yellow') {
        return { name, status: 'warn', severity: 'yellow', detail: artifact.summary || artifactGate };
    }
    return { name, status: 'fail', severity: 'red', detail: artifact.summary || artifactGate || 'red' };
}

function gateCheckFromValidationSummary(name, artifact, options = {}) {
    return gateCheckFromArtifact(name, artifact, Object.assign({}, options, {
        classifyArtifact(summary) {
            const detail = {
                ok: summary.ok === true,
                mismatches: Array.isArray(summary.mismatches) ? summary.mismatches.length : 0,
                duplicates: Array.isArray(summary.duplicates) ? summary.duplicates.length : 0,
                missing_refs: Array.isArray(summary.missing_refs) ? summary.missing_refs.length : 0,
                exclusion_failures: Array.isArray(summary.exclusion_checks)
                    ? summary.exclusion_checks.filter((entry) => entry.present === false).length
                    : 0,
            };
            const gate = detail.ok
                && detail.mismatches === 0
                && detail.duplicates === 0
                && detail.missing_refs === 0
                && detail.exclusion_failures === 0
                ? 'green'
                : 'red';
            return gateCheckResult(name, gate, detail);
        },
    }));
}

function gateCheckFromStagingLoadReport(name, artifact, options = {}) {
    return gateCheckFromArtifact(name, artifact, Object.assign({}, options, {
        classifyArtifact(report) {
            const gateFlags = report.gates || {};
            const missingGateFlags = ['allow_staging_load_env', 'staging_confirm_env', 'confirm_load_flag']
                .filter((key) => gateFlags[key] == null);
            const falseGateFlags = ['allow_staging_load_env', 'staging_confirm_env']
                .filter((key) => gateFlags[key] === false);
            if (!report.dry_run && gateFlags.confirm_load_flag === false) {
                falseGateFlags.push('confirm_load_flag');
            }

            const detail = {
                dry_run: !!report.dry_run,
                effective_mode: report.effective_mode || null,
                native_runtime_claim: report.native_runtime_claim === true,
                manual_actions: Array.isArray(report.manual_actions) ? report.manual_actions.length : 0,
                missing_gate_flags: missingGateFlags,
                false_gate_flags: falseGateFlags,
            };

            let gate = 'green';
            if (falseGateFlags.length) {
                gate = 'red';
            } else if (detail.dry_run || detail.manual_actions > 0 || missingGateFlags.length) {
                gate = 'yellow';
            }
            return gateCheckResult(name, gate, detail);
        },
    }));
}

function summarizeDatasetStatuses(datasets) {
    const summary = { loaded: 0, planned: 0, missing: 0, other: 0 };
    for (const dataset of Object.values(datasets || {})) {
        const status = String(dataset && dataset.status || '').toLowerCase();
        if (status === 'loaded') summary.loaded += 1;
        else if (status === 'planned') summary.planned += 1;
        else if (status === 'missing') summary.missing += 1;
        else summary.other += 1;
    }
    return summary;
}

function gateCheckFromPostgresLoadReport(name, artifact, options = {}) {
    return gateCheckFromArtifact(name, artifact, Object.assign({}, options, {
        classifyArtifact(report) {
            const datasetSummary = summarizeDatasetStatuses(report.datasets);
            const detail = {
                dry_run: !!report.dry_run,
                manual_actions: Array.isArray(report.manual_actions) ? report.manual_actions.length : 0,
                loaded_datasets: datasetSummary.loaded,
                planned_datasets: datasetSummary.planned,
                missing_datasets: datasetSummary.missing,
                other_dataset_statuses: datasetSummary.other,
                hobo_bucks_excluded: report.hobo_bucks_excluded !== false,
                loyalty_imported_as_progression: report.loyalty_imported_as_progression !== false,
            };

            let gate = 'green';
            if (!detail.hobo_bucks_excluded || !detail.loyalty_imported_as_progression) {
                gate = 'red';
            } else if (detail.dry_run || detail.manual_actions > 0 || detail.planned_datasets > 0 || detail.missing_datasets > 0) {
                gate = 'yellow';
            }
            return gateCheckResult(name, gate, detail);
        },
    }));
}

function gateCheckFromMediaBackfillReport(name, artifact, options = {}) {
    return gateCheckFromArtifact(name, artifact, Object.assign({}, options, {
        classifyArtifact(report) {
            const detail = {
                dry_run: !!report.dry_run,
                copied_records: Number(report.copied_records) || 0,
                missing_files: Array.isArray(report.missing_files) ? report.missing_files.length : 0,
                skipped_records: Array.isArray(report.skipped_records) ? report.skipped_records.length : 0,
            };
            const gate = detail.missing_files > 0 ? 'red' : (detail.dry_run ? 'yellow' : 'green');
            return gateCheckResult(name, gate, detail);
        },
    }));
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const skipStaging = !!args.skipStaging || !!args.auditOnly;
    const runBrowserSmoke = !!args.browserSmoke;

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

    if (runBrowserSmoke) {
        const browserArgs = [path.join('scripts', 'staging', 'browser-smoke.js'), '--out', BROWSER_SMOKE_REPORT];
        if (args.networkUrl) browserArgs.push('--network-url', String(args.networkUrl));
        if (args.liveUrl) browserArgs.push('--live-url', String(args.liveUrl));
        if (args.chatUrl) browserArgs.push('--chat-url', String(args.chatUrl));
        if (args.communityUrl) browserArgs.push('--community-url', String(args.communityUrl));
        if (args.mediaUrl) browserArgs.push('--media-url', String(args.mediaUrl));
        if (args.browserSmokeOnly) browserArgs.push('--only', String(args.browserSmokeOnly));
        steps.push(runStep('browser-smoke', process.execPath, browserArgs));
    }

    // 4. Aggregate artifacts.
    const auditSummary = readJsonOrNull(path.join(AUDIT_DIR, 'hobo-ref-list.json'));
    const importReport = readJsonOrNull(path.join(STAGING_AUDIT, 'import-report.json'));
    const validationSummary = readJsonOrNull(path.join(STAGING_AUDIT, 'validation-summary.json'));
    const stagingLoad = readJsonOrNull(path.join(STAGING_AUDIT, 'staging-load-report.json'));
    const postgresLoad = readJsonOrNull(path.join(STAGING_AUDIT, 'postgres-load-report.json'));
    const backfill = readJsonOrNull(path.join(STAGING_AUDIT, 'media-backfill-report.json'));
    const browserSmoke = readJsonOrNull(BROWSER_SMOKE_REPORT);
    const readinessArtifact = readFirstJson([
        path.join(STAGING_AUDIT, 'readiness-report.json'),
        path.join(OUT_DIR, 'readiness-phase9.json'),
        path.join(OUT_DIR, 'readiness-phase8.json'),
    ]);
    const readiness = readinessArtifact.data;

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
        if (validationSummary) {
            checks.push(gateCheckFromValidationSummary('validation_summary_gate', validationSummary));
        }
        if (stagingLoad) {
            checks.push(gateCheckFromStagingLoadReport('staging_load_gate', stagingLoad));
        }
        if (postgresLoad) {
            checks.push(gateCheckFromPostgresLoadReport('postgres_load_gate', postgresLoad));
        }
        if (backfill) {
            checks.push(gateCheckFromMediaBackfillReport('media_backfill_gate', backfill));
        }
        if (readiness) {
            checks.push(gateCheckFromArtifact('readiness_gate', readiness));
        }
    }
    if (runBrowserSmoke || browserSmoke) {
        checks.push(gateCheckFromArtifact('browser_smoke_gate', browserSmoke, {
            required: runBrowserSmoke,
            missingDetail: 'browser smoke report missing — run with --browser-smoke or write data/migrations/browser-smoke-report.json first',
        }));
    }

    // Hobo Bucks must remain excluded from spendable balances.
    if (importReport && importReport.financial_safety) {
        const hb = importReport.financial_safety.hobo_bucks_excluded === true;
        checks.push({ name: 'hobo_bucks_excluded', status: hb ? 'pass' : 'fail', severity: hb ? 'green' : 'red',
                      detail: importReport.financial_safety });
    }

    const report = {
        generated_at: new Date().toISOString(),
        phase: 9,
        track: 'hard-cut-hardening',
        gate: gateFor(checks),
        skip_staging: skipStaging,
        browser_smoke_requested: runBrowserSmoke,
        steps,
        checks,
        artifacts: {
            audit: auditSummary ? path.relative(ROOT, path.join(AUDIT_DIR, 'hobo-ref-list.json')) : null,
            import_report: importReport ? path.relative(ROOT, path.join(STAGING_AUDIT, 'import-report.json')) : null,
            validation_summary: validationSummary ? path.relative(ROOT, path.join(STAGING_AUDIT, 'validation-summary.json')) : null,
            staging_load_report: stagingLoad ? path.relative(ROOT, path.join(STAGING_AUDIT, 'staging-load-report.json')) : null,
            postgres_load_report: postgresLoad ? path.relative(ROOT, path.join(STAGING_AUDIT, 'postgres-load-report.json')) : null,
            media_backfill_report: backfill ? path.relative(ROOT, path.join(STAGING_AUDIT, 'media-backfill-report.json')) : null,
            browser_smoke_report: browserSmoke ? path.relative(ROOT, BROWSER_SMOKE_REPORT) : null,
            readiness_report: readinessArtifact.path ? path.relative(ROOT, readinessArtifact.path) : null,
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

module.exports = {
    main,
    gateFor,
    gateCheckFromArtifact,
    gateCheckFromMediaBackfillReport,
    gateCheckFromPostgresLoadReport,
    gateCheckFromStagingLoadReport,
    gateCheckFromValidationSummary,
};
