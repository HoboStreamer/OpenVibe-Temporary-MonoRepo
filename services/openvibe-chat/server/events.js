'use strict';

// openvibe-chat — wraps EventsClient. Publishes to TOPICS.CHAT.

const { EventsClient } = require('@openvibe/sdk');
const { TOPICS, isChatEventType, buildChatEventPayload } = require('@openvibe/contracts');

function buildEventBus(config) {
    const client = new EventsClient({
        eventsUrl: config.events.url,
        internalKey: config.internalKey,
        source: config.serviceId,
    });

    function publishChatEvent(eventType, base, extra) {
        if (!isChatEventType(eventType)) {
            console.warn(`[ChatEvents] non-canonical event_type=${eventType}`);
        }
        const payload = buildChatEventPayload(base, extra);
        return client.publish(TOPICS.CHAT, {
            event_type: eventType,
            source: config.serviceId,
            actor_type: (extra && extra.actor_type) || 'service',
            actor_id: (extra && extra.actor_id) || config.serviceId,
            payload,
        }).catch(err => {
            console.warn(`[ChatEvents] publish ${eventType} failed: ${err.message}`);
        });
    }

    return { client, publishChatEvent };
}

module.exports = { buildEventBus };
