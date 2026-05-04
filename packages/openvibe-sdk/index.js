'use strict';

const { OpenVibeAuthClient } = require('./auth-client');
const middleware = require('./middleware');
const http = require('./http');
const { RegistryClient } = require('./registry-client');
const { EventsClient } = require('./events-client');
const { RealtimeClient } = require('./realtime-client');
const { MediaClient } = require('./media-client');
const { StreamClient } = require('./stream-client');
const { ChatClient } = require('./chat-client');
const { CommunityClient } = require('./community-client');
const { BillingClient } = require('./billing-client');
const { AiClient } = require('./ai-client');
const { CapabilitiesClient } = require('./capabilities');
const { UserModulesClient } = require('./user-modules');
const persistenceMode = require('./persistence-mode');
const urlDefaults = require('./url-defaults');

module.exports = {
    OpenVibeAuthClient,
    RegistryClient,
    EventsClient,
    RealtimeClient,
    MediaClient,
    StreamClient,
    ChatClient,
    CommunityClient,
    BillingClient,
    AiClient,
    CapabilitiesClient,
    UserModulesClient,
    persistenceMode,
    urlDefaults,
    ...persistenceMode,
    ...urlDefaults,
    ...middleware,
    ...http,
};
