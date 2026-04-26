'use strict';

// openvibe-media — wraps EventsClient so route handlers don't see the bus
// abstraction directly. All media events are routed onto TOPICS.MEDIA.

const { EventsClient } = require('@openvibe/sdk');
const { TOPICS, buildMediaEventPayload, isMediaEventType } = require('@openvibe/contracts');

function buildEventBus(config) {
    const client = new EventsClient({
        eventsUrl: config.events.url,
        internalKey: config.internalKey,
        source: config.serviceId,
    });

    function publishMediaEvent(eventType, media, extra) {
        if (!isMediaEventType(eventType)) {
            console.warn(`[MediaEvents] non-canonical event_type=${eventType} (publishing anyway)`);
        }
        const payload = buildMediaEventPayload(media, extra);
        return client.publish(TOPICS.MEDIA, {
            event_type: eventType,
            source: config.serviceId,
            actor_type: extra && extra.actor_type ? extra.actor_type : 'service',
            actor_id: extra && extra.actor_id ? extra.actor_id : config.serviceId,
            payload,
        }).catch(err => {
            console.warn(`[MediaEvents] publish ${eventType} failed: ${err.message}`);
        });
    }

    return { client, publishMediaEvent };
}

module.exports = { buildEventBus };
