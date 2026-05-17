'use strict';

/**
 * openvibe-chat — WebSocket real-time push
 *
 * Augments the existing HTTP polling API with a WebSocket server.
 * Clients connect to /ws/chat, join rooms, and receive pushed messages.
 *
 * Wire protocol (JSON messages):
 *   client → { type: 'join', roomId, token? }
 *   server → { type: 'joined', roomId, userId, displayName }
 *   client → { type: 'leave', roomId }
 *   client → { type: 'ping' }
 *   server → { type: 'pong' }
 *   server → { type: 'message', roomId, message: { id, content, user_id, display_name, created_at } }
 *   server → { type: 'error', message }
 */

const crypto = require('crypto');

let WebSocket;
let WebSocketServer;
try {
    const ws = require('ws');
    WebSocket = ws.WebSocket || ws;
    WebSocketServer = ws.WebSocketServer || ws.Server;
} catch {
    console.warn('[chat-ws] ws package not available — WebSocket push disabled');
}

// roomId → Set<peerId>
const roomPeers = new Map();
// peerId → { ws, userId, displayName, rooms: Set<roomId> }
const peers = new Map();

let wss = null;
let model = null;

function genPeerId() {
    return `peer_${crypto.randomBytes(8).toString('hex')}`;
}

function send(ws, obj) {
    try {
        if (ws.readyState === (WebSocket && WebSocket.OPEN || 1)) {
            ws.send(JSON.stringify(obj));
        }
    } catch { /* ignore */ }
}

/**
 * Broadcast a message object to all peers subscribed to a room.
 * Called by routes.js after a message is persisted.
 */
function broadcastToRoom(roomId, messageObj) {
    const peerSet = roomPeers.get(String(roomId));
    if (!peerSet) return;
    const payload = JSON.stringify({ type: 'message', roomId: String(roomId), message: messageObj });
    for (const peerId of peerSet) {
        const peer = peers.get(peerId);
        if (peer) {
            try {
                if (peer.ws.readyState === (WebSocket && WebSocket.OPEN || 1)) {
                    peer.ws.send(payload);
                }
            } catch { /* ignore */ }
        }
    }
}

/**
 * Return the number of peers currently subscribed to a room.
 */
function roomViewerCount(roomId) {
    const s = roomPeers.get(String(roomId));
    return s ? s.size : 0;
}

function joinRoom(peerId, roomId) {
    const peer = peers.get(peerId);
    if (!peer) return;
    const rid = String(roomId);
    peer.rooms.add(rid);
    if (!roomPeers.has(rid)) roomPeers.set(rid, new Set());
    roomPeers.get(rid).add(peerId);
}

function leaveRoom(peerId, roomId) {
    const peer = peers.get(peerId);
    if (!peer) return;
    const rid = String(roomId);
    peer.rooms.delete(rid);
    const ps = roomPeers.get(rid);
    if (ps) {
        ps.delete(peerId);
        if (ps.size === 0) roomPeers.delete(rid);
    }
}

function removePeer(peerId) {
    const peer = peers.get(peerId);
    if (!peer) return;
    for (const roomId of peer.rooms) {
        leaveRoom(peerId, roomId);
    }
    peers.delete(peerId);
}

function handleConnection(ws) {
    const peerId = genPeerId();
    peers.set(peerId, { ws, userId: null, displayName: 'Guest', rooms: new Set() });

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === 'ping') {
            send(ws, { type: 'pong' });
            return;
        }

        if (msg.type === 'join') {
            const roomId = String(msg.roomId || msg.room_id || 'global');
            if (!roomId) {
                send(ws, { type: 'error', message: 'roomId required' });
                return;
            }
            // Verify room exists
            if (model) {
                const room = model.getRoom(roomId);
                if (!room) {
                    send(ws, { type: 'error', message: 'room not found' });
                    return;
                }
            }
            const peer = peers.get(peerId);
            if (peer) {
                // Optional display name from join payload
                if (msg.displayName) peer.displayName = String(msg.displayName).slice(0, 64);
                if (msg.userId) peer.userId = String(msg.userId).slice(0, 64);
            }
            joinRoom(peerId, roomId);
            send(ws, {
                type: 'joined',
                roomId,
                peerId,
                userId: peer && peer.userId || null,
                displayName: peer && peer.displayName || 'Guest',
                viewerCount: roomViewerCount(roomId),
            });
            return;
        }

        if (msg.type === 'leave') {
            const roomId = String(msg.roomId || msg.room_id || '');
            if (roomId) leaveRoom(peerId, roomId);
            send(ws, { type: 'left', roomId });
            return;
        }
    });

    ws.on('close', () => removePeer(peerId));
    ws.on('error', () => removePeer(peerId));
}

/**
 * Attach a WebSocket server to an http.Server instance.
 */
function attach(server, chatModel) {
    if (!WebSocketServer) {
        console.warn('[chat-ws] WebSocket server not available (ws not installed)');
        return;
    }
    model = chatModel;
    wss = new WebSocketServer({ noServer: true });
    wss.on('connection', handleConnection);
    console.log('[chat-ws] WebSocket server ready');
}

/**
 * Handle HTTP upgrade for /ws/chat path.
 */
function handleUpgrade(req, socket, head) {
    if (!wss) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
    });
}

module.exports = { attach, handleUpgrade, broadcastToRoom, roomViewerCount };
