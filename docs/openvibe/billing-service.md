# openvibe-billing

Port `5000`. Owns wallets, the ledger, credit checkouts, spends, refunds,
and economy freeze.

## Database

SQLite (better-sqlite3) with `WAL` and `foreign_keys=ON`. All ledger
mutations run inside `db.get().transaction(...)`.

| Table                          | Purpose                                                       |
|--------------------------------|---------------------------------------------------------------|
| `billing_wallets`              | (`owner_type`, `owner_id`, `wallet_type`, `currency`) — unique|
| `billing_ledger`               | append-only entries; never updated, never deleted             |
| `billing_balance_snapshots`    | per-wallet running balance (regenerable from ledger)          |
| `billing_checkout_sessions`    | provider checkouts                                            |
| `billing_webhook_receipts`     | UNIQUE (`provider`, `external_event_id`)                      |
| `billing_tips`                 | one row per tip / superchat / TTS / media-request             |
| `billing_subscription_plans`   | VIP plans                                                     |
| `billing_subscriptions`        | VIP subscriptions                                             |
| `billing_creator_balances`     | creator earnings rollup                                       |
| `billing_idempotency`          | per-scope idempotent response cache                           |
| `billing_audit`                | admin actions (grants, refunds, cancels)                      |
| `billing_economy_state`        | single-row freeze switch                                      |
| `billing_legacy_map`           | (`source`, `kind`, `legacy_id`) → `new_id` for migrations     |

## Money model

- All amounts are integer **minor units**. Default currency `OVC`
  (1 credit = 1 minor unit). `PLATFORM_FEE_BPS` configures a fee on
  tips and subscriptions in basis points (10000 = 100%).
- Wallet types: `credits` (spendable balance), `creator` (net earnings),
  `platform` (system fees, owner = `system/platform`).

## Ledger guarantees

1. **Atomicity** — every multi-row post is wrapped in `db.transaction(...)`.
2. **Idempotency** — when an `idempotency_key` is provided, a replay
   returns the existing transaction group without re-posting. Tips use
   `billing_tips.idempotency_key` (UNIQUE).
3. **Refund == compensating entries** — `refundTransactionGroup` inserts
   reversal rows (`transaction_type='reversal'`, opposite direction).
   Originals are never mutated.
4. **Snapshots are derived** — `recomputeBalanceFromLedger` always
   produces the same value as the snapshot for `status='posted'` rows.
5. **No negative balances** unless `allowNegative=true` (refund path).
   Spend attempts that would go negative throw `EFUNDS` with HTTP `402`.
6. **Frozen economy** — a single-row toggle in `billing_economy_state`;
   while frozen, every credit-spending operation throws `EFROZEN`
   (HTTP `423`) but reads and admin endpoints remain available.

## REST surface (`/api/billing`)

```
GET    /_ping
GET    /admin/summary | /admin/ledger | /admin/wallets | /admin/tips
GET    /admin/subscriptions
POST   /admin/freeze | /admin/unfreeze

GET    /wallet/:ownerType/:ownerId            ?wallet_type&currency
GET    /wallet/:ownerType/:ownerId/transactions
POST   /wallet/:ownerType/:ownerId/adjust     {amount_minor,reason,…} (admin/service)

POST   /credits/checkout                      {owner_type,owner_id,credits_minor,provider,…}
POST   /credits/checkout/:id/complete         (server-driven completion)
POST   /webhooks/:provider                    (idempotent via UNIQUE external_event_id)

POST   /credits/charge                        {owner_type,owner_id,amount_minor,target_type,target_id,…}
POST   /credits/refund                        {transaction_group_id,reason}

GET    /entitlements/:targetType/:targetId
POST   /entitlements/check                    {subscriber_*, target_owner_*}
GET    /entitlements                          (admin/service)
```

## Auth model

| Caller     | Header(s)                                                           |
|------------|---------------------------------------------------------------------|
| Service    | `X-Internal-Key: <INTERNAL_API_KEY>` + `X-OpenVibe-Service: <name>` |
| User       | bearer / cookie via kernel issuer (when wired)                      |
| Anonymous  | only `GET /api/tips/overlay/:targetType/:targetId`                  |

Decisions live in `server/policy.js`. Mutations always go through
`policy.assert(decideX(...))`.

## Configuration

| Env                          | Default                  | Notes                                  |
|------------------------------|--------------------------|----------------------------------------|
| `PORT`                       | `5000`                   |                                        |
| `INTERNAL_API_KEY`           | (required)               | trusted-service header                 |
| `DB_PATH`                    | `data/billing.sqlite`    | better-sqlite3 file                    |
| `OPENVIBE_EVENTS_URL`        | `http://127.0.0.1:4400`  | events backbone                        |
| `PLATFORM_FEE_BPS`           | `0`                      | basis points; 250 = 2.5%               |
| `CREDITS_CURRENCY`           | `OVC`                    |                                        |
| `PAYMENT_PROVIDER_DEFAULT`   | `stub`                   | overrides per checkout via `provider`  |
| `PUBLIC_BASE_URL`            | `http://127.0.0.1:5000`  | used by stub provider for return URLs  |

## Smoke test

```
node services/openvibe-billing/test/billing-smoke.test.js
```

Exercises wallet idempotency, purchase + replay, charge / EFUNDS,
refund / snapshot-vs-recompute, tip with platform fee, superchat
variant, plan + subscription + cancel, economy freeze, policy
decisions, legacy mapping.
