# Source adapter research notes (deferred)

Phase 7 intentionally ships **offline-safe stub adapters** for every
content source type. Live HTTP adapters are deferred to subsequent
phases. This file is a placeholder for the per-adapter research notes
that should be captured before each live adapter is wired up.

## Per-source notes (TODO)

For each `content_source` entry under
[content-source-registry.md](content-source-registry.md), capture:

- Authentication mode and the env-var name to use.
- Rate-limit policy (per-minute / per-day, soft vs. hard).
- ToS / attribution requirements that must surface in the rendered
  page (`terms_notes`).
- Robots / `User-agent` requirements.
- Pagination strategy for `fetch`.
- Per-item field mapping into `ai_sources` (`url`, `title`, `author`,
  `published_at`, `snippet`).
- Whether a manual review queue (`requires_review=1`) is required.

Live adapter implementations should be added under
`services/openvibe-ai/server/adapters/<key>.js` and registered through
`sources.adapterFor()`. The unit-test smoke for each adapter must
include both a successful path and a `respect_robots=false → blocked`
path.
