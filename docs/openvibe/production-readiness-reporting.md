# OpenVibe production readiness reporting

The scalable runtime track adds two layers of readiness truth:

1. per-service runtime endpoints
   - `/health` — descriptive process + service state
   - `/ready` — truthful green/yellow/red dependency summary
   - `/metrics` — Prometheus scrape surface
2. repository-level offline readiness
   - `scripts/readiness/check-scalable-runtime.js --offline`

## Current report artifact

Running `npm run readiness` now writes:

- `data/readiness/openvibe-production-readiness-report.json`
- `data/readiness/scalable-runtime-report.json`
- `data/migrations/runtime-readiness-report.json` (legacy compatibility path)

This artifact is intentionally machine-readable so future cutover and deploy
orchestrators can fold it into a broader go/no-go decision.

The report aggregates these repo-level checks:

- `scripts/readiness/check-scalable-runtime.js`
- `scripts/readiness/check-storage-providers.js`
- `scripts/readiness/check-queue-health.js`
- `scripts/readiness/check-media-pipeline.js`
- `scripts/readiness/check-realtime-socketio.js`
- `scripts/readiness/check-nginx-config.js`
- `scripts/readiness/check-cloudflare-assumptions.js`

If `data/migrations/browser-smoke-report.json` exists, browser smoke status is
folded into the final report as well; otherwise browser smoke is marked yellow
with an explicit instruction to run `npm run smoke:browser`.

## Gate semantics

- `green` — required repo/runtime scaffolding is present
- `yellow` — usable with caveats; missing optional hardening or convenience
  scripts
- `red` — missing required runtime foundations or service integration

## Next readiness extensions

- live Postgres connection checks against a configured database URL (offline
   `--dry-run --skip-external` mode now reports missing credentials as yellow
   instead of a misleading hard-red)
- live Redis connection and queue lag checks against a configured Redis URL
- richer realtime event-bridge and authorization probes beyond the expanded
   production-shaped namespace map
- broader browser smoke selectors, screenshots, and same-origin critical-link
   validation once the full stack is running locally in CI/staging
