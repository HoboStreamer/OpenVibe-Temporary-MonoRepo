'use strict';

/**
 * openre-stream — Broadcast WebSocket Server
 *
 * Handles viewer signaling for watching live WebRTC streams.
 * Broadcasters push via WHIP; viewers connect here to receive via WebRTC.
 *
 * Message flow (broadcaster → viewer):
 *   client → { type: 'join', channelSlug }
 *   server → { type: 'router-capabilities', rtpCapabilities }
 *   client → { type: 'create-transport' }
 *   server → { type: 'transport-created', transportId, iceParameters, iceCandidates, dtlsParameters }
 *   client → { type: 'connect-transport', transportId, dtlsParameters }
 *   client → { type: 'consume', transportId, producerId, rtpCapabilities }
 *   server → { type: 'consumed', consumerId, producerId, kind, rtpParameters }
 *   server → { type: 'producers-available', producers: [{id, kind}] }
 */

const crypto = require('crypto');
const sfu = require('./sfu');
const { getSessionForChannel } = require('./whip');

let WebSocket;
try {
    WebSocket = require('ws');
} catch {
    console.warn('[BroadcastWS] ws not available');
}

const clients = new Map(); // wsId → { ws, channelSlug, peerId, transportIds }

function genId(prefix = 'peer') {
    return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

function sendToClient(ws, msg) {
    try {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    } catch (err) {
        console.warn('[BroadcastWS] send error:', err.message);
    }
}

async function handleMessage(wsId, data) {
    let msg;
    try { msg = JSON.parse(data); }
    catch { return; }

    const client = clients.get(wsId);
    if (!client) return;

    const { type } = msg;

    if (type === 'join') {
        const { channelSlug } = msg;
        if (!channelSlug) return sendToClient(client.ws, { type: 'error', message: 'channelSlug required' });

        client.channelSlug = String(channelSlug);
        client.peerId = genId('viewer');

        const roomId = `channel-${channelSlug}`;
        try {
            const caps = await sfu.getRouterCapabilities(roomId);
            sendToClient(client.ws, { type: 'router-capabilities', rtpCapabilities: caps });

            // Notify about any already-active producers
            const producers = sfu.getProducers(roomId);
            if (producers.length > 0) {
                sendToClient(client.ws, { type: 'producers-available', producers });
            }
        } catch (err) {
            sendToClient(client.ws, { type: 'error', message: 'Stream not found or not live' });
        }
        return;
    }

    if (type === 'create-transport') {
        const { channelSlug, peerId } = client;
        if (!channelSlug) return sendToClient(client.ws, { type: 'error', message: 'Join first' });
        const roomId = `channel-${channelSlug}`;
        try {
            const transport = await sfu.createTransport(roomId, peerId);
            client.transportIds = client.transportIds || [];
            client.transportIds.push(transport.id);
            sendToClient(client.ws, { type: 'transport-created', ...transport });
        } catch (err) {
            sendToClient(client.ws, { type: 'error', message: err.message });
        }
        return;
    }

    if (type === 'connect-transport') {
        const { transportId, dtlsParameters } = msg;
        const { channelSlug, peerId } = client;
        if (!channelSlug) return;
        const roomId = `channel-${channelSlug}`;
        try {
            await sfu.connectTransport(roomId, peerId, transportId, dtlsParameters);
            sendToClient(client.ws, { type: 'transport-connected', transportId });
        } catch (err) {
            sendToClient(client.ws, { type: 'error', message: err.message });
        }
        return;
    }

    if (type === 'consume') {
        const { transportId, producerId, rtpCapabilities } = msg;
        const { channelSlug, peerId } = client;
        if (!channelSlug) return;
        const roomId = `channel-${channelSlug}`;
        try {
            const result = await sfu.consume(roomId, peerId, transportId, producerId, rtpCapabilities);
            sendToClient(client.ws, { type: 'consumed', ...result });
        } catch (err) {
            sendToClient(client.ws, { type: 'error', message: err.message });
        }
        return;
    }

    if (type === 'viewer-ready') {
        // Client is ready to receive; no-op here
        return;
    }
}

function handleClose(wsId) {
    const client = clients.get(wsId);
    if (!client) return;
    clients.delete(wsId);
    // Transports auto-close when socket drops; mediasoup cleans up consumers
}

/**
 * Attach to an existing http.Server for WebSocket upgrade handling.
 * Upgrades at path /ws/broadcast
 */
function attach(server) {
    if (!WebSocket) {
        console.warn('[BroadcastWS] ws not available — viewer WS disabled');
        return;
    }

    const wss = new WebSocket.Server({ noServer: true });

    // Listen for new producers → notify all viewers on that channel
    sfu.on('producer-added', ({ roomId, producerId, kind }) => {
        // roomId format: 'channel-<slug>'
        const channelSlug = roomId.replace(/^channel-/, '');
        for (const [, client] of clients) {
            if (client.channelSlug === channelSlug) {
                sendToClient(client.ws, {
                    type: 'producers-available',
                    producers: [{ id: producerId, kind }],
                });
            }
        }
    });

    sfu.on('room-closed', ({ roomId }) => {
        const channelSlug = roomId.replace(/^channel-/, '');
        for (const [, client] of clients) {
            if (client.channelSlug === channelSlug) {
                sendToClient(client.ws, { type: 'stream-ended' });
            }
        }
    });

    wss.on('connection', (ws) => {
        const wsId = genId('ws');
        clients.set(wsId, { ws, channelSlug: null, peerId: null, transportIds: [] });

        ws.on('message', (data) => handleMessage(wsId, data));
        ws.on('close', () => handleClose(wsId));
        ws.on('error', (err) => {
            console.warn('[BroadcastWS] ws error:', err.message);
            handleClose(wsId);
        });

        sendToClient(ws, { type: 'connected', wsId });
    });

    server.__broadcastWss = wss;
    console.log('[BroadcastWS] Attached to server, upgrading /ws/broadcast');
}

/**
 * Handle WebSocket upgrade for a specific request (called from index.js)
 */
function handleUpgrade(req, socket, head) {
    const server = socket.server;
    if (!server || !server.__broadcastWss) {
        socket.destroy();
        return;
    }
    server.__broadcastWss.handleUpgrade(req, socket, head, (ws) => {
        server.__broadcastWss.emit('connection', ws, req);
    });
}

module.exports = { attach, handleUpgrade };
