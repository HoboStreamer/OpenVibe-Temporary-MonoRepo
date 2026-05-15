/**
 * openvibe.live — realtime client integration
 *
 * Subscribes to openvibe-realtime via SSE (EventSource) and updates the page
 * with live stream events, community pulse, VOD/clip cards, and chat messages.
 *
 * Topics subscribed (homepage): global:live, community:pulse
 * Topics subscribed (stream page): channel:<slug>, stream:<id>, chat:stream:<id>
 *
 * The SSR page renders the initial state; this file mutates DOM after real
 * events arrive. Graceful fallback when EventSource is unavailable.
 *
 * No module system — plain IIFE, no bundler.
 * Loaded via <script src="/js/realtime.js?v=20260504-3"> in the page shell.
 */
(function () {
    'use strict';

    // ── configuration ─────────────────────────────────────────
    var REALTIME_URL = (window.OPENVIBE_CONFIG && window.OPENVIBE_CONFIG.realtimeUrl) || '';
    var SSE_ENDPOINT = REALTIME_URL
        ? REALTIME_URL.replace(/\/$/, '') + '/events'
        : '/events';

    // Determine topics from page-level data attributes
    var pageStreamId   = document.body && document.body.getAttribute('data-stream-id');
    var pageStreamSlug = document.body && document.body.getAttribute('data-channel-slug');
    var TOPICS = 'global:live,community:pulse';
    if (pageStreamId)   TOPICS += ',stream:' + encodeURIComponent(pageStreamId) + ',chat:stream:' + encodeURIComponent(pageStreamId);
    if (pageStreamSlug) TOPICS += ',channel:' + encodeURIComponent(pageStreamSlug);

    var RECONNECT_BASE_MS = 2000;
    var RECONNECT_MAX_MS  = 60000;

    // ── helpers ───────────────────────────────────────────────
    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[openvibe-rt]');
        console.log.apply(console, args);
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Canonical alias normalization — mirrors @openvibe/contracts/events.js EVENT_ALIASES.
    // (browser IIFE cannot require() modules, so this must stay in sync manually)
    var ALIASES = {
        'stream.vod_attached':        'stream.vod.attached',
        'stream.ingest_connected':    'stream.ingest.connected',
        'stream.ingest_disconnected': 'stream.ingest.disconnected',
        'stream.mirrored_to_live':    'stream.mirrored_to_live',
        'community.thread.created':   'thread.created',
        'community.post.created':     'comment.created',
        'community.paste.created':    'paste.created',
        'community.paste.updated':    'paste.updated',
        'chat.message.created':       'chat.message.sent',
        'chat.message_created':       'chat.message.sent',
        'chat.msg':                   'chat.message.sent',
        'vod.attached':               'stream.vod.attached',
        'clip.materialization_completed': 'clip.materialized',
        'discord.message.created':    'discord.message.received',
        'discord.message_created':    'discord.message.received',
        'media.upload_completed':     'media.processing.completed',
        'tips.tip.posted':            'billing.tip.sent',
        'tips.tip.created':           'billing.tip.sent',
    };
    function normalizeName(name) {
        var lower = String(name || '').toLowerCase().trim();
        return ALIASES[lower] || lower.replace(/[^a-z0-9.]/g, '.');
    }

    function formatCount(n) {
        var v = Number(n) || 0;
        if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
        if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
        return String(v);
    }

    function timeAgo(ts) {
        if (!ts) return 'just now';
        var delta = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
        if (delta < 60)  return delta + 's ago';
        if (delta < 3600) return Math.floor(delta / 60) + 'm ago';
        if (delta < 86400) return Math.floor(delta / 3600) + 'h ago';
        return Math.floor(delta / 86400) + 'd ago';
    }

    function exponentialBackoff(attempt) {
        var raw = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS);
        return raw + raw * 0.2 * (Math.random() * 2 - 1);
    }

    // ── state ─────────────────────────────────────────────────
    var reconnectAttempt = 0;
    var stopped = false;
    var source = null;

    var liveCards = {};  // streamId → article element
    var vodSeen   = {};  // mediaId  → bool (prevents duplicate VOD insertions)
    var clipSeen  = {};  // clipId   → bool

    // ── DOM helpers ───────────────────────────────────────────
    function findLiveNowGrid() {
        return document.querySelector('[data-live-now-grid]')
            || document.querySelector('.card-grid[data-live]')
            || null;
    }

    function findCommunityPulseGrid() {
        return document.querySelector('[data-community-pulse-grid]')
            || document.querySelector('[data-community-pulse]')
            || null;
    }

    function findVodGrid() {
        return document.querySelector('[data-vod-grid]')
            || document.querySelector('[data-recent-vods]')
            || null;
    }

    function findClipGrid() {
        return document.querySelector('[data-clip-grid]')
            || document.querySelector('[data-recent-clips]')
            || null;
    }

    function findChatMessages() {
        return document.querySelector('[data-chat-messages]')
            || document.querySelector('[data-stream-chat]')
            || null;
    }

    function findLiveCountBadge() {
        return document.querySelector('[data-live-count]') || null;
    }

    function findStreamCard(streamId) {
        return document.querySelector('[data-stream-id="' + streamId + '"]') || null;
    }

    function updateLiveCount(delta) {
        var badge = findLiveCountBadge();
        if (!badge) return;
        var current = parseInt(badge.textContent, 10) || 0;
        var next = Math.max(0, current + delta);
        badge.textContent = String(next);
    }

    function setStreamBadge(card, status) {
        var badge = card.querySelector('[data-stream-status-badge]');
        if (!badge) return;
        badge.className = badge.className.replace(/\bpill\S*/g, '').trim();
        if (status === 'live') {
            badge.className += ' pill live';
            badge.textContent = 'Live now';
        } else if (status === 'ingest') {
            badge.className += ' pill warn';
            badge.textContent = 'Connecting…';
        } else {
            badge.className += ' pill muted';
            badge.textContent = 'Ended';
        }
    }

    function buildStreamCard(payload) {
        var streamId = payload && (payload.stream_id || payload.id);
        var slug = payload && payload.channel_slug || '';
        var channelName = payload && payload.channel_name || payload && payload.channel_slug || 'Creator';
        var title = payload && payload.title || 'Untitled stream';
        var viewers = formatCount(payload && payload.viewer_count || 0);
        var category = escHtml(payload && payload.category || '');
        var channelHref = slug ? '/@' + encodeURIComponent(slug) : '/channels';
        var streamHref = slug && streamId ? '/@' + encodeURIComponent(slug) + '/s/' + encodeURIComponent(streamId) : channelHref;

        var article = document.createElement('article');
        article.className = 'glass-card is-inline';
        article.setAttribute('data-stream-id', streamId || '');
        article.setAttribute('data-live-rt', '1');
        article.innerHTML =
            '<div class="media-thumb">' +
                '<div class="media-fallback-copy">' +
                    '<span class="media-kicker">Live now</span>' +
                    '<strong>' + escHtml(title) + '</strong>' +
                    '<span>' + escHtml(channelName) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="pill-row">' +
                '<span class="pill live" data-stream-status-badge>Live now</span>' +
                '<span class="pill soft">' + viewers + ' watching</span>' +
                (category ? '<span class="pill muted">' + category + '</span>' : '') +
            '</div>' +
            '<a class="card-link" href="' + escHtml(streamHref) + '">' +
                '<h3 class="card-title">' + escHtml(title) + '</h3>' +
            '</a>' +
            '<div class="card-kicker">' +
                '<a class="link-inline" href="' + escHtml(channelHref) + '">' + escHtml(channelName) + '</a>' +
                ' · just started' +
            '</div>' +
            '<div class="card-footer">' +
                '<a class="link-inline" href="' + escHtml(streamHref) + '">Watch →</a>' +
            '</div>';
        return article;
    }

    function buildVodCard(payload) {
        var p = payload || {};
        var mediaId     = p.media_id || p.vod_id || p.id || '';
        var slug        = p.channel_slug || '';
        var channelName = p.channel_name || slug || 'Creator';
        var title       = p.title || 'VOD';
        var duration    = p.duration_seconds ? Math.floor(p.duration_seconds / 60) + 'm' : '';
        var href        = slug ? '/@' + encodeURIComponent(slug) + '/vods' : '/vods';

        var article = document.createElement('article');
        article.className = 'glass-card';
        article.setAttribute('data-media-id', mediaId);
        article.setAttribute('data-rt-vod', '1');
        article.innerHTML =
            '<div class="pill-row"><span class="pill">VOD</span>' +
            (duration ? '<span class="pill soft">' + escHtml(duration) + '</span>' : '') +
            '</div>' +
            '<a class="card-link" href="' + escHtml(href) + '">' +
                '<h3 class="card-title">' + escHtml(title) + '</h3>' +
            '</a>' +
            '<div class="card-kicker">' +
                '<a class="link-inline" href="' + escHtml('/@' + encodeURIComponent(slug || 'unknown')) + '">' + escHtml(channelName) + '</a>' +
                ' · just finished' +
            '</div>';
        return article;
    }

    function buildClipCard(payload) {
        var p = payload || {};
        var clipId      = p.clip_id || p.id || '';
        var slug        = p.channel_slug || '';
        var channelName = p.channel_name || slug || 'Creator';
        var title       = p.title || 'Clip';
        var href        = slug ? '/@' + encodeURIComponent(slug) + '/clips' : '/clips';

        var article = document.createElement('article');
        article.className = 'glass-card';
        article.setAttribute('data-clip-id', clipId);
        article.setAttribute('data-rt-clip', '1');
        article.innerHTML =
            '<div class="pill-row"><span class="pill">Clip</span></div>' +
            '<a class="card-link" href="' + escHtml(href) + '">' +
                '<h3 class="card-title">' + escHtml(title) + '</h3>' +
            '</a>' +
            '<div class="card-kicker">' +
                '<a class="link-inline" href="' + escHtml('/@' + encodeURIComponent(slug || 'unknown')) + '">' + escHtml(channelName) + '</a>' +
                ' · just clipped' +
            '</div>';
        return article;
    }

    function buildCommunitySignal(type, payload) {
        var p = payload || {};
        var eyebrow = type === 'paste' ? 'Paste' : type === 'comment' ? 'Comment' : 'Thread';
        var title = p.title || (type === 'paste' ? 'New paste' : type === 'comment' ? 'New comment' : 'New thread');
        var slug = p.slug || '';
        var route = p.route_url;
        if (!route && slug && type === 'paste')  route = 'https://openvibe.community/p/' + encodeURIComponent(slug);
        if (!route && p.thread_id) route = 'https://openvibe.community/threads/' + encodeURIComponent(p.thread_id);
        if (!route) route = 'https://openvibe.community/';

        var card = document.createElement('article');
        card.className = 'glass-card';
        card.setAttribute('data-rt-community', '1');
        card.innerHTML =
            '<div class="eyebrow">' + escHtml(eyebrow) + '</div>' +
            '<h3 class="card-title">' + escHtml(title) + '</h3>' +
            (p.preview_text || p.body
                ? '<p class="card-body">' + escHtml(String(p.preview_text || p.body || '').slice(0, 200)) + '</p>'
                : '') +
            '<div class="card-kicker">just now · <a class="link-inline" href="' + escHtml(route) + '">Open →</a></div>';
        return card;
    }

    function prependCommunitySignal(type, payload) {
        var grid = findCommunityPulseGrid();
        if (!grid) return;
        var card = buildCommunitySignal(type, payload);
        grid.insertBefore(card, grid.firstChild);
        // Keep at most 8 realtime signals in the pulse grid
        var signals = grid.querySelectorAll('[data-rt-community]');
        for (var i = 8; i < signals.length; i++) {
            if (signals[i].parentNode) signals[i].parentNode.removeChild(signals[i]);
        }
    }

    // ── event handlers ────────────────────────────────────────
    var HANDLERS = {
        'stream.started': function (data) {
            var p = data.payload || data;
            var streamId = p.stream_id || p.id;
            if (!streamId) return;

            var existing = findStreamCard(streamId);
            if (existing) {
                setStreamBadge(existing, 'live');
                return;
            }

            var grid = findLiveNowGrid();
            if (grid) {
                var card = buildStreamCard(p);
                liveCards[streamId] = card;
                grid.insertBefore(card, grid.firstChild);
                updateLiveCount(1);
            }
        },

        'stream.ended': function (data) {
            var p = data.payload || data;
            var streamId = p.stream_id || p.id;
            if (!streamId) return;

            var card = findStreamCard(streamId) || liveCards[streamId];
            if (card) {
                setStreamBadge(card, 'ended');
                // Fade out after 8 seconds
                setTimeout(function () {
                    if (card.parentNode) card.parentNode.removeChild(card);
                    delete liveCards[streamId];
                    updateLiveCount(-1);
                }, 8000);
            }
        },

        'stream.ingest.connected': function (data) {
            var p = data.payload || data;
            var streamId = p.stream_id || p.id;
            if (!streamId) return;
            var card = findStreamCard(streamId) || liveCards[streamId];
            if (card) setStreamBadge(card, 'ingest');
        },

        'stream.ingest.disconnected': function (data) {
            var p = data.payload || data;
            var streamId = p.stream_id || p.id;
            if (!streamId) return;
            var card = findStreamCard(streamId) || liveCards[streamId];
            if (card) setStreamBadge(card, 'ended');
        },

        'stream.mirrored.to.live': function (data) {
            HANDLERS['stream.started'](data);
        },

        'stream.vod.attached': function (data) {
            var p = data.payload || data;
            var mediaId = p.media_id || p.vod_media_id || p.vod_id;
            if (!mediaId || vodSeen[mediaId]) return;
            vodSeen[mediaId] = true;
            var grid = findVodGrid();
            if (grid) grid.insertBefore(buildVodCard(p), grid.firstChild);
        },

        'vod.created': function (data) {
            var p = data.payload || data;
            var mediaId = p.media_id || p.id;
            if (!mediaId || vodSeen[mediaId]) return;
            vodSeen[mediaId] = true;
            var grid = findVodGrid();
            if (grid) grid.insertBefore(buildVodCard(p), grid.firstChild);
        },

        'vod.finalized': function (data) {
            var p = data.payload || data;
            var mediaId = p.media_id || p.id;
            if (!mediaId) return;
            // Update existing card badge if already visible
            var existing = document.querySelector('[data-media-id="' + mediaId + '"]');
            if (existing) {
                var badge = existing.querySelector('.pill');
                if (badge) { badge.className = 'pill success'; badge.textContent = 'Ready'; }
                return;
            }
            if (!vodSeen[mediaId]) {
                vodSeen[mediaId] = true;
                var grid = findVodGrid();
                if (grid) grid.insertBefore(buildVodCard(p), grid.firstChild);
            }
        },

        'clip.created': function (data) {
            var p = data.payload || data;
            var clipId = p.clip_id || p.id;
            if (!clipId || clipSeen[clipId]) return;
            clipSeen[clipId] = true;
            var grid = findClipGrid();
            if (grid) grid.insertBefore(buildClipCard(p), grid.firstChild);
        },

        'clip.materialized': function (data) {
            var p = data.payload || data;
            var clipId = p.clip_id || p.id;
            if (!clipId) return;
            var existing = document.querySelector('[data-clip-id="' + clipId + '"]');
            if (existing) {
                var badge = existing.querySelector('.pill');
                if (badge) { badge.className = 'pill success'; badge.textContent = 'Ready'; }
                return;
            }
            if (!clipSeen[clipId]) {
                clipSeen[clipId] = true;
                var grid = findClipGrid();
                if (grid) grid.insertBefore(buildClipCard(p), grid.firstChild);
            }
        },

        // Canonical community event names (post-normalization)
        'thread.created': function (data) {
            prependCommunitySignal('thread', data.payload || data);
        },

        'paste.created': function (data) {
            prependCommunitySignal('paste', data.payload || data);
        },

        'paste.updated': function (data) {
            var p = data.payload || data;
            log('paste.updated', p.slug || p.id);
        },

        'comment.created': function (data) {
            prependCommunitySignal('comment', data.payload || data);
        },

        'discord.message.received': function (data) {
            var p = data.payload || data;
            prependCommunitySignal('thread', Object.assign({
                title: 'Discord: ' + (p.username || 'Community'),
                body:  p.content || '',
            }, p));
        },

        // Canonical chat event name (post-normalization)
        'chat.message.sent': function (data) {
            var p = data.payload || data;
            var container = findChatMessages();
            if (container) {
                var el = document.createElement('div');
                el.className = 'chat-message';
                el.innerHTML =
                    '<strong class="chat-author">' + escHtml(p.username || p.author || 'User') + '</strong>' +
                    '<span class="chat-body"> ' + escHtml(p.text || p.body || p.message || '') + '</span>';
                container.appendChild(el);
                container.scrollTop = container.scrollHeight;
                // Cap at 200 messages in the DOM
                var msgs = container.querySelectorAll('.chat-message');
                for (var i = 0; i < msgs.length - 200; i++) {
                    if (msgs[i].parentNode) msgs[i].parentNode.removeChild(msgs[i]);
                }
            }
            try {
                document.dispatchEvent(new CustomEvent('openvibe-rt-chat', { detail: data, bubbles: true }));
            } catch { /* ignore */ }
        },
    };

    // Backward-compat aliases — fired when legacy event names arrive from old servers
    HANDLERS['stream.vod_attached']        = HANDLERS['stream.vod.attached'];
    HANDLERS['stream.ingest_connected']    = HANDLERS['stream.ingest.connected'];
    HANDLERS['stream.ingest_disconnected'] = HANDLERS['stream.ingest.disconnected'];
    HANDLERS['stream.mirrored_to_live']    = HANDLERS['stream.mirrored.to.live'];
    HANDLERS['community.thread.created']   = HANDLERS['thread.created'];
    HANDLERS['community.paste.created']    = HANDLERS['paste.created'];
    HANDLERS['community.post.created']     = HANDLERS['comment.created'];
    HANDLERS['chat.message.created']       = HANDLERS['chat.message.sent'];

    // ── SSE connection ────────────────────────────────────────
    function dispatch(eventName, rawData) {
        var data;
        try { data = JSON.parse(rawData); } catch { data = { raw: rawData }; }
        // Normalize to canonical name then look up handler
        var name = normalizeName(String(eventName || '').toLowerCase());
        var handler = HANDLERS[name];
        if (handler) {
            try { handler(data); } catch (e) { log('handler error', name, e); }
        }
        // Also try raw name if it differs (belt-and-suspenders)
        var rawName = String(eventName || '').toLowerCase();
        if (rawName !== name) {
            var rawHandler = HANDLERS[rawName];
            if (rawHandler) {
                try { rawHandler(data); } catch { /* ignore */ }
            }
        }
        try {
            document.dispatchEvent(new CustomEvent('openvibe-rt-event', {
                detail: { event: name, data: data },
                bubbles: false,
            }));
        } catch { /* ignore */ }
    }

    function openSSE() {
        if (stopped) return;
        var url = SSE_ENDPOINT + '?topics=' + encodeURIComponent(TOPICS);
        if (!window.EventSource) {
            log('EventSource not available; realtime disabled.');
            return;
        }
        source = new window.EventSource(url);

        source.addEventListener('connected', function (e) {
            reconnectAttempt = 0;
            log('connected', e.data);
        });

        source.addEventListener('error', function () {
            source.close();
            source = null;
            if (!stopped) {
                var delay = exponentialBackoff(reconnectAttempt++);
                log('SSE error; reconnecting in', Math.round(delay) + 'ms');
                setTimeout(openSSE, delay);
            }
        });

        // Attach handlers for all tracked event names (canonical + aliases)
        var TRACKED_EVENTS = Object.keys(HANDLERS).concat([
            'stream.vod.attached', 'stream.created', 'billing.tip.sent',
            'vod.finalized', 'clip.materialized', 'discord.message.received',
        ]);
        TRACKED_EVENTS.forEach(function (evtName) {
            source.addEventListener(evtName, function (e) {
                dispatch(evtName, e.data);
            });
        });

        // Catch-all via onmessage for events not in the list
        source.onmessage = function (e) {
            dispatch(e.type || 'message', e.data);
        };
    }

    // ── init ──────────────────────────────────────────────────
    function init() {
        // Annotate existing live-now cards with data-stream-id if SSR put them there
        var existingCards = document.querySelectorAll('[data-stream-id]');
        existingCards.forEach(function (card) {
            var id = card.getAttribute('data-stream-id');
            if (id) liveCards[id] = card;
        });

        openSSE();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose handle for external cleanup
    window.OpenVibeRealtime = {
        stop: function () { stopped = true; if (source) source.close(); },
        dispatch: dispatch,
    };
})();
