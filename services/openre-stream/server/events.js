'use strict';

const { EventsClient } = require('@openvibe/sdk');
const { TOPICS, buildStreamEventPayload, isStreamEventType } = require('@openvibe/contracts');

function buildEventBus(config) {
    const client = new EventsClient({
        eventsUrl: config.events.url,
        internalKey: config.internalKey,
        source: config.serviceId,
    });

    function publishStreamEvent(eventType, stream, channel, extra) {
        if (!isStreamEventType(eventType)) {
            console.warn(`[StreamEvents] non-canonical event_type=${eventType} (publishing anyway)`);
        }
        const merged = Object.assign({}, extra || {}, channel ? {
            channel_id: channel.id,
            channel_slug: channel.slug,
            creator_id: channel.owner_user_id,
        } : {});
        const payload = buildStreamEventPayload(stream, merged);
        return client.publish(TOPICS.STREAM, {
            event_type: eventType,
            source: config.serviceId,
            actor_type: extra && extra.actor_type ? extra.actor_type : 'service',
            actor_id: extra && extra.actor_id ? extra.actor_id : config.serviceId,
            payload,
        }).catch(err => {
            console.warn(`[StreamEvents] publish ${eventType} failed: ${err.message}`);
        });
    }
    return { client, publishStreamEvent };
}

module.exports = { buildEventBus };
