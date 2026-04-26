# Legacy billing migration

This document spells out how the existing HoboStreamer money flows map
to `openvibe-billing` without breaking the legacy site or double-counting
balances during cutover.

## What HoboStreamer has today

| Legacy concept    | Reality                                                 |
|-------------------|---------------------------------------------------------|
| **Hobo Coins**    | Free in-app credits. Earned by activity, no real money. |
| **Hobo Bucks**    | Real-money credits. Purchased via PayPal.               |
| Donations         | One-off Hobo Bucks transfers from viewer → creator.     |
| Cashout           | Creator → PayPal payout in HoboStreamer.                |
| Subscriptions     | Not yet productized.                                    |

## Mapping

| Legacy                               | OpenVibe                                                    | Notes                                                                                       |
|--------------------------------------|-------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| Hobo Coins (free)                    | **NOT imported**                                            | They are a gameplay currency, not a financial liability. Stay in HoboStreamer.              |
| Hobo Bucks (paid)                    | `billing_wallets.wallet_type='credits'`, `currency='OVC'`   | Mirror via `mirrorPurchaseSafe(...)` from the bridge.                                       |
| Hobo Bucks purchase (PayPal)         | `billing_ledger.transaction_type='credit_purchase'`         | `idempotency_key='hobostreamer:purchase:<legacy_id>'` to make replays safe.                 |
| Donation (Hobo Bucks)                | `billing_tips` row + double-entry ledger post               | `mirrorDonationSafe(...)` from the bridge. Use `interaction_type='tip'` (or `superchat`).   |
| Cashout                              | Stays in HoboStreamer for now                               | Eventually moves behind a `billing_creator_balances`-aware payout worker.                   |
| PayPal config                        | Stays in HoboStreamer (`OVH.md`)                            | Once fully migrated, becomes `services/openvibe-billing/server/providers/paypal.js`.        |

## How mirroring works

`/opt/hobostreamer/server/openvibe-bridge/billing.js` is **inert** unless
`OPENVIBE_BILLING_URL` (and `INTERNAL_API_KEY`) are set. Each helper
(`chargeCreditsSafe`, `mirrorPurchaseSafe`, `mirrorDonationSafe`,
`mirrorSubscriptionSafe`, `entitlementCheckSafe`, `getWalletSafe`) returns
`{ ok: false, skipped: true }` when disabled and `{ ok: false, error }`
on any HTTP failure — the legacy code path remains the source of truth
during cutover.

When mirroring is enabled, every HoboStreamer money mutation should call
the appropriate `*Safe` helper after the legacy post succeeds. Use a
deterministic `idempotency_key` (e.g.
`hobostreamer:donation:<tx_id>`) so replays during catch-up jobs do not
double-credit the OpenVibe ledger.

## The legacy map

`billing_legacy_map(source, kind, legacy_id) → new_id` exists so that
later code can answer the question "did we already mirror legacy
transaction X?" without scanning the entire `billing_ledger`. Use
`source='hobostreamer'`, `kind ∈ {'transaction','donation','subscription'}`.

## Cutover plan

1. Deploy `openvibe-billing` with `OPENVIBE_BILLING_URL` **unset** in
   HoboStreamer so the bridge stays inert.
2. Backfill Hobo Bucks balances by replaying legacy paid-tx history
   into `mirrorPurchaseSafe(...)` from a one-shot script (idempotency
   keys make this safe to re-run).
3. Set `OPENVIBE_BILLING_URL` so live mutations start mirroring in
   real time. The legacy ledger remains canonical until step 4.
4. Switch HoboStreamer reads to query `openvibe-billing` via
   `getWalletSafe(...)`, then retire the legacy wallet table.
5. Move PayPal handling into `services/openvibe-billing/server/providers/paypal.js`
   and retire the HoboStreamer-side payout worker.
