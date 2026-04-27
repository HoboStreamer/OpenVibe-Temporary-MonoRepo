# Hobo Coins, Nickels, and Bucks — loyalty migration policy

Phase 8 imports the legacy hobo loyalty graph as **non-cash progression**.

| Token        | Treatment                                                              |
|--------------|-------------------------------------------------------------------------|
| Hobo Coins   | Imported into `loyalty_accounts.coins_balance` as a loyalty score.      |
| Hobo Nickels | Imported into `loyalty_accounts.nickels_balance` as a loyalty score.    |
| Hobo Bucks   | **Excluded** from spendable balances. Archived to `legacy_finance_archive` with `spendable=false`. |

The Postgres loader (`scripts/migrate-hobo/lib/postgres-loader.js`) sets
`report.hobo_bucks_excluded=true` and `report.loyalty_imported_as_progression=true`
in `audit/postgres-load-report.json`. The cutover orchestrator turns those
flags into a red-gate check (`hobo_bucks_excluded`) so the rehearsal cannot
turn green if the policy is violated.

Schema highlights:

* `loyalty_accounts(user_id, coins_balance, nickels_balance, ...)`
* `loyalty_transactions` — append-only ledger; transactions of `kind='hobo_bucks_legacy'` are recorded for audit but never debited.
* `legacy_finance_archive(spendable BOOLEAN NOT NULL DEFAULT false)` — every
  legacy financial row lands here unspendable. Surfacing it in any UI requires
  an explicit operator review.
