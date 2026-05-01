'use strict';

const { MessageRegistry } = require('./message-registry');
const { createPacketBuilder, createPacketReader, decodePacket } = require('./packet-codec');

function createNetLibrary(options = {}) {
    const registry = options.registry instanceof MessageRegistry ? options.registry : new MessageRegistry();
    const receivers = new Map();
    let currentBuilder = null;

    function ensurePacket(name) {
        const message = registry.Get(name);
        if (!message) throw new Error(`message not registered: ${name}`);
        return message;
    }

    function completeSend(packet, sendFn, target) {
        if (typeof sendFn !== 'function') return packet;
        sendFn(packet, target);
        return packet;
    }

    const api = {
        Register(name, schema = {}) {
            return registry.Register(name, schema);
        },
        Start(name, startOptions = {}) {
            ensurePacket(name);
            currentBuilder = createPacketBuilder(name, startOptions);
            return api;
        },
        WriteString(value) {
            if (!currentBuilder) throw new Error('net.Start must be called before writing');
            currentBuilder.WriteString(value);
            return api;
        },
        WriteUInt(value, bits) {
            if (!currentBuilder) throw new Error('net.Start must be called before writing');
            currentBuilder.WriteUInt(value, bits);
            return api;
        },
        WriteFloat(value) {
            if (!currentBuilder) throw new Error('net.Start must be called before writing');
            currentBuilder.WriteFloat(value);
            return api;
        },
        WriteJSON(value) {
            if (!currentBuilder) throw new Error('net.Start must be called before writing');
            currentBuilder.WriteJSON(value);
            return api;
        },
        Send(player) {
            if (!currentBuilder) throw new Error('net.Start must be called before send');
            const packet = currentBuilder.Build();
            currentBuilder = null;
            return completeSend(packet, options.send, player);
        },
        Broadcast() {
            if (!currentBuilder) throw new Error('net.Start must be called before broadcast');
            const packet = currentBuilder.Build();
            currentBuilder = null;
            return completeSend(packet, options.broadcast);
        },
        SendToServer() {
            if (!currentBuilder) throw new Error('net.Start must be called before send');
            const packet = currentBuilder.Build();
            currentBuilder = null;
            return completeSend(packet, options.sendToServer);
        },
        Receive(name, fn) {
            ensurePacket(name);
            if (typeof fn !== 'function') throw new Error('receiver must be a function');
            receivers.set(String(name), fn);
            return api;
        },
        Dispatch(rawPacket, context = {}) {
            const packet = decodePacket(rawPacket);
            const handler = receivers.get(packet.name);
            if (!handler) return { ok: false, reason: `no receiver for ${packet.name}` };
            const reader = createPacketReader(packet.payload);
            return handler(reader, context) || { ok: true };
        },
        List() {
            return registry.List();
        },
    };

    return api;
}

module.exports = {
    createNetLibrary,
};
