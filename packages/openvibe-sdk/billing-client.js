'use strict';

// OpenVibe — billing-service HTTP client. Wraps the openvibe-billing REST
// API (wallets, credits checkout/charge/refund, tips, VIP plans/subs,
// entitlements, admin economy controls).

const { jsonRequest } = require('./http');

class BillingClient {
    constructor(opts) {
        if (!opts || !opts.billingUrl) throw new Error('BillingClient: billingUrl required');
        this.billingUrl    = String(opts.billingUrl).replace(/\/$/, '');
        this.internalKey   = opts.internalKey || null;
        this.callerService = opts.service || null;
    }
    _u(p) { return `${this.billingUrl}${p}`; }
    _hdrs() {
        const h = {};
        if (this.callerService) h['X-OpenVibe-Service'] = this.callerService;
        return h;
    }
    _get(p)         { return jsonRequest(this._u(p), { headers: this._hdrs(), internalKey: this.internalKey }); }
    _post(p, body)  { return jsonRequest(this._u(p), { method: 'POST',  headers: this._hdrs(), internalKey: this.internalKey, body: body || {} }); }
    _put(p, body)   { return jsonRequest(this._u(p), { method: 'PUT',   headers: this._hdrs(), internalKey: this.internalKey, body: body || {} }); }

    // ── health / admin
    health()                    { return this._get('/health'); }
    adminSummary()              { return this._get('/api/billing/admin/summary'); }
    adminListLedger(query)      { const qs = new URLSearchParams(query || {}).toString(); return this._get(`/api/billing/admin/ledger${qs ? '?' + qs : ''}`); }
    adminListWallets(query)     { const qs = new URLSearchParams(query || {}).toString(); return this._get(`/api/billing/admin/wallets${qs ? '?' + qs : ''}`); }
    adminListTips(query)        { const qs = new URLSearchParams(query || {}).toString(); return this._get(`/api/billing/admin/tips${qs ? '?' + qs : ''}`); }
    adminListSubscriptions(q)   { const qs = new URLSearchParams(q || {}).toString();     return this._get(`/api/billing/admin/subscriptions${qs ? '?' + qs : ''}`); }
    freezeEconomy(reason)       { return this._post('/api/billing/admin/freeze',   { reason: reason || null }); }
    unfreezeEconomy(reason)     { return this._post('/api/billing/admin/unfreeze', { reason: reason || null }); }

    // ── wallet
    getWallet(ownerType, ownerId, walletType) {
        const qs = walletType ? `?wallet_type=${encodeURIComponent(walletType)}` : '';
        return this._get(`/api/billing/wallet/${encodeURIComponent(ownerType)}/${encodeURIComponent(ownerId)}${qs}`);
    }
    listWalletTransactions(ownerType, ownerId, query) {
        const qs = new URLSearchParams(query || {}).toString();
        return this._get(`/api/billing/wallet/${encodeURIComponent(ownerType)}/${encodeURIComponent(ownerId)}/transactions${qs ? '?' + qs : ''}`);
    }
    adjustWallet(ownerType, ownerId, body) {
        return this._post(`/api/billing/wallet/${encodeURIComponent(ownerType)}/${encodeURIComponent(ownerId)}/adjust`, body);
    }

    // ── credits checkout / purchase
    createCheckout(body)             { return this._post('/api/billing/credits/checkout', body); }
    completeCheckout(sessionId, body){ return this._post(`/api/billing/credits/checkout/${encodeURIComponent(sessionId)}/complete`, body || {}); }
    deliverWebhook(provider, body)   { return this._post(`/api/billing/webhooks/${encodeURIComponent(provider)}`, body); }

    // ── credits charge / refund
    chargeCredits(body) { return this._post('/api/billing/credits/charge', body); }
    refundCredits(body) { return this._post('/api/billing/credits/refund', body); }

    // ── tips
    createTip(body)         { return this._post('/api/tips', body); }
    listTips(query)         { const qs = new URLSearchParams(query || {}).toString(); return this._get(`/api/tips${qs ? '?' + qs : ''}`); }
    getTip(tipId)           { return this._get(`/api/tips/${encodeURIComponent(tipId)}`); }
    refundTip(tipId, body)  { return this._post(`/api/tips/${encodeURIComponent(tipId)}/refund`, body || {}); }
    overlayFeed(targetType, targetId, query) {
        const qs = new URLSearchParams(query || {}).toString();
        return this._get(`/api/tips/overlay/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}${qs ? '?' + qs : ''}`);
    }

    // ── VIP plans / subscriptions
    createPlan(body)            { return this._post('/api/vip/plans', body); }
    listPlans(query)            { const qs = new URLSearchParams(query || {}).toString(); return this._get(`/api/vip/plans${qs ? '?' + qs : ''}`); }
    getPlan(planId)             { return this._get(`/api/vip/plans/${encodeURIComponent(planId)}`); }
    updatePlan(planId, body)    { return this._put(`/api/vip/plans/${encodeURIComponent(planId)}`, body); }
    createSubscription(body)    { return this._post('/api/vip/subscriptions', body); }
    listSubscriptions(query)    { const qs = new URLSearchParams(query || {}).toString(); return this._get(`/api/vip/subscriptions${qs ? '?' + qs : ''}`); }
    getSubscription(id)         { return this._get(`/api/vip/subscriptions/${encodeURIComponent(id)}`); }
    cancelSubscription(id, body){ return this._post(`/api/vip/subscriptions/${encodeURIComponent(id)}/cancel`, body || {}); }
    renewSubscription(id, body) { return this._post(`/api/vip/subscriptions/${encodeURIComponent(id)}/renew`, body || {}); }

    // ── entitlements
    listEntitlements(query)              { const qs = new URLSearchParams(query || {}).toString(); return this._get(`/api/billing/entitlements${qs ? '?' + qs : ''}`); }
    getEntitlements(targetType, targetId, query) {
        const qs = new URLSearchParams(query || {}).toString();
        return this._get(`/api/billing/entitlements/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}${qs ? '?' + qs : ''}`);
    }
    checkEntitlement(body)               { return this._post('/api/billing/entitlements/check', body); }
}

module.exports = { BillingClient };
