'use strict';

const { OpenVibeAuthClient } = require('./auth-client');
const middleware = require('./middleware');
const http = require('./http');
const { RegistryClient } = require('./registry-client');
const { EventsClient } = require('./events-client');
const { MediaClient } = require('./media-client');
const { StreamClient } = require('./stream-client');
const { ChatClient } = require('./chat-client');
const { CommunityClient } = require('./community-client');
const { BillingClient } = require('./billing-client');
const { AiClient } = require('./ai-client');
const persistenceMode = require('./persistence-mode');
const urlDefaults = require('./url-defaults');

module.exports = {
    OpenVibeAuthClient,
    RegistryClient,
    EventsClient,
    MediaClient,
    StreamClient,
    ChatClient,
    CommunityClient,
    BillingClient,
    AiClient,
    persistenceMode,
    urlDefaults,
    ...persistenceMode,
    ...urlDefaults,
    ...middleware,
    ...http,
};
