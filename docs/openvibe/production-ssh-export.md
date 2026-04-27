# Production SSH export

The `scripts/migrate-hobo/fetch-production-hobo.js` helper pulls a read-only
copy of the live HoboStreamer.com and hobo.tools production data into
`data/migrations/hobo-production-staging/production-source/` over SSH.

* No writes ever touch the production host.
* `--dry-run` lists the rsync/scp commands without executing them.
* `--skip-media` and `--media-mode=metadata-only` keep the fetch cheap when
  only the canonical metadata is needed.
* Outputs land under `production-source/<service>/` with the same shape the
  exporter expects.

Use this from the cutover runbook (`cutover-runbook.md`).
