'use strict';

// openvibe-tips — PowerChat webhook event normaliser.
//
// PowerChat is a paid-chat and donation platform supporting:
//   - Direct tips via PayPal / Square / crypto
//   - TTS and media-request superchats
//   - Subscriptions
//
// PowerChat sends webhook POSTs to a configurable URL.
// The expected payload shape (simplified):
//   { type: 'donation', data: { amount, currency, username, message, orderId } }
//
// Docs: https://learn.powerchat.live/

const CONNECTOR_TYPE = 'powerchat';

function name() { return CONNECTOR_TYPE; }

function label() { return 'PowerChat'; }

function description() {
    return 'Receive tip and paid-chat events from PowerChat.live. Supports tips, subscriptions, and TTS media requests.';
}

function capabilities() {
    return {
        receiveWebhook: true,
        eventTypes: ['tip', 'subscription', 'media_request'],
        setupUrl: 'https://powerchat.live/dashboard',
        configFields: [
            { key: 'api_key', label: 'PowerChat API Key', required: false, sensitive: true, description: 'Your PowerChat API key for authenticating webhook deliveries.' },
        ],
    };
}

function normalise(body, { creator_id, connector_id } = {}) {
    if (!body || typeof body !== 'object') return [];

    const rawType  = String(body.type || '').toLowerCase();
    const data     = body.data || body;
    const isTip    = rawType === 'donation' || rawType === 'tip' || rawType === 'superchat';
    const isMedia  = rawType === 'media' || rawType === 'media_request' || rawType === 'tts';
    const eventType = isTip ? 'tip' : isMedia ? 'media_request' : rawType || 'tip';

    const sender     = String(data.username || data.name || body.username || 'Anonymous');
    const amount     = data.amount     || body.amount;
    const currency   = String(data.currency || body.currency || 'USD').toUpperCase();
    const amountStr  = amount != null ? String(amount) : '0';
    const amountMinor = (isTip || isMedia) ? Math.round(parseFloat(amountStr) * 100) : null;
    const message    = String(data.message || body.message || '').slice(0, 512) || null;
    const externalId = String(data.orderId || data.id || body.id || '');

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
        is_anonymous:    !sender || sender === 'Anonymous' ? 1 : 0,
        visibility:      'public',
        external_id:     externalId || null,
        raw_json:        JSON.stringify(body),
    }];
}

module.exports = { name, label, description, capabilities, normalise, CONNECTOR_TYPE };
