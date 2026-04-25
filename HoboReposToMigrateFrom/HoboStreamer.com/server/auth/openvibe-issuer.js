'use strict';

/**
 * HoboStreamer — OpenVibe issuer compat shim (Phase 2).
 *
 * Additive only: when OPENVIBE_AUTH_URL is set, this module loads the
 * OpenVibe RS256 public key (from OPENVIBE_AUTH_PUBLIC_KEY path or the
 * default ./data/keys/openvibe-public.pem) and returns a verifier the main
 * auth module can call when an incoming token's `iss` claim matches the
 * OpenVibe issuer.
 *
 * When OPENVIBE_AUTH_URL is unset, this module is inert — verifyOpenVibe()
 * always returns null and HoboStreamer behaves exactly as before.
 *
 * See /opt/openvibe/compat/hobostreamer/README.md for env var docs.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const OPENVIBE_AUTH_URL = (process.env.OPENVIBE_AUTH_URL || '').replace(/\/$/, '');
let openvibePublicKey = null;

if (OPENVIBE_AUTH_URL) {
    const candidates = [
        process.env.OPENVIBE_AUTH_PUBLIC_KEY,
        path.resolve('./data/keys/openvibe-public.pem'),
        '/opt/openvibe/services/openvibe-network/data/keys/openvibe-public.pem',
    ].filter(Boolean);
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                openvibePublicKey = fs.readFileSync(p, 'utf8');
                console.log(`[Auth/OpenVibe] Loaded OpenVibe public key from ${p}`);
                break;
            }
        } catch { /* try next */ }
    }
    if (!openvibePublicKey) {
        console.warn(`[Auth/OpenVibe] OPENVIBE_AUTH_URL=${OPENVIBE_AUTH_URL} set but no OpenVibe public key found — federation disabled until key is provisioned.`);
    }
}

function isOpenVibeIssuer(iss) {
    if (!OPENVIBE_AUTH_URL || !iss) return false;
    return String(iss).replace(/\/$/, '') === OPENVIBE_AUTH_URL;
}

/**
 * Verify a token against the OpenVibe issuer. Returns the decoded payload
 * or null. Logs reason on failure so operators can diagnose federation.
 */
function verifyOpenVibe(token) {
    if (!openvibePublicKey || !token) return null;
    try {
        return jwt.verify(token, openvibePublicKey, {
            algorithms: ['RS256'],
            issuer: OPENVIBE_AUTH_URL,
        });
    } catch (err) {
        console.warn(`[Auth/OpenVibe] verify failed for iss=${OPENVIBE_AUTH_URL}: ${err.message}`);
        return null;
    }
}

function isEnabled() {
    return !!(OPENVIBE_AUTH_URL && openvibePublicKey);
}

module.exports = {
    OPENVIBE_AUTH_URL,
    isOpenVibeIssuer,
    verifyOpenVibe,
    isEnabled,
};
