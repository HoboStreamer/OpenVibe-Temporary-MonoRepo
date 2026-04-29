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

function roomChat(chatRoomId) {
    return normalizeRoomName(`chat:room:${chatRoomId}`);
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

function roomChannel(channelId) {
    return normalizeRoomName(`channel:${channelId}`);
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

function roomPublicSpace(spaceId) {
    return normalizeRoomName(`public:space:${spaceId}`);
}

function roomSpace(spaceId) {
    return normalizeRoomName(`space:${spaceId}`);
}

function roomPublicThread(threadId) {
    return normalizeRoomName(`public:thread:${threadId}`);
}

function roomThread(threadId) {
    return normalizeRoomName(`thread:${threadId}`);
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
        || room.startsWith('channel:')
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
    roomChannel,
    roomChat,
    roomCanvas,
    roomChannelChat,
    roomClip,
    roomDm,
    roomGame,
    roomGlobalChat,
    roomLiveStream,
    roomMedia,
    roomPublicSpace,
    roomPublicThread,
    roomSpace,
    roomStreamChat,
    roomThread,
    roomUser,
};
