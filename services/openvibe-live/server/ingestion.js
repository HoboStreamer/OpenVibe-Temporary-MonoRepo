'use strict';

// openvibe-live — receives stream lifecycle events (push from openvibe-events
// subscription, or via direct internal POST). Updates live_streams /
// live_channels read-model so SSR pages stay in sync with openre-stream.

const model = require('./model');
const { STREAM_EVENT_TYPES } = require('@openvibe/contracts/stream-events');

function applyStreamEvent(envelope) {
    if (!envelope || !envelope.event_type || !envelope.payload) return { ok: false, reason: 'malformed envelope' };
    const t = envelope.event_type;
    const p = envelope.payload || {};
    const slug = p.channel_slug || (p.channel && p.channel.slug) || null;
    const channelId = p.channel_id || null;

    // Make sure channel row exists when we know its slug.
    if (slug) {
        model.upsertChannel({
            slug,
            display_name: p.channel_display_name || null,
            owner_user_id: p.creator_id || null,
            description: p.channel_description || null,
            metadata: p.channel_metadata || {},
        });
    }

    if (!p.stream_id) return { ok: false, reason: 'missing stream_id' };

    let patch = { id: p.stream_id, channel_slug: slug, channel_id: channelId, title: p.title || null, category: p.category || null, thumbnail_url: p.thumbnail_url || null, embed_url: p.embed_url || null };

    if (t === STREAM_EVENT_TYPES.CREATED)               patch.status = 'created';
    else if (t === STREAM_EVENT_TYPES.STARTED)          { patch.status = 'started'; patch.started_at = envelope.occurred_at || null; }
    else if (t === STREAM_EVENT_TYPES.MIRRORED_TO_LIVE) { model.recordMirror({ stream_id: p.stream_id, channel_slug: slug, details: { live_url: p.live_url } }); patch.status = patch.status || 'started'; }
    else if (t === STREAM_EVENT_TYPES.ENDED)            { patch.status = 'ended'; patch.ended_at = envelope.occurred_at || null; }
    else if (t === STREAM_EVENT_TYPES.VOD_ATTACHED)     { patch.vod_media_id = p.vod_media_id || null; }

    const stream = model.upsertStream(patch);
    return { ok: true, stream };
}

module.exports = { applyStreamEvent };
