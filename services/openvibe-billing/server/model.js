'use strict';

// openvibe-billing — pure data-access. No policy, no event publishing.
// Atomic balance changes and double-entry posts live in ledger.js.

const crypto = require('crypto');
const db = require('./db');

function newId(prefix) { return `${prefix}_${crypto.randomBytes(10).toString('hex')}`; }
function safeJson(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }
function nowIso() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

// ── wallets ────────────────────────────────────────────────
function hydrateWallet(r) {
    if (!r) return null;
    return {
        id: r.id, owner_type: r.owner_type, owner_id: r.owner_id,
        wallet_type: r.wallet_type, currency: r.currency,
        balance_minor: r.balance_minor, status: r.status,
        metadata: safeJson(r.metadata_json, {}),
        created_at: r.created_at, updated_at: r.updated_at,
    };
}

function getWallet(ownerType, ownerId, walletType, currency) {
    const row = db.get().prepare(
        `SELECT * FROM billing_wallets WHERE owner_type=? AND owner_id=? AND wallet_type=? AND currency=?`
    ).get(String(ownerType), String(ownerId), String(walletType), String(currency));
    return hydrateWallet(row);
}

function getWalletById(id) {
    return hydrateWallet(db.get().prepare(`SELECT * FROM billing_wallets WHERE id=?`).get(String(id)));
}

function listWalletsByOwner(ownerType, ownerId) {
    const rows = db.get().prepare(
        `SELECT * FROM billing_wallets WHERE owner_type=? AND owner_id=? ORDER BY created_at`
    ).all(String(ownerType), String(ownerId));
    return rows.map(hydrateWallet);
}

function listWallets({ wallet_type, status, limit } = {}) {
    const args = [];
    const where = [];
    if (wallet_type) { where.push(`wallet_type = ?`); args.push(String(wallet_type)); }
    if (status)      { where.push(`status = ?`);      args.push(String(status)); }
    let sql = `SELECT * FROM billing_wallets`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    args.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500));
    return db.get().prepare(sql).all(...args).map(hydrateWallet);
}

function createWallet({ owner_type, owner_id, wallet_type, currency, status, metadata }) {
    const id = newId('wal');
    db.get().prepare(`
        INSERT INTO billing_wallets (id, owner_type, owner_id, wallet_type, currency, balance_minor, status, metadata_json)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, String(owner_type), String(owner_id), String(wallet_type), String(currency),
        String(status || 'active'), JSON.stringify(metadata || {}));
    db.get().prepare(`INSERT OR IGNORE INTO billing_balance_snapshots (wallet_id, balance_minor) VALUES (?, 0)`).run(id);
    return getWalletById(id);
}

function updateWalletStatus(walletId, status) {
    db.get().prepare(`UPDATE billing_wallets SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(status), String(walletId));
    return getWalletById(walletId);
}

// ── ledger ─────────────────────────────────────────────────
function hydrateLedger(r) {
    if (!r) return null;
    return {
        id: r.id, transaction_group_id: r.transaction_group_id,
        wallet_id: r.wallet_id, direction: r.direction,
        amount_minor: r.amount_minor, currency: r.currency,
        transaction_type: r.transaction_type, status: r.status,
        idempotency_key: r.idempotency_key,
        target_type: r.target_type, target_id: r.target_id,
        source_type: r.source_type, source_id: r.source_id,
        provider: r.provider, external_ref: r.external_ref,
        actor_type: r.actor_type, actor_id: r.actor_id,
        metadata: safeJson(r.metadata_json, {}),
        posted_at: r.posted_at, created_at: r.created_at,
    };
}

function insertLedgerRow(row) {
    const id = row.id || newId('led');
    db.get().prepare(`
        INSERT INTO billing_ledger (
            id, transaction_group_id, wallet_id, direction, amount_minor, currency,
            transaction_type, status, idempotency_key,
            target_type, target_id, source_type, source_id,
            provider, external_ref, actor_type, actor_id, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, String(row.transaction_group_id), String(row.wallet_id),
        String(row.direction), Number(row.amount_minor), String(row.currency),
        String(row.transaction_type), String(row.status || 'posted'),
        row.idempotency_key || null,
        row.target_type || null, row.target_id != null ? String(row.target_id) : null,
        row.source_type || null, row.source_id != null ? String(row.source_id) : null,
        row.provider || null, row.external_ref || null,
        row.actor_type || null, row.actor_id != null ? String(row.actor_id) : null,
        JSON.stringify(row.metadata || {}),
    );
    return id;
}

function getLedgerRow(id) {
    return hydrateLedger(db.get().prepare(`SELECT * FROM billing_ledger WHERE id=?`).get(String(id)));
}

function listLedgerByWallet(walletId, { limit, before_id } = {}) {
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const args = [String(walletId)];
    let sql = `SELECT * FROM billing_ledger WHERE wallet_id=?`;
    if (before_id) {
        sql += ` AND rowid < (SELECT rowid FROM billing_ledger WHERE id=?)`;
        args.push(String(before_id));
    }
    sql += ` ORDER BY rowid DESC LIMIT ?`;
    args.push(cap);
    return db.get().prepare(sql).all(...args).map(hydrateLedger);
}

function listLedgerByGroup(groupId) {
    return db.get().prepare(`SELECT * FROM billing_ledger WHERE transaction_group_id=? ORDER BY rowid`)
        .all(String(groupId)).map(hydrateLedger);
}

function listLedger({ wallet_id, actor_type, actor_id, target_type, target_id, transaction_type, limit } = {}) {
    const where = [];
    const args = [];
    if (wallet_id)        { where.push('wallet_id = ?');       args.push(String(wallet_id)); }
    if (actor_type)       { where.push('actor_type = ?');      args.push(String(actor_type)); }
    if (actor_id)         { where.push('actor_id = ?');        args.push(String(actor_id)); }
    if (target_type)      { where.push('target_type = ?');     args.push(String(target_type)); }
    if (target_id)        { where.push('target_id = ?');       args.push(String(target_id)); }
    if (transaction_type) { where.push('transaction_type = ?');args.push(String(transaction_type)); }
    let sql = `SELECT * FROM billing_ledger`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY rowid DESC LIMIT ?`;
    args.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500));
    return db.get().prepare(sql).all(...args).map(hydrateLedger);
}

function findLedgerByIdempotencyKey(key) {
    if (!key) return [];
    return db.get().prepare(`SELECT * FROM billing_ledger WHERE idempotency_key=? ORDER BY rowid`)
        .all(String(key)).map(hydrateLedger);
}

// ── snapshots ──────────────────────────────────────────────
function getSnapshot(walletId) {
    return db.get().prepare(`SELECT * FROM billing_balance_snapshots WHERE wallet_id=?`).get(String(walletId)) || null;
}

function setSnapshot(walletId, balanceMinor, lastLedgerId) {
    db.get().prepare(`
        INSERT INTO billing_balance_snapshots (wallet_id, balance_minor, last_ledger_id, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(wallet_id) DO UPDATE SET
            balance_minor = excluded.balance_minor,
            last_ledger_id = excluded.last_ledger_id,
            updated_at = CURRENT_TIMESTAMP
    `).run(String(walletId), Number(balanceMinor), lastLedgerId || null);
    db.get().prepare(`UPDATE billing_wallets SET balance_minor=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(Number(balanceMinor), String(walletId));
}

function recomputeBalanceFromLedger(walletId) {
    const row = db.get().prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END), 0) AS bal,
            (SELECT id FROM billing_ledger WHERE wallet_id=? ORDER BY rowid DESC LIMIT 1) AS last_id
        FROM billing_ledger WHERE wallet_id=? AND status='posted'
    `).get(String(walletId), String(walletId));
    return { balance: row.bal, last_ledger_id: row.last_id || null };
}

// ── checkout sessions ──────────────────────────────────────
function hydrateCheckout(r) {
    if (!r) return null;
    return {
        id: r.id, owner_type: r.owner_type, owner_id: r.owner_id,
        provider: r.provider, currency: r.currency,
        amount_minor: r.amount_minor, credits_minor: r.credits_minor,
        status: r.status, external_ref: r.external_ref,
        return_url: r.return_url, cancel_url: r.cancel_url,
        metadata: safeJson(r.metadata_json, {}),
        expires_at: r.expires_at, created_at: r.created_at, updated_at: r.updated_at,
    };
}

function createCheckout(input) {
    const id = newId('chk');
    db.get().prepare(`
        INSERT INTO billing_checkout_sessions (id, owner_type, owner_id, provider, currency,
            amount_minor, credits_minor, status, external_ref, return_url, cancel_url, metadata_json, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, String(input.owner_type), String(input.owner_id),
        String(input.provider), String(input.currency),
        Number(input.amount_minor), Number(input.credits_minor),
        String(input.status || 'created'),
        input.external_ref || null, input.return_url || null, input.cancel_url || null,
        JSON.stringify(input.metadata || {}),
        input.expires_at || null,
    );
    return getCheckout(id);
}

function getCheckout(id) {
    return hydrateCheckout(db.get().prepare(`SELECT * FROM billing_checkout_sessions WHERE id=?`).get(String(id)));
}

function updateCheckoutStatus(id, status, externalRef, metaPatch) {
    const cur = getCheckout(id);
    if (!cur) return null;
    const meta = Object.assign({}, cur.metadata || {}, metaPatch || {});
    db.get().prepare(`
        UPDATE billing_checkout_sessions SET status=?, external_ref=COALESCE(?, external_ref),
            metadata_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(String(status), externalRef || null, JSON.stringify(meta), String(id));
    return getCheckout(id);
}

// ── webhook receipts ───────────────────────────────────────
function recordWebhook({ provider, external_event_id, signature, payload, status, error }) {
    try {
        const info = db.get().prepare(`
            INSERT INTO billing_webhook_receipts (provider, external_event_id, signature, payload_json, status, error)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(String(provider), external_event_id ? String(external_event_id) : null,
            signature || null, JSON.stringify(payload || {}), String(status || 'received'), error || null);
        return { id: info.lastInsertRowid, duplicate: false };
    } catch (e) {
        if (String(e.message).includes('UNIQUE')) return { id: null, duplicate: true };
        throw e;
    }
}

function markWebhookProcessed(id, status, error) {
    db.get().prepare(`
        UPDATE billing_webhook_receipts SET status=?, error=?, processed_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(String(status), error || null, Number(id));
}

// ── tips ───────────────────────────────────────────────────
function hydrateTip(r) {
    if (!r) return null;
    return {
        id: r.id, transaction_group_id: r.transaction_group_id,
        sender_actor_type: r.sender_actor_type, sender_actor_id: r.sender_actor_id,
        recipient_owner_type: r.recipient_owner_type, recipient_owner_id: r.recipient_owner_id,
        target_context_type: r.target_context_type, target_context_id: r.target_context_id,
        interaction_type: r.interaction_type,
        amount_minor: r.amount_minor, currency: r.currency,
        message: r.message, visibility: r.visibility,
        status: r.status, idempotency_key: r.idempotency_key,
        metadata: safeJson(r.metadata_json, {}),
        created_at: r.created_at,
    };
}

function createTipRow(input) {
    const id = newId('tip');
    db.get().prepare(`
        INSERT INTO billing_tips (id, transaction_group_id, sender_actor_type, sender_actor_id,
            recipient_owner_type, recipient_owner_id, target_context_type, target_context_id,
            interaction_type, amount_minor, currency, message, visibility, status,
            idempotency_key, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, String(input.transaction_group_id),
        String(input.sender_actor_type), String(input.sender_actor_id),
        String(input.recipient_owner_type), String(input.recipient_owner_id),
        input.target_context_type || null, input.target_context_id != null ? String(input.target_context_id) : null,
        String(input.interaction_type || 'tip'),
        Number(input.amount_minor), String(input.currency),
        input.message || null, String(input.visibility || 'public'),
        String(input.status || 'posted'), input.idempotency_key || null,
        JSON.stringify(input.metadata || {}),
    );
    return getTip(id);
}

function getTip(id) {
    return hydrateTip(db.get().prepare(`SELECT * FROM billing_tips WHERE id=?`).get(String(id)));
}

function setTipStatus(id, status) {
    db.get().prepare(`UPDATE billing_tips SET status=? WHERE id=?`).run(String(status), String(id));
    return getTip(id);
}

function listTips({ recipient_owner_type, recipient_owner_id, target_context_type, target_context_id,
                    sender_actor_type, sender_actor_id, status, limit } = {}) {
    const where = [];
    const args = [];
    if (recipient_owner_type) { where.push('recipient_owner_type=?'); args.push(String(recipient_owner_type)); }
    if (recipient_owner_id)   { where.push('recipient_owner_id=?');   args.push(String(recipient_owner_id)); }
    if (target_context_type)  { where.push('target_context_type=?');  args.push(String(target_context_type)); }
    if (target_context_id)    { where.push('target_context_id=?');    args.push(String(target_context_id)); }
    if (sender_actor_type)    { where.push('sender_actor_type=?');    args.push(String(sender_actor_type)); }
    if (sender_actor_id)      { where.push('sender_actor_id=?');      args.push(String(sender_actor_id)); }
    if (status)               { where.push('status=?');               args.push(String(status)); }
    let sql = `SELECT * FROM billing_tips`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY rowid DESC LIMIT ?`;
    args.push(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500));
    return db.get().prepare(sql).all(...args).map(hydrateTip);
}

function findTipByIdempotency(key) {
    if (!key) return null;
    return hydrateTip(db.get().prepare(`SELECT * FROM billing_tips WHERE idempotency_key=?`).get(String(key)));
}

// ── plans / subscriptions ──────────────────────────────────
function hydratePlan(r) {
    if (!r) return null;
    return {
        id: r.id, owner_type: r.owner_type, owner_id: r.owner_id,
        target_type: r.target_type, target_id: r.target_id,
        name: r.name, description: r.description,
        currency: r.currency, amount_minor: r.amount_minor,
        billing_interval: r.billing_interval,
        perks: safeJson(r.perks_json, []),
        status: r.status, visibility: r.visibility,
        metadata: safeJson(r.metadata_json, {}),
        created_at: r.created_at, updated_at: r.updated_at,
    };
}

function createPlan(input) {
    const id = newId('pln');
    db.get().prepare(`
        INSERT INTO billing_subscription_plans (id, owner_type, owner_id, target_type, target_id,
            name, description, currency, amount_minor, billing_interval, perks_json, status, visibility, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, String(input.owner_type), String(input.owner_id),
        input.target_type || null, input.target_id != null ? String(input.target_id) : null,
        String(input.name), input.description || null,
        String(input.currency), Number(input.amount_minor),
        String(input.billing_interval || 'month'),
        JSON.stringify(input.perks || []),
        String(input.status || 'active'), String(input.visibility || 'public'),
        JSON.stringify(input.metadata || {}),
    );
    return getPlan(id);
}

function getPlan(id) {
    return hydratePlan(db.get().prepare(`SELECT * FROM billing_subscription_plans WHERE id=?`).get(String(id)));
}

function listPlans({ owner_type, owner_id, target_type, target_id, status, visibility, limit } = {}) {
    const where = [];
    const args = [];
    if (owner_type)  { where.push('owner_type=?');  args.push(String(owner_type)); }
    if (owner_id)    { where.push('owner_id=?');    args.push(String(owner_id)); }
    if (target_type) { where.push('target_type=?'); args.push(String(target_type)); }
    if (target_id)   { where.push('target_id=?');   args.push(String(target_id)); }
    if (status)      { where.push('status=?');      args.push(String(status)); }
    if (visibility)  { where.push('visibility=?');  args.push(String(visibility)); }
    let sql = `SELECT * FROM billing_subscription_plans`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    args.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500));
    return db.get().prepare(sql).all(...args).map(hydratePlan);
}

function updatePlan(id, patch) {
    const cur = getPlan(id);
    if (!cur) return null;
    const fields = [];
    const args = [];
    for (const k of ['name', 'description', 'amount_minor', 'billing_interval', 'status', 'visibility']) {
        if (patch[k] !== undefined) { fields.push(`${k}=?`); args.push(patch[k] != null ? (k === 'amount_minor' ? Number(patch[k]) : String(patch[k])) : null); }
    }
    if (patch.perks !== undefined) { fields.push(`perks_json=?`); args.push(JSON.stringify(patch.perks || [])); }
    if (patch.metadata !== undefined) { fields.push(`metadata_json=?`); args.push(JSON.stringify(patch.metadata || {})); }
    if (!fields.length) return cur;
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    args.push(String(id));
    db.get().prepare(`UPDATE billing_subscription_plans SET ${fields.join(', ')} WHERE id=?`).run(...args);
    return getPlan(id);
}

function hydrateSubscription(r) {
    if (!r) return null;
    return {
        id: r.id, plan_id: r.plan_id,
        subscriber_actor_type: r.subscriber_actor_type, subscriber_actor_id: r.subscriber_actor_id,
        target_owner_type: r.target_owner_type, target_owner_id: r.target_owner_id,
        status: r.status,
        current_period_start: r.current_period_start, current_period_end: r.current_period_end,
        cancel_at: r.cancel_at, cancelled_at: r.cancelled_at,
        last_charge_transaction_group_id: r.last_charge_transaction_group_id,
        metadata: safeJson(r.metadata_json, {}),
        created_at: r.created_at, updated_at: r.updated_at,
    };
}

function createSubscriptionRow(input) {
    const id = newId('sub');
    db.get().prepare(`
        INSERT INTO billing_subscriptions (id, plan_id, subscriber_actor_type, subscriber_actor_id,
            target_owner_type, target_owner_id, status, current_period_start, current_period_end,
            last_charge_transaction_group_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, String(input.plan_id),
        String(input.subscriber_actor_type), String(input.subscriber_actor_id),
        String(input.target_owner_type), String(input.target_owner_id),
        String(input.status || 'active'),
        input.current_period_start || null, input.current_period_end || null,
        input.last_charge_transaction_group_id || null,
        JSON.stringify(input.metadata || {}),
    );
    return getSubscription(id);
}

function getSubscription(id) {
    return hydrateSubscription(db.get().prepare(`SELECT * FROM billing_subscriptions WHERE id=?`).get(String(id)));
}

function listSubscriptions({ subscriber_actor_type, subscriber_actor_id, target_owner_type, target_owner_id, plan_id, status, limit } = {}) {
    const where = [];
    const args = [];
    if (subscriber_actor_type) { where.push('subscriber_actor_type=?'); args.push(String(subscriber_actor_type)); }
    if (subscriber_actor_id)   { where.push('subscriber_actor_id=?');   args.push(String(subscriber_actor_id)); }
    if (target_owner_type)     { where.push('target_owner_type=?');     args.push(String(target_owner_type)); }
    if (target_owner_id)       { where.push('target_owner_id=?');       args.push(String(target_owner_id)); }
    if (plan_id)               { where.push('plan_id=?');               args.push(String(plan_id)); }
    if (status)                { where.push('status=?');                args.push(String(status)); }
    let sql = `SELECT * FROM billing_subscriptions`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    args.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500));
    return db.get().prepare(sql).all(...args).map(hydrateSubscription);
}

function updateSubscription(id, patch) {
    const cur = getSubscription(id);
    if (!cur) return null;
    const fields = [];
    const args = [];
    for (const k of ['status', 'current_period_start', 'current_period_end',
                     'cancel_at', 'cancelled_at', 'last_charge_transaction_group_id']) {
        if (patch[k] !== undefined) { fields.push(`${k}=?`); args.push(patch[k] != null ? String(patch[k]) : null); }
    }
    if (patch.metadata !== undefined) { fields.push(`metadata_json=?`); args.push(JSON.stringify(patch.metadata || {})); }
    if (!fields.length) return cur;
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    args.push(String(id));
    db.get().prepare(`UPDATE billing_subscriptions SET ${fields.join(', ')} WHERE id=?`).run(...args);
    return getSubscription(id);
}

// ── creator earnings ───────────────────────────────────────
function getCreatorBalance(ownerType, ownerId, currency) {
    const row = db.get().prepare(`
        SELECT * FROM billing_creator_balances WHERE owner_type=? AND owner_id=? AND currency=?
    `).get(String(ownerType), String(ownerId), String(currency));
    if (!row) return { owner_type: ownerType, owner_id: ownerId, currency, balance_minor: 0, total_earned_minor: 0, total_paid_out_minor: 0 };
    return row;
}

function addCreatorEarning(ownerType, ownerId, currency, amountMinor) {
    db.get().prepare(`
        INSERT INTO billing_creator_balances (owner_type, owner_id, currency, balance_minor, total_earned_minor, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(owner_type, owner_id, currency) DO UPDATE SET
            balance_minor      = balance_minor + excluded.balance_minor,
            total_earned_minor = total_earned_minor + excluded.total_earned_minor,
            updated_at = CURRENT_TIMESTAMP
    `).run(String(ownerType), String(ownerId), String(currency), Number(amountMinor), Number(amountMinor));
    return getCreatorBalance(ownerType, ownerId, currency);
}

// ── idempotency cache ──────────────────────────────────────
function findIdempotency(scope, key) {
    if (!key) return null;
    const row = db.get().prepare(`SELECT * FROM billing_idempotency WHERE scope=? AND idempotency_key=?`)
        .get(String(scope), String(key));
    if (!row) return null;
    return { status_code: row.status_code, response: safeJson(row.response_json, {}), created_at: row.created_at, expires_at: row.expires_at };
}

function saveIdempotency({ scope, key, actor_type, actor_id, status_code, response, ttl_ms }) {
    if (!key) return;
    const expires = ttl_ms ? new Date(Date.now() + ttl_ms).toISOString() : null;
    try {
        db.get().prepare(`
            INSERT INTO billing_idempotency (scope, idempotency_key, actor_type, actor_id, status_code, response_json, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(String(scope), String(key), actor_type || null, actor_id != null ? String(actor_id) : null,
            Number(status_code || 200), JSON.stringify(response || {}), expires);
    } catch (e) {
        // Concurrent insert — ignore.
        if (!String(e.message).includes('UNIQUE')) throw e;
    }
}

// ── audit ──────────────────────────────────────────────────
function recordAudit({ actor_type, actor_id, action, target_type, target_id, before, after, reason }) {
    db.get().prepare(`
        INSERT INTO billing_audit (actor_type, actor_id, action, target_type, target_id, before_json, after_json, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(actor_type || null, actor_id != null ? String(actor_id) : null,
        String(action), target_type || null, target_id != null ? String(target_id) : null,
        before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, reason || null);
}

function listAudit({ target_type, target_id, action, limit } = {}) {
    const where = [];
    const args = [];
    if (target_type) { where.push('target_type=?'); args.push(String(target_type)); }
    if (target_id)   { where.push('target_id=?');   args.push(String(target_id)); }
    if (action)      { where.push('action=?');      args.push(String(action)); }
    let sql = `SELECT * FROM billing_audit`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY id DESC LIMIT ?`;
    args.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500));
    return db.get().prepare(sql).all(...args).map(r => ({
        id: r.id, actor_type: r.actor_type, actor_id: r.actor_id,
        action: r.action, target_type: r.target_type, target_id: r.target_id,
        before: safeJson(r.before_json, null), after: safeJson(r.after_json, null),
        reason: r.reason, created_at: r.created_at,
    }));
}

// ── economy state ──────────────────────────────────────────
function getEconomyState() {
    const row = db.get().prepare(`SELECT * FROM billing_economy_state WHERE id=1`).get();
    return { frozen: !!(row && row.frozen), reason: row && row.reason || null,
             updated_at: row && row.updated_at, updated_by_actor_type: row && row.updated_by_actor_type,
             updated_by_actor_id: row && row.updated_by_actor_id };
}

function setEconomyState({ frozen, reason, actor_type, actor_id }) {
    db.get().prepare(`
        UPDATE billing_economy_state SET frozen=?, reason=?, updated_at=CURRENT_TIMESTAMP,
            updated_by_actor_type=?, updated_by_actor_id=? WHERE id=1
    `).run(frozen ? 1 : 0, reason || null,
        actor_type || null, actor_id != null ? String(actor_id) : null);
    return getEconomyState();
}

// ── legacy mapping ─────────────────────────────────────────
function recordLegacyMap({ source, kind, legacy_id, new_id }) {
    db.get().prepare(`
        INSERT OR IGNORE INTO billing_legacy_map (source, kind, legacy_id, new_id) VALUES (?, ?, ?, ?)
    `).run(String(source), String(kind), String(legacy_id), String(new_id));
}

function lookupLegacy(source, kind, legacy_id) {
    return db.get().prepare(`SELECT * FROM billing_legacy_map WHERE source=? AND kind=? AND legacy_id=?`)
        .get(String(source), String(kind), String(legacy_id)) || null;
}

// ── tips creator profiles (Phase 16) ───────────────────────
function hydrateTipCreator(r) {
    if (!r) return null;
    return {
        id: r.id,
        owner_type: r.owner_type, owner_id: r.owner_id,
        public_slug: r.public_slug,
        display_name: r.display_name,
        description: r.description,
        currency: r.currency,
        default_target_type: r.default_target_type, default_target_id: r.default_target_id,
        default_visibility: r.default_visibility,
        chat_owner_type: r.chat_owner_type, chat_owner_id: r.chat_owner_id,
        tts_target_queue: r.tts_target_queue,
        audio_target_queue: r.audio_target_queue,
        live_overlay_target: r.live_overlay_target,
        moderation_settings: safeJson(r.moderation_settings_json, {}),
        status: r.status,
        metadata: safeJson(r.metadata_json, {}),
        created_at: r.created_at, updated_at: r.updated_at,
    };
}

function getTipCreatorProfile(ownerType, ownerId) {
    return hydrateTipCreator(db.get().prepare(
        `SELECT * FROM billing_tip_creator_profiles WHERE owner_type=? AND owner_id=?`
    ).get(String(ownerType), String(ownerId)));
}

function getTipCreatorProfileBySlug(slug) {
    if (!slug) return null;
    return hydrateTipCreator(db.get().prepare(
        `SELECT * FROM billing_tip_creator_profiles WHERE public_slug=?`
    ).get(String(slug)));
}

function listTipCreatorProfiles({ status, limit } = {}) {
    const where = [];
    const args = [];
    if (status) { where.push('status=?'); args.push(String(status)); }
    let sql = `SELECT * FROM billing_tip_creator_profiles`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    args.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500));
    return db.get().prepare(sql).all(...args).map(hydrateTipCreator);
}

function upsertTipCreatorProfile(input) {
    const ownerType = String(input.owner_type);
    const ownerId   = String(input.owner_id);
    const existing  = getTipCreatorProfile(ownerType, ownerId);
    if (existing) {
        const fields = [];
        const args = [];
        for (const k of ['public_slug', 'display_name', 'description', 'currency',
                         'default_target_type', 'default_target_id', 'default_visibility',
                         'chat_owner_type', 'chat_owner_id',
                         'tts_target_queue', 'audio_target_queue', 'live_overlay_target', 'status']) {
            if (input[k] !== undefined) {
                fields.push(`${k}=?`);
                args.push(input[k] != null ? String(input[k]) : null);
            }
        }
        if (input.moderation_settings !== undefined) {
            fields.push(`moderation_settings_json=?`);
            args.push(JSON.stringify(input.moderation_settings || {}));
        }
        if (input.metadata !== undefined) {
            fields.push(`metadata_json=?`);
            args.push(JSON.stringify(input.metadata || {}));
        }
        if (fields.length) {
            fields.push(`updated_at=CURRENT_TIMESTAMP`);
            args.push(existing.id);
            db.get().prepare(`UPDATE billing_tip_creator_profiles SET ${fields.join(', ')} WHERE id=?`).run(...args);
        }
        return getTipCreatorProfile(ownerType, ownerId);
    }
    const id = newId('tcr');
    db.get().prepare(`
        INSERT INTO billing_tip_creator_profiles (
            id, owner_type, owner_id, public_slug, display_name, description, currency,
            default_target_type, default_target_id, default_visibility,
            chat_owner_type, chat_owner_id,
            tts_target_queue, audio_target_queue, live_overlay_target,
            moderation_settings_json, status, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, ownerType, ownerId,
        input.public_slug ? String(input.public_slug) : null,
        String(input.display_name || `${ownerType}/${ownerId}`),
        input.description ? String(input.description) : null,
        String(input.currency || 'OVC'),
        input.default_target_type ? String(input.default_target_type) : null,
        input.default_target_id != null ? String(input.default_target_id) : null,
        String(input.default_visibility || 'public'),
        input.chat_owner_type ? String(input.chat_owner_type) : null,
        input.chat_owner_id != null ? String(input.chat_owner_id) : null,
        input.tts_target_queue ? String(input.tts_target_queue) : null,
        input.audio_target_queue ? String(input.audio_target_queue) : null,
        input.live_overlay_target ? String(input.live_overlay_target) : null,
        JSON.stringify(input.moderation_settings || {}),
        String(input.status || 'active'),
        JSON.stringify(input.metadata || {}),
    );
    return getTipCreatorProfile(ownerType, ownerId);
}

function recordTipChatIntegration({ tip_id, interaction_type, target_kind,
                                    chat_owner_type, chat_owner_id, queue_target,
                                    outcome, detail }) {
    db.get().prepare(`
        INSERT INTO billing_tip_chat_integrations
            (tip_id, interaction_type, target_kind, chat_owner_type, chat_owner_id,
             queue_target, outcome, detail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        String(tip_id), String(interaction_type), String(target_kind),
        chat_owner_type || null, chat_owner_id != null ? String(chat_owner_id) : null,
        queue_target || null, String(outcome), detail || null,
    );
}

function listTipChatIntegrations({ tip_id, outcome, limit } = {}) {
    const where = [];
    const args = [];
    if (tip_id)  { where.push('tip_id=?');  args.push(String(tip_id)); }
    if (outcome) { where.push('outcome=?'); args.push(String(outcome)); }
    let sql = `SELECT * FROM billing_tip_chat_integrations`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY id DESC LIMIT ?`;
    args.push(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200));
    return db.get().prepare(sql).all(...args);
}

function tipChatIntegrationSummary() {
    const rows = db.get().prepare(
        `SELECT outcome, COUNT(*) AS n FROM billing_tip_chat_integrations GROUP BY outcome`
    ).all();
    const out = {};
    for (const r of rows) out[r.outcome] = r.n;
    return out;
}

// ── VIP creator profiles (Phase 16) ────────────────────────
function hydrateVipCreator(r) {
    if (!r) return null;
    return {
        id: r.id,
        owner_type: r.owner_type, owner_id: r.owner_id,
        public_slug: r.public_slug,
        display_name: r.display_name,
        description: r.description,
        content_rating: r.content_rating,
        requires_age_gate: !!r.requires_age_gate,
        allowed_gated_content: safeJson(r.allowed_gated_content_json, []),
        community_target: r.community_target,
        live_target: r.live_target,
        blog_target: r.blog_target,
        wiki_target: r.wiki_target,
        policy_acknowledged_at: r.policy_acknowledged_at,
        policy_acknowledged_by: r.policy_acknowledged_by,
        status: r.status,
        metadata: safeJson(r.metadata_json, {}),
        created_at: r.created_at, updated_at: r.updated_at,
    };
}

function getVipCreatorProfile(ownerType, ownerId) {
    return hydrateVipCreator(db.get().prepare(
        `SELECT * FROM billing_vip_creator_profiles WHERE owner_type=? AND owner_id=?`
    ).get(String(ownerType), String(ownerId)));
}

function getVipCreatorProfileBySlug(slug) {
    if (!slug) return null;
    return hydrateVipCreator(db.get().prepare(
        `SELECT * FROM billing_vip_creator_profiles WHERE public_slug=?`
    ).get(String(slug)));
}

function listVipCreatorProfiles({ status, limit } = {}) {
    const where = [];
    const args = [];
    if (status) { where.push('status=?'); args.push(String(status)); }
    let sql = `SELECT * FROM billing_vip_creator_profiles`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    args.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500));
    return db.get().prepare(sql).all(...args).map(hydrateVipCreator);
}

function upsertVipCreatorProfile(input) {
    const ownerType = String(input.owner_type);
    const ownerId   = String(input.owner_id);
    const existing  = getVipCreatorProfile(ownerType, ownerId);
    if (existing) {
        const fields = [];
        const args = [];
        for (const k of ['public_slug', 'display_name', 'description', 'content_rating',
                         'community_target', 'live_target', 'blog_target', 'wiki_target',
                         'status', 'policy_acknowledged_at', 'policy_acknowledged_by']) {
            if (input[k] !== undefined) {
                fields.push(`${k}=?`);
                args.push(input[k] != null ? String(input[k]) : null);
            }
        }
        if (input.requires_age_gate !== undefined) {
            fields.push(`requires_age_gate=?`);
            args.push(input.requires_age_gate ? 1 : 0);
        }
        if (input.allowed_gated_content !== undefined) {
            fields.push(`allowed_gated_content_json=?`);
            args.push(JSON.stringify(input.allowed_gated_content || []));
        }
        if (input.metadata !== undefined) {
            fields.push(`metadata_json=?`);
            args.push(JSON.stringify(input.metadata || {}));
        }
        if (fields.length) {
            fields.push(`updated_at=CURRENT_TIMESTAMP`);
            args.push(existing.id);
            db.get().prepare(`UPDATE billing_vip_creator_profiles SET ${fields.join(', ')} WHERE id=?`).run(...args);
        }
        return getVipCreatorProfile(ownerType, ownerId);
    }
    const id = newId('vcr');
    db.get().prepare(`
        INSERT INTO billing_vip_creator_profiles (
            id, owner_type, owner_id, public_slug, display_name, description, content_rating,
            requires_age_gate, allowed_gated_content_json,
            community_target, live_target, blog_target, wiki_target,
            policy_acknowledged_at, policy_acknowledged_by, status, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, ownerType, ownerId,
        input.public_slug ? String(input.public_slug) : null,
        String(input.display_name || `${ownerType}/${ownerId}`),
        input.description ? String(input.description) : null,
        String(input.content_rating || 'general'),
        input.requires_age_gate ? 1 : 0,
        JSON.stringify(input.allowed_gated_content || []),
        input.community_target ? String(input.community_target) : null,
        input.live_target ? String(input.live_target) : null,
        input.blog_target ? String(input.blog_target) : null,
        input.wiki_target ? String(input.wiki_target) : null,
        input.policy_acknowledged_at ? String(input.policy_acknowledged_at) : null,
        input.policy_acknowledged_by ? String(input.policy_acknowledged_by) : null,
        String(input.status || 'active'),
        JSON.stringify(input.metadata || {}),
    );
    return getVipCreatorProfile(ownerType, ownerId);
}

module.exports = {
    newId, nowIso,

    getWallet, getWalletById, listWalletsByOwner, listWallets, createWallet, updateWalletStatus,

    insertLedgerRow, getLedgerRow, listLedgerByWallet, listLedgerByGroup, listLedger, findLedgerByIdempotencyKey,

    getSnapshot, setSnapshot, recomputeBalanceFromLedger,

    createCheckout, getCheckout, updateCheckoutStatus,

    recordWebhook, markWebhookProcessed,

    createTipRow, getTip, setTipStatus, listTips, findTipByIdempotency,

    createPlan, getPlan, listPlans, updatePlan,
    createSubscriptionRow, getSubscription, listSubscriptions, updateSubscription,

    getCreatorBalance, addCreatorEarning,

    findIdempotency, saveIdempotency,

    recordAudit, listAudit,

    getEconomyState, setEconomyState,

    recordLegacyMap, lookupLegacy,

    // Phase 16 — tips creator profiles + chat integration log
    getTipCreatorProfile, getTipCreatorProfileBySlug, listTipCreatorProfiles, upsertTipCreatorProfile,
    recordTipChatIntegration, listTipChatIntegrations, tipChatIntegrationSummary,

    // Phase 16 — VIP creator profiles
    getVipCreatorProfile, getVipCreatorProfileBySlug, listVipCreatorProfiles, upsertVipCreatorProfile,
};
