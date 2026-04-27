# Media storage strategy

Two-tier model used by every Phase 8 service that holds binaries:

* **Hot** — local filesystem under `OPENVIBE_MEDIA_HOT_ROOT` (default
  `./data/media-hot`) plus per-service SQLite metadata. Default everywhere.
* **Cold** — S3-compatible bucket configured by `OPENVIBE_MEDIA_COLD_PROVIDER`,
  `OPENVIBE_S3_ENDPOINT`, `OPENVIBE_S3_BUCKET`, `OPENVIBE_S3_REGION`,
  `OPENVIBE_S3_ACCESS_KEY_ID`, `OPENVIBE_S3_SECRET_ACCESS_KEY`. Off until
  explicitly enabled.

Lifecycle is recorded in `media_lifecycle_audit`. Backfill from legacy
HoboStreamer storage is handled by `scripts/migrate-hobo/backfill-media.js`
which writes `audit/media-backfill-report.json`.
