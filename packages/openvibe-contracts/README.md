# @openvibe/contracts

Shared, dependency-free constants and schema helpers used by every OpenVibe
service. Lives at the bottom of the dependency graph — both the SDK and the
control plane consume this package.

Contents:

* `topics.js` — well-known event topics (`auth.events`, `chat.events`, …)
* `events.js` — event-type constants emitted by the kernel itself
* `capabilities.js` — capability ids (`chat.send_message`, `tips.create_alert`)
* `namespaces.js` — user-module namespace ownership table
* `services.js` — kernel + product service ids
* `envelope.js` — canonical event envelope (`createEnvelope`, `validateEnvelope`)

Anything published through the event backbone must wear an envelope built by
`createEnvelope` so consumers can rely on `event_id`, `trace_id`, `version`,
`source`, `actor_*`, and `timestamp` being present.
