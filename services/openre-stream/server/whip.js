'use strict';

/**
 * openre-stream — WHIP (WebRTC-HTTP Ingestion Protocol) Handler
 *
 * POST   /whip/:channelSlug          — offer → answer (create session)
 * PATCH  /whip/:channelSlug/:resId   — trickle ICE candidates
 * DELETE /whip/:channelSlug/:resId   — terminate session
 *
 * Auth: ?key=<stream_key>  or  Authorization: Bearer <stream_key>
 */

const crypto = require('crypto');
const model = require('./model');
const sfu = require('./sfu');

let sdpTransform;
try {
    sdpTransform = require('sdp-transform');
} catch {
    console.warn('[WHIP] sdp-transform not found — WHIP endpoint disabled');
}

// resourceId → session
const sessions = new Map();

function genResourceId() {
    return crypto.randomBytes(12).toString('hex');
}

function getStreamKey(req) {
    const auth = req.headers['authorization'] || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return (req.query.key || '').trim();
}

function resourceUrl(req, channelSlug, resourceId) {
    const base = `${req.protocol}://${req.get('host')}`;
    return `${base}/whip/${channelSlug}/${resourceId}`;
}

function sendError(res, status, message) {
    res.status(status).json({ error: message });
}

// ── SDP helpers ──────────────────────────────────────────────────────────────

function extractDtlsParameters(sdpObj) {
    let fingerprint = sdpObj.fingerprint;
    let setup = sdpObj.setup;
    for (const media of sdpObj.media || []) {
        if (!fingerprint && media.fingerprint) fingerprint = media.fingerprint;
        if (!setup && media.setup) setup = media.setup;
    }
    if (!fingerprint) throw new Error('No DTLS fingerprint in SDP');

    // WHIP clients send actpass or active; we always connect as server (passive)
    let role = 'server';
    if (setup && String(setup).toLowerCase() === 'passive') role = 'client';

    return {
        role,
        fingerprints: [{
            algorithm: String(fingerprint.type || fingerprint.algorithm || '').toLowerCase(),
            value: fingerprint.hash || fingerprint.value || '',
        }],
    };
}

function extractRtpCapabilities(sdpObj) {
    const codecs = [];
    const headerExtensions = [];
    const seenExt = new Set();

    for (const media of sdpObj.media || []) {
        const kind = media.type; // 'audio' | 'video'
        if (kind !== 'audio' && kind !== 'video') continue;

        for (const codec of media.rtp || []) {
            const fmtpEntry = (media.fmtp || []).find(f => f.payload === codec.payload);
            const params = {};
            if (fmtpEntry) {
                fmtpEntry.config.split(';').forEach(p => {
                    const [k, v] = p.trim().split('=');
                    if (k) params[k.trim()] = v !== undefined ? v.trim() : true;
                });
            }
            const rtcpFeedback = (media.rtcpFb || [])
                .filter(f => f.payload === codec.payload)
                .map(f => ({ type: f.type, parameter: f.subtype || '' }));

            codecs.push({
                kind,
                mimeType: `${kind}/${codec.codec}`,
                preferredPayloadType: codec.payload,
                clockRate: codec.rate,
                channels: kind === 'audio' ? (codec.encoding ? parseInt(codec.encoding) : 1) : undefined,
                parameters: params,
                rtcpFeedback,
            });
        }

        for (const ext of media.ext || []) {
            if (!seenExt.has(ext.uri)) {
                seenExt.add(ext.uri);
                headerExtensions.push({ kind, uri: ext.uri, preferredId: ext.value });
            }
        }
    }

    return { codecs, headerExtensions };
}

function buildRtpParametersFromSdp(sdpObj, transportId, kind) {
    const media = (sdpObj.media || []).find(m => m.type === kind);
    if (!media) throw new Error(`No ${kind} media in SDP`);

    const mainCodec = media.rtp && media.rtp[0];
    if (!mainCodec) throw new Error(`No RTP codec for ${kind}`);

    const fmtpEntry = (media.fmtp || []).find(f => f.payload === mainCodec.payload);
    const parameters = {};
    if (fmtpEntry) {
        fmtpEntry.config.split(';').forEach(p => {
            const [k, v] = p.trim().split('=');
            if (k) parameters[k.trim()] = v !== undefined ? (isNaN(v) ? v.trim() : Number(v)) : true;
        });
    }

    const rtcpFeedback = (media.rtcpFb || [])
        .filter(f => f.payload === mainCodec.payload)
        .map(f => ({ type: f.type, parameter: f.subtype || '' }));

    const ssrcEntry = (media.ssrcs || []).find(s => s.attribute === 'cname');
    const ssrc = ssrcEntry ? ssrcEntry.id : Math.floor(Math.random() * 0xffffffff);

    const headerExtensions = (media.ext || []).map(ext => ({
        uri: ext.uri,
        id: ext.value,
    }));

    return {
        mid: media.mid !== undefined ? String(media.mid) : undefined,
        codecs: [{
            mimeType: `${kind}/${mainCodec.codec}`,
            payloadType: mainCodec.payload,
            clockRate: mainCodec.rate,
            channels: kind === 'audio' ? (mainCodec.encoding ? parseInt(mainCodec.encoding) : 1) : undefined,
            parameters,
            rtcpFeedback,
        }],
        headerExtensions,
        encodings: [{ ssrc }],
        rtcp: { cname: ssrcEntry ? (media.ssrcs.find(s => s.attribute === 'cname') || {}).value || '' : 'openre', reducedSize: true },
    };
}

function buildSdpAnswer(transportParams, offerSdpObj, kind) {
    // Build minimal SDP answer from transport ICE/DTLS params
    const { iceParameters, iceCandidates, dtlsParameters, id: transportId } = transportParams;

    const candidateLines = (iceCandidates || []).map(c =>
        `a=candidate:${c.foundation} ${c.component} ${c.protocol} ${c.priority} ${c.ip} ${c.port} typ ${c.type}${c.relatedAddress ? ` raddr ${c.relatedAddress} rport ${c.relatedPort}` : ''}`
    ).join('\r\n');

    // Collect media sections from offer
    const mediaSections = (offerSdpObj.media || []).map(m => {
        if (m.type !== 'audio' && m.type !== 'video') return null;
        const mainRtp = m.rtp && m.rtp[0];
        if (!mainRtp) return null;

        const payloads = m.payloads || String(mainRtp.payload);
        const rtpLine = `a=rtpmap:${mainRtp.payload} ${mainRtp.codec}/${mainRtp.rate}${m.type === 'audio' && mainRtp.encoding ? '/' + mainRtp.encoding : ''}`;

        const fmtpLines = (m.fmtp || []).map(f => `a=fmtp:${f.payload} ${f.config}`).join('\r\n');
        const rtcpFbLines = (m.rtcpFb || []).map(f => `a=rtcp-fb:${f.payload} ${f.type}${f.subtype ? ' ' + f.subtype : ''}`).join('\r\n');
        const extLines = (m.ext || []).map(e => `a=extmap:${e.value} ${e.uri}`).join('\r\n');

        return [
            `m=${m.type} 9 UDP/TLS/RTP/SAVPF ${payloads}`,
            'c=IN IP4 0.0.0.0',
            'a=rtcp:9 IN IP4 0.0.0.0',
            candidateLines,
            `a=ice-ufrag:${iceParameters.usernameFragment}`,
            `a=ice-pwd:${iceParameters.password}`,
            'a=ice-options:trickle',
            `a=fingerprint:${dtlsParameters.fingerprints[0].algorithm} ${dtlsParameters.fingerprints[0].value}`,
            'a=setup:active',
            m.mid !== undefined ? `a=mid:${m.mid}` : '',
            extLines,
            'a=recvonly',
            'a=rtcp-mux',
            rtpLine,
            fmtpLines,
            rtcpFbLines,
        ].filter(Boolean).join('\r\n');
    }).filter(Boolean);

    const offerMids = (offerSdpObj.media || []).map(m => m.mid).filter(m => m !== undefined);
    const bundleGroup = offerMids.length ? `a=group:BUNDLE ${offerMids.join(' ')}` : '';

    return [
        'v=0',
        `o=openre-stream 0 0 IN IP4 0.0.0.0`,
        's=openre-stream',
        't=0 0',
        bundleGroup,
        'a=msid-semantic: WMS',
        ...mediaSections,
    ].filter(Boolean).join('\r\n') + '\r\n';
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanupSession(resourceId, { reason = 'unknown' } = {}) {
    const session = sessions.get(resourceId);
    if (!session) return;
    sessions.delete(resourceId);
    clearInterval(session.heartbeatTimer);

    const { channelSlug, streamId, roomId } = session;
    console.log(`[WHIP] Session ${resourceId} (channel=${channelSlug}) terminated — ${reason}`);

    // Check if any other sessions are still active for this channel
    const remaining = Array.from(sessions.values()).filter(s => s.channelSlug === channelSlug);
    if (remaining.length === 0 && streamId) {
        try {
            const stream = model.getStreamById(streamId);
            if (stream && stream.status === 'started') {
                model.endStream(streamId);
                console.log(`[WHIP] Stream ${streamId} ended`);
            }
        } catch (err) {
            console.warn('[WHIP] Error ending stream:', err.message);
        }
        try { sfu.closeRoom(roomId); } catch {}
    }
}

// ── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /whip/:channelSlug
 * Body: SDP offer (text/plain or application/sdp)
 */
async function handleOffer(req, res) {
    if (!sdpTransform) return sendError(res, 503, 'WHIP not available');
    if (!sfu.ready) return sendError(res, 503, 'SFU not ready');

    const { channelSlug } = req.params;
    const streamKey = getStreamKey(req);
    if (!streamKey) return sendError(res, 401, 'Stream key required (?key= or Authorization: Bearer)');

    const channel = model.getChannelBySlug(channelSlug);
    if (!channel) return sendError(res, 404, 'Channel not found');
    if (channel.stream_key !== streamKey) return sendError(res, 403, 'Invalid stream key');

    const offerSdp = typeof req.body === 'string' ? req.body : req.body && req.body.toString ? req.body.toString() : '';
    if (!offerSdp.includes('v=0')) return sendError(res, 400, 'Invalid SDP offer');

    let offerObj;
    try { offerObj = sdpTransform.parse(offerSdp); }
    catch (err) { return sendError(res, 400, `SDP parse error: ${err.message}`); }

    const resourceId = genResourceId();
    const roomId = `channel-${channelSlug}`;
    const peerId = `whip-${resourceId}`;

    try {
        // Create or get existing stream record
        let stream = model.listStreams({ channel_id: channel.id, status: 'started', limit: 1 })[0];
        if (!stream) {
            stream = model.createStream({ channel_id: channel.id, protocol: 'whip', stream_key: streamKey });
            model.startStream(stream.id);
            stream = model.getStreamById(stream.id);
        }

        // Create mediasoup transport
        const transportParams = await sfu.createTransport(roomId, peerId, { iceConsentTimeout: 0 });

        // Extract DTLS parameters from offer
        const dtlsParameters = extractDtlsParameters(offerObj);
        await sfu.connectTransport(roomId, peerId, transportParams.id, dtlsParameters);

        // Create producers for each media type in the offer
        const producerIds = {};
        for (const media of offerObj.media || []) {
            const kind = media.type;
            if (kind !== 'audio' && kind !== 'video') continue;
            if (media.direction === 'inactive' || media.direction === 'recvonly') continue;

            try {
                const rtpParameters = buildRtpParametersFromSdp(offerObj, transportParams.id, kind);
                const { id: producerId } = await sfu.produce(roomId, peerId, transportParams.id, kind, rtpParameters);
                producerIds[kind] = producerId;
                console.log(`[WHIP] Producer ${producerId} (${kind}) created for channel ${channelSlug}`);
            } catch (err) {
                console.warn(`[WHIP] Failed to create ${kind} producer:`, err.message);
            }
        }

        // Build SDP answer
        const answerSdp = buildSdpAnswer(transportParams, offerObj);

        const session = {
            resourceId,
            channelSlug,
            channelId: channel.id,
            streamId: stream.id,
            roomId,
            peerId,
            transportId: transportParams.id,
            producerIds,
            iceReady: true,
            heartbeatTimer: null,
        };

        // Heartbeat: update stream status every 30s
        session.heartbeatTimer = setInterval(() => {
            try { model.getStreamById(stream.id); } catch {}
        }, 30000);

        sessions.set(resourceId, session);

        console.log(`[WHIP] Session ${resourceId} created for channel ${channelSlug} stream ${stream.id}`);

        res.status(201)
            .set('Location', resourceUrl(req, channelSlug, resourceId))
            .set('Access-Control-Expose-Headers', 'Location')
            .set('Content-Type', 'application/sdp')
            .send(answerSdp);

    } catch (err) {
        console.error('[WHIP] handleOffer error:', err.message);
        await cleanupSession(resourceId, { reason: `offer-error: ${err.message}` });
        return sendError(res, 500, err.message);
    }
}

/**
 * PATCH /whip/:channelSlug/:resourceId
 * Body: trickle ICE candidate (application/trickle-ice-sdpfrag)
 * Per RFC 9725 we accept but don't need to process (mediasoup handles via transport)
 */
function handleTrickle(req, res) {
    const { resourceId } = req.params;
    if (!sessions.has(resourceId)) return sendError(res, 404, 'Session not found');
    // Accept trickle ICE — mediasoup transports handle ICE internally
    res.status(204).end();
}

/**
 * DELETE /whip/:channelSlug/:resourceId
 * Terminate a WHIP session
 */
async function handleDelete(req, res) {
    const { resourceId } = req.params;
    if (!sessions.has(resourceId)) return res.status(404).json({ error: 'Session not found' });
    await cleanupSession(resourceId, { reason: 'client-delete' });
    res.status(200).end();
}

/**
 * Get active session info for a channel (used by broadcast-ws)
 */
function getSessionForChannel(channelSlug) {
    for (const session of sessions.values()) {
        if (session.channelSlug === channelSlug && session.iceReady) return session;
    }
    return null;
}

// ── WHEP (viewer egress) ─────────────────────────────────────────────────────

const viewerSessions = new Map();

function buildWhepSdpAnswer(transportParams, consumerInfos, offerSdpObj) {
    const { iceParameters, iceCandidates, dtlsParameters } = transportParams;

    const candidateLines = (iceCandidates || []).map(c =>
        `a=candidate:${c.foundation} ${c.component} ${c.protocol} ${c.priority} ${c.ip} ${c.port} typ ${c.type}${c.relatedAddress ? ` raddr ${c.relatedAddress} rport ${c.relatedPort}` : ''}`
    ).join('\r\n');

    const mediaSections = [];
    const bundleMids = [];

    for (const { consumer, offerMedia } of consumerInfos) {
        const { kind, rtpParameters } = consumer;
        const mainCodec = rtpParameters.codecs && rtpParameters.codecs[0];
        if (!mainCodec) continue;

        const mid = offerMedia && offerMedia.mid !== undefined ? String(offerMedia.mid) : kind;
        bundleMids.push(mid);

        const pt = mainCodec.payloadType;
        const mimeType = mainCodec.mimeType || '';
        const codecName = mimeType.split('/')[1] || 'unknown';
        const clockRate = mainCodec.clockRate;
        const channels = kind === 'audio' && mainCodec.channels > 1 ? `/${mainCodec.channels}` : '';

        const fmtpParams = mainCodec.parameters
            ? Object.entries(mainCodec.parameters).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${v}`).join(';')
            : '';

        const rtcpFbLines = (mainCodec.rtcpFeedback || [])
            .map(fb => `a=rtcp-fb:${pt} ${fb.type}${fb.parameter ? ' ' + fb.parameter : ''}`)
            .join('\r\n');

        const extLines = (rtpParameters.headerExtensions || [])
            .map(ext => `a=extmap:${ext.id} ${ext.uri}`)
            .join('\r\n');

        const ssrc = rtpParameters.encodings && rtpParameters.encodings[0] && rtpParameters.encodings[0].ssrc;
        const cname = (rtpParameters.rtcp && rtpParameters.rtcp.cname) || 'openre';

        const section = [
            `m=${kind} 9 UDP/TLS/RTP/SAVPF ${pt}`,
            'c=IN IP4 0.0.0.0',
            'a=rtcp:9 IN IP4 0.0.0.0',
            candidateLines,
            `a=ice-ufrag:${iceParameters.usernameFragment}`,
            `a=ice-pwd:${iceParameters.password}`,
            'a=ice-options:trickle',
            `a=fingerprint:${dtlsParameters.fingerprints[0].algorithm} ${dtlsParameters.fingerprints[0].value}`,
            'a=setup:active',
            `a=mid:${mid}`,
            extLines,
            'a=sendonly',
            'a=rtcp-mux',
            `a=rtpmap:${pt} ${codecName}/${clockRate}${channels}`,
            fmtpParams ? `a=fmtp:${pt} ${fmtpParams}` : '',
            rtcpFbLines,
            ssrc ? `a=ssrc:${ssrc} cname:${cname}` : '',
            ssrc ? `a=ssrc:${ssrc} msid:openre-${kind} openre-${kind}` : '',
        ].filter(Boolean).join('\r\n');

        mediaSections.push(section);
    }

    const bundleGroup = bundleMids.length ? `a=group:BUNDLE ${bundleMids.join(' ')}` : '';

    return [
        'v=0',
        'o=openre-stream 0 0 IN IP4 0.0.0.0',
        's=openre-stream',
        't=0 0',
        bundleGroup,
        'a=msid-semantic: WMS',
        ...mediaSections,
    ].filter(Boolean).join('\r\n') + '\r\n';
}

/**
 * POST /whep/:channelSlug
 * Body: SDP offer from viewer (recvonly) — returns SDP answer with consumer RTP params
 */
async function handleWhepOffer(req, res) {
    if (!sdpTransform) return sendError(res, 503, 'WHEP not available');
    if (!sfu.ready) return sendError(res, 503, 'SFU not ready');

    const { channelSlug } = req.params;
    const roomId = `channel-${channelSlug}`;

    const producers = sfu.getProducers(roomId);
    if (producers.length === 0) return sendError(res, 404, 'No active stream for this channel');

    const offerSdp = typeof req.body === 'string' ? req.body : (req.body && req.body.toString ? req.body.toString() : '');
    if (!offerSdp.includes('v=0')) return sendError(res, 400, 'Invalid SDP offer');

    let offerObj;
    try { offerObj = sdpTransform.parse(offerSdp); }
    catch (err) { return sendError(res, 400, `SDP parse error: ${err.message}`); }

    const resourceId = genResourceId();
    const peerId = `whep-${resourceId}`;

    try {
        const transportParams = await sfu.createTransport(roomId, peerId);
        const dtlsParameters = extractDtlsParameters(offerObj);
        await sfu.connectTransport(roomId, peerId, transportParams.id, dtlsParameters);

        // Use viewer's RTP capabilities (extracted from offer) for consume()
        const viewerCaps = extractRtpCapabilities(offerObj);

        const consumerInfos = [];
        for (const producer of producers) {
            const offerMedia = (offerObj.media || []).find(m => m.type === producer.kind) || { mid: producer.kind, type: producer.kind };
            try {
                const consumer = await sfu.consume(roomId, peerId, transportParams.id, producer.id, viewerCaps);
                consumerInfos.push({ consumer, offerMedia });
            } catch (err) {
                console.warn(`[WHEP] Failed to create ${producer.kind} consumer:`, err.message);
            }
        }

        if (consumerInfos.length === 0) return sendError(res, 503, 'No consumable producers');

        const answerSdp = buildWhepSdpAnswer(transportParams, consumerInfos, offerObj);

        viewerSessions.set(resourceId, {
            resourceId, channelSlug, roomId, peerId,
            transportId: transportParams.id,
            consumerIds: consumerInfos.map(c => c.consumer.id),
        });

        console.log(`[WHEP] Viewer session ${resourceId} created for channel ${channelSlug}`);

        const loc = `${req.protocol}://${req.get('host')}/whep/${channelSlug}/${resourceId}`;
        res.status(201)
            .set('Location', loc)
            .set('Access-Control-Allow-Origin', '*')
            .set('Access-Control-Expose-Headers', 'Location')
            .set('Content-Type', 'application/sdp')
            .send(answerSdp);

    } catch (err) {
        console.error('[WHEP] handleWhepOffer error:', err.message);
        return sendError(res, 500, err.message);
    }
}

/**
 * DELETE /whep/:channelSlug/:resourceId
 * End a viewer session
 */
function handleWhepDelete(req, res) {
    const { resourceId } = req.params;
    if (!viewerSessions.has(resourceId)) return res.status(404).json({ error: 'Session not found' });
    viewerSessions.delete(resourceId);
    res.status(200).end();
}

module.exports = { handleOffer, handleTrickle, handleDelete, getSessionForChannel, handleWhepOffer, handleWhepDelete };
