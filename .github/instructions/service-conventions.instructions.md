---
description: "OpenVibe service route + cross-service conventions. Use when: editing files under services/*/server (Express routes, api modules, route registration, SDK calls, event publishes)."
applyTo: "services/**/server/**"
---

# OpenVibe service code conventions

Architecture rules: [ARCHITECTURE.md](../../ARCHITECTURE.md). Phase truth:
[PHASES.md](../../PHASES.md). Per-service docs live next to each service.

## Route registration

- Add new routes **inside** the function that builds the router (commonly
  `routes.js`, sometimes `server/api/<feature>.js`) and **before** the
  trailing `return r;`. Bare top-level `app.get(...)` calls escape the
  liftable `apiRouter` pattern.
- Every public API in `services/openvibe-network/server/api/*.js` is mounted
  on a single `apiRouter` so the service can be lifted into its own Express
  app — preserve that.
- New JSON status routes follow the `/product/status` and `/<surface>/product/status`
  shape used by chat, community, content, billing, and live (see Phase 16
  notes). Return zeros for unknown sub-keys, never silent green.

## Cross-service communication

- **Never** write to another service's database directly.
- Talk via:
  - `@openvibe/sdk` clients (`MediaClient`, `BillingClient`, `ChatClient`,
    `CommunityClient`, `StreamClient`, `AiClient`, etc.) for synchronous
    capability calls.
  - `@openvibe/sdk/events-client` for asynchronous fanout. All events,
    capabilities, contracts, and user-modules carry a `version` — pass it
    explicitly.
  - The capability registry on `openvibe-network` for declared/granted
    capabilities.
- Identity is centralized in
  [services/openvibe-network/server/identity.js](../../services/openvibe-network/server/identity.js).
  Do not reissue or attest tokens elsewhere.

## Legacy Hobo

- Folders under `compat/` and `HoboReposToMigrateFrom/` are migration /
  reference / archive inputs only. **No default route may proxy into or
  require a live `hobo.tools` / hobostreamer process.** Legacy proxies must
  be gated behind `OPENVIBE_LEGACY_COMPAT_MODE` and the relevant `HOBO_*_URL`.

## Network host-routed assets

In [services/openvibe-network/server/index.js](../../services/openvibe-network/server/index.js),
`attachIconAssets(...)` MUST be mounted **before** `attachHostRouter(...)`
or `/assets/openvibe-icons.{js,css}` will be intercepted by the host router's
404 fallback.

## Validation

After service edits, run the smallest meaningful slice first:

```
npm test -- --component=openvibe-<svc>
```

For shared SDK/contracts/persistence/runtime changes: `npm run test:fast`.
