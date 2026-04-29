'use strict';

const { resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');

// Stub payment provider — returns a simulated checkout URL. The "complete"
// call must come back through POST /api/billing/credits/checkout/:id/complete
// or POST /api/billing/webhooks/stub. Useful for tests and dev.

function name() { return 'stub'; }

async function createCheckoutUrl({ session, publicBaseUrl }) {
    const base = publicBaseUrl || resolvePublicOrigin({ surface: 'billing', envKeys: ['PUBLIC_BASE_URL', 'OPENVIBE_BILLING_URL'] });
    return {
        provider: 'stub',
        external_ref: `stub_${session.id}`,
        url: `${base.replace(/\/$/, '')}/checkout/stub.html?session=${encodeURIComponent(session.id)}`,
    };
}

async function verifyWebhook(/* { headers, rawBody } */) {
    return { ok: true, signature_required: false };
}

function parseWebhookEvent(payload) {
    // Expected shape: { event_id, type, session_id, external_ref }
    return {
        external_event_id: payload && payload.event_id ? String(payload.event_id) : null,
        type: payload && payload.type ? String(payload.type) : 'checkout.completed',
        session_id: payload && payload.session_id ? String(payload.session_id) : null,
        external_ref: payload && payload.external_ref ? String(payload.external_ref) : null,
    };
}

module.exports = { name, createCheckoutUrl, verifyWebhook, parseWebhookEvent };
