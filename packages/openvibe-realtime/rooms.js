'use strict';

function normalizeRoomName(value) {
    return String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9:_./-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
}

function roomGlobalChat() {
    return 'chat:global';
}

function roomStreamChat(streamId) {
    return normalizeRoomName(`chat:stream:${streamId}`);
}

function roomChannelChat(channelSlug) {
    return normalizeRoomName(`chat:channel:${channelSlug}`);
}

function roomDm(threadId) {
    return normalizeRoomName(`dm:${threadId}`);
}

function roomLiveStream(streamId) {
    return normalizeRoomName(`live:stream:${streamId}`);
}

function roomMedia(mediaId) {
    return normalizeRoomName(`media:${mediaId}`);
}

function roomClip(clipId) {
    return normalizeRoomName(`clip:${clipId}`);
}

function roomUser(userId) {
    return normalizeRoomName(`user:${userId}`);
}

function roomAdmin() {
    return 'admin';
}

function roomGame(gameId) {
    return normalizeRoomName(`game:${gameId}`);
}

function roomCanvas(canvasId) {
    return normalizeRoomName(`canvas:${canvasId}`);
}

function isPublicRoom(roomName) {
    const room = normalizeRoomName(roomName);
    if (!room) return false;
    return room === roomGlobalChat()
        || room.startsWith('public:')
        || room.startsWith('chat:stream:')
        || room.startsWith('chat:channel:')
        || room.startsWith('live:stream:')
        || room.startsWith('media:')
        || room.startsWith('clip:')
        || room.startsWith('game:')
        || room.startsWith('canvas:');
}

module.exports = {
    isPublicRoom,
    normalizeRoomName,
    roomAdmin,
    roomCanvas,
    roomChannelChat,
    roomClip,
    roomDm,
    roomGame,
    roomGlobalChat,
    roomLiveStream,
    roomMedia,
    roomStreamChat,
    roomUser,
};
