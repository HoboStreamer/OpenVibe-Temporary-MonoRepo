# Production SSH export

The `scripts/migrate-hobo/fetch-production-hobo.js` helper pulls a read-only
copy of the live HoboStreamer.com and hobo.tools production data into
`data/migrations/hobo-production-staging/production-source/` over SSH.

* No writes ever touch the production host.
* The command is **dry-run by default**; pass `--confirm` before any remote
  snapshot, `scp`, or `rsync` operation is allowed to run.
* `--dry-run` still exists for explicit planning and for scripts that want to be
  loud about staying read-only.
* `--skip-media` and `--media-mode=metadata-only` keep the fetch cheap when
  only the canonical metadata is needed.
* `--production-paths <json>` loads deterministic remote-path overrides; CLI
  flags still win if both are present.
* The resulting `production-fetch-report.json` captures discovered candidates,
  selected paths, db snapshots, config redactions/skips, media manifests,
  copied artifacts, sizes, checksums, warnings, and planned/executed commands.
* Outputs land under `production-source/<service>/` with the same shape the
  exporter expects.

Use this from the cutover runbook (`cutover-runbook.md`).
