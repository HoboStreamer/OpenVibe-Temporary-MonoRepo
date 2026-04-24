'use strict';

const { OpenVibeAuthClient } = require('./auth-client');
const middleware = require('./middleware');
const http = require('./http');
const { RegistryClient } = require('./registry-client');
const { EventsClient } = require('./events-client');

module.exports = {
    OpenVibeAuthClient,
    RegistryClient,
    EventsClient,
    ...middleware,
    ...http,
};
