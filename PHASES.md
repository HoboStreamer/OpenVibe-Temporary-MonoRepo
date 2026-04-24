# OpenVibe — Phase status

Numbering follows the later (corrected) numbering used in
[context/META_PROMPT_FOR_CHATGPT.md](context/META_PROMPT_FOR_CHATGPT.md):

| # | Name | Status | Where |
|---|---|---|---|
| 1 | Platform Kernel Foundations | ✅ implemented in this commit | `services/openvibe-network`, `services/openvibe-events`, `packages/openvibe-contracts`, `packages/openvibe-sdk` |
| 2 | Identity / Control Plane Extraction | ✅ implemented in this commit (federation mode) | `services/openvibe-network/server/identity.js` + host surfaces |
| 3 | Media platform extraction | ⏳ deferred | `HoboStreamer.com/server/media`, `vod`, `thumbnails` will lift into `openvibe-media` |
| 4 | Chat / community / product migration | ⏳ deferred | future `openvibe-chat`, `openvibe-community` |
| 5 | Billing / credits / tips ledger | ⏳ deferred | future `openvibe-billing` |
| 6 | AI backend orchestration | ⏳ deferred | future `openvibe-ai` |
| 7 | Mods + trust tiers | ⏳ deferred | extends capability + policy registries |

## Phase 1 — Platform Kernel Foundations: acceptance

1. `services/openvibe-events` boots, persists events with full envelope
   (`event_id`, `trace_id`, `event_type`, `version`, `source`, `actor_*`,
   `timestamp`, `payload`), supports topic + subscription filtering, has a
   work-queue with ack / retry, and a dead-letter table. ✅
2. `services/openvibe-network` exposes:
   * `POST/GET /api/v1/user-modules/:userId/:namespace` — namespaced shared
     user data, owner-attested writes, schema/version aware. ✅
   * `POST/GET /api/v1/services` — service registry (id, internal/public URL,
     declared capabilities + topics, last heartbeat). ✅
   * `POST/GET /api/v1/capabilities` — capability registry (owner service,
     input/output schemas, version, rate-limit policy). ✅
   * `POST/GET /api/v1/contracts` — contract registry (event/user-module/media
     schema definitions). ✅
3. The policy engine ([server/policy.js](services/openvibe-network/server/policy.js))
   is the single decision point used by all four registries above and by the
   user-modules API. ✅
4. All writes are audited in `audit_log`. ✅
5. No client-trusted writes — every mutating route runs through both
   `requireOpenVibeAuth` and `policy.assert(...)` before touching the DB. ✅

## Phase 2 — Identity / Control Plane Extraction: acceptance

1. Host-aware routing serves `auth.openvibe.network`, `api.openvibe.network`,
   `admin.openvibe.network`, `my.openvibe.network`,
   `themes.openvibe.network`. ✅
2. `auth.openvibe.network` exposes
   `/.well-known/openid-configuration` and `/.well-known/jwks.json` with the
   active RS256 public key (the existing hobo-tools key in federation mode).
   It also redirects to the existing hobo-tools `/oauth/authorize` so existing
   client redirects keep working. ✅
3. `themes.openvibe.network`, `admin.openvibe.network`,
   `my.openvibe.network` serve OpenVibe-branded shells **and** transparently
   proxy the existing hobo-tools API for the legacy surfaces, so existing
   browsers continue working through the new domains. ✅
4. URL registry compatibility: the OpenVibe network mirrors the
   `hobo-tools` registry plus `OPENVIBE_*` keys with documented Hobo
   fallbacks. ✅
5. HoboStreamer can verify a token from **either** `hobo.tools` or
   `auth.openvibe.network` via the additive `OPENVIBE_*` env vars
   (compat shim in [HoboStreamer.com/server/auth/openvibe-issuer.js](../HoboStreamer.com/server/auth/openvibe-issuer.js)).
   When the OpenVibe env vars are absent the existing Hobo flow is bit-for-bit
   unchanged. ✅

## Validation

```bash
cd /opt/openvibe
npm install
npm run check       # node --check across every server file
npm test            # in-repo module tests
```

Manual local validation steps live in
[services/openvibe-network/README.md](services/openvibe-network/README.md)
and [services/openvibe-events/README.md](services/openvibe-events/README.md).
