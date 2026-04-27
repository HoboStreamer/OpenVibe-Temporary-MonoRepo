# Legacy billing cutover notes

This document records the **current authoritative billing stance** for the
Hobo → OpenVibe migration.

Older notes that described mirroring Hobo Bucks balances into OpenVibe credits
are superseded by the hard-cutover plan in
`docs/openvibe/persistence-cutover-plan.md`.

## What is not imported into canonical OpenVibe billing

| Legacy concept | Current stance | Why |
|---|---|---|
| **Hobo Bucks balances** | **NOT imported** | The legacy balance model is not treated as authoritative ledger truth. |
| `transactions` rows as balance truth | **NOT imported as canonical wallet state** | Historical rows may still be archived/exported for audit and reconciliation, but they do not seed OpenVibe balances. |
| `donation_goals.current_amount` | **NOT imported** | It is derived from the legacy Hobo Bucks model and must be rebuilt explicitly if needed later. |
| **Hobo Coins** | **NOT imported into billing** | They are a free loyalty/product currency, not a canonical billing liability. |

## What is preserved in this migration foundation

| Legacy concept | OpenVibe handling | Notes |
|---|---|---|
| Subscription relationships | `billing/subscriptions` canonical bundle dataset | Preserved as legacy entitlement records for explicit plan remap. |
| Historical finance references | export/archive + reconciliation manifests | Archive-only unless a later explicit historical importer is approved. |
| Legacy ID dedupe seam | `billing_legacy_map` | Useful for replay safety and later audit/reconciliation tooling. |

## Secrets and provider credentials

The migration scaffold does **not** bulk-import or log:
- PayPal/provider secrets
- webhook secrets
- API keys/tokens
- host-specific billing config

Those values must be rotated or re-entered explicitly in OpenVibe.

## Role of `billing_legacy_map`

`billing_legacy_map(source, kind, legacy_id)` remains valuable as a stable
dedupe and reconciliation seam.

It can answer questions like:
- "Did we already record a legacy subscription relationship?"
- "Did this archived legacy finance reference already get attached to a
  reconciliation manifest?"

It should **not** be interpreted as approval to carry Hobo Bucks balances into
OpenVibe as canonical credits.

## Hard-cutover billing sequence

1. Export legacy billing-relevant rows in read-only mode.
2. Confirm the exclusion set still includes Hobo Bucks balance artifacts.
3. Build the canonical OpenVibe bundle and reconciliation manifests.
4. Stand up OpenVibe billing on its own canonical ledger/configuration.
5. Cut reads/writes over to OpenVibe billing.
6. Leave legacy Hobo billing data archived/read-only for audit and rollback,
   then redirect the legacy Hobo surfaces.
