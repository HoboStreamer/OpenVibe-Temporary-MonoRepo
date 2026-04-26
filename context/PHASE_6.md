Analyze #file:PLAN.md to gain an in depth detailed understanding of the architecture and plans to continue migrating/editing/merging the `HoboStreamer.com` folder and the `HoboApp` monorepo folder based on the planning/memories for "OpenVibe" ( these plans were generated from a conversation with ChatGPT which can be seen in #file:PLANNING_CONVERSATION.md )

Analyze the #codebase then confirm the exact scope from the current OpenVibe migration plan before editing anything. You have already finished integrating/implementing Phase 1, Phase 2, Phase 3, Phase 4, and Phase 5 ( #file:PHASE_1_AND_2.md #file:PHASE_1_AND_2.md #file:PHASE_1_AND_2.md ) within the `openvibe` folder in this workspace.

Analyze the #codebase then complete OpenVibe Phase 6 end-to-end inside the current workspace.

Do not fetch external repository URLs. Do not mention or depend on any temporary repository URL. Treat the current VS Code workspace as the active OpenVibe migration workspace. The legacy Hobo source trees under `HoboReposToMigrateFrom/` are migration/reference sources only; new canonical OpenVibe implementation should live in the OpenVibe service/package structure already established in this workspace.

Important context:
- Phase 1 and Phase 2 are complete: OpenVibe kernel/control-plane foundations should already exist.
- Phase 3 is complete: `openvibe-media` should already exist.
- Phase 4 is complete: `openvibe-live`, `openre-stream`, and stream/media/restream integration should already exist.
- Phase 5 is complete: `openvibe-chat` and `openvibe-community` should already exist.
- Phase 6 = `openvibe-billing` + credits ledger + tips + VIP/subscriptions foundations.

Primary Phase 6 goals:

1. Build/evolve `openvibe-billing` as the shared OpenVibe billing, credits, wallet, ledger, subscription, tips, and creator-balance platform.
2. Add reusable OpenVibe billing contracts/events/capabilities/SDK client support.
3. Implement a ledger-first credits system that can power:
   - `openvibe.tips`
   - `openvibe.vip`
   - monetized chat/TTS/audio interactions
   - OpenVibe Live streamer tips/subscriptions
   - future mod/service monetization
4. Migrate/bridge legacy HoboStreamer transaction, subscription, coin/reward, media request payment, donation, and streamer monetization concepts without deleting legacy data.
5. Integrate Phase 6 with completed Phase 1–5 systems:
   - OpenVibe auth/control plane
   - OpenVibe events
   - OpenVibe user modules
   - OpenVibe service registry
   - OpenVibe capability registry
   - OpenVibe contract registry
   - OpenVibe policy engine
   - OpenVibe SDK/contracts packages
   - `openvibe-media`
   - `openvibe-live`
   - `openre-stream`
   - `openvibe-chat`
   - `openvibe-community`
6. Preserve legacy HoboStreamer behavior through adapters/wrappers until later cleanup phases.
7. Implement usable, testable API/UI/admin flows, not only placeholder tables.

Do not stop at planning. Implement the code.

---

# 0. Confirmatory analysis before edits

Before changing files, inspect the actual current workspace and report what exists.

First inspect these root/current OpenVibe files or directories if present:

- #file:README.md
- #file:PLAN.md
- #file:PHASES.md
- #file:package.json
- #file:docs
- #file:packages
- #file:packages/openvibe-contracts
- #file:packages/openvibe-sdk
- #file:services
- #file:services/openvibe-network
- #file:services/openvibe-events
- #file:services/openvibe-media
- #file:services/openvibe-live
- #file:services/openre-stream
- #file:services/openvibe-chat
- #file:services/openvibe-community
- #file:services/openvibe-billing
- #file:openvibe-billing
- #file:openvibe-tips
- #file:openvibe-vip

Then inspect these legacy migration sources if present:

- #file:HoboReposToMigrateFrom/HoboStreamer.com/README.md
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/index.js
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/config.js
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/db/schema.sql
- #file:HoboReposToMigrateFrom/HoboStreamer.com/public
- #file:HoboReposToMigrateFrom/HoboApp/README.md
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/README.md
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/index.js
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/config.js
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/db/database.js
- #file:HoboReposToMigrateFrom/HoboApp/packages

Then search #codebase for the actual Phase 1–5 implementations and inspect the exact files before editing:

- event backbone
- user modules
- service registry
- capability registry
- contract registry
- policy engine
- OpenVibe auth/control-plane compatibility layer
- OpenVibe SDK/contracts packages
- `openvibe-media`
- `openvibe-live`
- `openre-stream`
- `openvibe-chat`
- `openvibe-community`
- legacy HoboStreamer compatibility adapters
- admin/internal diagnostics surfaces

Before editing, report:

1. Where the event infrastructure currently lives.
2. Where user modules, service registry, capabilities, contracts, and policy enforcement currently live.
3. Where `openvibe-media`, `openvibe-live`, `openre-stream`, `openvibe-chat`, and `openvibe-community` currently live.
4. Which APIs/events/capabilities those services already expose that Phase 6 must integrate with.
5. Which files currently own or reference legacy:
   - transactions
   - subscriptions
   - channel subscriptions
   - Hobo coins / credits / rewards
   - donation goals
   - media requests
   - paid TTS / paid audio interactions
   - paid chat alerts / superchat-style interactions
   - creator balances / streamer monetization
   - Stripe/PayPal/payment processor integration, if any
   - admin monetization screens
   - billing-related schema tables
6. Which old routes/tables must remain compatibility adapters.
7. The exact files to edit/create.

Only after this confirmatory analysis should you implement.

---

# 1. Service boundary for Phase 6

## 1.1 `openvibe-billing` owns

`openvibe-billing` is the cross-platform money/value service.

It should own canonical OpenVibe state for:

- append-only ledger
- platform credits / tip balance
- wallet snapshots/materialized balances
- credit purchases
- credit spends
- tips/donations
- superchat-style paid messages
- paid TTS/audio/media request interactions
- VIP/member subscriptions
- creator/channel subscriptions
- creator earning balances
- pending/available balances
- refunds/reversals
- webhook receipt/idempotency records
- provider payment intents/checkout sessions
- service/mod charge permissions
- billing audit logs
- reconciliation jobs
- emergency economy freeze / read-only mode

`openvibe-billing` should not own:

- stream page rendering
- chat message persistence
- TTS/audio playback queue persistence
- media file storage
- community threads/posts
- AI/content products
- games
- marketplace/trade full product logic

It should integrate with those systems through events, capabilities, SDK calls, and service APIs.

## 1.2 Product surfaces for this phase

Phase 6 should create billing foundations and thin product-facing surfaces/seams for:

- `openvibe.tips`
  - tips/donations
  - superchat-like paid chat messages
  - paid TTS
  - paid soundboard/audio/media request triggers
  - streamer overlay/widget data
  - integration with `openvibe-live` and `openvibe-chat`

- `openvibe.vip`
  - recurring memberships/subscriptions
  - streamer channel subscriptions
  - gated access/perk state
  - credits-assisted or regular processor-backed payments where feasible
  - policy seams for age-gated creator content later, without making adult content the default focus

If the workspace does not already have standalone `openvibe-tips` or `openvibe-vip` services, do not over-split yet. Implement them as product route groups or lightweight modules inside/around `openvibe-billing` with clear future extraction notes.

---

# 2. Implement or evolve `openvibe-billing`

If `services/openvibe-billing` already exists, evolve it.
If it does not exist, create it in the same Node/Express/service pattern used by the current OpenVibe services.

Do not invent a new framework.

Use existing workspace conventions:
- Express service
- better-sqlite3 persistence unless an existing abstraction says otherwise
- `@openvibe/contracts`
- `@openvibe/sdk`
- service-auth middleware
- policy assertions
- events client
- service registry declarations
- docs/tests structure

## 2.1 Data model

Implement safe additive migrations/storage for billing.

Minimum canonical models:

### Billing accounts / wallets

Support fields equivalent to:

- `id`
- `owner_type`
  - `user`
  - `service`
  - `mod`
  - `team`
  - `creator`
  - `system`
- `owner_id`
- `wallet_type`
  - `credits`
  - `tips`
  - `creator`
  - `platform`
  - `escrow`
  - `test`
- `status`
  - `active`
  - `frozen`
  - `closed`
- `currency`
  - `OVC` or another internal credit code
  - `USD`/fiat where needed for provider references
- `created_at`
- `updated_at`
- `metadata_json`

### Ledger transactions

Ledger is the source of truth.

Support fields equivalent to:

- `id`
- `transaction_group_id`
- `idempotency_key`
- `transaction_type`
  - `credit_purchase`
  - `credit_grant`
  - `credit_spend`
  - `tip`
  - `superchat`
  - `tts_payment`
  - `media_request_payment`
  - `subscription_charge`
  - `subscription_refund`
  - `creator_earning`
  - `platform_fee`
  - `refund`
  - `reversal`
  - `adjustment`
  - `payout_hold`
  - `payout_release`
  - `test`
- `status`
  - `pending`
  - `posted`
  - `failed`
  - `reversed`
  - `voided`
- `from_wallet_id`
- `to_wallet_id`
- `actor_type`
- `actor_id`
- `target_type`
  - `user`
  - `creator`
  - `channel`
  - `stream`
  - `community`
  - `service`
  - `mod`
  - `system`
- `target_id`
- `amount`
- `currency`
- `description`
- `reference_type`
- `reference_id`
- `provider`
- `provider_reference`
- `created_at`
- `posted_at`
- `metadata_json`

Rules:
- never mutate posted ledger rows except adding reversal/void markers if absolutely necessary
- balance = sum(posted debits/credits), optionally cached in snapshots
- all external actions require idempotency key support
- every monetary mutation must be server-side only

### Balance snapshots

Support fields equivalent to:

- `wallet_id`
- `available_balance`
- `pending_balance`
- `lifetime_in`
- `lifetime_out`
- `currency`
- `updated_at`

Snapshots are optimization only, not source of truth.

### Payment providers / checkout sessions

Support fields equivalent to:

- `id`
- `provider`
  - `stub`
  - `stripe`
  - `paypal`
  - `manual`
- `provider_reference`
- `user_id`
- `wallet_id`
- `amount`
- `currency`
- `credits_amount`
- `status`
  - `created`
  - `pending`
  - `paid`
  - `failed`
  - `cancelled`
  - `expired`
- `checkout_url`
- `idempotency_key`
- `created_at`
- `updated_at`
- `metadata_json`

Do not require live Stripe/PayPal credentials for local dev. Provide a stub/manual provider that can simulate a successful payment.

### Webhook receipts

Support fields equivalent to:

- `id`
- `provider`
- `event_id`
- `event_type`
- `received_at`
- `processed_at`
- `status`
  - `received`
  - `processed`
  - `ignored`
  - `failed`
- `signature_valid`
- `idempotency_key`
- `payload_json`
- `error`

Use this to prevent duplicate webhook processing.

### Tips / paid interactions

Support fields equivalent to:

- `id`
- `payer_user_id`
- `target_actor_type`
- `target_actor_id`
- `target_context_type`
  - `stream`
  - `channel`
  - `chat_room`
  - `community`
  - `service`
  - `mod`
- `target_context_id`
- `amount`
- `currency`
- `message`
- `visibility`
  - `public`
  - `private`
  - `anonymous`
  - `unlisted`
- `interaction_type`
  - `tip`
  - `superchat`
  - `tts`
  - `soundboard`
  - `media_request`
  - `alert`
- `status`
  - `pending`
  - `posted`
  - `failed`
  - `refunded`
  - `cancelled`
- `ledger_transaction_group_id`
- `chat_room_id`
- `chat_message_id`
- `audio_queue_id`
- `media_id`
- `created_at`
- `updated_at`
- `metadata_json`

### Subscriptions / VIP memberships

Support fields equivalent to:

- `id`
- `subscriber_user_id`
- `creator_actor_type`
- `creator_actor_id`
- `target_type`
  - `channel`
  - `creator`
  - `community`
  - `service`
  - `mod`
- `target_id`
- `plan_id`
- `tier_name`
- `price_amount`
- `currency`
- `billing_interval`
  - `month`
  - `year`
  - `one_time`
- `status`
  - `trialing`
  - `active`
  - `past_due`
  - `cancelled`
  - `expired`
  - `paused`
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end`
- `provider`
- `provider_subscription_id`
- `created_at`
- `updated_at`
- `metadata_json`

### Subscription plans / VIP tiers

Support fields equivalent to:

- `id`
- `owner_type`
- `owner_id`
- `target_type`
- `target_id`
- `slug`
- `name`
- `description`
- `price_amount`
- `currency`
- `billing_interval`
- `perks_json`
- `visibility`
  - `public`
  - `unlisted`
  - `private`
  - `restricted`
- `status`
  - `active`
  - `archived`
- `requires_age_check`
- `created_at`
- `updated_at`
- `metadata_json`

### Creator balances / earnings

Support fields equivalent to:

- `creator_actor_type`
- `creator_actor_id`
- `pending_balance`
- `available_balance`
- `lifetime_earned`
- `lifetime_paid_out`
- `currency`
- `updated_at`

For now, payout can be a future seam. Do not implement real payout rails unless already present. Track balances correctly.

### Billing idempotency keys

Support fields equivalent to:

- `idempotency_key`
- `actor_type`
- `actor_id`
- `operation`
- `request_hash`
- `response_json`
- `status`
- `created_at`
- `expires_at`

### Billing audit log

Support fields equivalent to:

- `id`
- `actor_type`
- `actor_id`
- `action`
- `target_type`
- `target_id`
- `trace_id`
- `created_at`
- `metadata_json`

## 2.2 APIs

Implement REST APIs using the existing service route patterns.

Minimum APIs:

### Health / admin basics

- `GET /health`
- `GET /api/billing/admin/summary`
- `GET /api/billing/admin/ledger`
- `GET /api/billing/admin/wallets`
- `GET /api/billing/admin/tips`
- `GET /api/billing/admin/subscriptions`
- `POST /api/billing/admin/freeze`
- `POST /api/billing/admin/unfreeze`

Admin routes must require service/admin permission. Do not trust client-side admin flags.

### Wallet / balance

- `GET /api/billing/wallet`
- `GET /api/billing/wallet/:ownerType/:ownerId`
- `GET /api/billing/wallet/:ownerType/:ownerId/transactions`
- `POST /api/billing/wallet/:ownerType/:ownerId/adjust`
  - admin/service-only
  - uses ledger adjustment transaction
  - requires idempotency key

### Credits purchase / provider stub

- `POST /api/billing/credits/checkout`
  - creates checkout/payment session
  - supports stub provider locally
  - supports future Stripe/PayPal env seam
- `POST /api/billing/credits/checkout/:sessionId/complete`
  - local dev/manual provider completion
  - posts ledger entry
  - emits event
- `POST /api/billing/webhooks/:provider`
  - validates/stores receipt
  - idempotently processes supported events
  - must not double-credit users

### Charge/spend credits

- `POST /api/billing/credits/charge`
  - server-side charge endpoint for services/mods
  - requires idempotency key
  - enforces actor/service charge permission
  - returns ledger transaction group + updated snapshot

- `POST /api/billing/credits/refund`
  - refund/reversal endpoint
  - idempotent
  - emits refund/reversal event

### Tips / paid interactions

- `POST /api/tips`
  - creates a tip/donation/superchat/TTS/media request interaction
  - debits payer wallet
  - credits creator/platform wallets according to fee policy
  - emits billing + tips events
  - if interaction includes chat/TTS/audio, call or enqueue through `openvibe-chat` using SDK/client where practical

- `GET /api/tips`
  - list tips by payer/target/context with permission filtering

- `GET /api/tips/:tipId`

- `POST /api/tips/:tipId/refund`
  - idempotent reversal

- `GET /api/tips/overlay/:targetType/:targetId`
  - streamer overlay/widget-friendly recent tips/alerts feed

### VIP / subscriptions

- `POST /api/vip/plans`
- `GET /api/vip/plans`
- `GET /api/vip/plans/:planId`
- `PUT /api/vip/plans/:planId`
- `POST /api/vip/subscriptions`
  - supports local stub/manual subscription activation
  - supports future provider checkout seam
- `GET /api/vip/subscriptions`
- `GET /api/vip/subscriptions/:subscriptionId`
- `POST /api/vip/subscriptions/:subscriptionId/cancel`
- `POST /api/vip/subscriptions/:subscriptionId/renew`
  - local/dev renewal simulation + future scheduler seam

### Entitlements / gating

- `GET /api/billing/entitlements`
- `GET /api/billing/entitlements/:targetType/:targetId`
- `POST /api/billing/entitlements/check`

This should let services check:
- user has active VIP subscription to channel/community/creator
- user has paid/unlocked access
- user has required tier/perk

Do not implement full adult-content product logic in this phase, but add policy fields/seams like `requires_age_check`, `restricted`, and entitlement checks for later safe gating.

## 2.3 Ledger transaction engine

Implement a central ledger engine module.

Requirements:

- double-entry-ish transaction posting where practical
- never allow negative balances unless explicit policy allows it
- idempotency key required for all spend/purchase/refund actions
- atomic DB transaction for every ledger post
- materialized balance snapshot updated in same transaction
- audit record written for every mutation
- trace_id propagated
- no direct balance mutation outside ledger engine
- reversal/refund creates compensating entries instead of deleting old entries
- service fees/platform fees are represented as ledger entries, even if fee is 0 for now

Implement at minimum:

- `ensureWallet(owner_type, owner_id, wallet_type, currency)`
- `getBalance(walletId)`
- `postCreditPurchase(...)`
- `chargeCredits(...)`
- `createTip(...)`
- `createSubscription(...)`
- `cancelSubscription(...)`
- `refundTransactionGroup(...)`
- `rebuildSnapshot(walletId)` or reconciliation helper
- `assertEconomyNotFrozen()`

## 2.4 Economy freeze / safety mode

Implement a service-wide safety switch.

Behavior:

- when frozen:
  - reads still work
  - wallet balance reads still work
  - admin summary still works
  - new purchases/spends/tips/subscriptions fail with a clear error
  - refunds/reversals may still be allowed for admin if implemented safely
- freeze/unfreeze must be audited
- expose state in `/health` and admin summary

## 2.5 Events

Publish through the existing Phase 1 event backbone.

Required event types:

- `billing.wallet.created`
- `billing.wallet.balance_updated`
- `billing.credits.checkout_created`
- `billing.credits.purchased`
- `billing.credits.charged`
- `billing.credits.refunded`
- `billing.transaction.posted`
- `billing.transaction.reversed`
- `billing.webhook.received`
- `billing.webhook.processed`
- `billing.economy.frozen`
- `billing.economy.unfrozen`

Tips events:

- `tips.tip.created`
- `tips.tip.posted`
- `tips.tip.refunded`
- `tips.superchat.created`
- `tips.tts.created`
- `tips.media_request.created`
- `tips.overlay.updated`

VIP events:

- `vip.plan.created`
- `vip.plan.updated`
- `vip.subscription.created`
- `vip.subscription.activated`
- `vip.subscription.renewed`
- `vip.subscription.cancelled`
- `vip.subscription.expired`
- `vip.entitlement.granted`
- `vip.entitlement.revoked`

Events should include:

- event type/version
- trace_id if supported
- actor info
- wallet/transaction/subscription/tip IDs where relevant
- target context
- source service
- sanitized payload
- never include payment secrets, full provider payloads, or private tokens

## 2.6 Capabilities/contracts

Register/add contracts for:

Billing:
- `billing.wallet.get`
- `billing.wallet.adjust`
- `billing.credits.checkout`
- `billing.credits.complete_checkout`
- `billing.credits.charge`
- `billing.credits.refund`
- `billing.transaction.lookup`
- `billing.entitlement.check`
- `billing.economy.freeze`
- `billing.economy.unfreeze`

Tips:
- `tips.create`
- `tips.refund`
- `tips.overlay.feed`
- `tips.superchat.create`
- `tips.tts.create`
- `tips.media_request.create`

VIP:
- `vip.plan.create`
- `vip.plan.update`
- `vip.subscription.create`
- `vip.subscription.cancel`
- `vip.subscription.renew`
- `vip.entitlement.check`

Update OpenVibe contracts with:

- billing event constants
- tips event constants
- VIP event constants
- billing capability constants
- wallet/ledger transaction types
- wallet/transaction statuses
- tip interaction types
- subscription statuses/intervals
- entitlement types
- service IDs/registry constants for `openvibe-billing`
- topic constants for `billing.events`, `tips.events`, `vip.events`

Update OpenVibe SDK with:

- `BillingClient`
- `TipsClient` or tips methods on BillingClient
- `VipClient` or VIP methods on BillingClient
- wallet helpers
- checkout helpers
- charge/refund helpers
- tip helpers
- subscription/plan helpers
- entitlement check helper

Export these from the SDK root.

## 2.7 Policy enforcement

Use the existing Phase 1/2 policy engine or service-local seam consistent with current patterns.

Enforce server-side:

- users can read their own wallet/billing data
- admins/services can read broader billing data when authorized
- only billing service can post ledger entries directly
- only authorized services/mods can charge credits
- only owner/admin can create/update VIP plans for a target
- only subscriber/admin/service can cancel subscription where allowed
- only admin/service can freeze/unfreeze economy
- tips cannot be created with spoofed payer/target actor
- refunds require original transaction/tip and proper authority
- idempotency keys cannot be reused for different request bodies

No client-only checks.

## 2.8 User modules integration

Use user modules for profile/preference/snapshot data only, not as source-of-truth ledger.

Potential namespaces:

- `billing.wallet_snapshot`
- `billing.preferences`
- `tips.preferences`
- `vip.membership_summary`

On ledger/subscription changes, optionally update snapshots through the existing user modules API or document the future seam.

Hard rule:
- user modules may cache balances/summary but ledger remains truth.

## 2.9 Integration with `openvibe-chat`

Integrate paid interactions with Phase 5 chat/TTS/audio queues.

Requirements:

- `POST /api/tips` with `interaction_type=superchat` can optionally create/enqueue a chat message via `openvibe-chat`
- `interaction_type=tts` can enqueue TTS via `openvibe-chat`
- `interaction_type=soundboard` or `media_request` can enqueue audio/media request via `openvibe-chat`
- failures after successful billing must be retried or visible as pending/failed interaction state; do not silently eat money
- event-driven fallback: emit tips events so chat/live overlays can react even if direct chat call fails
- no direct DB writes into `openvibe-chat`

## 2.10 Integration with `openvibe-live`

Integrate with Phase 4 live pages and streamer/channel concepts.

Requirements:

- stream/channel tips can target an OpenVibe stream/channel/creator
- `openvibe-live` can check channel subscription/VIP entitlement
- `openvibe-live` can display tip/alert overlay feed from `openvibe-billing`/tips endpoints
- stream/channel subscription plans can be created for creators/channels
- stream events can include billing/monetization context only as references, not duplicated ledger data

Do not move stream/channel storage into billing.

## 2.11 Integration with `openvibe-media`

Integrate media request / paid media where practical.

Requirements:

- paid media request records can reference `media_id`
- billing does not store raw files or local paths
- use `openvibe-media` IDs for media request attachments/assets
- if media request fulfillment fails after payment, interaction status should reflect pending/failed and be refundable

## 2.12 Integration with `openvibe-community`

Add subscription/entitlement seams for gated communities.

Requirements:

- `openvibe-community` can call entitlement check for gated spaces/threads later
- Phase 6 should expose enough API/SDK support for community gating
- do not rewrite community authorization now unless a small integration seam is straightforward

## 2.13 Legacy HoboStreamer compatibility

Inspect all legacy monetization/transactions/subscriptions/rewards/media request/payment-like routes and tables.

Preserve old behavior with adapters:

- legacy routes should delegate to `openvibe-billing` where safe
- legacy routes should keep working if `OPENVIBE_BILLING_URL` is absent
- legacy Hobo coins/rewards should be mapped carefully:
  - paid balance/credits -> billing ledger
  - free/game/loyalty points -> user modules or product-specific state, not billing ledger, unless they represent purchased value
- old transaction/subscription tables should not be deleted
- add idempotent backfill scripts where safe
- add dry-run mode for all backfills
- log skipped/failed rows
- document remaining manual migration work

Suggested legacy mapping to inspect and implement safely:

- subscriptions -> VIP subscriptions or plans where target is channel/creator
- transactions/payments -> ledger transactions with legacy source mapping
- Hobo coins/credits -> classify as paid credits vs free rewards before importing
- media request payments -> tips/media_request interaction records
- donation goals -> tips/overlay future seam, not ledger truth unless actual payments exist
- paid TTS/audio -> tips + chat audio queue integration

Do not delete or destructively rewrite legacy tables.

---

# 3. Product surfaces and UI

Implement minimal usable UI/admin surfaces matching current workspace patterns.

## 3.1 Billing account/wallet UI

If there is a `my.openvibe.network` or account surface from Phase 2, add or expose a lightweight route/view for:

- wallet balance
- recent transactions
- checkout simulation for local dev
- tips sent/received
- subscriptions
- cancellation flow if implemented

If the current UI framework is too thin, expose clean JSON APIs and add static minimal pages under `openvibe-billing/public`.

## 3.2 Admin UI / diagnostics

Add lightweight admin/internal diagnostics for:

- economy freeze state
- wallets
- ledger transactions
- failed/pending provider sessions
- webhook receipts
- idempotency records
- tips
- subscriptions
- creator balances
- reconciliation status

Do not rewrite the whole admin app.

## 3.3 Tips overlay/feed

Add a simple overlay/feed endpoint/page:

- recent public tips by stream/channel/creator
- suitable for streamer overlay integration later
- no private payment data
- can be consumed by `openvibe-live`

## 3.4 VIP/subscription UI

Add minimal plan/subscription APIs and, where practical, small pages for:

- list creator/channel plans
- create plan as creator/service/admin
- subscribe using stub/manual provider or credits flow
- cancel subscription
- entitlement check result

Keep UI basic but user-testable.

---

# 4. Optional migration/backfill scripts

If legacy data structures are clear enough, add idempotent migration scripts for:

- legacy transactions
- legacy subscriptions
- legacy channel subscriptions
- legacy coin/credit balances
- legacy media request payments
- legacy donation/tip records if present

Rules:

- no destructive changes
- idempotent by legacy source/id
- dry-run mode required
- log skipped/failed rows
- explicitly classify paid monetary value vs free reward points
- do not import ambiguous balances as paid credits without a documented classification rule
- do not require production access

---

# 5. Documentation requirements

Update or create Phase 6 docs.

Suggested docs if the workspace uses `docs/openvibe`:

- `docs/openvibe/phase-6-billing-tips-vip.md`
- `docs/openvibe/billing-service.md`
- `docs/openvibe/tips-service.md`
- `docs/openvibe/vip-service.md`
- `docs/openvibe/legacy-billing-migration.md`

Docs must cover:

- billing service boundary
- ledger-first model
- wallet/credits model
- idempotency rules
- provider stub/local dev flow
- payment provider seams
- tips/superchat/TTS/media request flow
- VIP/subscription flow
- creator balance flow
- economy freeze flow
- event/capability contracts
- integration with chat/live/media/community
- env vars/config keys
- local development
- manual validation
- deferred work

Update root/phase docs if they already exist from Phases 1–5.

Also update:

- `PHASES.md`
  - mark Phase 6 implemented only after validation
  - document acceptance criteria in the same style as prior phases

- root `README.md`
  - include `openvibe-billing` in layout/quick start if appropriate

---

# 6. Tests/checks

Add practical regression coverage where current test harness supports it.

At minimum:

Billing tests:

- create wallet
- post credit purchase with stub provider
- idempotency prevents duplicate credit
- charge credits
- insufficient balance rejected
- refund/reversal creates compensating transaction
- balance snapshot matches ledger
- economy freeze blocks new spend/purchase
- admin adjustment requires service/admin authority

Tips tests:

- create basic tip
- create superchat tip
- create TTS tip and verify chat integration seam is called or event emitted
- overlay feed returns public tips only
- refund tip reverses ledger entries

VIP tests:

- create plan
- create subscription
- entitlement check passes for active subscription
- cancel subscription
- renewal simulation or provider seam does not double-charge

Integration tests:

- service registry declaration exists
- capability registry entries exist
- contract exports exist
- billing events validate
- policy denies unauthorized charges/admin operations
- legacy compatibility adapter is inert when `OPENVIBE_BILLING_URL` is absent
- legacy backfill script dry-run does not mutate data

If no test harness exists, add the lightest practical smoke scripts and document manual validation.

Run basic checks:

- install/build/test commands already present in the workspace
- syntax checks for changed JS/TS
- service boot smoke test if practical

Do not claim tests were run unless you actually run them.

---

# 7. Migration safety rules

- Do not delete data.
- Do not destructively rename tables.
- Do not remove legacy HoboStreamer monetization/subscription/transaction routes.
- Do not import ambiguous free reward points as paid credits without explicit classification.
- Do not store balances as the only truth.
- Do not mutate posted ledger rows to “fix” money.
- Do not trust client-side identity, amount, payer, creator, target, admin, or entitlement claims.
- Do not bypass Phase 1 events/capabilities/registry/policy primitives.
- Do not bypass `openvibe-chat` for TTS/audio queue persistence.
- Do not bypass `openvibe-media` for paid media request assets.
- Do not bypass `openvibe-live` stream/channel identity models.
- Do not implement full marketplace/trade/crypto/stock alert systems in this phase.
- Do not implement full AI/wiki/blog/news stack in this phase.
- Do not migrate games in this phase.
- Do not require production payment provider credentials for local development.
- Preserve backward-compatible Hobo aliases/adapters until later cleanup phases.

---

# 8. Optional production inspection block

If local code or migration docs reveal that real production data is required for a safe backfill plan, include this optional section in your final response only; do not run it yourself.

OPTIONAL — requires explicit developer permission to run against production

Production SSH target is configured as `hobo.tools`.

Default mode is inspect-only. Suggested non-destructive commands only:

- inspect service directories
- inspect database schema
- count legacy transaction rows
- count legacy subscription rows
- count legacy channel subscription rows
- count legacy Hobo coin/credit/reward rows
- count legacy media request payment rows
- count legacy donation/tip-like rows
- inspect payment provider config variable names without printing secret values
- inspect env/config variable names without printing secret values

Before any remote command:

- summarize the exact command
- require explicit developer confirmation
- remind developer to redact secrets/tokens/IPs before pasting logs back

Do not suggest destructive production commands.

---

# 9. Final response format

When finished, provide:

1. Confirmatory analysis summary.
2. Files changed.
3. What changed in each file/group.
4. Schema/migration changes.
5. Env/config changes.
6. Tests/checks run.
7. Manual validation steps.
8. Legacy compatibility notes.
9. Deferred work for later phases.
10. Explicit statement of how the implementation satisfies Phase 6.

Implement the code. Do not output only a plan. Continue working until Phase 6 ( #file:PHASE_6.md ) have been entirely completed end-to-end. Create the structure, components, and connected OpenVibe related services, context, and projects contained within the `openvibe` folder in the workspace. Create and init the individual/modular/split git repository folders that we will push/deploy to newly created GitHub repositories, after all OpenVibe phases have been 100% completed and tested in our local environment. Utilize intuitive modular structures that will allow us to easily grow, expand, and iterate upon during the completion of phases ( as described in the original plan: #file:PLAN.md ) and update #file:PHASES.md after following all instructions for Phase 6.

Treat the current workspace as the active OpenVibe migration workspace. Do not fetch external repository URLs. Do not assume old Hobo repos are authoritative long-term destinations. The legacy Hobo repos are migration/reference sources under `HoboReposToMigrateFrom/`; new OpenVibe code should be created or evolved in the current workspace’s OpenVibe structure, making sure you are following, expanding, and building upon whatever Phase 1, Phase 2, Phase 3, Phase 4, and Phase 5 already established.