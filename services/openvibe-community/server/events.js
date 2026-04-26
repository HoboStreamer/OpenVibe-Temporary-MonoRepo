'use strict';

const { EventsClient } = require('@openvibe/sdk');
const { TOPICS, isCommunityEventType, buildCommunityEventPayload } = require('@openvibe/contracts');

function buildEventBus(config) {
    const client = new EventsClient({
        eventsUrl: config.events.url,
        internalKey: config.internalKey,
        source: config.serviceId,
    });

    function publishCommunityEvent(eventType, base, extra) {
        if (!isCommunityEventType(eventType)) {
            console.warn(`[CommunityEvents] non-canonical event_type=${eventType}`);
        }
        const payload = buildCommunityEventPayload(base, extra);
        return client.publish(TOPICS.COMMUNITY, {
            event_type: eventType,
            source: config.serviceId,
            actor_type: (extra && extra.actor_type) || 'service',
            actor_id: (extra && extra.actor_id) || config.serviceId,
            payload,
        }).catch(err => {
            console.warn(`[CommunityEvents] publish ${eventType} failed: ${err.message}`);
        });
    }

    return { client, publishCommunityEvent };
}

module.exports = { buildEventBus };
