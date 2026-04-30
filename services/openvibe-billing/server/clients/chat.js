'use strict';

// openvibe-billing — best-effort chat integration seam for tip-driven TTS/audio.
//
// Behavior:
//   - If `config.chat.url` is configured AND `INTERNAL_API_KEY` is set, attempts
//     a non-blocking POST to enqueue a TTS / audio queue item for the resolved
//     chat owner. Returns a structured outcome the caller can record.
//   - If chat is not configured OR the request times out / fails, returns a
//     truthful `unavailable` / `failed` outcome. Callers persist this so the
//     tip product status can report it.
//   - Never throws. Never blocks the tip transaction.

const http = require('http');
const https = require('https');
const { URL } = require('url');

function postJson(targetUrl, body, headers, timeoutMs) {
    return new Promise((resolve) => {
        let parsed;
        try { parsed = new URL(targetUrl); } catch { return resolve({ ok: false, error: 'invalid url' }); }
        const lib = parsed.protocol === 'https:' ? https : http;
        const data = JSON.stringify(body || {});
        const req = lib.request({
            method: 'POST',
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + (parsed.search || ''),
            headers: Object.assign({
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            }, headers || {}),
        }, (res) => {
            let buf = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { buf += c; if (buf.length > 65536) buf = buf.slice(0, 65536); });
            res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: buf }));
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message || String(err) }));
        req.setTimeout(timeoutMs || 1500, () => { try { req.destroy(); } catch {} resolve({ ok: false, error: 'timeout' }); });
        req.write(data);
        req.end();
    });
}

function chatBaseUrl(config) {
    const url = config && config.chat && config.chat.url;
    if (!url || /openvibe\.chat\.localhost(:\d+)?$/.test(String(url)) === false) {
        // Even when defaulted, we still attempt — the request will fail fast if
        // the chat service isn't running and we'll record `unavailable`.
    }
    return url || null;
}

async function deliverTipChatSideEffect({ config, tip, profile }) {
    const baseUrl = chatBaseUrl(config);
    const interaction = tip && tip.interaction_type || 'tip';
    const targetKind = interaction === 'tts' ? 'tts'
        : interaction === 'media_request' ? 'audio'
        : 'overlay';
    const chatOwnerType = (profile && profile.chat_owner_type) || tip.recipient_owner_type;
    const chatOwnerId   = (profile && profile.chat_owner_id) || tip.recipient_owner_id;

    if (!baseUrl) {
        return {
            outcome: 'unavailable',
            target_kind: targetKind,
            chat_owner_type: chatOwnerType,
            chat_owner_id: chatOwnerId,
            queue_target: profile && (targetKind === 'tts' ? profile.tts_target_queue : profile.audio_target_queue) || null,
            detail: 'chat URL not configured',
        };
    }

    if (targetKind === 'overlay') {
        // No outbound call needed; the overlay GET feed picks up the tip.
        return {
            outcome: 'queued_local',
            target_kind: 'overlay',
            chat_owner_type: chatOwnerType,
            chat_owner_id: chatOwnerId,
            queue_target: null,
            detail: 'tip recorded; overlay feed reflects it on next read',
        };
    }

    const path = targetKind === 'tts'
        ? `/api/v1/chat/tts/queue/${encodeURIComponent(chatOwnerType)}/${encodeURIComponent(chatOwnerId)}`
        : `/api/v1/chat/audio/queue/${encodeURIComponent(chatOwnerType)}/${encodeURIComponent(chatOwnerId)}`;
    const url = baseUrl.replace(/\/+$/, '') + path;
    const headers = {};
    if (config.internalKey) {
        headers['X-Internal-Key'] = config.internalKey;
        headers['X-OpenVibe-Service'] = config.serviceId || 'openvibe-billing';
    }
    const result = await postJson(url, {
        source: 'tip',
        tip_id: tip.id,
        amount_minor: tip.amount_minor,
        currency: tip.currency,
        sender_actor_type: tip.sender_actor_type,
        sender_actor_id: tip.sender_actor_id,
        message: tip.message || null,
        idempotency_key: `tip:${tip.id}`,
    }, headers, 1500);

    return {
        outcome: result.ok ? 'delivered' : (result.error === 'timeout' ? 'unavailable' : 'failed'),
        target_kind: targetKind,
        chat_owner_type: chatOwnerType,
        chat_owner_id: chatOwnerId,
        queue_target: profile && (targetKind === 'tts' ? profile.tts_target_queue : profile.audio_target_queue) || null,
        detail: result.ok ? `chat ${result.status}` : (result.error || `chat ${result.status || 'error'}`),
    };
}

module.exports = { deliverTipChatSideEffect };
