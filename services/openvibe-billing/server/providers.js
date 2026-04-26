'use strict';

// openvibe-billing — payment provider seam.
// Real PSP integrations (Stripe, PayPal, etc.) plug in here. The "stub"
// provider returns a simulated checkout URL and accepts an out-of-band
// "complete" call from the service. This is enough for in-process tests and
// for the legacy HoboStreamer compat shim that mints credits server-side.

const stub = require('./providers/stub');

const PROVIDERS = { stub };

function getProvider(name) {
    const p = PROVIDERS[String(name || 'stub')];
    if (!p) throw new Error(`billing provider '${name}' not registered`);
    return p;
}

function listProviders() { return Object.keys(PROVIDERS); }

module.exports = { getProvider, listProviders };
