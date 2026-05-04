'use strict';

const { TOPIC_LIST } = require('@openvibe/contracts/topics');
const { mapEnvelopeToRealtimeTargets, normalizeEventType } = require('@openvibe/realtime');
const { EventsClient } = require('@openvibe/sdk');
const {
    ack,
    buildStreamKey,
    consumeGroup,
    createGroup,
    createStreamClient,
} = require('@openvibe/queue');

const BRIDGED_TOPICS = Object.freeze([...TOPIC_LIST, 'tips.events', 'vip.events']);

function createEventBridge(options) {
    const opts = options || {};
    const config = opts.config || {};
    const io = opts.io || (opts.socketRuntime && opts.socketRuntime.io) || null;
    const eventsClient = opts.eventsClient || new EventsClient({
        eventsUrl: config.eventsUrl,
        internalKey: config.internalKey,
        source: config.serviceId,
    });
    const streamClient = opts.streamClient || (config.redisUrl ? createStreamClient({
        url: config.redisUrl,
        name: `${config.serviceId}-event-bridge`,
        prefix: config.queuePrefix,
    }) : null);

    const sseClients = opts.sseClients || null; // Map<id, { res, topics }>

    const state = {
        started: false,
        mode: 'disabled',
        consumer_group: config.bridgeConsumerGroup,
        consumer_name: config.bridgeConsumerName,
        last_poll_id: 0,
        last_event_at: null,
        last_event_type: null,
        last_trace_id: null,
        routed_messages: 0,
        socket_targets: 0,
        sse_targets: 0,
        backlog_warning: null,
        last_error: null,
    };

    let pollTimer = null;
    let redisLoop = null;

    function recordError(error) {
        state.last_error = {
            message: error && error.message || String(error),
            at: new Date().toISOString(),
        };
    }

    function clearError() {
        state.last_error = null;
    }

    function emitTarget(target) {
        if (!io || !target || !target.namespace || !target.room) return false;
        io.of(target.namespace).to(target.room).emit(target.event, target.payload);
        return true;
    }

    // Normalize the envelope's event_type to canonical dot-notation and attach
    // a last_event_id field for SSE replay. Returns a new envelope object.
    function normalizeEnvelope(envelope) {
        if (!envelope) return envelope;
        const raw = envelope.event_type;
        const canonical = normalizeEventType(raw);
        if (canonical === raw) return envelope;
        return Object.assign({}, envelope, { event_type: canonical, _original_event_type: raw });
    }

    async function ingestEnvelope(rawEnvelope) {
        const envelope = normalizeEnvelope(rawEnvelope);
        const targets = mapEnvelopeToRealtimeTargets(envelope || {});
        let socketEmitted = 0;
        for (const target of targets) {
            // Use canonical event name for Socket.IO emission too
            const normalizedTarget = target.event === (rawEnvelope && rawEnvelope.event_type)
                ? Object.assign({}, target, { event: envelope.event_type })
                : target;
            if (emitTarget(normalizedTarget)) socketEmitted += 1;
        }

        // Fan out to SSE subscribers
        let sseEmitted = 0;
        if (sseClients && sseClients.size > 0 && envelope && envelope.event_type) {
            const eventId = envelope.event_id || null;
            const eventType = envelope.event_type; // canonical
            const topic = envelope.topic || null;
            const data = JSON.stringify(Object.assign({}, envelope, topic ? { topic } : {}));
            const prefix = eventId ? `id: ${eventId}\n` : '';
            const frame = `${prefix}event: ${eventType}\ndata: ${data}\n\n`;
            for (const [, client] of sseClients) {
                // Deliver if client has no topic filter or its filter includes this event's topic
                const matches = !client.topics.length || (topic && client.topics.includes(topic));
                if (matches) {
                    try {
                        client.res.write(frame);
                        sseEmitted += 1;
                    } catch {
                        // client disconnected mid-write; cleaned up on req.close
                    }
                }
            }
        }

        if (envelope && envelope.event_type) {
            state.last_event_at = new Date().toISOString();
            state.last_event_type = envelope.event_type;
            state.last_event_id = envelope.event_id || state.last_event_id;
            state.last_trace_id = envelope.trace_id || null;
        }
        state.routed_messages += targets.length;
        state.socket_targets += socketEmitted;
        state.sse_targets += sseEmitted;
        clearError();
        return { routed: targets.length, targets, sse_targets: sseEmitted };
    }

    // Alias: same as ingestEnvelope, but callable from outside with the intent
    // of publishing to both Socket.IO and SSE from the same path.
    const publishEnvelopeToTransports = ingestEnvelope;

    function hydrateEnvelope(message) {
        const values = message && message.values || {};
        if (values.envelope && typeof values.envelope === 'object') {
            return Object.assign({ topic: values.topic || null }, values.envelope);
        }
        return {
            event_id: values.event_id || null,
            trace_id: values.trace_id || null,
            topic: values.topic || null,
            event_type: values.event_type || null,
            source: values.source || null,
            actor_type: values.actor_type || null,
            actor_id: values.actor_id || null,
            timestamp: values.timestamp || null,
            payload: values.payload || {},
        };
    }

    async function pollOnce() {
        if (!config.eventsUrl) return { polled: 0, mode: 'disabled' };
        const response = await eventsClient.listEvents({
            since_id: state.last_poll_id,
            limit: config.bridgePollLimit,
        });
        const items = Array.isArray(response && response.items) ? response.items.slice().sort((a, b) => Number(a.id || 0) - Number(b.id || 0)) : [];
        for (const item of items) {
            await ingestEnvelope(item);
            state.last_poll_id = Math.max(state.last_poll_id, Number(item.id || 0));
        }
        state.backlog_warning = items.length >= config.bridgePollLimit
            ? `Polling bridge hit limit=${config.bridgePollLimit}; increase OPENVIBE_REALTIME_BRIDGE_POLL_LIMIT if this becomes normal.`
            : null;
        clearError();
        return { polled: items.length, mode: 'polling' };
    }

    async function pumpRedisTopic(topic) {
        const stream = buildStreamKey(config.eventStreamNamespace, topic);
        const messages = await consumeGroup(streamClient, stream, config.bridgeConsumerGroup, config.bridgeConsumerName, {
            count: config.bridgeBatchSize,
            blockMs: 1,
        });
        for (const message of messages) {
            const envelope = hydrateEnvelope(message);
            await ingestEnvelope(envelope);
            await ack(streamClient, stream, config.bridgeConsumerGroup, message.id);
        }
        return messages.length;
    }

    async function runRedisLoop() {
        while (state.started && state.mode === 'redis-stream') {
            try {
                let processed = 0;
                for (const topic of BRIDGED_TOPICS) {
                    processed += await pumpRedisTopic(topic);
                }
                if (!processed) {
                    await new Promise((resolve) => setTimeout(resolve, config.bridgeIdleMs));
                }
            } catch (error) {
                recordError(error);
                await new Promise((resolve) => setTimeout(resolve, config.bridgePollIntervalMs));
            }
        }
    }

    async function start() {
        if (state.started) return summary();
        state.started = true;

        if (streamClient) {
            for (const topic of BRIDGED_TOPICS) {
                await createGroup(streamClient, buildStreamKey(config.eventStreamNamespace, topic), config.bridgeConsumerGroup, {
                    mkstream: true,
                    fromId: '0',
                });
            }
            state.mode = 'redis-stream';
            redisLoop = runRedisLoop();
            void redisLoop.catch(recordError);
            return summary();
        }

        if (!config.eventsUrl) {
            state.mode = 'disabled';
            recordError(new Error('event bridge requires OPENVIBE_EVENTS_URL when Redis is unavailable'));
            return summary();
        }

        state.mode = 'polling';
        await pollOnce().catch(recordError);
        pollTimer = setInterval(() => {
            void pollOnce().catch(recordError);
        }, config.bridgePollIntervalMs);
        if (typeof pollTimer.unref === 'function') pollTimer.unref();
        return summary();
    }

    async function stop() {
        state.started = false;
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        if (streamClient && streamClient.isOpen) {
            await streamClient.quit().catch(() => {});
        }
    }

    function summary() {
        return {
            started: state.started,
            mode: state.mode,
            configured_topics: BRIDGED_TOPICS,
            consumer_group: state.consumer_group,
            consumer_name: state.consumer_name,
            events_url_configured: !!config.eventsUrl,
            redis_configured: !!config.redisUrl,
            last_poll_id: state.last_poll_id,
            last_event_at: state.last_event_at,
            last_event_type: state.last_event_type,
            last_trace_id: state.last_trace_id,
            routed_messages: state.routed_messages,
            socket_targets: state.socket_targets,
            sse_targets: state.sse_targets,
            backlog_warning: state.backlog_warning,
            last_error: state.last_error,
        };
    }

    return {
        BRIDGED_TOPICS,
        ingestEnvelope,
        publishEnvelopeToTransports,
        pollOnce,
        start,
        stop,
        summary,
    };
}

module.exports = {
    BRIDGED_TOPICS,
    createEventBridge,
    publishEnvelopeToTransports: null, // set per-instance; use createEventBridge().publishEnvelopeToTransports
};
