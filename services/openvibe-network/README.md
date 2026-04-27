# openvibe-network

The OpenVibe **control plane** — identity surface, four registries
(user-modules, service, capability, contract), URL registry overlay, policy
engine seam, and host-aware routing for the OpenVibe-branded subdomains.

This service deliberately runs *alongside* the legacy `hobo.tools` install
during the migration and federates with it: hobo-tools-issued JWTs are
trusted, the JWKS advertises the hobo-tools key, and the legacy admin / themes
/ my-account UIs are transparently proxied through the new domains.

## Run

```bash
cd /opt/openvibe/services/openvibe-network
cp .env.example .env
npm install
# Optional: federate with the existing hobo-tools install
#   set HOBO_TOOLS_URL, HOBO_TOOLS_INTERNAL_URL, HOBO_TOOLS_PUBLIC_KEY in .env
npm start            # http://localhost:4100
```

## Surfaces

The single Express app serves five logical surfaces, decided by Host header:

| Host | Surface | Notes |
|---|---|---|
| `auth.openvibe.network` | OIDC + OAuth2 | discovery + JWKS local; `/oauth/*` federated to hobo-tools |
| `api.openvibe.network`  | shared API | mounts `/api/v1/*` (registries, user-modules) |
| `admin.openvibe.network`| operator UI | OpenVibe shell at `/`, legacy paths proxied |
| `my.openvibe.network`   | account hub | OpenVibe shell at `/`, legacy paths proxied |
| `themes.openvibe.network`| theme catalog | OpenVibe shell at `/`, legacy paths proxied |

For local dev without DNS, hit the same port and use the `Host:` header:

```bash
curl -H 'Host: admin.openvibe.network' http://localhost:4100/
curl -H 'Host: auth.openvibe.network' http://localhost:4100/.well-known/openid-configuration
```

## Phase 1 — kernel APIs

All under `/api/v1`. Mutating routes require either:
* a user JWT with `role=admin`, OR
* `X-Internal-Key: <INTERNAL_API_KEY>` plus `X-OpenVibe-Service: <service-id>`
  (this sets `req.serviceActor` and the policy engine treats the caller as
  that service).

| Method | Path | Purpose |
|---|---|---|
| `GET/PUT` | `/user-modules/:userId/:namespace` | namespaced shared user data |
| `GET` | `/user-modules/:userId` | list visible namespaces |
| `GET` | `/user-modules/:userId/:namespace/history` | per-row changelog |
| `GET/POST` | `/services` | service registry |
| `POST` | `/services/:id/heartbeat` | liveness ping |
| `GET/POST` | `/capabilities` | capability registry |
| `GET/POST` | `/contracts` | contract registry |
| `GET` | `/url-registry/resolved` | merged hobo-tools + OpenVibe URL view |
| `PUT` | `/url-registry/overlay/:key` | OpenVibe-only registry override |
| `GET` | `/me` | decoded JWT |
| `GET` | `/audit` | audit log (admin) |
| `GET` | `/topics`, `/namespaces` | known constants |

## Manual smoke

```bash
KEY=$(grep '^INTERNAL_API_KEY=' .env | cut -d= -f2)

# register a service as itself
curl -s -X POST http://localhost:4100/api/v1/services \
  -H "X-Internal-Key: $KEY" -H "X-OpenVibe-Service: openvibe-live" \
  -H 'Content-Type: application/json' \
  -d '{"service_id":"openvibe-live","display_name":"OpenVibe Live (HoboStreamer)",
       "internal_url":"http://127.0.0.1:3000","public_url":"https://hobostreamer.com",
       "capabilities":["chat.send_message"],"topics":["stream.events","chat.events"]}'

# write a user module as the owner service
curl -s -X PUT http://localhost:4100/api/v1/user-modules/42/live.profile \
  -H "X-Internal-Key: $KEY" -H "X-OpenVibe-Service: openvibe-live" \
  -H 'Content-Type: application/json' \
  -d '{"schema_version":1,"data":{"display_name":"Hobo McNomad","color":"#c0965c"}}'

# read it back as anyone
curl -s http://localhost:4100/api/v1/user-modules/42/live.profile
```

## Staging migration rehearsal

The current Phase 8 cutover rehearsal does **not** pretend standalone OpenVibe
auth is finished. Instead, the staging loader writes migrated identity,
linked-account, theme, notification, and control-plane rows into
`staging_import_records` (plus `url_registry_overlay` for resolved URL keys)
inside the network SQLite database. This makes migrated accounts and control
plane data auditable in staging while the public auth flow can still run in
federation mode to `hobo-tools`.

Use the readiness report at
`openvibe-target/audit/readiness-report.json` to distinguish:

- green: route/surface is live and migrated data is present
- yellow: migrated data is staged but standalone auth/runtime modeling is not
  complete yet
- red: a required route or dataset is missing entirely
