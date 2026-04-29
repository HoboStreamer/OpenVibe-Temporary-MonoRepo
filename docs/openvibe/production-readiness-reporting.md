# OpenVibe production readiness reporting

The scalable runtime track adds two layers of readiness truth:

1. per-service runtime endpoints
   - `/health` — descriptive process + service state
   - `/ready` — truthful green/yellow/red dependency summary
   - `/metrics` — Prometheus scrape surface
2. repository-level offline readiness
   - `scripts/readiness/check-scalable-runtime.js --offline`

## Current report artifact

Running the readiness script writes:

- `data/migrations/runtime-readiness-report.json`

This artifact is intentionally machine-readable so future cutover and deploy
orchestrators can fold it into a broader go/no-go decision.

## Gate semantics

- `green` — required repo/runtime scaffolding is present
- `yellow` — usable with caveats; missing optional hardening or convenience
  scripts
- `red` — missing required runtime foundations or service integration

## Next readiness extensions

- live Postgres connection checks
- live Redis connection checks
- worker registration and queue lag checks
- object storage provider checks
- realtime node fanout checks
- media-plane readiness and clip/DVR pipeline checks
