'use strict';

const { OpenVibeAuthClient, optionalOpenVibeAuth } = require('@openvibe/sdk');

function serviceActorMiddleware(internalKey) {
    return (req, _res, next) => {
        const provided = req.headers['x-internal-key'];
        if (provided && provided === internalKey) {
            const sid = req.headers['x-openvibe-service'];
            if (sid && /^[a-z0-9_-]{2,64}$/i.test(String(sid))) {
                req.serviceActor = String(sid);
            } else {
                req.serviceActor = 'unidentified-service';
            }
        }
        next();
    };
}

function buildAuthClient(config) {
    const authClient = new OpenVibeAuthClient();
    if (config && config.auth && config.auth.issuer) {
        authClient.addIssuer({
            issuer: config.auth.issuer,
            publicKeyPath: config.auth.publicKeyPath,
            label: 'openvibe',
        });
    }
    if (process.env.HOBO_TOOLS_URL && process.env.HOBO_TOOLS_PUBLIC_KEY) {
        authClient.addIssuer({
            issuer: process.env.HOBO_TOOLS_URL,
            publicKeyPath: process.env.HOBO_TOOLS_PUBLIC_KEY,
            label: 'hobo-tools',
        });
    }
    return authClient;
}

function userContextMiddleware() {
    return (req, _res, next) => {
        if (req.user) return next();
        const userId = req.headers['x-openvibe-user-id'];
        if (userId && /^[a-z0-9:_-]{1,128}$/i.test(String(userId))) {
            req.user = {
                sub: String(userId),
                id: String(userId),
                role: String(req.headers['x-openvibe-user-role'] || 'user'),
                username: req.headers['x-openvibe-username'] ? String(req.headers['x-openvibe-username']) : null,
                display_name: req.headers['x-openvibe-display-name'] ? String(req.headers['x-openvibe-display-name']) : null,
            };
        }
        next();
    };
}

module.exports = {
    buildAuthClient,
    optionalOpenVibeAuth,
    serviceActorMiddleware,
    userContextMiddleware,
};
