# Postgres canonical loader

Phase 8 introduces an optional Postgres staging path. Schemas live in
`scripts/migrate-hobo/postgres/schema/` and are applied numerically:

* `001_core.sql` — bookkeeping (`migration_runs`, `migration_legacy_id_map`,
  `migration_audit`, `migration_reconciliation`, `migration_import_hold`).
* `010_identity_control.sql` — identity, themes, control plane, notifications.
* `020_social_live.sql` — social graph, live channels/streams, restream.
* `030_chat_community_media.sql` — chat, community, media metadata.
* `040_billing_loyalty.sql` — billing, `legacy_finance_archive` (spendable=false),
  loyalty (Hobo Coins/Nickels as progression).

## Commands

```bash
# Apply schema only.
node scripts/migrate-hobo/migrate-postgres.js \
  --database-url="$OPENVIBE_STAGING_DATABASE_URL"

# Load the canonical NDJSON bundle (dry-run by default).
node scripts/migrate-hobo/load-postgres.js \
  --database-url="$OPENVIBE_STAGING_DATABASE_URL" \
  --bundle data/migrations/hobo-production-staging/openvibe-target \
  --dry-run

# Verify table presence + counts.
node scripts/migrate-hobo/validate-postgres.js \
  --database-url="$OPENVIBE_STAGING_DATABASE_URL"
```

Loader writes `audit/postgres-load-report.json` with rows-per-dataset, a run
id, and the financial-safety flags described in
`hobo-coins-loyalty-migration.md`. The `pg` package is loaded lazily so this
toolchain can ship without forcing a Postgres install on developers who only
use SQLite.
