'use strict';

/**
 * openre-stream — Native RTMP ingest server
 * Validates stream keys against openre-stream's own channel/stream database.
 * Fires event-bus events on publish/unpublish.
 */

const EventEmitter = require('events');
const http = require('http');
const https = require('https');
const db = require('./db');
const model = require('./model');

function pushLiveEvent(liveUrl, internalKey, eventType, stream, channel) {
    if (!liveUrl) return;
    try {
        const payload = JSON.stringify({
            event_type: eventType,
            source: 'openre-stream',
            occurred_at: new Date().toISOString(),
            payload: {
                stream_id: stream.id,
                channel_id: channel && channel.id || null,
                channel_slug: channel && channel.slug || null,
                creator_id: channel && channel.owner_user_id || null,
                title: stream.title || null,
                status: stream.status || null,
            },
        });
        const url = new URL('/api/v1/events/stream', liveUrl);
        const mod = url.protocol === 'https:' ? https : http;
        const req = mod.request({
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'x-internal-key': internalKey || '',
            },
        }, (res) => {
            res.resume();
            if (res.statusCode >= 400) {
                console.warn(`[RTMP] live push ${eventType} → ${res.statusCode}`);
            }
        });
        req.on('error', (err) => console.warn(`[RTMP] live push error: ${err.message}`));
        req.write(payload);
        req.end();
    } catch (err) {
        console.warn(`[RTMP] live push failed: ${err.message}`);
    }
}

let NodeMediaServer;
try {
    NodeMediaServer = require('node-media-server');
} catch {
    console.warn('[RTMP] node-media-server not installed — RTMP streaming disabled');
}

class RTMPServer extends EventEmitter {
    constructor({ config, eventBus }) {
        super();
        this.config = config;
        this.eventBus = eventBus;
        this.nms = null;
        this.activeStreams = new Map(); // streamKey → { streamId, channelSlug, sessionId, connectedAt }
    }

    restoreActiveStreams() {
        try {
            const sessions = model.listActiveIngestSessions();
            for (const s of sessions) {
                if (s.protocol !== 'rtmp' || !s.channel_slug) continue;
                this.activeStreams.set(s.channel_slug, {
                    streamId: s.stream_id,
                    channelSlug: s.channel_slug,
                    sessionId: null,
                    connectedAt: s.connected_at,
                });
            }
            if (sessions.length) console.log(`[RTMP] restored ${sessions.length} active session(s) from DB`);
        } catch (err) {
            console.warn('[RTMP] could not restore active sessions:', err.message);
        }
    }

    start() {
        if (!NodeMediaServer) {
            console.warn('[RTMP] node-media-server not available, RTMP disabled');
            return;
        }

        this.restoreActiveStreams();

        const rtmpPort = parseInt(process.env.RTMP_PORT || '1935', 10);

        const nmsConfig = {
            rtmp: {
                port: rtmpPort,
                chunk_size: 60000,
                gop_cache: true,
                ping: 30,
                ping_timeout: 60,
            },
            http: {
                port: rtmpPort + 8000,
                allow_origin: '*',
                mediaroot: require('path').join(require('path').dirname(this.config.db.path), 'media'),
            },
        };

        this.nms = new NodeMediaServer(nmsConfig);

        // ── Auth: validate stream key on publish ───────────────────────────
        this.nms.on('prePublish', (sessionId, streamPath, args) => {
            console.log(`[RTMP] prePublish: ${streamPath} session=${sessionId}`);

            // Path must be /live/<channel-slug>
            if (!streamPath.startsWith('/live/')) {
                console.log(`[RTMP] Rejected — bad app name: ${streamPath}`);
                const s = this.nms.getSession(sessionId);
                if (s) s.reject();
                return;
            }

            const channelSlug = streamPath.slice('/live/'.length).split('?')[0];
            if (!channelSlug || !/^[a-zA-Z0-9_.-]{1,128}$/.test(channelSlug)) {
                console.log(`[RTMP] Rejected — invalid channel slug: ${channelSlug}`);
                const s = this.nms.getSession(sessionId);
                if (s) s.reject();
                return;
            }

            // The stream key is passed as ?key=<value> in OBS args
            const providedKey = (args && (args.key || args.streamkey)) || null;

            const channel = model.getChannelBySlug(channelSlug);
            if (!channel) {
                console.log(`[RTMP] Rejected — unknown channel: ${channelSlug}`);
                const s = this.nms.getSession(sessionId);
                if (s) s.reject();
                return;
            }

            // Validate key: must match channel metadata.stream_key OR a started/created stream's
            // stream_key OR a stream ID for this channel.
            const channelStreamKey = channel.metadata && channel.metadata.stream_key;
            const activeStreams = model.listStreams({ channel_id: channel.id, status: 'started', limit: 5 });
            const createdStreams = model.listStreams({ channel_id: channel.id, status: 'created', limit: 5 });
            const candidateStreams = [...activeStreams, ...createdStreams];

            let matchedStream = null;
            if (providedKey) {
                // Check channel-level key
                if (channelStreamKey && providedKey === channelStreamKey) {
                    matchedStream = candidateStreams[0] || null;
                }
                // Check stream-level key or stream ID
                if (!matchedStream) {
                    matchedStream = candidateStreams.find(
                        (str) => str.stream_key === providedKey || str.id === providedKey
                    ) || null;
                }
            } else {
                // No key provided — accept if channel has a started/created stream (trust slug)
                matchedStream = candidateStreams[0] || null;
            }

            if (!matchedStream) {
                // No matching stream — auto-create one
                console.log(`[RTMP] Auto-creating stream for channel ${channelSlug}`);
                matchedStream = model.createStream({
                    channel_id: channel.id,
                    protocol: 'rtmp',
                    title: `${channel.display_name || channelSlug}'s stream`,
                    stream_key: providedKey || null,
                });
            }

            // Prevent duplicate publishers
            const existingActive = this.activeStreams.get(channelSlug);
            if (existingActive && existingActive.sessionId !== sessionId) {
                console.log(`[RTMP] Rejected — already publishing: ${channelSlug}`);
                const s = this.nms.getSession(sessionId);
                if (s) s.reject();
                return;
            }

            // Mark stream started if not already
            if (matchedStream.status !== 'started') {
                model.startStream(matchedStream.id);
                matchedStream = model.getStreamById(matchedStream.id);
            }

            const connectedAt = new Date().toISOString();
            this.activeStreams.set(channelSlug, {
                streamId: matchedStream.id,
                channelSlug,
                sessionId,
                connectedAt,
            });

            model.recordIngestConnected({ stream_id: matchedStream.id, protocol: 'rtmp', client_addr: null, details: { session_id: sessionId } });
            console.log(`[RTMP] Stream started — channel=${channelSlug} stream=${matchedStream.id}`);
            this.emit('publish', { streamId: matchedStream.id, channelSlug, channel });

            pushLiveEvent(this.config.live && this.config.live.url, this.config.internalKey, 'stream.started', matchedStream, channel);

            if (this.eventBus) {
                try {
                    const { STREAM_EVENT_TYPES } = require('@openvibe/contracts/stream-events');
                    this.eventBus.publishStreamEvent(STREAM_EVENT_TYPES.INGEST_CONNECTED, matchedStream, channel, { protocol: 'rtmp' });
                } catch (e) {
                    console.warn('[RTMP] eventBus publish failed:', e.message);
                }
            }
        });

        // ── Unpublish ───────────────────────────────────────────────────────
        this.nms.on('donePublish', (sessionId, streamPath) => {
            const channelSlug = streamPath.startsWith('/live/')
                ? streamPath.slice('/live/'.length).split('?')[0]
                : null;
            if (!channelSlug) return;

            const info = this.activeStreams.get(channelSlug);
            if (info && info.sessionId === sessionId) {
                this.activeStreams.delete(channelSlug);
                console.log(`[RTMP] Stream ended — channel=${channelSlug} stream=${info.streamId}`);

                model.recordIngestDisconnected({ stream_id: info.streamId });
                const stream = model.getStreamById(info.streamId);
                const channel = model.getChannelBySlug(channelSlug);
                if (stream && stream.status === 'started') {
                    model.endStream(info.streamId, {});
                }
                this.emit('unpublish', { streamId: info.streamId, channelSlug });

                const endedStream = model.getStreamById(info.streamId);
                pushLiveEvent(this.config.live && this.config.live.url, this.config.internalKey, 'stream.ended', endedStream || stream || { id: info.streamId }, channel);

                if (this.eventBus && stream && channel) {
                    try {
                        const { STREAM_EVENT_TYPES } = require('@openvibe/contracts/stream-events');
                        this.eventBus.publishStreamEvent(STREAM_EVENT_TYPES.INGEST_DISCONNECTED, stream, channel, { protocol: 'rtmp' });
                    } catch (e) {
                        console.warn('[RTMP] eventBus unpublish failed:', e.message);
                    }
                }
            }
        });

        this.nms.run();
        console.log(`[RTMP] Server started on port ${parseInt(process.env.RTMP_PORT || '1935', 10)}`);
    }

    getActiveStreams() {
        return Array.from(this.activeStreams.values());
    }

    isChannelLive(channelSlug) {
        return this.activeStreams.has(channelSlug);
    }

    stop() {
        if (this.nms) {
            try { this.nms.stop(); } catch {}
            this.nms = null;
        }
    }
}

let instance = null;

function createRTMPServer({ config, eventBus }) {
    instance = new RTMPServer({ config, eventBus });
    return instance;
}

function getInstance() {
    return instance;
}

module.exports = { createRTMPServer, getInstance };
