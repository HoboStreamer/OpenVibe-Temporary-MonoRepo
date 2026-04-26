Analyze the #codebase then confirm the exact scope from the current OpenVibe migration plan before editing anything.

Treat this as implementing the later plan numbering from the OpenVibe conversation:
- Phase 1 = Platform Kernel Foundations
- Phase 2 = Identity / Control Plane Extraction

If you encounter earlier notes that call this “phase 0/1”, treat that as the same workstream plus any minimal audit/env cleanup required to safely finish Phase 1 and Phase 2.

This must be implemented as a real migration slice inside the current `HoboApp` + `HoboStreamer.com` workspace, not as a greenfield fantasy. Use additive, migration-safe changes and preserve backward compatibility with current Hobo flows unless impossible. Do not stop at planning.

First inspect these authoritative existing files and cite them back in your analysis before editing:

- #file:HoboApp/README.md
- #file:HoboApp/hobo-tools/README.md
- #file:HoboApp/hobo-tools/server/index.js
- #file:HoboApp/hobo-tools/server/config.js
- #file:HoboApp/hobo-tools/server/db/database.js
- #file:HoboApp/hobo-tools/server/url-registry.js
- #file:HoboStreamer.com/README.md
- #file:HoboStreamer.com/server/index.js
- #file:HoboStreamer.com/server/config.js
- #file:HoboStreamer.com/server/db/schema.sql
- #file:HoboStreamer.com/docs/broadcasting.md

Then inspect the authoritative imported modules from those entrypoints before editing, especially:
- the `HoboApp/hobo-tools/server/auth/*`, `admin/*`, `themes/*`, `notifications/*`, `internal/*`, `setup/*` modules actually imported by `server/index.js`
- the `HoboStreamer.com/server/auth/*`, plus any registry/auth/config helpers actually imported by `HoboStreamer.com/server/index.js` and `HoboStreamer.com/server/config.js`

After confirmatory analysis, implement Phase 1 and Phase 2 end-to-end with the smallest coherent migration-safe structure that fully works in this workspace.

Hard requirements

1) Implement the OpenVibe kernel foundation in-place in the current workspace
Create the missing OpenVibe migration scaffolding in the cleanest place inside `HoboApp` and wire it into the existing monorepo patterns. Prefer additive new directories/packages/services over destructive renames.

At minimum, implement:
- an `openvibe-events` service or equivalent cleanly separated event backbone inside `HoboApp`
- an `openvibe-network` migration layer or equivalent evolution of `hobo-tools` that can serve as the OpenVibe control plane
- a `packages/openvibe-sdk` package for shared client/helpers
- a `packages/openvibe-contracts` package or equivalent for schema/constants/contracts

If you determine that `hobo-tools` itself should temporarily become the OpenVibe network/control-plane runtime for this phase, that is acceptable, but do it in a way that:
- preserves current Hobo behavior
- adds clear extraction seams
- documents intended future repo/service split
- does not do a shallow global rename

2) Implement the Phase 1 kernel data/control primitives
Add the foundational storage + APIs + server-side enforcement for:
- user modules / namespaced shared user data
- service registry
- capability registry
- contract registry
- policy engine skeleton / permission enforcement seam
- feature/config compatibility hooks only where needed to support these phase goals

Requirements for user modules:
- namespaced ownership metadata
- read/write permission model
- schema/version field support
- safe CRUD APIs
- auditability or logging hooks
- no client-trusted writes

Requirements for service registry:
- service identity record
- internal/public URL support
- capability/event declarations
- heartbeat/health-friendly structure
- migration-safe storage

Requirements for capability + contract registry:
- stored definitions with versioning
- schema-bearing records
- enough API + data model support to unblock later phases
- additive design, not a dead-end placeholder

Requirements for policy skeleton:
- central enforcement seam for namespace/capability/service permissions
- do not overengineer a huge rules engine, but do not bury permission logic ad hoc across routes either

3) Implement the Phase 1 event system foundation
Implement a real event backbone foundation inside this workspace.

Use existing project patterns and minimal new infrastructure:
- prefer existing Node/Express/SQLite/better-sqlite3 patterns if Redis/NATS/Kafka are not already present and truly wired
- build a clean abstraction seam so Redis/NATS/Kafka can replace the persistence/queue layer later
- do not invent an unrelated framework

The event system must include:
- event log persistence
- topics
- subscriptions
- queue/work item records
- ack/retry state
- dead-letter queue or equivalent failed-event storage
- publish API
- basic consumer/admin inspection API
- event IDs / trace IDs / version field support
- idempotency-friendly shape
- diagnostics/logging on failed publish/process paths

4) Implement the Phase 2 OpenVibe identity/control-plane extraction
Build the OpenVibe-branded control-plane surfaces while preserving the current Hobo ones.

Support these host/surface concepts in the current workspace:
- auth.openvibe.network
- api.openvibe.network
- admin.openvibe.network
- my.openvibe.network
- themes.openvibe.network

This can be host-aware routing or another clean compatibility strategy that fits the current codebase, but it must:
- preserve existing hobo.tools/login.hobo.tools/my.hobo.tools behavior where practical
- add clear OpenVibe-branded equivalents
- not break existing installs
- make the new OpenVibe surface usable now

Phase 2 deliverables must include:
- OpenVibe issuer/JWKS/OIDC-friendly identity surface derived from current hobo-tools auth
- account-management/my-account surface for OpenVibe
- themes surface migrated from current hobo.tools theme system
- admin surface migrated/reachable under OpenVibe hosting
- config/registry support for OpenVibe URLs and service names
- backward-compatible Hobo aliases or fallbacks

5) Update HoboStreamer.com as a consumer of the new control plane
Implement only the HoboStreamer changes required to complete Phase 2 safely:
- add OpenVibe network issuer/config support alongside existing hobo.tools support
- support new internal/public URL registry keys and env fallbacks
- preserve current auth/login behavior while allowing the new OpenVibe control plane to be the authoritative source
- add diagnostics where issuer/registry/auth resolution can fail

Do not start the broader Phase 3 media extraction or Phase 4 chat/community/product migrations here except for the minimum compatibility wiring required to make Phase 1 and 2 real.

6) Preserve data and compatibility
- Do not delete data
- Do not rename public APIs without migration notes
- If schema changes are required, include safe migrations and backfill notes
- Preserve existing installs
- Preserve current Hobo flows unless explicitly superseded with compatibility wrappers
- Do not perform a destructive “rename hobo-tools to openvibe-network” hack

7) Reuse existing patterns
Use the current project’s Express, SQLite, route, config, and shared-package patterns where practical.
Do not replace the architecture with a new framework.
Do not do shallow placeholder stubs if the existing code can support a real implementation.
Do not create dead-end scaffolding that cannot plausibly power later OpenVibe phases.

8) Add docs and env/config support
Update the relevant README/env/config surfaces so the phase is actually usable by a developer in this workspace:
- document the new OpenVibe services/surfaces/packages you create
- add OpenVibe env vars and fallback rules
- explain how Hobo compatibility works
- explain how to run the new pieces locally

Implementation expectations

A) Confirmatory analysis first
Before editing, identify:
- which current files own SSO/auth/issuer behavior
- which current files own admin/themes/account management
- where URL registry values are stored/resolved
- what HoboStreamer consumes from hobo-tools today
- the best additive place to create the OpenVibe kernel pieces in the current workspace

B) Then implement actual code
Do not stop at “here is a plan”.
Make the edits and create the files.
Keep the changes surgical but complete.

C) Add focused validation coverage
Where practical, add:
- route-level or module-level tests
- smoke checks
- syntax/static checks
If there is no existing test harness, add the lightest practical validation and document manual verification clearly.

D) Add diagnostics/logging where useful
Especially around:
- auth issuer selection / token verification
- URL registry resolution
- OpenVibe host routing
- event publish/consume failures
- namespace permission denials
- service registration failures

Suggested implementation shape

Use the actual codebase after confirmatory inspection, but the target should roughly land on:
- `HoboApp/openvibe-events/...` or equivalent event service root
- `HoboApp/packages/openvibe-sdk/...`
- `HoboApp/packages/openvibe-contracts/...`
- a clean OpenVibe control-plane runtime layered onto or extracted from `HoboApp/hobo-tools/...`
- the minimum `HoboStreamer.com/...` config/auth updates needed to consume the new control plane

Required validation outcomes

Make sure the final implementation allows a developer to verify all of these locally:

1. The control plane can serve OpenVibe-branded auth/api/admin/my/themes surfaces without breaking the Hobo ones.
2. There is a real persisted user-modules API with namespace ownership + permission enforcement.
3. There is a real persisted service registry API.
4. There is a real persisted capability/contract registry API.
5. There is a real event publish/store/subscription/queue/retry or failed-event path, not just comments.
6. HoboStreamer can still boot and can resolve auth/config against the new OpenVibe control-plane configuration without losing existing Hobo fallback behavior.
7. Docs/env examples explain how to run and validate this phase locally.

Finish by providing:
- files changed
- what changed in each
- schema/config/env changes
- tests/checks run
- manual local validation steps
- remaining edge cases or intentional deferrals
- a concise summary of how this satisfies Phase 1 and Phase 2 specifically

Do not do shallow patches. Do not output only a plan. Implement the work.