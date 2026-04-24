# OpenVibe — Architecture rules

These rules are inherited from [context/PLAN.md §4](context/PLAN.md) and apply
to every service inside this monorepo. They are deliberately short so they can
fit in a contributor's head.

1. **Identity is centralized.** Only `auth.openvibe.network` (via
   `services/openvibe-network`) issues or attests tokens. During the migration
   it federates with `hobo.tools` instead of replacing it.
2. **Cross-service writes go through the platform.** No service writes to
   another service's database. Cross-service signal travels through the event
   backbone (`openvibe-events`) or through registered capabilities exposed by
   the owning service.
3. **Shared state is namespaced.** User-module, capability, contract, and
   service registry rows all carry an owner namespace. The policy engine
   enforces who may read or write each namespace.
4. **Everything is versioned.** Events, capabilities, contracts, and user
   modules all carry a `version` column. SDK consumers are required to pass it.
5. **Expensive work is asynchronous.** Long-running cross-service work fans out
   through the event backbone with at-least-once delivery, retries, and a DLQ.
6. **Composability over copy-paste.** A new product surface should compose
   existing capabilities (chat send, billing charge, media upload, …) rather
   than reimplement them.
7. **The platform is introspectable.** The capability registry, contract
   registry, service registry, and event topics are all queryable HTTP APIs.
8. **Mods are first-class.** Mods receive scoped tokens, register the
   capabilities they expose, and can only invoke capabilities they are granted
   by the policy engine.

## Repo / runtime ownership

| Concern | Today | Phase 1 / 2 target | Future repo |
|---|---|---|---|
| User auth + OAuth2 + JWKS | `HoboApp/hobo-tools` | `services/openvibe-network` (federates with hobo-tools) | `openvibe-network` |
| URL registry | `HoboApp/hobo-tools` | `services/openvibe-network` (mirror + extend) | `openvibe-network` |
| Themes UI / catalog | `HoboApp/hobo-tools` | proxied via `themes.openvibe.network` | `openvibe-themes` |
| Admin panel | `HoboApp/hobo-tools` | proxied via `admin.openvibe.network` | `openvibe-admin` |
| Account hub (`my.*`) | `HoboApp/hobo-tools` | proxied via `my.openvibe.network` | `openvibe-account` |
| Event backbone | (none) | `services/openvibe-events` | `openvibe-events` |
| User modules / capability / contract registry | (none) | `services/openvibe-network` API | `openvibe-network` |
| Streaming runtime | `HoboStreamer.com` | unchanged consumer | `openvibe-live` (Phase 3) |

## Extraction seams

* Every API in `services/openvibe-network/server/api/*.js` is mounted onto a
  single `apiRouter` so it can be lifted into its own Express app without
  rewrites.
* Identity is encapsulated in [services/openvibe-network/server/identity.js](services/openvibe-network/server/identity.js)
  — the only place that knows about hobo-tools federation. When the network
  becomes the issuer of record, only this file needs to change.
* The event backbone is reached only through
  [packages/openvibe-sdk/events-client.js](packages/openvibe-sdk/events-client.js)
  so the storage layer (currently SQLite) can be swapped for Redis / NATS /
  Kafka without rewriting publishers or consumers.
