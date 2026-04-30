---
description: "OpenVibe readiness + smoke truthfulness. Use when: editing scripts/readiness/**, scripts/staging/**, files under data/readiness/, or anything that aggregates green/yellow/red gates."
applyTo: "scripts/readiness/**,scripts/staging/**,data/readiness/**,data/migrations/*-report.json"
---

# Readiness + smoke truthfulness

Reference: [docs/openvibe/production-readiness-reporting.md](../../docs/openvibe/production-readiness-reporting.md).

Readiness and browser-smoke reports are the **truth surface** for "is this
ready to ship". They are intentionally honest: gates are computed from real
probes and may legitimately stay yellow or red.

## Hard rules

- **Never** flip a gate to green by silencing a check, lowering a threshold,
  hard-coding a value, or removing a probe. If a probe cannot run in the
  current environment, mark it `yellow` with an explicit reason.
- **Never** delete or hand-edit a checked-in JSON report under
  `data/readiness/` to make a status look better. Regenerate via the
  appropriate `npm run readiness*` / `npm run smoke:browser*` command.
- New checks must surface their source (script path), the probe target, and
  a human-readable reason for any non-green status.
- Keep `gate` semantics consistent: `green` (passes), `yellow` (usable with
  caveats / optional missing), `red` (required foundation missing).

## Adding a new check

1. Add the script under `scripts/readiness/` with a `--offline` /
   `--skip-external` mode so `npm run readiness` (offline) still succeeds.
2. Wire it into the aggregator that produces
   `data/readiness/openvibe-production-readiness-report.json`.
3. Document deferred / known-yellow items in the matching
   `context/PHASE_*.md` and append a row in [PHASES.md](../../PHASES.md).

## Validation flow

Verified offline flow that must remain runnable on a bare clone:

```
npm run check && npm test && npm run readiness:schema-drift && npm run readiness
```

`readiness:schema-drift` must stay **green**. Top-level `readiness` is
expected **yellow** today and that is correct — do not "fix" it by hiding the
yellow gates.
