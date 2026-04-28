'use strict';

// openvibe-billing — SQLite persistence (migration-safe via CREATE IF NOT EXISTS).
//
// All amounts are stored as integer **minor units** (e.g. cents, or 1 credit = 1
// minor unit if currency='OVC'). Foreign keys are ON. WAL is enabled for
// concurrent reads while writes are serialised through better-sqlite3.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { warnIfUnsupported } = require('@openvibe/sdk');

let dbInstance = null;
let persistenceDescriptor = null;

function init(dbPath) {
    persistenceDescriptor = warnIfUnsupported('openvibe-billing', dbPath);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS billing_wallets (
            id              TEXT PRIMARY KEY,
            owner_type      TEXT NOT NULL,
            owner_id        TEXT NOT NULL,
            wallet_type     TEXT NOT NULL,
            currency        TEXT NOT NULL,
            balance_minor   INTEGER NOT NULL DEFAULT 0,
            status          TEXT NOT NULL DEFAULT 'active',
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (owner_type, owner_id, wallet_type, currency)
        );
        CREATE INDEX IF NOT EXISTS idx_billing_wallets_owner ON billing_wallets(owner_type, owner_id);

        CREATE TABLE IF NOT EXISTS billing_ledger (
            id                    TEXT PRIMARY KEY,
            transaction_group_id  TEXT NOT NULL,
            wallet_id             TEXT NOT NULL,
            direction             TEXT NOT NULL CHECK(direction IN ('credit','debit')),
            amount_minor          INTEGER NOT NULL,
            currency              TEXT NOT NULL,
            transaction_type      TEXT NOT NULL,
            status                TEXT NOT NULL DEFAULT 'posted',
            idempotency_key       TEXT,
            target_type           TEXT,
            target_id             TEXT,
            source_type           TEXT,
            source_id             TEXT,
            provider              TEXT,
            external_ref          TEXT,
            actor_type            TEXT,
            actor_id              TEXT,
            metadata_json         TEXT NOT NULL DEFAULT '{}',
            posted_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (wallet_id) REFERENCES billing_wallets(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_billing_ledger_wallet ON billing_ledger(wallet_id, posted_at);
        CREATE INDEX IF NOT EXISTS idx_billing_ledger_group  ON billing_ledger(transaction_group_id);
        CREATE INDEX IF NOT EXISTS idx_billing_ledger_actor  ON billing_ledger(actor_type, actor_id);
        CREATE INDEX IF NOT EXISTS idx_billing_ledger_target ON billing_ledger(target_type, target_id);

        CREATE TABLE IF NOT EXISTS billing_balance_snapshots (
            wallet_id       TEXT PRIMARY KEY,
            balance_minor   INTEGER NOT NULL DEFAULT 0,
            last_ledger_id  TEXT,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (wallet_id) REFERENCES billing_wallets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
            id              TEXT PRIMARY KEY,
            owner_type      TEXT NOT NULL,
            owner_id        TEXT NOT NULL,
            provider        TEXT NOT NULL,
            currency        TEXT NOT NULL,
            amount_minor    INTEGER NOT NULL,
            credits_minor   INTEGER NOT NULL,
            status          TEXT NOT NULL DEFAULT 'created',
            external_ref    TEXT,
            return_url      TEXT,
            cancel_url      TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            expires_at      DATETIME,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_billing_checkout_owner ON billing_checkout_sessions(owner_type, owner_id);
        CREATE INDEX IF NOT EXISTS idx_billing_checkout_status ON billing_checkout_sessions(status);

        CREATE TABLE IF NOT EXISTS billing_webhook_receipts (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            provider            TEXT NOT NULL,
            external_event_id   TEXT,
            signature           TEXT,
            status              TEXT NOT NULL DEFAULT 'received',
            payload_json        TEXT NOT NULL,
            error               TEXT,
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at        DATETIME,
            UNIQUE (provider, external_event_id)
        );

        CREATE TABLE IF NOT EXISTS billing_tips (
            id                      TEXT PRIMARY KEY,
            transaction_group_id    TEXT NOT NULL,
            sender_actor_type       TEXT NOT NULL,
            sender_actor_id         TEXT NOT NULL,
            recipient_owner_type    TEXT NOT NULL,
            recipient_owner_id      TEXT NOT NULL,
            target_context_type     TEXT,
            target_context_id       TEXT,
            interaction_type        TEXT NOT NULL DEFAULT 'tip',
            amount_minor            INTEGER NOT NULL,
            currency                TEXT NOT NULL,
            message                 TEXT,
            visibility              TEXT NOT NULL DEFAULT 'public',
            status                  TEXT NOT NULL DEFAULT 'posted',
            idempotency_key         TEXT,
            metadata_json           TEXT NOT NULL DEFAULT '{}',
            created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS idx_billing_tips_recipient ON billing_tips(recipient_owner_type, recipient_owner_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_billing_tips_target ON billing_tips(target_context_type, target_context_id, created_at);

        CREATE TABLE IF NOT EXISTS billing_subscription_plans (
            id              TEXT PRIMARY KEY,
            owner_type      TEXT NOT NULL,
            owner_id        TEXT NOT NULL,
            target_type     TEXT,
            target_id       TEXT,
            name            TEXT NOT NULL,
            description     TEXT,
            currency        TEXT NOT NULL,
            amount_minor    INTEGER NOT NULL,
            billing_interval TEXT NOT NULL DEFAULT 'month',
            perks_json      TEXT NOT NULL DEFAULT '[]',
            status          TEXT NOT NULL DEFAULT 'active',
            visibility      TEXT NOT NULL DEFAULT 'public',
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_billing_plans_owner ON billing_subscription_plans(owner_type, owner_id);
        CREATE INDEX IF NOT EXISTS idx_billing_plans_target ON billing_subscription_plans(target_type, target_id);

        CREATE TABLE IF NOT EXISTS billing_subscriptions (
            id                              TEXT PRIMARY KEY,
            plan_id                         TEXT NOT NULL,
            subscriber_actor_type           TEXT NOT NULL,
            subscriber_actor_id             TEXT NOT NULL,
            target_owner_type               TEXT NOT NULL,
            target_owner_id                 TEXT NOT NULL,
            status                          TEXT NOT NULL DEFAULT 'active',
            current_period_start            DATETIME,
            current_period_end              DATETIME,
            cancel_at                       DATETIME,
            cancelled_at                    DATETIME,
            last_charge_transaction_group_id TEXT,
            metadata_json                   TEXT NOT NULL DEFAULT '{}',
            created_at                      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at                      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (plan_id) REFERENCES billing_subscription_plans(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_billing_subs_subscriber ON billing_subscriptions(subscriber_actor_type, subscriber_actor_id);
        CREATE INDEX IF NOT EXISTS idx_billing_subs_target ON billing_subscriptions(target_owner_type, target_owner_id);
        CREATE INDEX IF NOT EXISTS idx_billing_subs_status ON billing_subscriptions(status);

        CREATE TABLE IF NOT EXISTS billing_creator_balances (
            owner_type              TEXT NOT NULL,
            owner_id                TEXT NOT NULL,
            currency                TEXT NOT NULL,
            balance_minor           INTEGER NOT NULL DEFAULT 0,
            total_earned_minor      INTEGER NOT NULL DEFAULT 0,
            total_paid_out_minor    INTEGER NOT NULL DEFAULT 0,
            updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (owner_type, owner_id, currency)
        );

        CREATE TABLE IF NOT EXISTS billing_idempotency (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            scope           TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            actor_type      TEXT,
            actor_id        TEXT,
            status_code     INTEGER NOT NULL DEFAULT 200,
            response_json   TEXT NOT NULL,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at      DATETIME,
            UNIQUE (scope, idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS idx_billing_idem_expiry ON billing_idempotency(expires_at);

        CREATE TABLE IF NOT EXISTS billing_audit (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_type      TEXT,
            actor_id        TEXT,
            action          TEXT NOT NULL,
            target_type     TEXT,
            target_id       TEXT,
            before_json     TEXT,
            after_json      TEXT,
            reason          TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_billing_audit_target ON billing_audit(target_type, target_id);
        CREATE INDEX IF NOT EXISTS idx_billing_audit_actor ON billing_audit(actor_type, actor_id);

        CREATE TABLE IF NOT EXISTS billing_economy_state (
            id          INTEGER PRIMARY KEY CHECK (id = 1),
            frozen      INTEGER NOT NULL DEFAULT 0,
            reason      TEXT,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_by_actor_type TEXT,
            updated_by_actor_id   TEXT
        );
        INSERT OR IGNORE INTO billing_economy_state (id, frozen) VALUES (1, 0);

        CREATE TABLE IF NOT EXISTS billing_legacy_map (
            source     TEXT NOT NULL,
            kind       TEXT NOT NULL,
            legacy_id  TEXT NOT NULL,
            new_id     TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (source, kind, legacy_id)
        );
    `);

    dbInstance = db;
    return db;
}

function get() {
    if (!dbInstance) throw new Error('billing db not initialized — call db.init(path) first');
    return dbInstance;
}

function describePersistence() {
    return persistenceDescriptor || { service: 'openvibe-billing', mode: 'sqlite', database_url_configured: false };
}

module.exports = { init, get, describePersistence };
