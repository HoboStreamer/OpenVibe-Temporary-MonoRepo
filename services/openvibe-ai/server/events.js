'use strict';

// openvibe-ai — event bus wrapper. Publishes to the four AI-domain topics.
// Failures are logged but never thrown.

const { EventsClient } = require('@openvibe/sdk');
const {
    AI_TOPICS,
    isAiEventType, isSeoEventType, isContentEventType, isSearchEventType,
    buildAiEventPayload, buildSeoEventPayload,
    buildContentEventPayload, buildSearchEventPayload,
} = require('@openvibe/contracts');

function buildEventBus(config) {
    const client = new EventsClient({
        eventsUrl: config.events.url,
        internalKey: config.internalKey,
        source: config.serviceId,
    });

    function publish(topic, eventType, payload, actor, validator) {
        if (!validator(eventType)) {
            console.warn(`[AiEvents] non-canonical event_type=${eventType} on ${topic}`);
        }
        return client.publish(topic, {
            event_type: eventType,
            source: config.serviceId,
            actor_type: (actor && actor.actor_type) || 'service',
            actor_id:   (actor && actor.actor_id)   || config.serviceId,
            payload: payload || {},
        }).catch(err => {
            console.warn(`[AiEvents] publish ${topic}/${eventType} failed: ${err.message}`);
        });
    }

    return {
        client,
        publishAi: (eventType, base, extra) =>
            publish(AI_TOPICS.AI, eventType,
                buildAiEventPayload(base, (extra && extra.payload) || {}), extra, isAiEventType),
        publishSeo: (eventType, base, extra) =>
            publish(AI_TOPICS.SEO, eventType,
                buildSeoEventPayload(base, (extra && extra.payload) || {}), extra, isSeoEventType),
        publishContent: (eventType, base, extra) =>
            publish(AI_TOPICS.CONTENT, eventType,
                buildContentEventPayload(base, (extra && extra.payload) || {}), extra, isContentEventType),
        publishSearch: (eventType, base, extra) =>
            publish(AI_TOPICS.SEARCH, eventType,
                buildSearchEventPayload(base, (extra && extra.payload) || {}), extra, isSearchEventType),
    };
}

module.exports = { buildEventBus };
