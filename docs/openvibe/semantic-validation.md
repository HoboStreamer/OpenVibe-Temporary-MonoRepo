# Semantic validation

`scripts/migrate-hobo/validate-migration.js` enforces semantic invariants on
the canonical bundle before any Postgres load is allowed:

* every `live_streams.channel_id` references a known channel;
* every `chat_messages.user_id` references a known identity (or is anonymous);
* every `media_objects.id` is unique and addressable;
* `legacy_finance_archive` rows have `spendable=false`;
* `loyalty_accounts` rows do not include `hobo_bucks_*` columns.

Output: `audit/validation-summary.json`. The cutover orchestrator surfaces a
red gate when this file is missing or reports failed checks.
