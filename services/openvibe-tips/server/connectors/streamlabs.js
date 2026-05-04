'use strict';

// openvibe-tips — Streamlabs webhook/socket event normaliser.
//
// Streamlabs sends events to a webhook endpoint. Each event is a JSON body with:
//   { type: 'donation', message: [{ name, amount, formatted_amount, currency, message }] }
//
// Webhook validation: Streamlabs includes a socket token in the URL path.
// Per-creator tokens are stored in tips_webhook_tokens and verified by the route
// before calling this normaliser.
//
// Supported event types:
//   donation   → tip
//   follow     → follow (non-monetary, ignored unless stored)
//   host       → host
//   subscription → subscription
//
// Docs: https://streamlabs.com/dashboard#/settings/api-settings

const CONNECTOR_TYPE = 'streamlabs';

function name() { return CONNECTOR_TYPE; }

function label() { return 'Streamlabs'; }

function description() {
    return 'Receive tip/donation events from Streamlabs via webhook. Configure your Streamlabs Socket Token and point the Streamlabs webhook URL to your openvibe.tips endpoint.';
}

function capabilities() {
    return {
        receiveWebhook: true,
        eventTypes: ['tip', 'follow', 'subscription', 'host'],
        setupUrl: 'https://streamlabs.com/dashboard#/settings/api-settings',
        configFields: [
            { key: 'socket_token', label: 'Socket / Widget Token', required: false, sensitive: true, description: 'Your Streamlabs Socket API token (optional for webhook-only mode).' },
        ],
    };
}

// Normalise a Streamlabs webhook body into a flat list of TipEvent objects.
function normalise(body, { creator_id, connector_id } = {}) {
    if (!body || typeof body !== 'object') return [];
    const eventType = String(body.type || '');
    const messages  = Array.isArray(body.message) ? body.message : (body.message ? [body.message] : []);

    return messages.map(msg => {
        if (!msg || typeof msg !== 'object') return null;

        const donationType = eventType === 'donation' || eventType === 'tip';
        const amountValue  = String(msg.amount || msg.formatted_amount || '0');
        const currency     = String(msg.currency || 'USD').toUpperCase();
        const amountMinor  = donationType
            ? Math.round(parseFloat(amountValue.replace(/[^0-9.]/g, '')) * 100)
            : null;

        return {
            id:              null, // let model generate
            creator_id:      creator_id || null,
            connector_id:    connector_id || null,
            source:          CONNECTOR_TYPE,
            event_type:      donationType ? 'tip' : eventType,
            sender:          String(msg.name || msg.from || msg.from_display_name || 'Anonymous'),
            amount_value:    amountValue,
            amount_currency: currency,
            amount_minor:    amountMinor,
            message:         String(msg.message || msg.comment || '').slice(0, 512) || null,
            is_anonymous:    !msg.name && !msg.from ? 1 : 0,
            visibility:      'public',
            external_id:     msg.id ? String(msg.id) : null,
            raw_json:        JSON.stringify(body),
        };
    }).filter(Boolean);
}

module.exports = { name, label, description, capabilities, normalise, CONNECTOR_TYPE };
