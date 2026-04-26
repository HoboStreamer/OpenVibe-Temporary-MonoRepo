'use strict';

const topics = require('./topics');
const events = require('./events');
const capabilities = require('./capabilities');
const namespaces = require('./namespaces');
const services = require('./services');
const envelope = require('./envelope');
const mediaNamespaces = require('./media-namespaces');
const mediaEvents = require('./media-events');
const streamEvents = require('./stream-events');
const chatEvents = require('./chat-events');
const communityEvents = require('./community-events');

module.exports = {
    ...topics,
    ...events,
    ...capabilities,
    ...namespaces,
    ...services,
    ...envelope,
    ...mediaNamespaces,
    ...mediaEvents,
    ...streamEvents,
    ...chatEvents,
    ...communityEvents,
};
