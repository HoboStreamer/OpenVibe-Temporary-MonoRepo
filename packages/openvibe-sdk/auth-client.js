'use strict';

// OpenVibe — multi-issuer auth client.
//
// During Phase 2 a deployment commonly trusts BOTH:
//   - the OpenVibe network issuer (auth.openvibe.network), AND
//   - the legacy hobo.tools issuer (federation mode).
//
// This client lets a service register N (issuer, public-key) pairs and
// verify a token against whichever pair its `iss` claim matches.

const fs = require('fs');
const jwt = require('jsonwebtoken');

class OpenVibeAuthClient {
    constructor(opts) {
        this.issuers = new Map(); // issuer URL -> { publicKey, label }
        this.acceptedIssuers = new Set();
        this.lastError = null;
        if (opts && Array.isArray(opts.issuers)) {
            for (const i of opts.issuers) this.addIssuer(i);
        }
    }

    /**
     * Register a trusted issuer. `publicKey` may be either a PEM string or a
     * filesystem path to a PEM file. Bad inputs are logged and skipped — the
     * service stays alive even if one issuer config is broken.
     */
    addIssuer({ issuer, publicKey, publicKeyPath, label }) {
        if (!issuer || typeof issuer !== 'string') {
            console.warn('[OpenVibeAuth] addIssuer: issuer URL required');
            return false;
        }
        let pem = publicKey || null;
        if (!pem && publicKeyPath) {
            try {
                if (fs.existsSync(publicKeyPath)) {
                    pem = fs.readFileSync(publicKeyPath, 'utf8');
                }
            } catch (err) {
                console.warn(`[OpenVibeAuth] failed to read public key at ${publicKeyPath}: ${err.message}`);
            }
        }
        if (!pem) {
            console.warn(`[OpenVibeAuth] no public key for issuer ${issuer} — skipping`);
            return false;
        }
        const norm = String(issuer).replace(/\/$/, '');
        this.issuers.set(norm, { publicKey: pem, label: label || norm });
        this.acceptedIssuers.add(norm);
        console.log(`[OpenVibeAuth] trusting issuer ${norm} (${label || 'unlabeled'})`);
        return true;
    }

    listIssuers() {
        return Array.from(this.issuers.entries()).map(([issuer, v]) => ({ issuer, label: v.label }));
    }

    /**
     * Verify a token. Returns the decoded payload or null. Records the last
     * verification error on `this.lastError` for diagnostic logging.
     */
    verifyToken(token) {
        this.lastError = null;
        if (!token || typeof token !== 'string') {
            this.lastError = 'missing token';
            return null;
        }
        let decoded;
        try { decoded = jwt.decode(token, { complete: false }); }
        catch (err) { this.lastError = `decode failed: ${err.message}`; return null; }
        if (!decoded || typeof decoded !== 'object' || !decoded.iss) {
            this.lastError = 'token missing iss claim';
            return null;
        }
        const iss = String(decoded.iss).replace(/\/$/, '');
        const trusted = this.issuers.get(iss);
        if (!trusted) {
            this.lastError = `issuer not trusted: ${iss}`;
            return null;
        }
        try {
            return jwt.verify(token, trusted.publicKey, {
                algorithms: ['RS256'],
                issuer: iss,
            });
        } catch (err) {
            this.lastError = `verify failed for ${iss}: ${err.message}`;
            return null;
        }
    }
}

module.exports = { OpenVibeAuthClient };
