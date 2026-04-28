# OpenVibe

OpenVibe is the native platform kernel and the federated set of product
surfaces replacing the legacy **HoboStreamer.com** runtime and the
**HoboApp** / `hobo-tools` monorepo.

This folder is the working monorepo root for the kernel itself. The legacy
trees intentionally remain **alongside** it in the workspace as migration
inputs, historical references, and rollback-only archives. They are not part
of the default OpenVibe runtime.

See [context/PLAN.md](context/PLAN.md) for the long-form architecture plan and
[ARCHITECTURE.md](ARCHITECTURE.md) for the rules every OpenVibe service must
follow. Phase status lives in [PHASES.md](PHASES.md).

The authoritative production persistence + hard-cutover plan lives in
[docs/openvibe/persistence-cutover-plan.md](docs/openvibe/persistence-cutover-plan.md).
The canonical Hobo → OpenVibe mapping lives in
[docs/openvibe/hobo-to-openvibe-data-map.md](docs/openvibe/hobo-to-openvibe-data-map.md).

---

## Layout

```
openvibe/
├── context/                       Long-form architecture + planning notes
├── packages/
│   ├── openvibe-contracts/        Shared schemas / topics / capability + namespace ids
│   └── openvibe-sdk/              Auth client, middleware, registry + events HTTP clients
├── services/
│   ├── openvibe-network/          Control plane + public hub (auth/api/admin/my/themes/tools)
│   ├── openvibe-events/           Event backbone (publish, subscribe, retry, DLQ)
│   ├── openvibe-media/            Shared media object/storage platform
│   ├── openre-stream/             Stream ingest + restream runtime
│   ├── openvibe-live/             Native live discovery / channel / stream product
│   ├── openvibe-chat/             Native chat / DM / call / TTS product
│   ├── openvibe-community/        Native threads / pastes / discussion product
│   ├── openvibe-billing/          Billing / tips / loyalty / subscriptions
│   ├── openvibe-ai/               AI / SEO / indexing / workflow backbone
│   └── openvibe-games/            Native games / canvas / progression service
└── compat/
  └── hobostreamer/              Legacy migration notes only; not required for runtime
```

Each service is an independent Node/Express app with its own `package.json`.
SQLite remains the local-dev bootstrap path so contributors can run the
workspace without extra infrastructure, but the target runtime for staging and
production is PostgreSQL + Redis + object storage + async workers. Legacy Hobo
runtime compatibility is not part of the steady-state OpenVibe deployment.

---

## Phase 1 + Phase 2 — what is implemented today

* **Phase 1 — Platform Kernel Foundations**
  * Persisted **user modules** API with namespace ownership + read/write
    permission enforcement and an audit trail
    (`services/openvibe-network/server/api/user-modules.js`)
  * Persisted **service registry**, **capability registry**, and **contract
    registry** APIs with versioned records and schema bearings
    (`services/openvibe-network/server/api/*.js`)
  * **Policy engine seam** — single enforcement point for namespace and
    capability invocation permissions
    (`services/openvibe-network/server/policy.js`)
  * **Event backbone** — log, topics, subscriptions, work queue, ack / retry,
    DLQ, replay, publish + admin inspection HTTP API
    (`services/openvibe-events/server/*`)

* **Phase 2 — Identity / Control Plane Extraction**
  * Host-aware routing for `auth.openvibe.network`, `api.openvibe.network`,
    `admin.openvibe.network`, `my.openvibe.network`, `themes.openvibe.network`
  * OIDC-friendly identity surface: `/.well-known/openid-configuration` +
    JWKS exposed directly by `services/openvibe-network`
  * Themes / admin / my-account / tools host surfaces are served natively by
    OpenVibe and no longer fall through to the legacy Hobo UI in default mode
  * URL registry and platform discovery live in the OpenVibe control plane;
    legacy Hobo registry data is migration input only

* **Legacy Hobo sources**
  * `HoboReposToMigrateFrom/HoboStreamer.com` and
    `HoboReposToMigrateFrom/HoboApp` remain in the workspace for export,
    mapping, verification, and archival reference
  * Production-facing migration access is limited to the read-only export
    scripts under `scripts/migrate-hobo/`
  * The OpenVibe runtime does not require the legacy Hobo services to be
    running in default mode

---

## Quick start (local dev)

```bash
# 1. Install workspace deps
cd /opt/openvibe
npm install

# 2. Boot the event backbone
cd services/openvibe-events
cp .env.example .env
npm start                     # listens on :4400

# 3. Boot the control plane (separate terminal)
cd services/openvibe-network
cp .env.example .env
npm start                     # listens on :4100

# 4. Optional: point staging/prod at Postgres and Redis.
#    Local bootstrap can stay on SQLite, but staging/prod should set:
#       OPENVIBE_PERSISTENCE_MODE=postgres
#       OPENVIBE_DATABASE_URL=postgres://...
#       OPENVIBE_REDIS_URL=redis://...
```

For the migration and cutover workflow, use the docs under `docs/openvibe/`
and the scripts under `scripts/migrate-hobo/`.

---

## Validation

The intentionally-light validation covers the surfaces listed in
[PHASES.md](PHASES.md). After any change, run:

```bash
cd /opt/openvibe
npm run check                 # node --check across every server file
npm test                      # focused module tests
```
