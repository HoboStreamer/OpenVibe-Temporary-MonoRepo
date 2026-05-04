'use strict';

const assert = require('assert');

const { createEventBridge } = require('../server/event-bridge');

function createFakeIo() {
    const emitted = [];
    return {
        emitted,
        of(namespace) {
            return {
                to(room) {
                    return {
                        emit(event, payload) {
                            emitted.push({ namespace, room, event, payload });
                        },
                    };
                },
            };
        },
    };
}

(async function pollingFallbackRoutesChatEvents() {
    const io = createFakeIo();
    let calls = 0;
    const bridge = createEventBridge({
        io,
        config: {
            serviceId: 'openvibe-realtime',
            internalKey: 'test-key',
            eventsUrl: 'http://events.local',
            redisUrl: '',
            queuePrefix: 'openvibe',
            eventStreamNamespace: 'events',
            bridgeBatchSize: 10,
            bridgeConsumerGroup: 'openvibe-realtime',
            bridgeConsumerName: 'test-consumer',
            bridgeIdleMs: 5,
            bridgePollIntervalMs: 10,
            bridgePollLimit: 100,
        },
        eventsClient: {
            async listEvents() {
                calls += 1;
                if (calls > 1) return { items: [] };
                return {
                    items: [
                        {
                            id: 9,
                            event_id: 'evt_chat_1',
                            trace_id: 'trace_chat_1',
                            event_type: 'chat.message.created',
                            source: 'openvibe-chat',
                            payload: { room_type: 'stream', stream_id: 'stream-77' },
                        },
                    ],
                };
            },
        },
    });

    const result = await bridge.pollOnce();
    assert.strictEqual(result.polled, 1);
    assert.strictEqual(bridge.summary().last_poll_id, 9);
    assert.ok(io.emitted.some((entry) => entry.namespace === '/chat' && entry.room === 'chat:stream:stream-77' && entry.event === 'chat.message.sent'));
})();

(async function emitsAdminEventsOnlyIntoAdminRoom() {
    const io = createFakeIo();
    const bridge = createEventBridge({
        io,
        config: {
            serviceId: 'openvibe-realtime',
            internalKey: 'test-key',
            eventsUrl: 'http://events.local',
            redisUrl: '',
            queuePrefix: 'openvibe',
            eventStreamNamespace: 'events',
            bridgeBatchSize: 10,
            bridgeConsumerGroup: 'openvibe-realtime',
            bridgeConsumerName: 'test-consumer',
            bridgeIdleMs: 5,
            bridgePollIntervalMs: 10,
            bridgePollLimit: 100,
        },
        eventsClient: { async listEvents() { return { items: [] }; } },
    });

    const ingested = await bridge.ingestEnvelope({
        event_id: 'evt_admin_1',
        trace_id: 'trace_admin_1',
        event_type: 'admin.broadcast',
        source: 'openvibe-network',
        payload: { title: 'Maintenance' },
    });

    assert.strictEqual(ingested.routed, 1);
    assert.deepStrictEqual(io.emitted[0].namespace, '/admin');
    assert.deepStrictEqual(io.emitted[0].room, 'admin');
})();

(async function startUsesPollingWithoutRedis() {
    const io = createFakeIo();
    const bridge = createEventBridge({
        io,
        config: {
            serviceId: 'openvibe-realtime',
            internalKey: 'test-key',
            eventsUrl: 'http://events.local',
            redisUrl: '',
            queuePrefix: 'openvibe',
            eventStreamNamespace: 'events',
            bridgeBatchSize: 10,
            bridgeConsumerGroup: 'openvibe-realtime',
            bridgeConsumerName: 'test-consumer',
            bridgeIdleMs: 5,
            bridgePollIntervalMs: 10,
            bridgePollLimit: 100,
        },
        eventsClient: { async listEvents() { return { items: [] }; } },
    });

    await bridge.start();
    assert.strictEqual(bridge.summary().mode, 'polling');
    assert.strictEqual(bridge.summary().started, true);
    await bridge.stop();
})();

console.log('openvibe-realtime event bridge tests OK');
