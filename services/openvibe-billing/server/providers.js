'use strict';

// openvibe-billing — payment provider registry.
//
// Providers plug into the checkout session + webhook lifecycle:
//   createCheckoutUrl({ session, publicBaseUrl, config }) → { provider, external_ref, url, ... }
//   verifyWebhook({ headers, rawBody, config })           → { ok, ... }
//   parseWebhookEvent(payload)                            → { external_event_id, type, session_id, external_ref, ... }
//
// Built-in providers:
//   stub   — simulated checkout (dev/test, no credentials)
//   paypal — PayPal Orders API v2 (requires PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET)
//   crypto — On-chain BTC/ETH/USDC (requires CRYPTO_RECEIVE_* address env vars)

const stub   = require('./providers/stub');
const paypal = require('./providers/paypal');
const crypto = require('./providers/crypto');

const PROVIDERS = { stub, paypal, crypto };

function getProvider(name) {
    const p = PROVIDERS[String(name || 'stub')];
    if (!p) throw new Error(`billing provider '${name}' not registered. Available: ${Object.keys(PROVIDERS).join(', ')}`);
    return p;
}

function listProviders() { return Object.keys(PROVIDERS); }

// Return a list of providers that appear to have credentials configured.
function listConfiguredProviders(config) {
    const configured = ['stub']; // stub always works
    const pc = config && config.paypal;
    if ((pc && pc.clientId) || process.env.PAYPAL_CLIENT_ID) configured.push('paypal');
    const cc = config && config.crypto;
    if ((cc && (cc.receiveBtc || cc.receiveEth || cc.receiveUsdc))
        || process.env.CRYPTO_RECEIVE_BTC
        || process.env.CRYPTO_RECEIVE_ETH
        || process.env.CRYPTO_RECEIVE_USDC) {
        configured.push('crypto');
    }
    return configured;
}

module.exports = { getProvider, listProviders, listConfiguredProviders };
