'use strict';

const { EventsClient } = require('@openvibe/sdk');

function buildEventBus(config) {
    const client = new EventsClient({
        eventsUrl:   config.events.url,
        internalKey: config.internalKey,
        source:      config.serviceId,
    });

    function publishTipEvent(tipEvent) {
        return client.publish('tips', {
            event_type:  'tip.received',
            source:      config.serviceId,
            actor_type:  'service',
            actor_id:    config.serviceId,
            payload:     tipEvent,
        }).catch(err => {
            console.warn(`[tips/events] publish tip.received failed: ${err.message}`);
        });
    }

    return { client, publishTipEvent };
}

module.exports = { buildEventBus };
