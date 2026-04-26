# openvibe-billing

OpenVibe Phase 6 — shared billing, credits, ledger, tips, and VIP/subscription
service. See [`docs/openvibe/phase-6-billing-tips-vip.md`](../../docs/openvibe/phase-6-billing-tips-vip.md).

## Quick start

```bash
cp .env.example .env
node server/index.js
# health
curl http://127.0.0.1:5000/health
```

## API surface

- `GET  /health`
- `GET  /api/billing/wallet/:ownerType/:ownerId`
- `GET  /api/billing/wallet/:ownerType/:ownerId/transactions`
- `POST /api/billing/wallet/:ownerType/:ownerId/adjust`           (admin/service)
- `POST /api/billing/credits/checkout`
- `POST /api/billing/credits/checkout/:sessionId/complete`
- `POST /api/billing/webhooks/:provider`
- `POST /api/billing/credits/charge`                              (idempotent)
- `POST /api/billing/credits/refund`                              (idempotent)
- `POST /api/tips`                                                (idempotent)
- `GET  /api/tips`
- `GET  /api/tips/:tipId`
- `POST /api/tips/:tipId/refund`
- `GET  /api/tips/overlay/:targetType/:targetId`
- `POST /api/vip/plans`
- `GET  /api/vip/plans`
- `GET  /api/vip/plans/:planId`
- `PUT  /api/vip/plans/:planId`
- `POST /api/vip/subscriptions`
- `GET  /api/vip/subscriptions`
- `GET  /api/vip/subscriptions/:id`
- `POST /api/vip/subscriptions/:id/cancel`
- `POST /api/vip/subscriptions/:id/renew`
- `GET  /api/billing/entitlements/:targetType/:targetId`
- `POST /api/billing/entitlements/check`
- Admin: `/api/billing/admin/{summary,ledger,wallets,tips,subscriptions,freeze,unfreeze}`

Service-callers send `X-Internal-Key` + `X-OpenVibe-Service`. End-user callers
send a bearer/cookie token validated by the kernel auth middleware (or run
unauthenticated for read-only public endpoints).
