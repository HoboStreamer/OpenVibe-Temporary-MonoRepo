# Media backfill

Drives `scripts/migrate-hobo/backfill-media.js`. Reads the `media_objects`
metadata in the canonical bundle, locates each object on the production
`production-source/` mirror, and uploads it to either the hot directory or the
cold S3 bucket.

Outputs `audit/media-backfill-report.json` with per-kind counts, byte totals,
and any objects that could not be located. Items missing from the source are
recorded into `migration_import_hold` so the cutover rehearsal flags them as a
yellow-gate check.
