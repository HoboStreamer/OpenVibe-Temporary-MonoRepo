'use strict';

// openvibe-tips — StreamElements webhook event normaliser.
//
// StreamElements sends tip/cheer/subscriber events via webhook.
// The webhook payload is signed with HMAC-SHA256 using the channel's JWT secret.
// Per-creator tokens in tips_webhook_tokens handle this.
//
// Tip payload shape:
//   { _id, username, amount, currency, message, createdAt, channel: { _id, displayName } }
//
// Docs: https://streamelements.com/help/extensions-and-apps/tips
//       https://dev.streamelements.com/

const CONNECTOR_TYPE = 'streamelements';

function name() { return CONNECTOR_TYPE; }

function label() { return 'StreamElements'; }

function description() {
    return 'Receive tip events from StreamElements via webhook. Connect your StreamElements account and configure the webhook endpoint in your StreamElements dashboard.';
}

function capabilities() {
    return {
        receiveWebhook: true,
        eventTypes: ['tip', 'subscription', 'follow', 'cheer'],
        setupUrl: 'https://streamelements.com/dashboard/tips',
        configFields: [
            { key: 'channel_id', label: 'Channel ID', required: false, sensitive: false, description: 'Your StreamElements channel ID (found in your dashboard URL).' },
            { key: 'jwt_secret', label: 'JWT / Webhook Secret', required: false, sensitive: true, description: 'Used to verify webhook signatures.' },
        ],
    };
}

// Normalise a StreamElements tip webhook body.
function normalise(body, { creator_id, connector_id } = {}) {
    if (!body || typeof body !== 'object') return [];

    // SE wraps events in `data` when using socket-based delivery
    const data = body.data || body;

    // Determine event type
    const rawType  = String(body.type || data.type || 'tip').toLowerCase();
    const isTip    = rawType === 'tip' || rawType === 'donation';
    const eventType = isTip ? 'tip' : rawType;

    const sender    = String(data.username || data.displayName || body.username || 'Anonymous');
    const amount    = data.amount   || body.amount;
    const currency  = String(data.currency || body.currency || 'USD').toUpperCase();
    const amountStr = amount != null ? String(amount) : '0';
    const amountMinor = isTip ? Math.round(parseFloat(amountStr) * 100) : null;
    const message   = String(data.message || body.message || '').slice(0, 512) || null;
    const externalId = String(data._id || body._id || data.id || body.id || '');

    return [{
        id:              null,
        creator_id:      creator_id || null,
        connector_id:    connector_id || null,
        source:          CONNECTOR_TYPE,
        event_type:      eventType,
        sender,
        amount_value:    amountStr,
        amount_currency: currency,
        amount_minor:    amountMinor,
        message,
        is_anonymous:    0,
        visibility:      'public',
        external_id:     externalId || null,
        raw_json:        JSON.stringify(body),
    }];
}

module.exports = { name, label, description, capabilities, normalise, CONNECTOR_TYPE };
