# HoboStreamer ↔ OpenVibe compat shim

Phase 2 of the OpenVibe migration is **purely additive** for HoboStreamer:
the legacy hobo.tools SSO continues to be the authoritative issuer until
Phase 3. This document records the additive surface area.

## Files

| File | Change |
|---|---|
| `server/auth/openvibe-issuer.js` | NEW — loads `OPENVIBE_AUTH_PUBLIC_KEY`; inert when `OPENVIBE_AUTH_URL` unset. |
| `server/auth/auth.js` | `verifyToken()` peeks the `iss` claim and routes OpenVibe-issued tokens through the new verifier. Hobo-issued tokens still go through the existing path unchanged. |
| `server/index.js` | `getAllowedOrigins()` adds OpenVibe surface origins when their env vars are set. |

## New env vars (all optional; behaviour unchanged when absent)

| Var | Purpose |
|---|---|
| `OPENVIBE_AUTH_URL` | Issuer URL of the OpenVibe network (e.g. `https://auth.openvibe.network`). When set, tokens whose `iss` matches this value are verified using the OpenVibe public key. |
| `OPENVIBE_AUTH_PUBLIC_KEY` | Path to the OpenVibe RS256 PEM. Falls back to `./data/keys/openvibe-public.pem` and `/opt/openvibe/services/openvibe-network/data/keys/openvibe-public.pem`. |
| `OPENVIBE_NETWORK_URL` / `OPENVIBE_API_URL` / `OPENVIBE_ADMIN_URL` / `OPENVIBE_MY_URL` / `OPENVIBE_THEMES_URL` | When set, those origins are added to the CORS allow-list so OpenVibe-branded subdomains can hit HoboStreamer APIs. |

## Verifier flow

1. Token arrives → `verifyToken(token)`.
2. We `jwt.decode` (no signature check) just to read `iss`.
3. If `iss` matches `OPENVIBE_AUTH_URL`, verify with the OpenVibe key.
4. Otherwise verify with the hobo.tools key (existing code path).
5. On failure either way, return `null` and the request is anonymous.

The OpenVibe network's JWKS / OIDC discovery already advertises *both* keys
(see `services/openvibe-network/server/identity.js`), so Phase 2 reaches a
state where every Hobo-issued token is also acceptable to OpenVibe consumers
without a key rotation.

## Rollback

Unset `OPENVIBE_AUTH_URL` and restart. The new code paths short-circuit
(`isEnabled()` returns false) and HoboStreamer behaves exactly as it did
before this change.
