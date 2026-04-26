'use strict';

// openvibe-billing — model + ledger + policy in-process smoke test.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-billing-test-')), 'billing.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.PLATFORM_FEE_BPS = '500'; // 5%

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const ledger = require('../server/ledger');
const policy = require('../server/policy');

// ── wallet creation + idempotent ensureWallet
const w1 = ledger.ensureWallet({ owner_type: 'user', owner_id: '42', wallet_type: 'credits', currency: 'OVC' });
assert.ok(w1.id.startsWith('wal_'));
const w1b = ledger.ensureWallet({ owner_type: 'user', owner_id: '42', wallet_type: 'credits', currency: 'OVC' });
assert.strictEqual(w1.id, w1b.id, 'ensureWallet must be idempotent');

// ── purchase 1000 credits
const purchase = ledger.postCreditPurchase({
    owner_type: 'user', owner_id: '42', currency: 'OVC', amount_minor: 1000,
    provider: 'stub', external_ref: 'stub_demo_1', actor_type: 'service', actor_id: 'openvibe-billing',
    idempotency_key: 'tx-purchase-1',
});
assert.strictEqual(purchase.replayed, false);
assert.strictEqual(ledger.getBalance(w1.id), 1000, 'balance after purchase');

// ── replay same idempotency key → no double credit
const purchase2 = ledger.postCreditPurchase({
    owner_type: 'user', owner_id: '42', currency: 'OVC', amount_minor: 1000,
    provider: 'stub', external_ref: 'stub_demo_1', actor_type: 'service', actor_id: 'openvibe-billing',
    idempotency_key: 'tx-purchase-1',
});
assert.strictEqual(purchase2.replayed, true);
assert.strictEqual(ledger.getBalance(w1.id), 1000, 'balance unchanged on replay');

// ── charge 250 credits to a stream target
const charge = ledger.chargeCredits({
    owner_type: 'user', owner_id: '42', currency: 'OVC', amount_minor: 250,
    target_type: 'stream', target_id: 's-99', transaction_type: 'credit_spend',
    actor_type: 'user', actor_id: '42', idempotency_key: 'spend-1',
});
assert.strictEqual(ledger.getBalance(w1.id), 750);
assert.ok(charge.transaction_group_id);

// ── insufficient funds
let threw = false;
try { ledger.chargeCredits({
    owner_type: 'user', owner_id: '42', currency: 'OVC', amount_minor: 10000,
    actor_type: 'user', actor_id: '42', idempotency_key: 'spend-overdraft',
}); } catch (e) { threw = true; assert.strictEqual(e.code, 'EFUNDS'); }
assert.ok(threw, 'overdraft must throw EFUNDS');

// ── refund the previous charge
const refund = ledger.refundTransactionGroup({
    transaction_group_id: charge.transaction_group_id,
    reason: 'user requested', actor_type: 'service', actor_id: 'openvibe-billing',
});
assert.strictEqual(ledger.getBalance(w1.id), 1000, 'balance restored after refund');
assert.ok(refund.ledger.length >= 1);

// ── snapshot must match recompute
const recomputed = model.recomputeBalanceFromLedger(w1.id);
assert.strictEqual(recomputed.balance, ledger.getBalance(w1.id), 'snapshot matches recompute');

// ── tip from sender to creator (with 5% platform fee)
ledger.postCreditPurchase({
    owner_type: 'user', owner_id: '7', currency: 'OVC', amount_minor: 500,
    provider: 'stub', actor_type: 'service', actor_id: 'openvibe-billing', idempotency_key: 'sender-buys',
});
const tipResult = ledger.createTip({
    sender_actor_type: 'user', sender_actor_id: '7',
    recipient_owner_type: 'user', recipient_owner_id: '99',
    target_context_type: 'stream', target_context_id: 's-1',
    interaction_type: 'tip', amount_minor: 200, currency: 'OVC',
    message: 'Nice stream', visibility: 'public',
    idempotency_key: 'tip-1', platformFeeBps: 500,
});
assert.strictEqual(tipResult.replayed, false);
assert.strictEqual(tipResult.tip.interaction_type, 'tip');
const senderWallet = model.getWallet('user', '7', 'credits', 'OVC');
const creatorWallet = model.getWallet('user', '99', 'creator', 'OVC');
const platformWallet = model.getWallet('system', 'platform', 'platform', 'OVC');
assert.strictEqual(ledger.getBalance(senderWallet.id), 300, 'sender debited 200');
assert.strictEqual(ledger.getBalance(creatorWallet.id), 190, 'creator credited net 190');
assert.strictEqual(ledger.getBalance(platformWallet.id), 10, 'platform fee 5%');

// ── replay tip with same idempotency key
const tipReplay = ledger.createTip({
    sender_actor_type: 'user', sender_actor_id: '7',
    recipient_owner_type: 'user', recipient_owner_id: '99',
    interaction_type: 'tip', amount_minor: 200, currency: 'OVC',
    idempotency_key: 'tip-1', platformFeeBps: 500,
});
assert.strictEqual(tipReplay.replayed, true);
assert.strictEqual(ledger.getBalance(senderWallet.id), 300, 'no double-debit on replay');

// ── superchat as a tip variant
const sc = ledger.createTip({
    sender_actor_type: 'user', sender_actor_id: '7',
    recipient_owner_type: 'user', recipient_owner_id: '99',
    interaction_type: 'superchat', amount_minor: 50, currency: 'OVC',
    message: 'PIN ME!', visibility: 'public',
    idempotency_key: 'sc-1', platformFeeBps: 500,
});
assert.strictEqual(sc.tip.interaction_type, 'superchat');

// ── VIP plan + subscribe + entitlement check + cancel
const plan = model.createPlan({
    owner_type: 'user', owner_id: '99', name: 'VIP', currency: 'OVC',
    amount_minor: 100, billing_interval: 'month', perks: ['custom-emote', 'badge'],
});
ledger.postCreditPurchase({
    owner_type: 'user', owner_id: '7', currency: 'OVC', amount_minor: 500,
    provider: 'stub', actor_type: 'service', actor_id: 'openvibe-billing', idempotency_key: 'topup-2',
});
const subBal = ledger.getBalance(senderWallet.id);
const sub = ledger.createSubscription({
    plan_id: plan.id, subscriber_actor_type: 'user', subscriber_actor_id: '7',
    actor_type: 'user', actor_id: '7', idempotency_key: 'sub-1', platformFeeBps: 500,
});
assert.strictEqual(sub.subscription.status, 'active');
assert.strictEqual(ledger.getBalance(senderWallet.id), subBal - 100);

// entitlement check
const subs = model.listSubscriptions({
    subscriber_actor_type: 'user', subscriber_actor_id: '7',
    target_owner_type: 'user', target_owner_id: '99', status: 'active',
});
assert.strictEqual(subs.length, 1);

const cancel = ledger.cancelSubscription({ subscription_id: sub.subscription.id, reason: 'test', actor_type: 'user', actor_id: '7' });
assert.strictEqual(cancel.subscription.status, 'cancelled');

// ── economy freeze prevents new spends
model.setEconomyState({ frozen: true, reason: 'test', actor_type: 'admin', actor_id: 'root' });
threw = false;
try { ledger.chargeCredits({ owner_type: 'user', owner_id: '42', currency: 'OVC', amount_minor: 10,
    actor_type: 'user', actor_id: '42', idempotency_key: 'frozen-spend' }); }
catch (e) { threw = true; assert.strictEqual(e.code, 'EFROZEN'); }
assert.ok(threw, 'frozen economy must block spends');
model.setEconomyState({ frozen: false });

// ── policy decisions
const userReq = { user: { sub: '42', role: 'user' } };
const otherReq = { user: { sub: '99', role: 'user' } };
const adminReq = { user: { sub: '1', role: 'admin' } };
const svcReq = { serviceActor: 'openvibe-stream' };
assert.strictEqual(policy.decideWalletRead({ req: userReq, owner_type: 'user', owner_id: '42' }).allow, true);
assert.strictEqual(policy.decideWalletRead({ req: otherReq, owner_type: 'user', owner_id: '42' }).allow, false);
assert.strictEqual(policy.decideWalletRead({ req: adminReq, owner_type: 'user', owner_id: '42' }).allow, true);
assert.strictEqual(policy.decideWalletRead({ req: svcReq, owner_type: 'user', owner_id: '42' }).allow, true);
assert.strictEqual(policy.decideAdjust({ req: userReq }).allow, false);
assert.strictEqual(policy.decideEconomyFreeze({ req: userReq }).allow, false);
assert.strictEqual(policy.decideTip({ req: userReq, sender_actor_type: 'user', sender_actor_id: '42' }).allow, true);
assert.strictEqual(policy.decideTip({ req: userReq, sender_actor_type: 'user', sender_actor_id: '99' }).allow, false);
assert.strictEqual(policy.decideRefund({ req: userReq }).allow, false);
assert.strictEqual(policy.decideRefund({ req: svcReq }).allow, true);

// ── legacy mapping
model.recordLegacyMap({ source: 'hobostreamer', kind: 'transaction', legacy_id: 'tx-7', new_id: 'led_xyz' });
assert.strictEqual(model.lookupLegacy('hobostreamer', 'transaction', 'tx-7').new_id, 'led_xyz');

console.log('openvibe-billing smoke OK');
