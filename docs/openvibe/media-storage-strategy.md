# Media storage strategy

OpenVibe media uses a **B2-default + R2-on-demand** policy.

## Canonical policy

* **Backblaze B2 (`b2`)** is the canonical/default provider for VODs, clips,
  HLS segments, HLS playlists, source media, repair files, and materialized
  clip packages.
* **Cloudflare R2 (`r2`)** is an optional hot playback tier. It only receives
  copied/promoted media after analytics thresholds are met or an operator
  explicitly forces promotion.
* **Local/VPS storage (`local`)** is for development, multipart scratch space,
  and cheap small-asset origin bytes such as thumbnails, previews, avatars,
  and similar low-cost public assets.
* **Cloudflare CDN/cache** fronts playback, but Cloudflare Stream is not part
  of this design.

## Important rules

* Normal uploads do **not** write directly to R2 just because
  `OPENVIBE_MEDIA_HOT_PROVIDER=r2` is configured.
* `OPENVIBE_MEDIA_PROVIDER_POLICY=b2-default-r2-on-demand` means initial writes
  default to B2, unless a small asset is eligible for the local asset origin or
  an explicit admin/system override selects another provider.
* R2 is intentionally conservative and should **not** activate for a trivial
  10-viewers/day traffic pattern.
* The canonical B2 copy is never deleted merely because an R2 hot copy exists.
* No public playback object may exceed **500 MB**. The recommended target is
  **256 MB**, with warnings beginning at **384 MB**.

## Lifecycle data model

OpenVibe stores storage truth in SQLite/Postgres metadata:

* `media_object_locations` tracks canonical/hot/asset-origin locations.
* `media_access_rollups` and `media_site_heat_rollups` track media/site heat.
* `media_promotion_decisions` records promotion/demotion decisions.
* `media_retention_holds` blocks destructive cleanup while clips or moderation
  holds depend on a parent object.
* `vod_parts`, `vod_partial_segments`, and `media_part_access_rollups` support
  part-aware VOD playback, hot-tier decisions, and size enforcement.

Lifecycle actions are recorded in `media_lifecycle_audit`. Backfill from legacy
HoboStreamer storage is handled by `scripts/migrate-hobo/backfill-media.js`,
which writes `audit/media-backfill-report.json`.
