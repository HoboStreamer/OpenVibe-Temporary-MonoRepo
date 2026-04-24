'use strict';

// openvibe-network — identity surface.
//
// Phase 2 federation mode: the OpenVibe network publishes an OIDC discovery
// document and a JWKS that ALSO advertises the existing hobo-tools RS256
// public key. That means every existing Hobo token verifies cleanly when a
// consumer (HoboStreamer, hobo-quest, etc.) starts trusting the OpenVibe
// issuer — no key rotation required.
//
// When `OPENVIBE_PRIVATE_KEY` exists, an OpenVibe-native key is also
// advertised so the network can begin issuing its own tokens once the OAuth2
// authorization-code dance is migrated in Phase 3.

const fs = require('fs');
const crypto = require('crypto');

function readPemSafe(p) {
    if (!p) return null;
    try {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    } catch (err) {
        console.warn(`[Identity] failed to read PEM at ${p}: ${err.message}`);
    }
    return null;
}

function pemToJwk(pem, kid) {
    if (!pem) return null;
    try {
        const key = crypto.createPublicKey(pem);
        const jwk = key.export({ format: 'jwk' });
        return Object.assign({ kid, kty: jwk.kty, alg: 'RS256', use: 'sig' }, jwk);
    } catch (err) {
        console.warn(`[Identity] failed to convert PEM to JWK (${kid}): ${err.message}`);
        return null;
    }
}

function buildIdentity(config) {
    const trustedIssuers = []; // { issuer, label, publicKey, kid }

    // OpenVibe-native key (issuer of record path)
    const openvibePub = readPemSafe(config.openvibeKeys.publicPath);
    if (openvibePub) {
        trustedIssuers.push({
            issuer: config.surfaces.auth,
            label: 'openvibe',
            publicKey: openvibePub,
            kid: 'openvibe-1',
        });
    } else {
        console.warn('[Identity] no OpenVibe-native public key — running federation-only');
    }

    // Federation: trust hobo-tools too
    if (config.hoboTools.publicUrl && config.hoboTools.publicKeyPath) {
        const hoboPub = readPemSafe(config.hoboTools.publicKeyPath);
        if (hoboPub) {
            trustedIssuers.push({
                issuer: config.hoboTools.publicUrl,
                label: 'hobo-tools',
                publicKey: hoboPub,
                kid: 'hobo-tools-1',
            });
        } else {
            console.warn(`[Identity] HOBO_TOOLS_URL set but key at ${config.hoboTools.publicKeyPath} unreadable`);
        }
    }

    if (trustedIssuers.length === 0) {
        console.warn('[Identity] WARNING: no trusted issuers configured — auth verification will fail');
    } else {
        console.log(`[Identity] trusted issuers: ${trustedIssuers.map(i => `${i.label}=${i.issuer}`).join(', ')}`);
    }

    return {
        trustedIssuers,
        getJwks() {
            const keys = trustedIssuers
                .map(i => pemToJwk(i.publicKey, i.kid))
                .filter(Boolean);
            return { keys };
        },
        getDiscovery() {
            const issuer = config.surfaces.auth;
            const hoboBase = config.hoboTools.publicUrl;
            // Until OpenVibe owns the OAuth flow, point auth/token endpoints
            // at the legacy hobo-tools install when federated; otherwise
            // advertise the OpenVibe paths so they can be implemented in
            // Phase 3 without a discovery-doc churn.
            const base = hoboBase || issuer;
            return {
                issuer,
                authorization_endpoint: `${base}/oauth/authorize`,
                token_endpoint: `${base}/oauth/token`,
                userinfo_endpoint: `${issuer}/api/v1/me`,
                jwks_uri: `${issuer}/.well-known/jwks.json`,
                response_types_supported: ['code'],
                subject_types_supported: ['public'],
                id_token_signing_alg_values_supported: ['RS256'],
                scopes_supported: ['openid', 'profile', 'email', 'theme'],
                grant_types_supported: ['authorization_code', 'refresh_token'],
                openvibe: {
                    federation: hoboBase ? { mode: 'hobo-tools', upstream: hoboBase } : { mode: 'native' },
                    trusted_issuers: trustedIssuers.map(i => ({ issuer: i.issuer, label: i.label })),
                },
            };
        },
    };
}

module.exports = { buildIdentity, readPemSafe };
