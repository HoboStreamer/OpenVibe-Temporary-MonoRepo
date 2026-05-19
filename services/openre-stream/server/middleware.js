'use strict';

const { OpenVibeAuthClient, optionalOpenVibeAuth } = require('@openvibe/sdk');

function serviceActorMiddleware(internalKey) {
    return (req, _res, next) => {
        const provided = req.headers['x-internal-key'];
        if (provided && provided === internalKey) {
            const sid = req.headers['x-openvibe-service'];
            req.serviceActor = sid && /^[a-z0-9_-]{2,64}$/i.test(String(sid)) ? String(sid) : 'unidentified-service';
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
    // hobo-tools federation removed — OpenVibe auth only
    return authClient;
}

module.exports = {
    buildAuthClient,
    optionalOpenVibeAuth,
    serviceActorMiddleware,
};
