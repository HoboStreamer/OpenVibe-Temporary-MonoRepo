'use strict';

const { EventsClient } = require('@openvibe/sdk');
const { TOPICS, GAME_EVENT_TYPES, isGameEventType, buildGameEventPayload } = require('@openvibe/contracts');

function buildEventBus(config) {
    const client = new EventsClient({
        eventsUrl: config.events.url,
        internalKey: config.internalKey,
        source: config.serviceId,
    });

    function publishGameEvent(eventType, base, extra) {
        if (!isGameEventType(eventType)) {
            console.warn(`[GamesEvents] non-canonical event_type=${eventType}`);
        }
        const payload = buildGameEventPayload(base, extra);
        return client.publish(TOPICS.GAME, {
            event_type: eventType,
            source: config.serviceId,
            actor_type: (extra && extra.actor_type) || 'service',
            actor_id: (extra && extra.actor_id) || config.serviceId,
            payload,
        }).catch((err) => {
            console.warn(`[GamesEvents] publish ${eventType} failed: ${err.message}`);
        });
    }

    return { client, publishGameEvent };
}

module.exports = { buildEventBus };
