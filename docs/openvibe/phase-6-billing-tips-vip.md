# Phase 6 — Billing, Tips, VIP

OpenVibe Phase 6 introduces `services/openvibe-billing` (port `5000`),
the canonical home for the platform's credit ledger, tips, super-chat /
TTS / media-request micro-payments, and VIP / subscription billing.

## Why a dedicated service

Billing has different correctness requirements than the rest of the
platform — every state change must be auditable, idempotent, and
recoverable from raw ledger rows. Co-locating it with chat, media, or
streaming would make it harder to reason about transactional safety.

## Surface

| Concern              | Where                                                         |
|----------------------|---------------------------------------------------------------|
| Wallets + ledger     | `services/openvibe-billing/server/{model,ledger}.js`          |
| Credits checkout     | `POST /api/billing/credits/checkout(:id/complete)`            |
| Spend / refund       | `POST /api/billing/credits/{charge,refund}`                   |
| Webhooks             | `POST /api/billing/webhooks/:provider` (idempotent)           |
| Tips / superchat / … | `POST /api/tips`, `GET /api/tips/overlay/:targetType/:targetId` |
| VIP plans            | `POST/GET/PUT /api/vip/plans`                                 |
| Subscriptions        | `POST /api/vip/subscriptions(:id/{cancel,renew})`             |
| Entitlements         | `GET /api/billing/entitlements/:targetType/:targetId`         |
| Economy freeze       | `POST /api/billing/admin/{freeze,unfreeze}`                   |

## Auth

- Service callers send `X-Internal-Key` + `X-OpenVibe-Service`. The
  request gets `req.serviceActor = '<service id>'`. Service callers are
  trusted for cross-actor mutations (charges on behalf of users, refunds,
  freeze/unfreeze).
- User callers use the kernel-issued bearer/cookie auth (when wired) and
  may only act on their own wallets/tips/subscriptions.
- Anonymous callers can only hit truly public endpoints (overlay feed).

## Events

| Topic              | Examples                                                    |
|--------------------|-------------------------------------------------------------|
| `billing.events`   | `billing.credits.purchased`, `billing.credits.charged`, `billing.credits.refunded`, `billing.economy.frozen`/`unfrozen`, `billing.webhook.received`/`processed` |
| `tips.events`      | `tips.tip.created`, `tips.superchat.created`, `tips.tts.created`, `tips.media_request.created`, `tips.tip.refunded` |
| `vip.events`       | `vip.subscription.created`/`activated`/`renewed`/`cancelled`, `vip.entitlement.granted`/`revoked` |

See `packages/openvibe-contracts/billing-events.js` for the complete
catalog.

## Documents

- [billing-service.md](billing-service.md) — REST API, schema, ledger
  semantics, idempotency rules.
- [tips-service.md](tips-service.md) — interaction types, overlay feed,
  visibility model.
- [vip-service.md](vip-service.md) — plans, subscriptions, entitlements.
- [legacy-billing-migration.md](legacy-billing-migration.md) — Hobo Coins
  vs. Hobo Bucks, the import strategy, and what stays in HoboStreamer.
