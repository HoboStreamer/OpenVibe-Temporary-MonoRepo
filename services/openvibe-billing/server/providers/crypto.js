'use strict';

// openvibe-billing — Crypto (on-chain) payment provider.
//
// Required env vars (set via config.crypto):
//   CRYPTO_RECEIVE_BTC    — Bitcoin receive address (xpub or single address)
//   CRYPTO_RECEIVE_ETH    — Ethereum receive address (hex, 0x-prefixed)
//   CRYPTO_RECEIVE_USDC   — USDC receive address (same as ETH usually)
//   CRYPTO_NODE_URL       — Optional: URL to a block-explorer or node API for
//                           confirmation polling (e.g. Blockstream, Infura)
//   CRYPTO_CONFIRMATIONS  — Minimum confirmations required (default: 1)
//
// Flow:
//   1. createCheckoutUrl()  — returns a crypto.html checkout URL with the
//      receive address and expected amount embedded as query params.
//   2. User sends on-chain payment from their wallet.
//   3. A background reconciler (or manual webhook) calls:
//      POST /api/billing/webhooks/crypto  with { session_id, tx_hash, network }
//   4. The billing webhook handler calls parseWebhookEvent() + completes session.
//
// IMPORTANT: This provider DOES NOT self-custody or generate HD-wallet addresses
// per session. It uses fixed receive addresses. For production, replace with an
// HD-wallet derivation strategy or a hosted crypto payment processor (e.g.
// Coinbase Commerce, NOWPayments) that supports per-invoice addresses.

function name() { return 'crypto'; }

const SUPPORTED_NETWORKS = ['btc', 'eth', 'usdc'];

function getReceiveAddress(network, config) {
    const c = (config && config.crypto) || {};
    switch (String(network || 'eth').toLowerCase()) {
        case 'btc':  return c.receiveBtc  || process.env.CRYPTO_RECEIVE_BTC  || null;
        case 'eth':  return c.receiveEth  || process.env.CRYPTO_RECEIVE_ETH  || null;
        case 'usdc': return c.receiveUsdc || process.env.CRYPTO_RECEIVE_USDC || process.env.CRYPTO_RECEIVE_ETH || null;
        default:     return null;
    }
}

// Rough USD-to-crypto amount estimation. In production, fetch real-time rates.
function estimateCryptoAmount(amountMinorUsd, network) {
    // amount_minor is in cents (USD). This returns a display string only.
    const usd = Number(amountMinorUsd || 0) / 100;
    switch (String(network || 'eth').toLowerCase()) {
        case 'btc':  return { value: (usd / 60000).toFixed(8), unit: 'BTC' };
        case 'eth':  return { value: (usd / 3000).toFixed(6),  unit: 'ETH' };
        case 'usdc': return { value: usd.toFixed(2),            unit: 'USDC' };
        default:     return { value: usd.toFixed(2),            unit: 'USD' };
    }
}

async function createCheckoutUrl({ session, publicBaseUrl, config, network: networkHint }) {
    const network = String(networkHint || 'eth').toLowerCase();
    if (!SUPPORTED_NETWORKS.includes(network)) {
        throw new Error(`crypto provider: unsupported network '${network}'. Supported: ${SUPPORTED_NETWORKS.join(', ')}`);
    }

    const address = getReceiveAddress(network, config);
    if (!address) {
        throw new Error(
            `crypto provider: no receive address for network '${network}'. ` +
            `Set CRYPTO_RECEIVE_${network.toUpperCase()} in environment.`
        );
    }

    const amount = estimateCryptoAmount(session.amount_minor, network);
    const base   = String(publicBaseUrl || '').replace(/\/$/, '');
    const params = new URLSearchParams({
        session:  session.id,
        network,
        address,
        amount:   amount.value,
        unit:     amount.unit,
        label:    `OpenVibe Credits ${session.id.slice(0, 8)}`,
    });

    return {
        provider: 'crypto',
        external_ref: `crypto_${network}_${session.id}`,
        url: `${base}/checkout/crypto.html?${params.toString()}`,
        network,
        address,
        amount: amount.value,
        unit:   amount.unit,
    };
}

// Webhook: accepts { session_id, tx_hash, network, amount, confirmations }
async function verifyWebhook(/* { headers, rawBody } */) {
    // Crypto webhooks are submitted by operators or our own reconciler.
    // Signature verification is out of scope unless an external processor is used.
    return { ok: true, signature_required: false };
}

function parseWebhookEvent(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return {
        external_event_id: String(payload.tx_hash || payload.event_id || ''),
        type: 'checkout.completed',
        session_id:   payload.session_id  ? String(payload.session_id)  : null,
        external_ref: payload.tx_hash     ? String(payload.tx_hash)     : null,
        network:      payload.network     ? String(payload.network)     : null,
        confirmations: Number(payload.confirmations || 0),
    };
}

module.exports = {
    name,
    createCheckoutUrl,
    verifyWebhook,
    parseWebhookEvent,
    getReceiveAddress,
    estimateCryptoAmount,
    SUPPORTED_NETWORKS,
};
