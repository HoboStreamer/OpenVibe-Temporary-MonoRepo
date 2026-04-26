'use strict';

// openvibe-billing — ledger engine. The only place ledger rows are written.
// All multi-row posts run inside `db.transaction(...)` so balances stay
// consistent even on concurrent writes.

const db = require('./db');
const model = require('./model');

class BillingError extends Error {
    constructor(message, { code = 'EBILLING', status = 400, detail = null } = {}) {
        super(message);
        this.code = code;
        this.status = status;
        this.detail = detail;
    }
}

function ensureWallet({ owner_type, owner_id, wallet_type, currency, status, metadata }) {
    if (!owner_type || !owner_id || !wallet_type || !currency) {
        throw new BillingError('owner_type, owner_id, wallet_type, currency required', { code: 'EBADARG' });
    }
    let w = model.getWallet(owner_type, owner_id, wallet_type, currency);
    if (!w) w = model.createWallet({ owner_type, owner_id, wallet_type, currency, status, metadata });
    return w;
}

function getBalance(walletId) {
    const snap = model.getSnapshot(walletId);
    if (snap) return snap.balance_minor;
    const recomputed = model.recomputeBalanceFromLedger(walletId);
    model.setSnapshot(walletId, recomputed.balance, recomputed.last_ledger_id);
    return recomputed.balance;
}

function rebuildSnapshot(walletId) {
    const recomputed = model.recomputeBalanceFromLedger(walletId);
    model.setSnapshot(walletId, recomputed.balance, recomputed.last_ledger_id);
    return recomputed.balance;
}

function assertEconomyNotFrozen() {
    const s = model.getEconomyState();
    if (s.frozen) {
        throw new BillingError(`economy frozen: ${s.reason || 'unspecified'}`, { code: 'EFROZEN', status: 423 });
    }
}

function assertWalletActive(wallet) {
    if (!wallet) throw new BillingError('wallet not found', { code: 'ENOWALLET', status: 404 });
    if (wallet.status === 'closed')  throw new BillingError('wallet closed',  { code: 'ECLOSED',  status: 409 });
    if (wallet.status === 'frozen')  throw new BillingError('wallet frozen',  { code: 'EWFROZEN', status: 423 });
}

// ── core post primitive ────────────────────────────────────
// Creates one or more ledger rows (debits + credits) within a single
// transaction and updates each affected wallet's balance snapshot.
//
// `entries` is [{ wallet_id, direction:'credit'|'debit', amount_minor, currency, transaction_type,
//   target_type?, target_id?, source_type?, source_id?, provider?, external_ref?,
//   actor_type?, actor_id?, metadata?, idempotency_key? }, ...]
function postEntries({ transaction_group_id, entries, allowNegative = false }) {
    if (!Array.isArray(entries) || !entries.length) {
        throw new BillingError('entries required', { code: 'EBADARG' });
    }
    const groupId = transaction_group_id || db.get().prepare(`SELECT lower(hex(randomblob(8))) AS h`).get().h;
    const tx = db.get().transaction(() => {
        const affected = new Map();      // wallet_id → running balance
        const ids = [];
        for (const e of entries) {
            if (!e.wallet_id || !e.direction || !Number.isFinite(Number(e.amount_minor)) || !e.currency || !e.transaction_type) {
                throw new BillingError('bad ledger entry', { code: 'EBADARG' });
            }
            const w = model.getWalletById(e.wallet_id);
            assertWalletActive(w);
            const cur = affected.has(w.id) ? affected.get(w.id) : getBalance(w.id);
            const delta = e.direction === 'credit' ? Number(e.amount_minor) : -Number(e.amount_minor);
            const next = cur + delta;
            if (!allowNegative && next < 0) {
                throw new BillingError('insufficient balance', { code: 'EFUNDS', status: 402, detail: { wallet_id: w.id, balance: cur, attempted: e.amount_minor } });
            }
            affected.set(w.id, next);
            const id = model.insertLedgerRow(Object.assign({}, e, { transaction_group_id: groupId, id: null }));
            ids.push(id);
        }
        for (const [walletId, balance] of affected.entries()) {
            // last ledger id for this wallet within this batch
            const last = ids.slice().reverse().find(id => {
                const row = model.getLedgerRow(id);
                return row && row.wallet_id === walletId;
            });
            model.setSnapshot(walletId, balance, last || null);
        }
        return { transaction_group_id: groupId, ledger_ids: ids };
    });
    return tx();
}

// ── high-level operations ──────────────────────────────────
function postCreditPurchase({
    owner_type, owner_id, currency, amount_minor,
    provider, external_ref, idempotency_key, actor_type, actor_id, metadata,
}) {
    assertEconomyNotFrozen();
    if (!Number.isFinite(amount_minor) || amount_minor <= 0) {
        throw new BillingError('amount_minor must be positive integer', { code: 'EBADARG' });
    }
    if (idempotency_key) {
        const cached = model.findLedgerByIdempotencyKey(idempotency_key);
        if (cached.length) {
            return { transaction_group_id: cached[0].transaction_group_id, ledger: cached, replayed: true };
        }
    }
    const wallet = ensureWallet({ owner_type, owner_id, wallet_type: 'credits', currency });
    const result = postEntries({
        entries: [{
            wallet_id: wallet.id, direction: 'credit', amount_minor, currency,
            transaction_type: 'credit_purchase', provider, external_ref,
            actor_type, actor_id, idempotency_key, metadata,
            target_type: owner_type, target_id: owner_id,
        }],
    });
    return { transaction_group_id: result.transaction_group_id, ledger: model.listLedgerByGroup(result.transaction_group_id), wallet: model.getWalletById(wallet.id), replayed: false };
}

function postCreditGrant({
    owner_type, owner_id, currency, amount_minor, reason,
    actor_type, actor_id, idempotency_key, metadata,
}) {
    assertEconomyNotFrozen();
    if (!Number.isFinite(amount_minor) || amount_minor === 0) {
        throw new BillingError('amount_minor required (non-zero)', { code: 'EBADARG' });
    }
    if (idempotency_key) {
        const cached = model.findLedgerByIdempotencyKey(idempotency_key);
        if (cached.length) {
            return { transaction_group_id: cached[0].transaction_group_id, ledger: cached, replayed: true };
        }
    }
    const wallet = ensureWallet({ owner_type, owner_id, wallet_type: 'credits', currency });
    const direction = amount_minor > 0 ? 'credit' : 'debit';
    const result = postEntries({
        entries: [{
            wallet_id: wallet.id, direction, amount_minor: Math.abs(amount_minor), currency,
            transaction_type: amount_minor > 0 ? 'credit_grant' : 'adjustment',
            actor_type, actor_id, idempotency_key,
            metadata: Object.assign({ reason: reason || null }, metadata || {}),
            target_type: owner_type, target_id: owner_id,
        }],
        allowNegative: false,
    });
    model.recordAudit({ actor_type, actor_id, action: 'credit_grant',
        target_type: owner_type, target_id: owner_id,
        after: { amount_minor, currency }, reason });
    return { transaction_group_id: result.transaction_group_id, ledger: model.listLedgerByGroup(result.transaction_group_id), wallet: model.getWalletById(wallet.id), replayed: false };
}

function chargeCredits({
    owner_type, owner_id, currency, amount_minor,
    target_type, target_id, transaction_type,
    actor_type, actor_id, idempotency_key, metadata,
}) {
    assertEconomyNotFrozen();
    if (!Number.isFinite(amount_minor) || amount_minor <= 0) {
        throw new BillingError('amount_minor must be positive', { code: 'EBADARG' });
    }
    if (idempotency_key) {
        const cached = model.findLedgerByIdempotencyKey(idempotency_key);
        if (cached.length) {
            return { transaction_group_id: cached[0].transaction_group_id, ledger: cached, replayed: true };
        }
    }
    const wallet = ensureWallet({ owner_type, owner_id, wallet_type: 'credits', currency });
    const result = postEntries({
        entries: [{
            wallet_id: wallet.id, direction: 'debit', amount_minor, currency,
            transaction_type: transaction_type || 'credit_spend',
            target_type: target_type || null, target_id: target_id != null ? String(target_id) : null,
            actor_type, actor_id, idempotency_key, metadata,
        }],
    });
    return { transaction_group_id: result.transaction_group_id, ledger: model.listLedgerByGroup(result.transaction_group_id), wallet: model.getWalletById(wallet.id), replayed: false };
}

// Refund == compensating ledger entries. The original group rows are NEVER
// mutated. All entries in the original group are reversed.
function refundTransactionGroup({ transaction_group_id, reason, actor_type, actor_id }) {
    if (!transaction_group_id) throw new BillingError('transaction_group_id required', { code: 'EBADARG' });
    const original = model.listLedgerByGroup(transaction_group_id);
    if (!original.length) throw new BillingError('transaction group not found', { code: 'ENOTX', status: 404 });

    // Build reversal entries
    const entries = original.map(row => ({
        wallet_id: row.wallet_id,
        direction: row.direction === 'credit' ? 'debit' : 'credit',
        amount_minor: row.amount_minor,
        currency: row.currency,
        transaction_type: 'reversal',
        target_type: row.target_type, target_id: row.target_id,
        source_type: 'reversal_of', source_id: row.id,
        actor_type, actor_id,
        metadata: { original_transaction_type: row.transaction_type, reason: reason || null },
    }));
    const result = postEntries({ entries, allowNegative: true });
    model.recordAudit({ actor_type, actor_id, action: 'refund',
        target_type: 'transaction_group', target_id: transaction_group_id, reason });
    return { transaction_group_id: result.transaction_group_id, ledger: model.listLedgerByGroup(result.transaction_group_id) };
}

// ── tips (double-entry: sender wallet → recipient creator wallet, plus optional platform fee) ──
function createTip({
    sender_actor_type, sender_actor_id,
    recipient_owner_type, recipient_owner_id,
    target_context_type, target_context_id,
    interaction_type, amount_minor, currency, message, visibility,
    idempotency_key, metadata, platformFeeBps = 0,
}) {
    assertEconomyNotFrozen();
    if (!sender_actor_type || !sender_actor_id || !recipient_owner_type || !recipient_owner_id) {
        throw new BillingError('sender + recipient required', { code: 'EBADARG' });
    }
    if (!Number.isFinite(amount_minor) || amount_minor <= 0) {
        throw new BillingError('amount_minor must be positive', { code: 'EBADARG' });
    }
    if (idempotency_key) {
        const cached = model.findTipByIdempotency(idempotency_key);
        if (cached) return { tip: cached, replayed: true };
    }

    const senderWallet  = ensureWallet({ owner_type: sender_actor_type, owner_id: sender_actor_id, wallet_type: 'credits',  currency });
    const creatorWallet = ensureWallet({ owner_type: recipient_owner_type, owner_id: recipient_owner_id, wallet_type: 'creator', currency });

    const fee = Math.max(0, Math.min(amount_minor, Math.floor(amount_minor * Number(platformFeeBps || 0) / 10000)));
    const net = amount_minor - fee;

    const entries = [
        { wallet_id: senderWallet.id, direction: 'debit', amount_minor, currency,
          transaction_type: interactionToTxType(interaction_type),
          actor_type: sender_actor_type, actor_id: sender_actor_id,
          target_type: recipient_owner_type, target_id: recipient_owner_id,
          metadata: Object.assign({ interaction_type, target_context_type, target_context_id }, metadata || {}) },
        { wallet_id: creatorWallet.id, direction: 'credit', amount_minor: net, currency,
          transaction_type: 'creator_earning',
          actor_type: sender_actor_type, actor_id: sender_actor_id,
          target_type: recipient_owner_type, target_id: recipient_owner_id,
          metadata: Object.assign({ interaction_type, fee_minor: fee }, metadata || {}) },
    ];
    if (fee > 0) {
        const platformWallet = ensureWallet({ owner_type: 'system', owner_id: 'platform', wallet_type: 'platform', currency });
        entries.push({
            wallet_id: platformWallet.id, direction: 'credit', amount_minor: fee, currency,
            transaction_type: 'platform_fee',
            actor_type: sender_actor_type, actor_id: sender_actor_id,
            target_type: recipient_owner_type, target_id: recipient_owner_id,
            metadata: { interaction_type, of_amount_minor: amount_minor, fee_bps: platformFeeBps },
        });
    }

    const result = db.get().transaction(() => {
        const posted = postEntries({ entries });
        const tip = model.createTipRow({
            transaction_group_id: posted.transaction_group_id,
            sender_actor_type, sender_actor_id,
            recipient_owner_type, recipient_owner_id,
            target_context_type, target_context_id,
            interaction_type: interaction_type || 'tip',
            amount_minor, currency, message, visibility,
            status: 'posted', idempotency_key,
            metadata: Object.assign({ fee_minor: fee, net_minor: net }, metadata || {}),
        });
        model.addCreatorEarning(recipient_owner_type, recipient_owner_id, currency, net);
        return { tip, transaction_group_id: posted.transaction_group_id };
    })();
    return { tip: result.tip, transaction_group_id: result.transaction_group_id, replayed: false };
}

function interactionToTxType(interaction_type) {
    switch (interaction_type) {
        case 'superchat':     return 'superchat';
        case 'tts':           return 'tts_payment';
        case 'soundboard':    return 'tts_payment';
        case 'media_request': return 'media_request_payment';
        case 'alert':         return 'tip';
        case 'tip':
        default:              return 'tip';
    }
}

function refundTip({ tip_id, reason, actor_type, actor_id }) {
    const tip = model.getTip(tip_id);
    if (!tip) throw new BillingError('tip not found', { code: 'ENOTIP', status: 404 });
    if (tip.status === 'refunded') return { tip, replayed: true };
    refundTransactionGroup({ transaction_group_id: tip.transaction_group_id, reason, actor_type, actor_id });
    const updated = model.setTipStatus(tip.id, 'refunded');
    return { tip: updated, replayed: false };
}

// ── subscriptions ──────────────────────────────────────────
function createSubscription({
    plan_id, subscriber_actor_type, subscriber_actor_id,
    actor_type, actor_id, currency, idempotency_key, metadata, platformFeeBps = 0,
}) {
    assertEconomyNotFrozen();
    const plan = model.getPlan(plan_id);
    if (!plan)   throw new BillingError('plan not found', { code: 'ENOPLAN', status: 404 });
    if (plan.status !== 'active') throw new BillingError('plan not active', { code: 'EPLAN', status: 409 });
    const c = currency || plan.currency;

    if (idempotency_key) {
        const cached = model.findLedgerByIdempotencyKey(idempotency_key);
        if (cached.length) {
            const existing = model.listSubscriptions({
                subscriber_actor_type, subscriber_actor_id, plan_id,
            }).find(s => s.last_charge_transaction_group_id === cached[0].transaction_group_id);
            if (existing) return { subscription: existing, transaction_group_id: cached[0].transaction_group_id, replayed: true };
        }
    }

    // Charge subscriber, credit plan owner.
    const senderWallet = ensureWallet({ owner_type: subscriber_actor_type, owner_id: subscriber_actor_id, wallet_type: 'credits', currency: c });
    const ownerWallet  = ensureWallet({ owner_type: plan.owner_type, owner_id: plan.owner_id, wallet_type: 'creator', currency: c });

    const fee = Math.max(0, Math.min(plan.amount_minor, Math.floor(plan.amount_minor * Number(platformFeeBps || 0) / 10000)));
    const net = plan.amount_minor - fee;

    const entries = [
        { wallet_id: senderWallet.id, direction: 'debit', amount_minor: plan.amount_minor, currency: c,
          transaction_type: 'subscription_charge',
          actor_type, actor_id, idempotency_key,
          target_type: plan.owner_type, target_id: plan.owner_id,
          metadata: Object.assign({ plan_id, billing_interval: plan.billing_interval }, metadata || {}) },
        { wallet_id: ownerWallet.id, direction: 'credit', amount_minor: net, currency: c,
          transaction_type: 'creator_earning',
          actor_type, actor_id,
          target_type: plan.owner_type, target_id: plan.owner_id,
          metadata: { plan_id, fee_minor: fee, source: 'subscription' } },
    ];
    if (fee > 0) {
        const platformWallet = ensureWallet({ owner_type: 'system', owner_id: 'platform', wallet_type: 'platform', currency: c });
        entries.push({ wallet_id: platformWallet.id, direction: 'credit', amount_minor: fee, currency: c,
            transaction_type: 'platform_fee', actor_type, actor_id,
            target_type: plan.owner_type, target_id: plan.owner_id,
            metadata: { plan_id, of_amount_minor: plan.amount_minor, fee_bps: platformFeeBps } });
    }

    const result = db.get().transaction(() => {
        const posted = postEntries({ entries });
        const periodStart = new Date();
        const periodEnd = new Date(periodStart);
        if (plan.billing_interval === 'year')      periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
        else if (plan.billing_interval === 'month')periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
        else                                       periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 100);

        const sub = model.createSubscriptionRow({
            plan_id, subscriber_actor_type, subscriber_actor_id,
            target_owner_type: plan.owner_type, target_owner_id: plan.owner_id,
            status: 'active',
            current_period_start: periodStart.toISOString(),
            current_period_end:   periodEnd.toISOString(),
            last_charge_transaction_group_id: posted.transaction_group_id,
            metadata: metadata || {},
        });
        model.addCreatorEarning(plan.owner_type, plan.owner_id, c, net);
        return { sub, posted };
    })();
    return { subscription: result.sub, transaction_group_id: result.posted.transaction_group_id, replayed: false };
}

function cancelSubscription({ subscription_id, reason, actor_type, actor_id }) {
    const sub = model.getSubscription(subscription_id);
    if (!sub) throw new BillingError('subscription not found', { code: 'ENOSUB', status: 404 });
    if (sub.status === 'cancelled' || sub.status === 'expired') {
        return { subscription: sub, replayed: true };
    }
    const updated = model.updateSubscription(subscription_id, {
        status: 'cancelled', cancelled_at: new Date().toISOString(),
        metadata: Object.assign({}, sub.metadata || {}, { cancel_reason: reason || null }),
    });
    model.recordAudit({ actor_type, actor_id, action: 'subscription_cancel',
        target_type: 'subscription', target_id: subscription_id, before: sub, after: updated, reason });
    return { subscription: updated, replayed: false };
}

// ── checkout completion ────────────────────────────────────
function completeCheckout({ session_id, provider_external_ref, actor_type, actor_id, metadata }) {
    const sess = model.getCheckout(session_id);
    if (!sess) throw new BillingError('session not found', { code: 'ENOSESSION', status: 404 });
    if (sess.status === 'paid') {
        // idempotent: find ledger group via session metadata
        const meta = sess.metadata || {};
        if (meta.transaction_group_id) {
            return { session: sess, ledger: model.listLedgerByGroup(meta.transaction_group_id), replayed: true };
        }
    }
    if (sess.status === 'cancelled' || sess.status === 'expired' || sess.status === 'failed') {
        throw new BillingError(`session ${sess.status}`, { code: 'EBADSTATE', status: 409 });
    }
    const result = postCreditPurchase({
        owner_type: sess.owner_type, owner_id: sess.owner_id,
        currency: sess.currency, amount_minor: sess.credits_minor,
        provider: sess.provider, external_ref: provider_external_ref || sess.external_ref,
        idempotency_key: `checkout:${sess.id}`,
        actor_type, actor_id,
        metadata: Object.assign({ session_id: sess.id }, metadata || {}),
    });
    model.updateCheckoutStatus(sess.id, 'paid', provider_external_ref, {
        transaction_group_id: result.transaction_group_id,
    });
    return { session: model.getCheckout(sess.id), ledger: result.ledger, replayed: false };
}

module.exports = {
    BillingError,
    ensureWallet, getBalance, rebuildSnapshot,
    assertEconomyNotFrozen, assertWalletActive,
    postEntries,
    postCreditPurchase, postCreditGrant, chargeCredits, refundTransactionGroup,
    createTip, refundTip,
    createSubscription, cancelSubscription,
    completeCheckout,
};
