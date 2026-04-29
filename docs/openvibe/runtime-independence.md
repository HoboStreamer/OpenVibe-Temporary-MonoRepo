# Runtime independence

Phase 8 fixes the rule that **OpenVibe must run with zero hobo.* runtime
dependencies** by default.

Mechanics:

1. `OPENVIBE_LEGACY_COMPAT_MODE` (default `false`). Every module that used to
   reach into `hobo.tools` checks this flag and the relevant `HOBO_*_URL` vars
   before performing any cross-network call. With compat off, all such code
   paths short-circuit to the OpenVibe-native implementation.
2. `OPENVIBE_PERSISTENCE_MODE` (default `sqlite`). The shared
   `@openvibe/sdk/persistence-mode` helper standardises how every service
   reports **requested mode vs effective mode** plus `adapter_status`, so
   health/readiness surfaces can distinguish local SQLite bootstrap from a real
   Postgres-backed runtime adapter.
3. The host-aware router in `services/openvibe-network/server/host-router.js`
   serves OpenVibe-native shells for `/`, `/admin`, `/my`, `/themes`, and
   `/tools`. Anything outside `/api/v1` and `/.well-known/` falls through to a
   legacy proxy **only** when compat is enabled.

Contract: a bare `git clone && npm install && npm test` run with no `.env`
must boot the entire monorepo, pass tests, and serve every UI surface against
local SQLite databases.
