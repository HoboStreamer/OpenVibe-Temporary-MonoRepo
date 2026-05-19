'use strict';

// openvibe-network — identity surface.
//
// The network publishes a native OIDC discovery document and JWKS signed by
// the OpenVibe keypair, while optionally continuing to trust legacy Hobo
// issuers for token verification during migration. In development, missing
// OpenVibe keys are generated automatically so native auth flows work out of
// the box instead of collapsing into federation-only mode.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function readPemSafe(p) {
    if (!p) return null;
    try {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    } catch (err) {
        console.warn(`[Identity] failed to read PEM at ${p}: ${err.message}`);
    }
    return null;
}

function ensureParentDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writePemSafe(filePath, pem) {
    try {
        ensureParentDir(filePath);
        fs.writeFileSync(filePath, pem, 'utf8');
    } catch (err) {
        console.warn(`[Identity] failed to write PEM at ${filePath}: ${err.message}`);
    }
}

function ensureOpenVibeKeyPair(config) {
    let privatePem = readPemSafe(config.openvibeKeys.privatePath);
    let publicPem = readPemSafe(config.openvibeKeys.publicPath);

    if (privatePem && !publicPem) {
        try {
            publicPem = crypto.createPublicKey(privatePem).export({ type: 'spki', format: 'pem' });
            writePemSafe(config.openvibeKeys.publicPath, publicPem);
        } catch (err) {
            console.warn(`[Identity] failed to derive public key from private key: ${err.message}`);
        }
    }

    if (!privatePem && !publicPem && config.nodeEnv !== 'production') {
        try {
            const generated = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            });
            privatePem = generated.privateKey;
            publicPem = generated.publicKey;
            writePemSafe(config.openvibeKeys.privatePath, privatePem);
            writePemSafe(config.openvibeKeys.publicPath, publicPem);
            console.log('[Identity] generated development OpenVibe signing keypair');
        } catch (err) {
            console.warn(`[Identity] failed to generate development signing keys: ${err.message}`);
        }
    }

    return { privatePem, publicPem };
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
    const nativeIssuer = String(config.surfaces.auth || '').replace(/\/$/, '');
    const { privatePem: openvibePrivate, publicPem: openvibePub } = ensureOpenVibeKeyPair(config);

    // OpenVibe-native key (issuer of record path)
    if (openvibePub) {
        trustedIssuers.push({
            issuer: nativeIssuer,
            label: 'openvibe',
            publicKey: openvibePub,
            kid: 'openvibe-1',
        });
    } else {
        console.warn('[Identity] no OpenVibe-native public key — running federation-only');
    }

    if (trustedIssuers.length === 0) {
        console.warn('[Identity] WARNING: no trusted issuers configured — auth verification will fail');
    } else {
        console.log(`[Identity] trusted issuers: ${trustedIssuers.map(i => `${i.label}=${i.issuer}`).join(', ')}`);
    }

    return {
        trustedIssuers,
        nativeIssuer,
        hasNativeSigningKey() {
            return !!openvibePrivate;
        },
        getJwks() {
            const keys = trustedIssuers
                .map(i => pemToJwk(i.publicKey, i.kid))
                .filter(Boolean);
            return { keys };
        },
        issueToken(payload, options) {
            if (!openvibePrivate) throw new Error('OpenVibe private key unavailable');
            const opts = Object.assign({
                algorithm: 'RS256',
                issuer: nativeIssuer,
                keyid: 'openvibe-1',
            }, options || {});
            return jwt.sign(payload, openvibePrivate, opts);
        },
        getDiscovery() {
            const issuer = nativeIssuer;
            return {
                issuer,
                authorization_endpoint: `${issuer}/oauth/authorize`,
                token_endpoint: `${issuer}/oauth/token`,
                userinfo_endpoint: `${issuer}/api/v1/me`,
                jwks_uri: `${issuer}/.well-known/jwks.json`,
                response_types_supported: ['code'],
                subject_types_supported: ['public'],
                id_token_signing_alg_values_supported: ['RS256'],
                scopes_supported: ['openid', 'profile', 'email', 'theme'],
                grant_types_supported: ['authorization_code', 'refresh_token'],
                code_challenge_methods_supported: ['S256', 'plain'],
                token_endpoint_auth_methods_supported: ['none'],
                openvibe: {
                    federation: { mode: 'native-only' },
                    trusted_issuers: trustedIssuers.map(i => ({ issuer: i.issuer, label: i.label })),
                },
            };
        },
    };
}

module.exports = { buildIdentity, readPemSafe };
