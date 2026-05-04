'use strict';

// openvibe-billing — PayPal Orders API v2 payment provider.
//
// Required env vars (set via config.paypal):
//   PAYPAL_CLIENT_ID      — PayPal REST app client ID
//   PAYPAL_CLIENT_SECRET  — PayPal REST app client secret
//   PAYPAL_MODE           — 'sandbox' (default) or 'live'
//
// Flow:
//   1. createCheckoutUrl()  → creates a PayPal Order, returns approval URL
//   2. User approves in browser → PayPal redirects to return_url
//   3. Webhook or return-URL callback → verifyWebhook() + parseWebhookEvent()
//   4. POST /api/billing/credits/checkout/:id/complete is called to mint credits

const https = require('https');
const http  = require('http');

const PAYPAL_SANDBOX_API = 'https://api-m.sandbox.paypal.com';
const PAYPAL_LIVE_API    = 'https://api-m.paypal.com';

function name() { return 'paypal'; }

function apiBase(mode) {
    return mode === 'live' ? PAYPAL_LIVE_API : PAYPAL_SANDBOX_API;
}

// Minimal HTTPS fetch utility — avoids a hard dependency on node-fetch.
function jsonRequest(method, urlStr, body, headers) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const lib = u.protocol === 'https:' ? https : http;
        const reqBody = body ? JSON.stringify(body) : null;
        const req = lib.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            method,
            headers: Object.assign({
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(reqBody ? { 'Content-Length': Buffer.byteLength(reqBody) } : {}),
            }, headers || {}),
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let parsed;
                try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ status: res.statusCode, body: parsed });
                } else {
                    const e = new Error(`PayPal API ${res.statusCode}: ${text.slice(0, 200)}`);
                    e.status = res.statusCode;
                    e.body = parsed;
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        if (reqBody) req.write(reqBody);
        req.end();
    });
}

// Fetch an OAuth2 access token using client credentials.
async function getAccessToken(clientId, clientSecret, mode) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = 'grant_type=client_credentials';
    const result = await new Promise((resolve, reject) => {
        const u = new URL(`${apiBase(mode)}/v1/oauth2/token`);
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.request({
            hostname: u.hostname,
            port: u.port || 443,
            path: '/v1/oauth2/token',
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
    if (!result.access_token) throw new Error('PayPal OAuth failed: no access_token in response');
    return result.access_token;
}

// Build the PayPal Order create payload.
function buildOrderPayload(session, returnUrl, cancelUrl) {
    return {
        intent: 'CAPTURE',
        purchase_units: [{
            reference_id: session.id,
            description: `OpenVibe Credits — ${session.credits_minor} ${session.currency}`,
            amount: {
                currency_code: session.currency === 'OVC' ? 'USD' : String(session.currency).toUpperCase(),
                value: (Number(session.amount_minor) / 100).toFixed(2), // amount_minor assumed in cents
            },
            custom_id: session.id,
        }],
        application_context: {
            return_url: returnUrl,
            cancel_url: cancelUrl,
            brand_name: 'OpenVibe',
            landing_page: 'LOGIN',
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
        },
    };
}

async function createCheckoutUrl({ session, publicBaseUrl, config }) {
    const paypal = (config && config.paypal) || {};
    const clientId     = paypal.clientId     || process.env.PAYPAL_CLIENT_ID     || '';
    const clientSecret = paypal.clientSecret || process.env.PAYPAL_CLIENT_SECRET || '';
    const mode         = paypal.mode         || process.env.PAYPAL_MODE          || 'sandbox';

    if (!clientId || !clientSecret) {
        throw new Error('PayPal provider: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required');
    }

    const base      = String(publicBaseUrl || '').replace(/\/$/, '');
    const returnUrl = `${base}/checkout/paypal.html?session=${encodeURIComponent(session.id)}&result=approved`;
    const cancelUrl = `${base}/checkout/paypal.html?session=${encodeURIComponent(session.id)}&result=cancelled`;

    const token    = await getAccessToken(clientId, clientSecret, mode);
    const payload  = buildOrderPayload(session, returnUrl, cancelUrl);
    const result   = await jsonRequest('POST', `${apiBase(mode)}/v2/checkout/orders`, payload, {
        'Authorization': `Bearer ${token}`,
        'PayPal-Request-Id': `ov-${session.id}`,
        'Prefer': 'return=representation',
    });

    const order     = result.body;
    const approveLink = (order.links || []).find(l => l.rel === 'approve');
    if (!approveLink) throw new Error('PayPal order created but no approve link returned');

    return {
        provider: 'paypal',
        external_ref: order.id,
        url: approveLink.href,
        order_id: order.id,
    };
}

// Capture an approved PayPal order. Called after return_url redirect.
async function captureOrder({ orderId, config }) {
    const paypal = (config && config.paypal) || {};
    const clientId     = paypal.clientId     || process.env.PAYPAL_CLIENT_ID     || '';
    const clientSecret = paypal.clientSecret || process.env.PAYPAL_CLIENT_SECRET || '';
    const mode         = paypal.mode         || process.env.PAYPAL_MODE          || 'sandbox';

    const token = await getAccessToken(clientId, clientSecret, mode);
    const result = await jsonRequest('POST', `${apiBase(mode)}/v2/checkout/orders/${orderId}/capture`, null, {
        'Authorization': `Bearer ${token}`,
    });
    return result.body;
}

// Verify a PayPal webhook signature. Requires webhook ID configured.
async function verifyWebhook({ headers, rawBody, config }) {
    const paypal = (config && config.paypal) || {};
    const clientId     = paypal.clientId     || process.env.PAYPAL_CLIENT_ID     || '';
    const clientSecret = paypal.clientSecret || process.env.PAYPAL_CLIENT_SECRET || '';
    const webhookId    = paypal.webhookId    || process.env.PAYPAL_WEBHOOK_ID    || '';
    const mode         = paypal.mode         || process.env.PAYPAL_MODE          || 'sandbox';

    if (!webhookId) {
        // Permissive fallback — log warning, accept
        console.warn('[billing/paypal] PAYPAL_WEBHOOK_ID not set; skipping webhook signature verification');
        return { ok: true, signature_required: false };
    }

    const token = await getAccessToken(clientId, clientSecret, mode);
    const body = {
        auth_algo:         headers['paypal-auth-algo'],
        cert_url:          headers['paypal-cert-url'],
        transmission_id:   headers['paypal-transmission-id'],
        transmission_sig:  headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id:        webhookId,
        webhook_event:     JSON.parse(rawBody),
    };
    const result = await jsonRequest('POST', `${apiBase(mode)}/v1/notifications/verify-webhook-signature`, body, {
        'Authorization': `Bearer ${token}`,
    });
    const ok = result.body && result.body.verification_status === 'SUCCESS';
    return { ok, verification_status: result.body && result.body.verification_status };
}

function parseWebhookEvent(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const eventType = String(payload.event_type || '');
    const resource  = payload.resource || {};

    // CHECKOUT.ORDER.APPROVED or PAYMENT.CAPTURE.COMPLETED → credit the session
    const isCapture = eventType === 'CHECKOUT.ORDER.APPROVED'
        || eventType === 'PAYMENT.CAPTURE.COMPLETED'
        || eventType === 'CHECKOUT.ORDER.COMPLETED';

    return {
        external_event_id: String(payload.id || ''),
        type: isCapture ? 'checkout.completed' : eventType.toLowerCase().replace(/\./g, '_'),
        session_id:   resource.custom_id || null,   // mapped to our session.id via custom_id
        external_ref: resource.id        || null,   // PayPal order/capture ID
        raw_event_type: eventType,
    };
}

module.exports = { name, createCheckoutUrl, captureOrder, verifyWebhook, parseWebhookEvent };
