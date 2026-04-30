'use strict';

// openvibe-billing — REST routes.
//
// Auth model:
//   - service callers: X-Internal-Key + X-OpenVibe-Service (req.serviceActor)
//   - user callers:    Bearer token / cookie -> req.user (when auth issuer wired)
//   - anonymous:       read-only on truly public endpoints (overlay feed)

const express = require('express');
const config = require('./config');
const model = require('./model');
const policy = require('./policy');
const ledger = require('./ledger');
const providers = require('./providers');
const { reconcileWalletSnapshots } = require('./reconciler');
const {
    BILLING_EVENT_TYPES, TIPS_EVENT_TYPES, VIP_EVENT_TYPES,
    BILLING_TARGET_TYPES, TIP_INTERACTION_TYPES,
} = require('@openvibe/contracts');

function buildRouter({ eventBus }) {
    const r = express.Router();
    const json = express.json({ limit: '256kb' });

    function actorMeta(req) {
        const a = policy.actorOfReq(req);
        return { actor_type: a.type, actor_id: a.id };
    }
    function serviceActorId(req) {
        return typeof req.serviceActor === 'string'
            ? req.serviceActor
            : req.serviceActor && req.serviceActor.id || null;
    }
    function denied(res, err) {
        return res.status(err.status || 403).json({ error: err.message, reason: err.reason || null, detail: err.detail || null });
    }
    function billingErr(res, err) {
        if (err && err.code) return res.status(err.status || 400).json({ error: err.message, code: err.code, detail: err.detail || null });
        console.error('[billing] error:', err && err.stack || err);
        return res.status(500).json({ error: 'internal error' });
    }
    function publishSafe(fn) {
        try { Promise.resolve(fn()).catch(() => {}); } catch { /* ignore */ }
    }

    // ─── health ───
    r.get('/_ping', (_req, res) => res.json({ ok: true, service: config.serviceId }));

    // ─── admin ───
    r.get('/admin/summary', (req, res) => {
        try { policy.assert(policy.decideAdjust({ req }), actorMeta(req)); } catch (e) { return denied(res, e); }
        const wallets = model.listWallets({ limit: 500 });
        const economy = model.getEconomyState();
        res.json({
            economy,
            wallet_count: wallets.length,
            wallets_by_type: wallets.reduce((acc, w) => { acc[w.wallet_type] = (acc[w.wallet_type] || 0) + 1; return acc; }, {}),
        });
    });

    r.get('/admin/ledger', (req, res) => {
        try { policy.assert(policy.decideAdjust({ req }), actorMeta(req)); } catch (e) { return denied(res, e); }
        const items = model.listLedger({
            wallet_id: req.query.wallet_id, actor_type: req.query.actor_type, actor_id: req.query.actor_id,
            target_type: req.query.target_type, target_id: req.query.target_id,
            transaction_type: req.query.transaction_type, limit: req.query.limit,
        });
        res.json({ items });
    });

    r.get('/admin/wallets', (req, res) => {
        try { policy.assert(policy.decideAdjust({ req }), actorMeta(req)); } catch (e) { return denied(res, e); }
        res.json({ items: model.listWallets({ wallet_type: req.query.wallet_type, status: req.query.status, limit: req.query.limit }) });
    });

    r.get('/admin/tips', (req, res) => {
        try { policy.assert(policy.decideAdjust({ req }), actorMeta(req)); } catch (e) { return denied(res, e); }
        res.json({ items: model.listTips(req.query) });
    });

    r.get('/admin/subscriptions', (req, res) => {
        try { policy.assert(policy.decideAdjust({ req }), actorMeta(req)); } catch (e) { return denied(res, e); }
        res.json({ items: model.listSubscriptions(req.query) });
    });

    r.post('/admin/freeze', json, (req, res) => {
        try { policy.assert(policy.decideEconomyFreeze({ req }), actorMeta(req)); } catch (e) { return denied(res, e); }
        const a = actorMeta(req);
        const state = model.setEconomyState({ frozen: true, reason: req.body && req.body.reason || null,
            actor_type: a.actor_type, actor_id: a.actor_id });
        publishSafe(() => eventBus.publishBillingEvent(BILLING_EVENT_TYPES.ECONOMY_FROZEN, { reason: state.reason }, a));
        res.json({ economy: state });
    });

    r.post('/admin/unfreeze', json, (req, res) => {
        try { policy.assert(policy.decideEconomyFreeze({ req }), actorMeta(req)); } catch (e) { return denied(res, e); }
        const a = actorMeta(req);
        const state = model.setEconomyState({ frozen: false, reason: req.body && req.body.reason || null,
            actor_type: a.actor_type, actor_id: a.actor_id });
        publishSafe(() => eventBus.publishBillingEvent(BILLING_EVENT_TYPES.ECONOMY_UNFROZEN, { reason: state.reason }, a));
        res.json({ economy: state });
    });

    // ─── wallet read / list / adjust ───
    r.get('/wallet/:ownerType/:ownerId', (req, res) => {
        const { ownerType, ownerId } = req.params;
        try { policy.assert(policy.decideWalletRead({ req, owner_type: ownerType, owner_id: ownerId }), actorMeta(req)); }
        catch (e) { return denied(res, e); }
        const walletType = req.query.wallet_type || 'credits';
        const currency = req.query.currency || config.creditsCurrency;
        const wallet = ledger.ensureWallet({ owner_type: ownerType, owner_id: ownerId, wallet_type: walletType, currency });
        const balance = ledger.getBalance(wallet.id);
        const wallets = model.listWalletsByOwner(ownerType, ownerId);
        res.json({ wallet: Object.assign({}, wallet, { balance_minor: balance }), all: wallets });
    });

    r.get('/wallet/:ownerType/:ownerId/transactions', (req, res) => {
        const { ownerType, ownerId } = req.params;
        try { policy.assert(policy.decideWalletRead({ req, owner_type: ownerType, owner_id: ownerId }), actorMeta(req)); }
        catch (e) { return denied(res, e); }
        const wallets = model.listWalletsByOwner(ownerType, ownerId);
        let items = [];
        for (const w of wallets) {
            items = items.concat(model.listLedgerByWallet(w.id, { limit: req.query.limit, before_id: req.query.before_id }));
        }
        items.sort((a, b) => (b.posted_at || '').localeCompare(a.posted_at || ''));
        res.json({ items });
    });

    r.post('/wallet/:ownerType/:ownerId/adjust', json, (req, res) => {
        try { policy.assert(policy.decideAdjust({ req }), actorMeta(req)); } catch (e) { return denied(res, e); }
        const { ownerType, ownerId } = req.params;
        const a = actorMeta(req);
        try {
            const result = ledger.postCreditGrant({
                owner_type: ownerType, owner_id: ownerId,
                currency: req.body.currency || config.creditsCurrency,
                amount_minor: Number(req.body.amount_minor),
                reason: req.body.reason,
                actor_type: a.actor_type, actor_id: a.actor_id,
                idempotency_key: req.body.idempotency_key,
                metadata: req.body.metadata,
            });
            publishSafe(() => eventBus.publishBillingEvent(BILLING_EVENT_TYPES.WALLET_BALANCE_UPDATED,
                { wallet_id: result.wallet.id, balance_minor: result.wallet.balance_minor,
                  transaction_group_id: result.transaction_group_id }, a));
            res.status(201).json(result);
        } catch (e) { return billingErr(res, e); }
    });

    // ─── credits checkout ───
    r.post('/credits/checkout', json, (req, res) => {
        const b = req.body || {};
        const ownerType = b.owner_type, ownerId = b.owner_id;
        try { policy.assert(policy.decideCheckoutCreate({ req, owner_type: ownerType, owner_id: ownerId }), actorMeta(req)); }
        catch (e) { return denied(res, e); }
        const currency = b.currency || config.creditsCurrency;
        const credits = Number(b.credits_minor || b.amount_minor);
        if (!Number.isFinite(credits) || credits <= 0) return res.status(400).json({ error: 'credits_minor required (positive integer)' });
        const provider = b.provider || config.defaultProvider;
        try {
            providers.getProvider(provider);
        } catch (e) { return res.status(400).json({ error: e.message }); }

        const session = model.createCheckout({
            owner_type: ownerType, owner_id: ownerId,
            provider, currency,
            amount_minor: Number(b.amount_minor || credits),
            credits_minor: credits,
            return_url: b.return_url, cancel_url: b.cancel_url,
            metadata: b.metadata, expires_at: b.expires_at,
        });
        const a = actorMeta(req);
        providers.getProvider(provider).createCheckoutUrl({ session, publicBaseUrl: config.publicBaseUrl })
            .then((info) => {
                const updated = model.updateCheckoutStatus(session.id, 'pending', info && info.external_ref || null,
                    { checkout_url: info && info.url || null, provider });
                publishSafe(() => eventBus.publishBillingEvent(BILLING_EVENT_TYPES.CREDITS_CHECKOUT_CREATED,
                    { session_id: updated.id, owner_type: ownerType, owner_id: ownerId, provider,
                      amount_minor: updated.amount_minor, credits_minor: updated.credits_minor,
                      checkout_url: info && info.url || null }, a));
                res.status(201).json({ session: updated, checkout_url: info && info.url || null });
            })
            .catch((err) => {
                model.updateCheckoutStatus(session.id, 'failed', null, { error: err.message });
                res.status(502).json({ error: 'provider error', detail: err.message });
            });
    });

    r.post('/credits/checkout/:sessionId/complete', json, (req, res) => {
        const a = actorMeta(req);
        const sess = model.getCheckout(req.params.sessionId);
        if (!sess) return res.status(404).json({ error: 'session not found' });
        try { policy.assert(policy.decideCheckoutCreate({ req, owner_type: sess.owner_type, owner_id: sess.owner_id }), a); }
        catch (e) { return denied(res, e); }
        try {
            const result = ledger.completeCheckout({
                session_id: sess.id,
                provider_external_ref: req.body && req.body.provider_external_ref,
                actor_type: a.actor_type, actor_id: a.actor_id,
                metadata: req.body && req.body.metadata,
            });
            if (!result.replayed) {
                publishSafe(() => eventBus.publishBillingEvent(BILLING_EVENT_TYPES.CREDITS_PURCHASED,
                    { session_id: result.session.id, owner_type: result.session.owner_type, owner_id: result.session.owner_id,
                      amount_minor: result.session.credits_minor, currency: result.session.currency,
                      transaction_group_id: result.ledger[0] && result.ledger[0].transaction_group_id || null }, a));
            }
            res.json(result);
        } catch (e) { return billingErr(res, e); }
    });

    // ─── webhooks ───
    r.post('/webhooks/:provider', express.json({ limit: '1mb' }), (req, res) => {
        const providerName = req.params.provider;
        let prov;
        try { prov = providers.getProvider(providerName); } catch (e) { return res.status(404).json({ error: e.message }); }
        const parsed = prov.parseWebhookEvent(req.body || {});
        const recv = model.recordWebhook({
            provider: providerName,
            external_event_id: parsed.external_event_id,
            payload: req.body || {},
            status: 'received',
        });
        if (recv.duplicate) return res.json({ duplicate: true });
        const a = { actor_type: 'service', actor_id: providerName };
        publishSafe(() => eventBus.publishBillingEvent(BILLING_EVENT_TYPES.WEBHOOK_RECEIVED,
            { provider: providerName, external_event_id: parsed.external_event_id, type: parsed.type }, a));
        try {
            if (parsed.type === 'checkout.completed' && parsed.session_id) {
                const result = ledger.completeCheckout({
                    session_id: parsed.session_id,
                    provider_external_ref: parsed.external_ref,
                    actor_type: 'service', actor_id: providerName,
                });
                model.markWebhookProcessed(recv.id, 'processed', null);
                publishSafe(() => eventBus.publishBillingEvent(BILLING_EVENT_TYPES.WEBHOOK_PROCESSED,
                    { provider: providerName, external_event_id: parsed.external_event_id, session_id: parsed.session_id }, a));
                if (!result.replayed) {
                    publishSafe(() => eventBus.publishBillingEvent(BILLING_EVENT_TYPES.CREDITS_PURCHASED,
                        { session_id: result.session.id, owner_type: result.session.owner_type, owner_id: result.session.owner_id,
                          amount_minor: result.session.credits_minor, currency: result.session.currency,
                          transaction_group_id: result.ledger[0] && result.ledger[0].transaction_group_id || null }, a));
                }
                return res.json({ ok: true, replayed: result.replayed });
            }
            model.markWebhookProcessed(recv.id, 'ignored', `unhandled type ${parsed.type}`);
            res.json({ ok: true, ignored: true });
        } catch (e) {
            model.markWebhookProcessed(recv.id, 'failed', e.message);
            return billingErr(res, e);
        }
    });

    // ─── credits charge / refund ───
    r.post('/credits/charge', json, (req, res) => {
        const b = req.body || {};
        const a = actorMeta(req);
        try { policy.assert(policy.decideCharge({ req, owner_type: b.owner_type, owner_id: b.owner_id }), a); }
        catch (e) { return denied(res, e); }
        if (b.target_type && !BILLING_TARGET_TYPES.includes(b.target_type)) {
            return res.status(400).json({ error: `target_type must be one of ${BILLING_TARGET_TYPES.join(',')}` });
        }
        try {
            const result = ledger.chargeCredits({
                owner_type: b.owner_type, owner_id: b.owner_id,
                currency: b.currency || config.creditsCurrency,
                amount_minor: Number(b.amount_minor),
                target_type: b.target_type, target_id: b.target_id,
                transaction_type: b.transaction_type,
                actor_type: a.actor_type, actor_id: a.actor_id,
                idempotency_key: b.idempotency_key, metadata: b.metadata,
            });
            if (!result.replayed) {
                publishSafe(() => eventBus.publishBillingEvent(BILLING_EVENT_TYPES.CREDITS_CHARGED,
                    { wallet_id: result.wallet.id, owner_type: b.owner_type, owner_id: b.owner_id,
                      amount_minor: Number(b.amount_minor), currency: b.currency || config.creditsCurrency,
                      transaction_group_id: result.transaction_group_id,
                      target_type: b.target_type, target_id: b.target_id }, a));
            }
            res.status(result.replayed ? 200 : 201).json(result);
        } catch (e) { return billingErr(res, e); }
    });

    r.post('/credits/refund', json, (req, res) => {
        const a = actorMeta(req);
        try { policy.assert(policy.decideRefund({ req }), a); } catch (e) { return denied(res, e); }
        const b = req.body || {};
        try {
            const result = ledger.refundTransactionGroup({
                transaction_group_id: b.transaction_group_id,
                reason: b.reason, actor_type: a.actor_type, actor_id: a.actor_id,
            });
            publishSafe(() => eventBus.publishBillingEvent(BILLING_EVENT_TYPES.CREDITS_REFUNDED,
                { transaction_group_id: b.transaction_group_id,
                  reversal_transaction_group_id: result.transaction_group_id,
                  reason: b.reason || null }, a));
            res.json(result);
        } catch (e) { return billingErr(res, e); }
    });

    // ─── entitlements ───
    function entitlementsFor(targetType, targetId) {
        const subs = model.listSubscriptions({
            target_owner_type: targetType, target_owner_id: targetId, status: 'active', limit: 500,
        });
        return subs.map(s => ({
            type: 'vip_subscription',
            target_type: targetType, target_id: targetId,
            subscription_id: s.id, plan_id: s.plan_id,
            subscriber_actor_type: s.subscriber_actor_type, subscriber_actor_id: s.subscriber_actor_id,
            status: s.status, current_period_end: s.current_period_end,
        }));
    }

    r.get('/entitlements/:targetType/:targetId', (req, res) => {
        res.json({ items: entitlementsFor(req.params.targetType, req.params.targetId) });
    });

    r.post('/entitlements/check', json, (req, res) => {
        const b = req.body || {};
        if (!b.subscriber_actor_type || !b.subscriber_actor_id || !b.target_owner_type || !b.target_owner_id) {
            return res.status(400).json({ error: 'subscriber + target required' });
        }
        const subs = model.listSubscriptions({
            subscriber_actor_type: b.subscriber_actor_type,
            subscriber_actor_id:   b.subscriber_actor_id,
            target_owner_type:     b.target_owner_type,
            target_owner_id:       b.target_owner_id,
            status: 'active',
        });
        res.json({ active: subs.length > 0, items: subs });
    });

    r.get('/entitlements', (req, res) => {
        const a = actorMeta(req);
        try { policy.assert(policy.decideAdjust({ req }), a); } catch (e) { return denied(res, e); }
        res.json({ items: model.listSubscriptions({ status: req.query.status || 'active', limit: req.query.limit }) });
    });

    r.post('/internal/reconcile', json, (req, res) => {
        if (!req.serviceActor) {
            return res.status(403).json({ error: 'internal service actor required' });
        }
        res.json(reconcileWalletSnapshots({
            model,
            requestedByService: serviceActorId(req) || 'unknown-service',
        }, req.body || {}));
    });

    return r;
}

// ── tips router ───────────────────────────────────────────
function buildTipsRouter({ eventBus }) {
    const r = express.Router();
    const json = express.json({ limit: '128kb' });

    function actorMeta(req) {
        const a = policy.actorOfReq(req);
        return { actor_type: a.type, actor_id: a.id };
    }
    function denied(res, err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason || null }); }
    function billingErr(res, err) {
        if (err && err.code) return res.status(err.status || 400).json({ error: err.message, code: err.code, detail: err.detail || null });
        console.error('[tips] error:', err && err.stack || err);
        return res.status(500).json({ error: 'internal error' });
    }
    function publishSafe(fn) { try { Promise.resolve(fn()).catch(() => {}); } catch { /* ignore */ } }

    r.post('/', json, (req, res) => {
        const a = actorMeta(req);
        const b = req.body || {};
        const senderType = b.sender_actor_type || a.actor_type;
        const senderId   = b.sender_actor_id   || a.actor_id;
        try { policy.assert(policy.decideTip({ req, sender_actor_type: senderType, sender_actor_id: senderId }), a); }
        catch (e) { return denied(res, e); }
        if (b.interaction_type && !TIP_INTERACTION_TYPES.includes(b.interaction_type)) {
            return res.status(400).json({ error: `interaction_type must be one of ${TIP_INTERACTION_TYPES.join(',')}` });
        }
        try {
            const result = ledger.createTip({
                sender_actor_type: senderType, sender_actor_id: senderId,
                recipient_owner_type: b.recipient_owner_type, recipient_owner_id: b.recipient_owner_id,
                target_context_type: b.target_context_type, target_context_id: b.target_context_id,
                interaction_type: b.interaction_type || 'tip',
                amount_minor: Number(b.amount_minor),
                currency: b.currency || config.creditsCurrency,
                message: b.message, visibility: b.visibility,
                idempotency_key: b.idempotency_key, metadata: b.metadata,
                platformFeeBps: config.platformFeeBps,
            });
            if (!result.replayed) {
                const evType = result.tip.interaction_type === 'superchat' ? TIPS_EVENT_TYPES.SUPERCHAT_CREATED
                    : result.tip.interaction_type === 'tts' ? TIPS_EVENT_TYPES.TTS_CREATED
                    : result.tip.interaction_type === 'media_request' ? TIPS_EVENT_TYPES.MEDIA_REQUEST_CREATED
                    : TIPS_EVENT_TYPES.TIP_CREATED;
                publishSafe(() => eventBus.publishTipsEvent(evType, {
                    tip_id: result.tip.id, transaction_group_id: result.tip.transaction_group_id,
                    sender_actor_type: result.tip.sender_actor_type, sender_actor_id: result.tip.sender_actor_id,
                    recipient_owner_type: result.tip.recipient_owner_type, recipient_owner_id: result.tip.recipient_owner_id,
                    target_context_type: result.tip.target_context_type, target_context_id: result.tip.target_context_id,
                    interaction_type: result.tip.interaction_type,
                    amount_minor: result.tip.amount_minor, currency: result.tip.currency,
                    visibility: result.tip.visibility,
                }, a));
            }
            res.status(result.replayed ? 200 : 201).json(result);
        } catch (e) { return billingErr(res, e); }
    });

    r.get('/', (req, res) => {
        // Sender / recipient / context filtering. Visibility=anonymous strips sender id.
        const items = model.listTips(req.query).filter(t => t.visibility !== 'private' || policy.isAdmin(req) || policy.isService(req));
        res.json({ items: items.map(t => t.visibility === 'anonymous' ? Object.assign({}, t, { sender_actor_id: null }) : t) });
    });

    r.get('/overlay/:targetType/:targetId', (req, res) => {
        const items = model.listTips({
            target_context_type: req.params.targetType,
            target_context_id:   req.params.targetId,
            status: 'posted',
            limit: req.query.limit,
        }).filter(t => t.visibility === 'public' || t.visibility === 'anonymous')
          .map(t => t.visibility === 'anonymous' ? Object.assign({}, t, { sender_actor_id: null }) : t);
        res.json({ items });
    });

    // Phase 16 — product status seam: lightweight summary that the admin
    // matrix and product surfaces use to confirm the tips workflow is wired.
    r.get('/product/status', (req, res) => {
        const recent = model.listTips({ limit: 50 });
        const byStatus = {};
        const byInteraction = {};
        let totalPostedMinor = 0;
        for (const t of recent) {
            byStatus[t.status] = (byStatus[t.status] || 0) + 1;
            byInteraction[t.interaction_type] = (byInteraction[t.interaction_type] || 0) + 1;
            if (t.status === 'posted') totalPostedMinor += Number(t.amount_minor) || 0;
        }
        res.json({
            ok: true,
            product: 'tips',
            sample_size: recent.length,
            by_status: byStatus,
            by_interaction: byInteraction,
            recent_posted_minor: totalPostedMinor,
            currency: config.creditsCurrency,
            platform_fee_bps: config.platformFeeBps,
        });
    });

    r.get('/:tipId', (req, res) => {
        const tip = model.getTip(req.params.tipId);
        if (!tip) return res.status(404).json({ error: 'tip not found' });
        res.json({ tip });
    });

    r.post('/:tipId/refund', json, (req, res) => {
        const a = actorMeta(req);
        try { policy.assert(policy.decideRefund({ req }), a); } catch (e) { return denied(res, e); }
        try {
            const result = ledger.refundTip({
                tip_id: req.params.tipId, reason: req.body && req.body.reason,
                actor_type: a.actor_type, actor_id: a.actor_id,
            });
            publishSafe(() => eventBus.publishTipsEvent(TIPS_EVENT_TYPES.TIP_REFUNDED,
                { tip_id: result.tip.id, transaction_group_id: result.tip.transaction_group_id,
                  reason: req.body && req.body.reason || null }, a));
            res.json(result);
        } catch (e) { return billingErr(res, e); }
    });

    return r;
}

// ── VIP router ────────────────────────────────────────────
function buildVipRouter({ eventBus }) {
    const r = express.Router();
    const json = express.json({ limit: '128kb' });

    function actorMeta(req) {
        const a = policy.actorOfReq(req);
        return { actor_type: a.type, actor_id: a.id };
    }
    function denied(res, err) { return res.status(err.status || 403).json({ error: err.message, reason: err.reason || null }); }
    function billingErr(res, err) {
        if (err && err.code) return res.status(err.status || 400).json({ error: err.message, code: err.code, detail: err.detail || null });
        console.error('[vip] error:', err && err.stack || err);
        return res.status(500).json({ error: 'internal error' });
    }
    function publishSafe(fn) { try { Promise.resolve(fn()).catch(() => {}); } catch { /* ignore */ } }

    // Phase 16 — VIP product status seam.
    r.get('/product/status', (req, res) => {
        const plans = model.listPlans({ limit: 200 });
        const subs = model.listSubscriptions({ limit: 200 });
        const planByStatus = {};
        const subByStatus = {};
        for (const p of plans) planByStatus[p.status] = (planByStatus[p.status] || 0) + 1;
        for (const s of subs) subByStatus[s.status] = (subByStatus[s.status] || 0) + 1;
        res.json({
            ok: true,
            product: 'vip',
            plan_count: plans.length,
            plans_by_status: planByStatus,
            subscription_count: subs.length,
            subscriptions_by_status: subByStatus,
            currency: config.creditsCurrency,
            platform_fee_bps: config.platformFeeBps,
        });
    });

    // plans
    r.get('/plans', (req, res) => {
        const items = model.listPlans(req.query);
        res.json({ items: items.filter(p => p.visibility === 'public' || policy.isAdmin(req) || policy.isService(req) ||
            (req.user && p.owner_type === 'user' && String(req.user.sub || req.user.id) === String(p.owner_id))) });
    });

    r.post('/plans', json, (req, res) => {
        const b = req.body || {};
        const a = actorMeta(req);
        const ownerType = b.owner_type || a.actor_type;
        const ownerId   = b.owner_id   || a.actor_id;
        try { policy.assert(policy.decidePlanManage({ req, owner_type: ownerType, owner_id: ownerId }), a); }
        catch (e) { return denied(res, e); }
        try {
            const plan = model.createPlan(Object.assign({}, b, { owner_type: ownerType, owner_id: ownerId,
                currency: b.currency || config.creditsCurrency }));
            publishSafe(() => eventBus.publishVipEvent(VIP_EVENT_TYPES.PLAN_CREATED,
                { plan_id: plan.id, owner_type: plan.owner_type, owner_id: plan.owner_id,
                  amount_minor: plan.amount_minor, currency: plan.currency, billing_interval: plan.billing_interval }, a));
            res.status(201).json({ plan });
        } catch (e) { return billingErr(res, e); }
    });

    r.get('/plans/:planId', (req, res) => {
        const plan = model.getPlan(req.params.planId);
        if (!plan) return res.status(404).json({ error: 'plan not found' });
        res.json({ plan });
    });

    r.put('/plans/:planId', json, (req, res) => {
        const plan = model.getPlan(req.params.planId);
        if (!plan) return res.status(404).json({ error: 'plan not found' });
        const a = actorMeta(req);
        try { policy.assert(policy.decidePlanManage({ req, owner_type: plan.owner_type, owner_id: plan.owner_id }), a); }
        catch (e) { return denied(res, e); }
        const updated = model.updatePlan(plan.id, req.body || {});
        publishSafe(() => eventBus.publishVipEvent(VIP_EVENT_TYPES.PLAN_UPDATED,
            { plan_id: plan.id, owner_type: plan.owner_type, owner_id: plan.owner_id }, a));
        res.json({ plan: updated });
    });

    // subscriptions
    r.post('/subscriptions', json, (req, res) => {
        const b = req.body || {};
        const a = actorMeta(req);
        const subType = b.subscriber_actor_type || a.actor_type;
        const subId   = b.subscriber_actor_id   || a.actor_id;
        try { policy.assert(policy.decideSubscriptionCreate({ req, subscriber_actor_type: subType, subscriber_actor_id: subId }), a); }
        catch (e) { return denied(res, e); }
        try {
            const result = ledger.createSubscription({
                plan_id: b.plan_id,
                subscriber_actor_type: subType, subscriber_actor_id: subId,
                actor_type: a.actor_type, actor_id: a.actor_id,
                currency: b.currency, idempotency_key: b.idempotency_key, metadata: b.metadata,
                platformFeeBps: config.platformFeeBps,
            });
            if (!result.replayed) {
                publishSafe(() => eventBus.publishVipEvent(VIP_EVENT_TYPES.SUBSCRIPTION_CREATED,
                    { subscription_id: result.subscription.id, plan_id: result.subscription.plan_id,
                      subscriber_actor_type: result.subscription.subscriber_actor_type,
                      subscriber_actor_id: result.subscription.subscriber_actor_id,
                      target_owner_type: result.subscription.target_owner_type,
                      target_owner_id: result.subscription.target_owner_id,
                      transaction_group_id: result.transaction_group_id,
                      current_period_end: result.subscription.current_period_end }, a));
                publishSafe(() => eventBus.publishVipEvent(VIP_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
                    { subscription_id: result.subscription.id }, a));
                publishSafe(() => eventBus.publishVipEvent(VIP_EVENT_TYPES.ENTITLEMENT_GRANTED,
                    { subscription_id: result.subscription.id, target_owner_type: result.subscription.target_owner_type,
                      target_owner_id: result.subscription.target_owner_id,
                      subscriber_actor_type: result.subscription.subscriber_actor_type,
                      subscriber_actor_id: result.subscription.subscriber_actor_id }, a));
            }
            res.status(result.replayed ? 200 : 201).json(result);
        } catch (e) { return billingErr(res, e); }
    });

    r.get('/subscriptions', (req, res) => {
        const a = actorMeta(req);
        // Restrict to admin/service or self-listing
        if (!policy.isAdmin(req) && !policy.isService(req)) {
            if (!req.user) return res.status(401).json({ error: 'auth required' });
            return res.json({ items: model.listSubscriptions({ subscriber_actor_type: 'user', subscriber_actor_id: String(req.user.sub || req.user.id) }) });
        }
        res.json({ items: model.listSubscriptions(req.query) });
    });

    r.get('/subscriptions/:id', (req, res) => {
        const sub = model.getSubscription(req.params.id);
        if (!sub) return res.status(404).json({ error: 'subscription not found' });
        const a = actorMeta(req);
        if (!policy.isAdmin(req) && !policy.isService(req)
            && !(a.actor_type === sub.subscriber_actor_type && String(a.actor_id) === String(sub.subscriber_actor_id))
            && !(a.actor_type === sub.target_owner_type && String(a.actor_id) === String(sub.target_owner_id))) {
            return res.status(403).json({ error: 'not subscriber, plan owner, admin, or service' });
        }
        res.json({ subscription: sub });
    });

    r.post('/subscriptions/:id/cancel', json, (req, res) => {
        const sub = model.getSubscription(req.params.id);
        if (!sub) return res.status(404).json({ error: 'subscription not found' });
        const a = actorMeta(req);
        try { policy.assert(policy.decideSubscriptionCancel({ req, subscription: sub }), a); }
        catch (e) { return denied(res, e); }
        try {
            const result = ledger.cancelSubscription({
                subscription_id: sub.id, reason: req.body && req.body.reason,
                actor_type: a.actor_type, actor_id: a.actor_id,
            });
            publishSafe(() => eventBus.publishVipEvent(VIP_EVENT_TYPES.SUBSCRIPTION_CANCELLED,
                { subscription_id: sub.id, reason: req.body && req.body.reason || null }, a));
            publishSafe(() => eventBus.publishVipEvent(VIP_EVENT_TYPES.ENTITLEMENT_REVOKED,
                { subscription_id: sub.id, target_owner_type: sub.target_owner_type, target_owner_id: sub.target_owner_id,
                  subscriber_actor_type: sub.subscriber_actor_type, subscriber_actor_id: sub.subscriber_actor_id }, a));
            res.json(result);
        } catch (e) { return billingErr(res, e); }
    });

    r.post('/subscriptions/:id/renew', json, (req, res) => {
        const sub = model.getSubscription(req.params.id);
        if (!sub) return res.status(404).json({ error: 'subscription not found' });
        const a = actorMeta(req);
        try { policy.assert(policy.decideSubscriptionCreate({ req, subscriber_actor_type: sub.subscriber_actor_type, subscriber_actor_id: sub.subscriber_actor_id }), a); }
        catch (e) { return denied(res, e); }
        try {
            const result = ledger.createSubscription({
                plan_id: sub.plan_id,
                subscriber_actor_type: sub.subscriber_actor_type,
                subscriber_actor_id:   sub.subscriber_actor_id,
                actor_type: a.actor_type, actor_id: a.actor_id,
                idempotency_key: req.body && req.body.idempotency_key,
                platformFeeBps: config.platformFeeBps,
            });
            publishSafe(() => eventBus.publishVipEvent(VIP_EVENT_TYPES.SUBSCRIPTION_RENEWED,
                { subscription_id: result.subscription.id, transaction_group_id: result.transaction_group_id }, a));
            res.json(result);
        } catch (e) { return billingErr(res, e); }
    });

    return r;
}

module.exports = { buildRouter, buildTipsRouter, buildVipRouter };
