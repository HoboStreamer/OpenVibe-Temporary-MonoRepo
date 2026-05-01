'use strict';

const { CHANNELS } = require('./channels');

function validateBits(bits) {
    const normalized = Number(bits);
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 32) throw new Error('bits must be an integer between 1 and 32');
    return normalized;
}

function createPacketBuilder(name, options = {}) {
    const packet = {
        name: String(name || '').trim(),
        channel: options.channel || CHANNELS.RELIABLE,
        unreliable: options.unreliable === true,
        payload: [],
    };
    if (!packet.name) throw new Error('packet name required');

    const api = {
        WriteString(value) {
            packet.payload.push({ type: 'string', value: String(value == null ? '' : value) });
            return api;
        },
        WriteUInt(value, bits = 32) {
            const normalizedBits = validateBits(bits);
            const normalizedValue = Number(value);
            if (!Number.isFinite(normalizedValue) || normalizedValue < 0) throw new Error('uint value must be a non-negative number');
            packet.payload.push({ type: 'uint', bits: normalizedBits, value: Math.floor(normalizedValue) });
            return api;
        },
        WriteFloat(value) {
            const normalizedValue = Number(value);
            if (!Number.isFinite(normalizedValue)) throw new Error('float value must be finite');
            packet.payload.push({ type: 'float', value: normalizedValue });
            return api;
        },
        WriteJSON(value) {
            packet.payload.push({ type: 'json', value });
            return api;
        },
        Build() {
            return JSON.parse(JSON.stringify(packet));
        },
    };

    return api;
}

function createPacketReader(payload = []) {
    const queue = Array.isArray(payload) ? payload.slice() : [];

    function next(expectedType) {
        if (!queue.length) throw new Error('packet underflow');
        const entry = queue.shift();
        if (expectedType && entry.type !== expectedType) throw new Error(`expected ${expectedType} but received ${entry.type}`);
        return entry;
    }

    return {
        ReadString() {
            return next('string').value;
        },
        ReadUInt(bits = 32) {
            const entry = next('uint');
            validateBits(bits);
            return Number(entry.value) || 0;
        },
        ReadFloat() {
            return Number(next('float').value) || 0;
        },
        ReadJSON() {
            return next('json').value;
        },
        Remaining() {
            return queue.length;
        },
    };
}

function encodePacket(packet) {
    return JSON.stringify(packet);
}

function decodePacket(rawPacket) {
    const packet = typeof rawPacket === 'string' ? JSON.parse(rawPacket) : rawPacket;
    if (!packet || typeof packet !== 'object') throw new Error('packet must be an object');
    if (!packet.name || typeof packet.name !== 'string') throw new Error('packet name required');
    if (!Array.isArray(packet.payload)) packet.payload = [];
    return packet;
}

module.exports = {
    createPacketBuilder,
    createPacketReader,
    encodePacket,
    decodePacket,
};
