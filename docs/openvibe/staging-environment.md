# Staging environment

The OpenVibe staging environment mirrors production but is **the only place**
where the canonical bundle is loaded into a Postgres database.

Required gates (refuse-by-default):

* `OPENVIBE_ENV=staging`
* `OPENVIBE_PERSISTENCE_MODE=postgres`
* `OPENVIBE_DATABASE_URL=postgres://…`
* `OPENVIBE_STAGING_DATABASE_URL=postgres://…`
* `OPENVIBE_ALLOW_STAGING_LOAD=true`
* `OPENVIBE_STAGING_CONFIRM=true`

Workflow:

1. `scripts/migrate-hobo/fetch-production-hobo.js` (over SSH, read-only).
2. `scripts/migrate-hobo/import-openvibe.js` to produce the canonical bundle.
3. `scripts/migrate-hobo/validate-migration.js` for structural validation.
4. `scripts/migrate-hobo/migrate-postgres.js --apply` to apply schema.
5. `scripts/migrate-hobo/load-postgres.js --apply` to load the bundle.
6. `scripts/migrate-hobo/validate-postgres.js` to confirm row counts.
7. `scripts/migrate-hobo/backfill-media.js` for cold-tier objects.
8. `scripts/cutover/run-cutover-rehearsal.js` to gate.
