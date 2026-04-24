'use strict';

const topics = require('./topics');
const events = require('./events');
const capabilities = require('./capabilities');
const namespaces = require('./namespaces');
const services = require('./services');
const envelope = require('./envelope');

module.exports = {
    ...topics,
    ...events,
    ...capabilities,
    ...namespaces,
    ...services,
    ...envelope,
};
