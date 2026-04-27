# Cutover runbook

Operator guide for executing the Phase 8 cutover. The orchestrator is
`scripts/cutover/run-cutover-rehearsal.js`; verification is
`scripts/cutover/verify-cutover.js`. Both produce
`data/migrations/cutover-report.json` with red/yellow/green gates.

## Pre-flight (audit only)

```bash
node scripts/cutover/run-cutover-rehearsal.js --skip-staging
node scripts/cutover/verify-cutover.js
```

Checks:

* `orchestration_steps` — every spawned step exited 0.
* `hobo_ref_audit_artifact` — `data/migrations/audit/hobo-ref-list.json` exists.

## Full rehearsal

```bash
export OPENVIBE_ALLOW_STAGING_LOAD=true
export OPENVIBE_STAGING_CONFIRM=true
export OPENVIBE_STAGING_DATABASE_URL=postgres://…

node scripts/cutover/run-cutover-rehearsal.js \
  --host hobo.tools           # SSH source
  --user deploy
node scripts/cutover/verify-cutover.js
```

Adds:

* `import_report_present` (`audit/import-report.json`).
* `validation_summary_present` (`audit/validation-summary.json`).
* `staging_load_present` (`audit/staging-load-report.json`).
* `postgres_load_present` (`audit/postgres-load-report.json`).
* `media_backfill_present` (`audit/media-backfill-report.json`).
* `readiness_report_present` (`audit/readiness-report.json` or
  `data/migrations/readiness-phase8.json`).
* `hobo_bucks_excluded` — must be `pass`. If `false`, the gate goes RED and
  the cutover is aborted.

## Cutover

The cutover itself happens in three steps under operator control:

1. Freeze writes on the legacy hobo install (Cloudflare maintenance page).
2. Re-run the rehearsal one final time and re-verify.
3. Flip DNS to the OpenVibe network and set `OPENVIBE_LEGACY_COMPAT_MODE=true`
   if the legacy `hobo.tools` install is to keep federating.

## Rollback

The OpenVibe Postgres database is staging-only until the operator promotes
it. The legacy hobo install is never modified by these scripts, so rollback
is a matter of pointing DNS back. Audit/legacy archives stay in
`legacy_finance_archive` for permanent reference.
