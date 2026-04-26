'use strict';

const { OpenVibeAuthClient } = require('./auth-client');
const middleware = require('./middleware');
const http = require('./http');
const { RegistryClient } = require('./registry-client');
const { EventsClient } = require('./events-client');
const { MediaClient } = require('./media-client');
const { StreamClient } = require('./stream-client');

module.exports = {
    OpenVibeAuthClient,
    RegistryClient,
    EventsClient,
    MediaClient,
    StreamClient,
    ...middleware,
    ...http,
};
