# Phase 9 — hard-cut hardening + cutover parity

Status: implementation in progress.

Phase 8 built the native OpenVibe migration/runtime-independence foundation.
Phase 9 is the follow-on hardening tranche: make the cutover workflow safe,
truthful, repeatable, browser-validated, and honest about what is still
missing before a real hard cut.

This phase does **not** replace Phase 8. It is the execution layer that turns
“the pieces exist” into “operators can trust the result.”

## Current baseline

At the start of Phase 9, the repository already has:

* native OpenVibe network, live, chat, community, media, billing, AI, events,
  and games services checked in
* migration/export/import/backfill/readiness scripts under
  `scripts/migrate-hobo/`
* cutover orchestration under `scripts/cutover/`
* native localhost-domain resolution via `packages/openvibe-sdk/url-defaults.js`
  so `openvibe.*.localhost` surfaces stop leaking to production hosts
* verified repo validation commands:
  * `npm run check`
  * `npm test`

Phase 9 starts from that baseline and hardens the unsafe, ambiguous, or
optimistic edges.

## Goals

Phase 9 is complete when the repo can honestly claim all of the following:

1. production export/fetch is safe by default and auditable
2. cutover/staging/postgres reports describe what really happened
3. localhost/staging/public URL resolution is stable across surfaces
4. browser smoke coverage exists for critical OpenVibe domains
5. native OpenVibe surfaces remain usable with compatibility disabled
6. operator docs, readiness gates, and machine-readable artifacts agree with
   the current implementation reality

## Work packages

| WP | Topic | Status | Notes |
|----|-------|--------|-------|
| 0 | Baseline docs + navigation | ✅ landed | This file, `PHASES.md`, and Phase 8 cross-links establish the active hardening track. |
| 1 | Production fetch safety + reporting | ✅ landed + verified | `fetch-production-hobo.js` now defaults to dry-run, requires `--confirm`, supports `--production-paths`, expands analytics DB discovery, records richer reports, and validates via `scripts/migrate-hobo/test/production-fetch.test.js`. |
| 2 | Localhost/staging domain correctness | ✅ landed + browser-validated | Shared URL defaults prevent surface links from bouncing to production while testing locally. |
| 3 | Postgres truthfulness | ⏳ next | Tighten canonical load/validate/readiness reporting so “postgres support” reflects actual runtime truth, not descriptors alone. |
| 4 | Staging loader + readiness honesty | ⏳ next | Make staging reports explicit about hydrated stores, skipped imports, backfill gaps, and remaining manual actions. |
| 5 | Cutover orchestration parity | 🚧 initial hardening landed | `scripts/cutover/run-cutover-rehearsal.js` now emits Phase 9 report metadata and can fold browser-smoke artifacts into the top-level gate; deeper go/no-go tightening remains next. |
| 6 | Browser smoke/parity harness | 🚧 initial harness landed | `scripts/staging/browser-smoke.js` and `scripts/staging/test/browser-smoke.test.js` now cover the critical surface shells; broadened runtime parity runs remain next. |
| 7 | Native surface polish | ⏳ next | Continue closing product-shell gaps and bring native OpenVibe pages closer to real operator/user workflows. |
| 8 | Compatibility-off verification | ⏳ next | Confirm `OPENVIBE_LEGACY_COMPAT_MODE=false` remains the default and does not break native staging flows. |
| 9 | Final hard-cut readiness report | ⏳ next | Produce a machine-readable report that operators can use for red/yellow/green go/no-go decisions. |

## Verified in this phase so far

### Production fetch hardening

The first verified Phase 9 tranche landed in `scripts/migrate-hobo/`:

* `fetch-production-hobo.js` is **dry-run by default**
* any snapshot/copy path requires `--confirm`
* `--production-paths <json>` provides deterministic remote-path overrides
* production fetch now discovers additional candidate SQLite sources including:
  * HoboStreamer analytics
  * RobotStreamer / rs-companion
  * HoboQuest
  * sibling Hobo service analytics DBs (`hobo-img`, `hobo-docs`, `hobo-text`,
    `hobo-audio`, `hobo-maps`, `hobo-food`, `hobo-yt`)
* reports now include discovered candidates, selected paths, db snapshots,
  config redactions/skips, media manifests, copied artifacts, sizes,
  checksums, warnings, and planned/executed commands
* optional remote temp cleanup only targets the exact
  `/tmp/openvibe-migration-*` directory created for the run

### Validation

The hardening tranche is verified by:

* `node scripts/migrate-hobo/test/production-fetch.test.js`
* `node scripts/staging/test/browser-smoke.test.js`
* `npm run check`
* `npm test`

All three are green in-session after the fetch/reporting changes.

### Browser validation

In-session browser checks confirmed that local canonical surfaces stay on
`*.localhost` hosts instead of redirecting to production domains. Verified pages
include:

* `openvibe.network.localhost`
* `openvibe.tools.localhost`
* `openvibe.live.localhost`
* `openvibe.chat.localhost`

### Cutover report hardening

The top-level rehearsal orchestrator now reflects Phase 9 reality better than
the earlier Phase 8-only scaffolding:

* `scripts/cutover/run-cutover-rehearsal.js` now emits `phase: 9`
* the report includes `track: 'hard-cut-hardening'`
* optional `--browser-smoke` runs can be folded into the final cutover gate via
  `browser_smoke_gate`
* the runbook now documents the browser-smoke artifact path and Phase 9 framing

## Execution rules

Phase 9 keeps the same architectural stance as Phase 8:

* OpenVibe-native runtime is the default
* legacy Hobo repos remain migration/reference/archive inputs only
* compatibility shims stay additive, isolated, and removable later
* production-facing scripts remain read-only except for temp snapshots and temp
  export directories under `/tmp/openvibe-migration-*`
* browser-facing validation should use canonical local domains such as
  `openvibe.network.localhost`, `openvibe.live.localhost`, and friends

## Near-term verification loop

Use this loop while Phase 9 is active:

```bash
npm run check
npm test
node scripts/migrate-hobo/test/production-fetch.test.js
node scripts/staging/test/browser-smoke.test.js
```

Add focused browser smoke checks as the Phase 9 browser harness lands.

## Relationship to other docs

* Phase 8 implementation index: [../docs/openvibe/phase-8.md](../docs/openvibe/phase-8.md)
* Repo-wide phase status: [../PHASES.md](../PHASES.md)
* High-level architecture plan: [PLAN.md](PLAN.md)

When docs disagree, this file and `PHASES.md` should be treated as the active
execution truth for the hardening/parity tranche.