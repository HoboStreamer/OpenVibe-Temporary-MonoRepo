'use strict';

/**
 * openre-stream — WebRTC SFU via Mediasoup
 *
 * Provides low-latency WebRTC streaming using Mediasoup as an SFU.
 * Producers (streamers via WHIP) send media; consumers (viewers via WS) receive it.
 */
const EventEmitter = require('events');
const config = require('./config');

let mediasoup;
try {
    mediasoup = require('mediasoup');
} catch {
    console.warn('[SFU] mediasoup not found — WebRTC disabled');
}

class WebRTCSFU extends EventEmitter {
    constructor() {
        super();
        this.rooms = new Map();
        this.worker = null;
        this.ready = false;
    }

    async init() {
        if (!mediasoup) {
            console.warn('[SFU] Mediasoup not available, SFU disabled');
            return;
        }
        try {
            this.worker = await mediasoup.createWorker({
                logLevel: 'warn',
                rtcMinPort: config.mediasoup.minPort,
                rtcMaxPort: config.mediasoup.maxPort,
            });
            this.worker.on('died', () => {
                console.error('[SFU] Mediasoup Worker died — restarting...');
                this.ready = false;
                for (const roomId of this.rooms.keys()) {
                    try { this.closeRoom(roomId); } catch (e) {
                        console.warn(`[SFU] Error closing room ${roomId}:`, e.message);
                    }
                }
                this.rooms.clear();
                setTimeout(() => this.init(), 2000);
            });
            this.ready = true;
            console.log('[SFU] Mediasoup Worker started (PID:', this.worker.pid, ')');
        } catch (err) {
            console.error('[SFU] Failed to create Mediasoup worker:', err.message);
        }
    }

    async getOrCreateRoom(roomId) {
        if (this.rooms.has(roomId)) return this.rooms.get(roomId);
        if (!this.worker || !this.ready) throw new Error('SFU not initialized');

        const router = await this.worker.createRouter({
            mediaCodecs: config.mediasoup.mediaCodecs,
        });
        const room = {
            router,
            producers: new Map(),
            consumers: new Map(),
            transports: new Map(),
        };
        this.rooms.set(roomId, room);
        console.log(`[SFU] Room created: ${roomId}`);
        return room;
    }

    async getRouterCapabilities(roomId) {
        const room = await this.getOrCreateRoom(roomId);
        return room.router.rtpCapabilities;
    }

    async createTransport(roomId, peerId, options = {}) {
        const room = await this.getOrCreateRoom(roomId);
        const transportOptions = {
            listenIps: [{ ip: config.mediasoup.listenIp, announcedIp: config.mediasoup.announcedIp }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            initialAvailableOutgoingBitrate: 1000000,
        };
        if (typeof options.iceConsentTimeout === 'number') {
            transportOptions.iceConsentTimeout = options.iceConsentTimeout;
        }
        const transport = await room.router.createWebRtcTransport(transportOptions);

        transport.on('dtlsstatechange', (state) => {
            if (state === 'closed' || state === 'failed') {
                try { transport.close(); } catch {}
            }
        });

        room.transports.set(`${peerId}-${transport.id}`, transport);
        return {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        };
    }

    async connectTransport(roomId, peerId, transportId, dtlsParameters) {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        const transport = room.transports.get(`${peerId}-${transportId}`);
        if (!transport) throw new Error('Transport not found');
        await transport.connect({ dtlsParameters });
    }

    async produce(roomId, peerId, transportId, kind, rtpParameters) {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        const transport = room.transports.get(`${peerId}-${transportId}`);
        if (!transport) throw new Error('Transport not found');

        const producer = await transport.produce({ kind, rtpParameters });
        room.producers.set(producer.id, { producer, peerId, transportId });

        producer.on('transportclose', () => {
            room.producers.delete(producer.id);
            this.emit('producer-removed', { roomId, producerId: producer.id, kind });
        });

        this.emit('producer-added', { roomId, producerId: producer.id, kind, peerId });
        return { id: producer.id };
    }

    async consume(roomId, peerId, transportId, producerId, rtpCapabilities) {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        if (!room.router.canConsume({ producerId, rtpCapabilities })) throw new Error('Cannot consume producer');
        const transport = room.transports.get(`${peerId}-${transportId}`);
        if (!transport) throw new Error('Transport not found');

        const consumer = await transport.consume({ producerId, rtpCapabilities, paused: false });
        room.consumers.set(consumer.id, { consumer, peerId });

        consumer.on('transportclose', () => { room.consumers.delete(consumer.id); });
        consumer.on('producerclose', () => {
            try { consumer.close(); } catch {}
            room.consumers.delete(consumer.id);
        });

        if (consumer.kind === 'video') {
            [0, 400, 1200].forEach((delay, i) => setTimeout(async () => {
                try { await consumer.requestKeyFrame(); } catch {}
            }, delay));
        }

        return {
            id: consumer.id,
            producerId: consumer.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
        };
    }

    hasProducers(roomId) {
        const room = this.rooms.get(roomId);
        return room ? room.producers.size > 0 : false;
    }

    findProducerByKind(roomId, kind) {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        for (const [id, { producer, peerId }] of room.producers) {
            if (producer.kind === kind && !producer.closed) return { id, peerId };
        }
        return null;
    }

    waitForProducer(roomId, kind, timeoutMs = 30000) {
        const existing = this.findProducerByKind(roomId, kind);
        if (existing) return Promise.resolve(existing);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.removeListener('producer-added', handler);
                reject(new Error(`Timeout waiting for ${kind} producer in ${roomId}`));
            }, timeoutMs);
            const handler = (ev) => {
                if (ev.roomId === roomId && ev.kind === kind) {
                    clearTimeout(timer);
                    this.removeListener('producer-added', handler);
                    resolve({ id: ev.producerId, peerId: ev.peerId });
                }
            };
            this.on('producer-added', handler);
        });
    }

    getProducers(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return [];
        return Array.from(room.producers.entries())
            .filter(([, { producer }]) => !producer.closed)
            .map(([id, { producer, peerId }]) => ({ id, peerId, kind: producer.kind }));
    }

    getViewerCount(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return 0;
        const peers = new Set();
        room.consumers.forEach(({ peerId }) => peers.add(peerId));
        return peers.size;
    }

    closeRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        room.transports.forEach(t => { try { t.close(); } catch {} });
        try { room.router.close(); } catch {}
        this.rooms.delete(roomId);
        this.emit('room-closed', { roomId });
        console.log(`[SFU] Room closed: ${roomId}`);
    }

    closeAll() {
        for (const roomId of this.rooms.keys()) this.closeRoom(roomId);
        if (this.worker) { try { this.worker.close(); } catch {} }
    }
}

module.exports = new WebRTCSFU();
