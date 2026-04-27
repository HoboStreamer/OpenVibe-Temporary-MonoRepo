# OpenVibe

OpenVibe is the platform kernel and the federated set of product surfaces being
extracted from the existing **HoboStreamer.com** runtime and the **HoboApp** /
`hobo-tools` monorepo.

This folder is the working monorepo root for the kernel itself. Until the
extraction completes it intentionally lives **alongside** `HoboApp` and
`HoboStreamer.com` in the workspace, and it federates with the existing
`hobo.tools` SSO / URL registry instead of replacing it.

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
│   ├── openvibe-network/          Control plane (auth/api/admin/my/themes surfaces)
│   └── openvibe-events/           Event backbone (publish, subscribe, retry, DLQ)
└── compat/
    └── hobostreamer/              Notes on the additive HoboStreamer wiring
```

Both services are independent Node/Express apps with their own `package.json`.
The currently checked-in implementations still use `better-sqlite3` for local
bootstrap — same pattern as `hobo-tools` and HoboStreamer — so a developer can
run them without new infra. That SQLite pattern, plus the existing
federation/compat bridges, should be treated as **transitional scaffolding
only**: the production cutover target is PostgreSQL + Redis + object storage +
async workers, and the end-state is a hard cutover rather than indefinite
dual-runtime compatibility.

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
    JWKS derived from the existing `hobo-tools` RS256 public key (federation
    mode) so every existing Hobo token verifies on day one
  * Themes / admin / my-account surfaces transparently proxy to the existing
    `hobo-tools` runtime as a backward-compatibility layer; OpenVibe-native
    pages live alongside as the migration target
  * URL registry compatibility: the network service mirrors the existing
    hobo-tools registry and adds `OPENVIBE_*` keys with documented Hobo
    fallbacks

* **HoboStreamer compatibility**
  * Additive multi-issuer support so a single deployment can verify tokens
    issued by **either** `hobo.tools` or `auth.openvibe.network`
  * No public API renames, no schema changes, fully backwards compatible
    when the OpenVibe vars are absent
  * Compatibility bridges remain transitional. After migration validation, the
    intended end state is redirecting the legacy Hobo domains to the
    corresponding OpenVibe surfaces

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

# 4. (Optional) Federate with an existing hobo-tools install
#    so JWKS + registry compatibility kick in. Set in the openvibe-network .env:
#       HOBO_TOOLS_INTERNAL_URL=http://127.0.0.1:3100
#       HOBO_TOOLS_PUBLIC_KEY=/opt/HoboApp/hobo-tools/data/keys/public.pem
#       INTERNAL_API_KEY=<same as hobo-tools>
```

For HoboStreamer additive wiring see [compat/hobostreamer/README.md](compat/hobostreamer/README.md).

---

## Validation

The intentionally-light validation covers the surfaces listed in
[PHASES.md](PHASES.md). After any change, run:

```bash
cd /opt/openvibe
npm run check                 # node --check across every server file
npm test                      # focused module tests
```
