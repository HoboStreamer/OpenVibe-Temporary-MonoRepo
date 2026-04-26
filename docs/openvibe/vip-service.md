# VIP / subscriptions

OpenVibe's recurring-billing surface lives under `/api/vip/*` inside
`openvibe-billing`. A VIP plan is a recurring price set by a creator
(or admin) that grants subscribers an entitlement (badge, perks,
custom emotes — perks are descriptive metadata; gating is done by the
consuming service via entitlement check).

## Plans

```
POST   /api/vip/plans         { owner_type, owner_id, name, amount_minor, currency, billing_interval, perks?, visibility? }
GET    /api/vip/plans         (visibility-filtered for non-owner/non-admin)
GET    /api/vip/plans/:planId
PUT    /api/vip/plans/:planId
```

`billing_interval` is one of `month` | `year` | `lifetime`. Plan
management is gated by `decidePlanManage` (owner / admin / service).

## Subscriptions

```
POST   /api/vip/subscriptions               { plan_id, subscriber_actor_type?, subscriber_actor_id?, idempotency_key? }
GET    /api/vip/subscriptions               (self list for users; admin/service can filter)
GET    /api/vip/subscriptions/:id
POST   /api/vip/subscriptions/:id/cancel    { reason? }
POST   /api/vip/subscriptions/:id/renew     { idempotency_key? }
```

`POST /subscriptions` runs the same double-entry ledger post as a tip
(`subscription_charge` debit on subscriber → `creator_earning` credit on
plan owner → optional `platform_fee`) inside a single
`db.get().transaction(...)` and writes a `billing_subscriptions` row
with:

- `current_period_start = now`
- `current_period_end = now + billing_interval`
- `last_charge_transaction_group_id` linked to the ledger group

Cancellation flips status to `cancelled` and stamps `cancelled_at`.
**No automatic refund** — entitlement is honored to the existing
`current_period_end`. Issue a manual refund via
`POST /api/billing/credits/refund` if needed.

## Entitlements

```
GET  /api/billing/entitlements/:targetType/:targetId
POST /api/billing/entitlements/check     { subscriber_*, target_owner_* }
```

`check` returns `{ active: boolean, items: [...] }` so other services
(`openvibe-chat`, `openvibe-live`, `openvibe-community`) can gate
custom-emote / pinned-message / VIP-only-room features without owning
billing state themselves.

## Events (`vip.events`)

- `vip.plan.created`, `vip.plan.updated`
- `vip.subscription.created`
- `vip.subscription.activated`
- `vip.subscription.renewed`
- `vip.subscription.cancelled`
- `vip.entitlement.granted`
- `vip.entitlement.revoked`
