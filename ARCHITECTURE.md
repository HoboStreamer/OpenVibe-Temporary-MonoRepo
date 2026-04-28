# OpenVibe — Architecture rules

These rules are inherited from [context/PLAN.md §4](context/PLAN.md) and apply
to every service inside this monorepo. They are deliberately short so they can
fit in a contributor's head.

1. **Identity is centralized.** Only `auth.openvibe.network` (via
   `services/openvibe-network`) issues or attests tokens for the OpenVibe
   runtime. Legacy Hobo identity data may be imported, reconciled, or verified
   during migration tooling, but the default runtime must not depend on a live
   `hobo.tools` process.
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
9. **Legacy repos are source-only.** `HoboReposToMigrateFrom/*` exist for
   export, validation, and archival reference. No default OpenVibe route may
   proxy into or require those runtimes.

## Repo / runtime ownership

| Concern | Legacy source | Native OpenVibe owner | Runtime note |
|---|---|---|---|
| User auth + OAuth2 + JWKS | `HoboApp/hobo-tools` | `services/openvibe-network` | Legacy users/clients are migration input only |
| URL registry | `HoboApp/hobo-tools` | `services/openvibe-network` | Legacy registry data is imported/mapped, not proxied |
| Themes UI / catalog | `HoboApp/hobo-tools` | `services/openvibe-network` host surfaces | Native shell owns runtime UI |
| Admin panel | `HoboApp/hobo-tools` | `services/openvibe-network` host surfaces | Native shell owns runtime UI |
| Account hub (`my.*`) | `HoboApp/hobo-tools` | `services/openvibe-network` host surfaces | Native shell owns runtime UI |
| Tools / directory hub | Hobo utility catalog + docs | `services/openvibe-network` host surfaces | Registry-backed discovery |
| Event backbone | (none) | `services/openvibe-events` | Native runtime only |
| User modules / capability / contract registry | (none) | `services/openvibe-network` API | Native runtime only |
| Streaming runtime | `HoboStreamer.com` | `services/openre-stream` + `services/openvibe-live` | Legacy stream data migrates into native services |

## Extraction seams

* Every API in `services/openvibe-network/server/api/*.js` is mounted onto a
  single `apiRouter` so it can be lifted into its own Express app without
  rewrites.
* Identity is encapsulated in [services/openvibe-network/server/identity.js](services/openvibe-network/server/identity.js)
   so legacy issuers can be handled during migration without leaking Hobo-aware
   assumptions into the rest of the runtime.
* The event backbone is reached only through
  [packages/openvibe-sdk/events-client.js](packages/openvibe-sdk/events-client.js)
  so the storage layer (currently SQLite) can be swapped for Redis / NATS /
  Kafka without rewriting publishers or consumers.
