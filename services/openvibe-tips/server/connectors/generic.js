'use strict';

// openvibe-tips — Generic webhook connector.
//
// Accepts any JSON body from any tip service and maps it to TipEvent shape
// using a configurable field-mapping stored in the connector's config_json.
//
// Default mapping (override per-connector in config_json.mapping):
//   sender  → body.name || body.username || body.from || body.sender
//   amount  → body.amount || body.value
//   currency → body.currency || 'USD'
//   message → body.message || body.comment
//   id      → body.id || body._id
//   type    → body.type || 'tip'
//
// Example config_json:
//   { "mapping": { "sender": "donor_name", "amount": "tip_amount", "currency": "tip_currency" } }

const CONNECTOR_TYPE = 'generic';

function name() { return CONNECTOR_TYPE; }

function label() { return 'Generic Webhook'; }

function description() {
    return 'Accept tip events from any service via a configurable JSON webhook. Map incoming fields to OpenVibe tip event fields using a JSON mapping config.';
}

function capabilities() {
    return {
        receiveWebhook: true,
        eventTypes: ['tip'],
        setupUrl: null,
        configFields: [
            { key: 'mapping', label: 'Field Mapping (JSON)', required: false, sensitive: false, description: 'JSON object mapping your webhook fields to OpenVibe tip fields: { sender, amount, currency, message, id, type }' },
            { key: 'service_name', label: 'Service Name', required: false, sensitive: false, description: 'Human-readable name of the service sending webhooks (e.g. "throne.com", "tipbox.gg").' },
        ],
    };
}

function get(obj, path) {
    if (!path) return undefined;
    const parts = String(path).split('.');
    let cur = obj;
    for (const p of parts) { if (cur == null) return undefined; cur = cur[p]; }
    return cur;
}

function normalise(body, { creator_id, connector_id, config_json } = {}) {
    if (!body || typeof body !== 'object') return [];

    let mapping = {};
    let serviceName = 'generic';
    try {
        const cfg = JSON.parse(config_json || '{}');
        mapping     = cfg.mapping     || {};
        serviceName = cfg.service_name || 'generic';
    } catch { /* invalid config_json — use defaults */ }

    const resolve = (field, defaults) => {
        if (mapping[field]) return get(body, mapping[field]);
        for (const d of defaults) {
            const v = get(body, d);
            if (v != null) return v;
        }
        return undefined;
    };

    const sender     = String(resolve('sender',   ['name', 'username', 'from', 'sender', 'donor_name']) || 'Anonymous');
    const amount     = resolve('amount',   ['amount', 'value', 'tip_amount']);
    const currency   = String(resolve('currency', ['currency', 'tip_currency']) || 'USD').toUpperCase();
    const message    = String(resolve('message',  ['message', 'comment', 'note']) || '').slice(0, 512) || null;
    const rawType    = String(resolve('type',     ['type', 'event_type']) || 'tip').toLowerCase();
    const externalId = String(resolve('id',       ['id', '_id', 'event_id', 'order_id']) || '');
    const amountStr  = amount != null ? String(amount) : '0';
    const amountMinor = Math.round(parseFloat(amountStr.replace(/[^0-9.]/g, '') || '0') * 100);

    return [{
        id:              null,
        creator_id:      creator_id || null,
        connector_id:    connector_id || null,
        source:          serviceName,
        event_type:      rawType === 'donation' ? 'tip' : rawType,
        sender,
        amount_value:    amountStr,
        amount_currency: currency,
        amount_minor:    amountMinor || null,
        message,
        is_anonymous:    sender === 'Anonymous' ? 1 : 0,
        visibility:      'public',
        external_id:     externalId || null,
        raw_json:        JSON.stringify(body),
    }];
}

module.exports = { name, label, description, capabilities, normalise, CONNECTOR_TYPE };
