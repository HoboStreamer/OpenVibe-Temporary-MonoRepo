'use strict';

// OpenVibe — billing/tips/VIP event-type catalog. Every billing-domain
// lifecycle event is published on one of three topics (billing.events,
// tips.events, vip.events). Consumers MUST tolerate unknown payload keys.
//
// Payload shape (additive):
//   { wallet_id?, transaction_id?, transaction_group_id?, tip_id?,
//     subscription_id?, plan_id?, target_type?, target_id?,
//     amount?, currency?, status?, provider?, ... }

const BILLING_EVENT_TYPES = Object.freeze({
    WALLET_CREATED:           'billing.wallet.created',
    WALLET_BALANCE_UPDATED:   'billing.wallet.balance_updated',
    CREDITS_CHECKOUT_CREATED: 'billing.credits.checkout_created',
    CREDITS_PURCHASED:        'billing.credits.purchased',
    CREDITS_CHARGED:          'billing.credits.charged',
    CREDITS_REFUNDED:         'billing.credits.refunded',
    TRANSACTION_POSTED:       'billing.transaction.posted',
    TRANSACTION_REVERSED:     'billing.transaction.reversed',
    WEBHOOK_RECEIVED:         'billing.webhook.received',
    WEBHOOK_PROCESSED:        'billing.webhook.processed',
    ECONOMY_FROZEN:           'billing.economy.frozen',
    ECONOMY_UNFROZEN:         'billing.economy.unfrozen',
});

const TIPS_EVENT_TYPES = Object.freeze({
    TIP_CREATED:           'tips.tip.created',
    TIP_POSTED:            'tips.tip.posted',
    TIP_REFUNDED:          'tips.tip.refunded',
    SUPERCHAT_CREATED:     'tips.superchat.created',
    TTS_CREATED:           'tips.tts.created',
    MEDIA_REQUEST_CREATED: 'tips.media_request.created',
    OVERLAY_UPDATED:       'tips.overlay.updated',
});

const VIP_EVENT_TYPES = Object.freeze({
    PLAN_CREATED:           'vip.plan.created',
    PLAN_UPDATED:           'vip.plan.updated',
    SUBSCRIPTION_CREATED:   'vip.subscription.created',
    SUBSCRIPTION_ACTIVATED: 'vip.subscription.activated',
    SUBSCRIPTION_RENEWED:   'vip.subscription.renewed',
    SUBSCRIPTION_CANCELLED: 'vip.subscription.cancelled',
    SUBSCRIPTION_EXPIRED:   'vip.subscription.expired',
    ENTITLEMENT_GRANTED:    'vip.entitlement.granted',
    ENTITLEMENT_REVOKED:    'vip.entitlement.revoked',
});

const BILLING_EVENT_TYPE_LIST = Object.freeze(Object.values(BILLING_EVENT_TYPES));
const TIPS_EVENT_TYPE_LIST    = Object.freeze(Object.values(TIPS_EVENT_TYPES));
const VIP_EVENT_TYPE_LIST     = Object.freeze(Object.values(VIP_EVENT_TYPES));

function isBillingEventType(t) { return typeof t === 'string' && BILLING_EVENT_TYPE_LIST.includes(t); }
function isTipsEventType(t)    { return typeof t === 'string' && TIPS_EVENT_TYPE_LIST.includes(t); }
function isVipEventType(t)     { return typeof t === 'string' && VIP_EVENT_TYPE_LIST.includes(t); }

// ── enumerations ──────────────────────────────────────────────
const BILLING_OWNER_TYPES   = Object.freeze(['user', 'service', 'mod', 'team', 'creator', 'system']);
const BILLING_WALLET_TYPES  = Object.freeze(['credits', 'tips', 'creator', 'platform', 'escrow', 'test']);
const BILLING_WALLET_STATUSES = Object.freeze(['active', 'frozen', 'closed']);

const BILLING_TRANSACTION_TYPES = Object.freeze([
    'credit_purchase', 'credit_grant', 'credit_spend',
    'tip', 'superchat', 'tts_payment', 'media_request_payment',
    'subscription_charge', 'subscription_refund',
    'creator_earning', 'platform_fee',
    'refund', 'reversal', 'adjustment',
    'payout_hold', 'payout_release', 'test',
]);
const BILLING_TRANSACTION_STATUSES = Object.freeze(['pending', 'posted', 'failed', 'reversed', 'voided']);

const BILLING_TARGET_TYPES = Object.freeze([
    'user', 'creator', 'channel', 'stream', 'community', 'service', 'mod', 'system',
]);

const BILLING_PROVIDERS = Object.freeze(['stub', 'manual', 'stripe', 'paypal']);
const BILLING_CHECKOUT_STATUSES = Object.freeze(['created', 'pending', 'paid', 'failed', 'cancelled', 'expired']);

const BILLING_WEBHOOK_STATUSES = Object.freeze(['received', 'processed', 'ignored', 'failed']);

const TIP_INTERACTION_TYPES = Object.freeze([
    'tip', 'superchat', 'tts', 'soundboard', 'media_request', 'alert',
]);
const TIP_TARGET_CONTEXT_TYPES = Object.freeze([
    'stream', 'channel', 'chat_room', 'community', 'service', 'mod', 'creator',
]);
const TIP_VISIBILITIES = Object.freeze(['public', 'private', 'anonymous', 'unlisted']);
const TIP_STATUSES     = Object.freeze(['pending', 'posted', 'failed', 'refunded', 'cancelled']);

const VIP_TARGET_TYPES   = Object.freeze(['channel', 'creator', 'community', 'service', 'mod']);
const VIP_BILLING_INTERVALS = Object.freeze(['month', 'year', 'one_time']);
const VIP_SUBSCRIPTION_STATUSES = Object.freeze([
    'trialing', 'active', 'past_due', 'cancelled', 'expired', 'paused',
]);
const VIP_PLAN_VISIBILITIES = Object.freeze(['public', 'unlisted', 'private', 'restricted']);
const VIP_PLAN_STATUSES     = Object.freeze(['active', 'archived']);

const ENTITLEMENT_TYPES = Object.freeze([
    'vip_subscription', 'channel_subscription', 'creator_membership',
    'community_membership', 'tier_perk', 'one_time_unlock',
]);

function buildBillingEventPayload(base, extra) { return Object.assign({}, base || {}, extra || {}); }
function buildTipsEventPayload(base, extra)    { return Object.assign({}, base || {}, extra || {}); }
function buildVipEventPayload(base, extra)     { return Object.assign({}, base || {}, extra || {}); }

module.exports = {
    BILLING_EVENT_TYPES, BILLING_EVENT_TYPE_LIST, isBillingEventType,
    TIPS_EVENT_TYPES, TIPS_EVENT_TYPE_LIST, isTipsEventType,
    VIP_EVENT_TYPES, VIP_EVENT_TYPE_LIST, isVipEventType,

    BILLING_OWNER_TYPES, BILLING_WALLET_TYPES, BILLING_WALLET_STATUSES,
    BILLING_TRANSACTION_TYPES, BILLING_TRANSACTION_STATUSES,
    BILLING_TARGET_TYPES,
    BILLING_PROVIDERS, BILLING_CHECKOUT_STATUSES, BILLING_WEBHOOK_STATUSES,

    TIP_INTERACTION_TYPES, TIP_TARGET_CONTEXT_TYPES, TIP_VISIBILITIES, TIP_STATUSES,

    VIP_TARGET_TYPES, VIP_BILLING_INTERVALS, VIP_SUBSCRIPTION_STATUSES,
    VIP_PLAN_VISIBILITIES, VIP_PLAN_STATUSES,

    ENTITLEMENT_TYPES,

    buildBillingEventPayload, buildTipsEventPayload, buildVipEventPayload,
};
