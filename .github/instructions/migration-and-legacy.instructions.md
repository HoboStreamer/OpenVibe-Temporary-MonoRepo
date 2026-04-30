---
description: "OpenVibe migration / legacy Hobo handling. Use when: editing scripts/migrate-hobo/**, scripts/cutover/**, compat/**, or anything that reads from HoboReposToMigrateFrom/ or /opt/hobostreamer/."
applyTo: "scripts/migrate-hobo/**,scripts/cutover/**,compat/**,docs/openvibe/*migration*.md,docs/openvibe/*cutover*.md"
---

# Hobo → OpenVibe migration handling

Authoritative plan: [docs/openvibe/persistence-cutover-plan.md](../../docs/openvibe/persistence-cutover-plan.md).
Table-by-table map: [docs/openvibe/hobo-to-openvibe-data-map.md](../../docs/openvibe/hobo-to-openvibe-data-map.md).
Migration map: [docs/openvibe/migration-map.md](../../docs/openvibe/migration-map.md).

## Posture

- Legacy Hobo folders are **read-only migration / reference / archive
  inputs**. Migration scripts may read them; the OpenVibe runtime must not
  depend on them. `OPENVIBE_LEGACY_COMPAT_MODE=false` is the default stance.
- The end state is a **hard cutover**: PostgreSQL canonical store + Redis
  coordination + object storage for media bytes + async workers for replay
  and reconciliation. Do not design new flows assuming long-term
  service-local SQLite or indefinite mirror mode.

## Required behaviours

- Exports against legacy sources must be **read-only** and must emit
  deterministic manifests with row counts, excluded counts, missing media
  references, and redacted secret-bearing fields.
- Canonical import must be **idempotent and replay-safe**. Every mirrored
  entity records a `legacy_id_map` row keyed by `(source, kind, legacy_id) →
  new_id`. Use the existing legacy lookup endpoints rather than inventing
  new ID schemes.
- **Do not migrate Hobo Bucks balances** as canonical OpenVibe wallet
  balances. Coins/nickels/watch-time may migrate as non-cash
  progression/history only.
- Secrets and raw credentials must **never** appear in canonical import
  bundles. Keep them in env / secrets managers.

## Code locations

- Exporters / loaders / staging: [scripts/migrate-hobo/](../../scripts/migrate-hobo/)
- Cutover rehearsals + verification: [scripts/cutover/](../../scripts/cutover/)
- Compatibility notes: [compat/](../../compat/)
- Bridges (transitional, opt-in): `/opt/hobostreamer/server/openvibe-bridge/*`

## Validation

Migration-touching changes should run at minimum:

```
npm test -- --scope=scripts/migrate-hobo
npm run readiness:schema-drift
```

Then the relevant `npm run readiness*` aggregator if the change affects
canonical reports.
