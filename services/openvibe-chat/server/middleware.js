'use strict';

// openvibe-chat — local middleware shim, mirrors openvibe-media/middleware.

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
    return authClient;
}

module.exports = {
    buildAuthClient,
    optionalOpenVibeAuth,
    serviceActorMiddleware,
};
