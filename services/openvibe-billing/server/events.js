'use strict';

// openvibe-billing — wraps EventsClient. Publishes to TOPICS.BILLING / TIPS / VIP.
// Failures are logged but never thrown — the ledger write has already been
// committed and downstream services rely on event replay / catch-up jobs.

const { EventsClient } = require('@openvibe/sdk');
const {
    isBillingEventType, isTipsEventType, isVipEventType,
    buildBillingEventPayload, buildTipsEventPayload, buildVipEventPayload,
} = require('@openvibe/contracts');

// We reference the topic strings directly (TOPICS.TIPS / TOPICS.VIP may not be
// in the contracts topic registry yet — they are documented as separate streams
// but the events backbone treats topic as a string).
const TOPIC_BILLING = 'billing.events';
const TOPIC_TIPS    = 'tips.events';
const TOPIC_VIP     = 'vip.events';

function buildEventBus(config) {
    const client = new EventsClient({
        eventsUrl: config.events.url,
        internalKey: config.internalKey,
        source: config.serviceId,
    });

    function publish(topic, eventType, base, extra, validator) {
        if (!validator(eventType)) {
            console.warn(`[BillingEvents] non-canonical event_type=${eventType}`);
        }
        const payload = (extra && extra.__payloadBuilder)
            ? extra.__payloadBuilder(base, extra)
            : Object.assign({}, base || {}, extra && extra.payload || {});
        return client.publish(topic, {
            event_type: eventType,
            source: config.serviceId,
            actor_type: (extra && extra.actor_type) || 'service',
            actor_id:   (extra && extra.actor_id)   || config.serviceId,
            payload,
        }).catch(err => {
            console.warn(`[BillingEvents] publish ${topic}/${eventType} failed: ${err.message}`);
        });
    }

    return {
        client,
        publishBillingEvent: (eventType, base, extra) =>
            publish(TOPIC_BILLING, eventType, buildBillingEventPayload(base, (extra && extra.payload) || {}), extra, isBillingEventType),
        publishTipsEvent: (eventType, base, extra) =>
            publish(TOPIC_TIPS, eventType, buildTipsEventPayload(base, (extra && extra.payload) || {}), extra, isTipsEventType),
        publishVipEvent: (eventType, base, extra) =>
            publish(TOPIC_VIP, eventType, buildVipEventPayload(base, (extra && extra.payload) || {}), extra, isVipEventType),
    };
}

module.exports = { buildEventBus };
