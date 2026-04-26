# Tips, super-chat, TTS, media requests

These are all the same shape: a **paid micro-interaction** from a sender
to a creator. The only difference is the `interaction_type` field, which
controls the downstream UX (overlay style, TTS pipeline, queue).

## Interaction types

| `interaction_type` | Ledger `transaction_type`     | Typical UX                                 |
|--------------------|-------------------------------|--------------------------------------------|
| `tip`              | `tip`                         | overlay alert                              |
| `superchat`        | `superchat`                   | pinned chat message                        |
| `tts`              | `tts_payment`                 | enqueued in `openvibe-chat` TTS queue      |
| `soundboard`       | `tts_payment`                 | sound bite via TTS pipeline                |
| `media_request`    | `media_request_payment`       | song / clip request                        |
| `alert`            | `tip`                         | bare alert (no message)                    |

## Double-entry post

Every tip is a single `transaction_group` containing:

1. `debit` on the **sender's `credits` wallet** for the full amount.
2. `credit` on the **recipient's `creator` wallet** for the *net* amount.
3. (optional) `credit` on the **`system/platform` `platform` wallet**
   for the platform fee (`floor(amount * PLATFORM_FEE_BPS / 10000)`).

All three rows are inserted inside `db.get().transaction(...)`, so the
ledger is never half-applied.

## Idempotency

`POST /api/tips` accepts `idempotency_key`. `billing_tips.idempotency_key`
has a `UNIQUE` index, so a retry returns the original tip unchanged
(`{ tip, replayed: true }`).

## Visibility

| `visibility` | Effect                                                              |
|--------------|---------------------------------------------------------------------|
| `public`     | shown in overlay feed with sender id                                |
| `anonymous`  | shown in overlay feed with `sender_actor_id` stripped               |
| `private`    | hidden from `GET /api/tips` for non-admin/non-service callers       |

## Overlay feed

```
GET /api/tips/overlay/:targetType/:targetId?limit=50
```

Returns recent `posted` tips for a stream / channel / community context.
Already filters to `public` + `anonymous` and strips the sender id when
needed — safe to expose to unauthenticated overlay clients.

## Refunds

```
POST /api/tips/:tipId/refund   { reason }
```

Requires admin or service. Calls `refundTransactionGroup` to insert
compensating ledger rows and flips `billing_tips.status` to `refunded`.
Publishes `tips.tip.refunded`.

## Events

`tips.events` topic (`packages/openvibe-contracts/billing-events.js`):

- `tips.tip.created`
- `tips.superchat.created`
- `tips.tts.created`
- `tips.media_request.created`
- `tips.tip.refunded`

Envelope payload includes `tip_id`, `transaction_group_id`,
`sender_actor_*`, `recipient_owner_*`, `target_context_*`,
`interaction_type`, `amount_minor`, `currency`, `visibility`.
