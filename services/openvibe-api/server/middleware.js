'use strict';

const { OpenVibeAuthClient, optionalOpenVibeAuth } = require('@openvibe/sdk');

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
};
