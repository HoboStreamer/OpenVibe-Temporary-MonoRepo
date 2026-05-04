/**
 * openvibe.live — realtime client integration
 *
 * Subscribes to openvibe-realtime via SSE (EventSource) and updates the page
 * with live stream events, community pulse, and ingest status changes without
 * a full page reload.
 *
 * Topics subscribed:
 *   global:live       — stream.started, stream.ended, stream.ingest.*
 *   community:pulse   — community.thread.created, community.paste.created
 *
 * The SSR page renders the initial state; this file only mutates DOM after
 * real events arrive. It does not replace or reinitialise the SSR content.
 *
 * Loaded via <script src="/js/realtime.js?v=..."> at the bottom of the page shell.
 * No module system — plain IIFE, no bundler.
 */
(function () {
    'use strict';

    // ── configuration ─────────────────────────────────────────
    // Prefer an explicit window.OPENVIBE_REALTIME_URL env injection from SSR,
    // fall back to same-origin /events which the nginx proxy forwards to
    // openvibe-realtime.
    var REALTIME_URL = (window.OPENVIBE_CONFIG && window.OPENVIBE_CONFIG.realtimeUrl) || '';
    var SSE_ENDPOINT = REALTIME_URL
        ? REALTIME_URL.replace(/\/$/, '') + '/events'
        : '/events';
    var TOPICS = 'global:live,community:pulse';
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

    // Tracks live-now stream cards by stream id
    var liveCards = {}; // streamId → article element

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

    function buildCommunitySignal(type, payload) {
        var title = payload && payload.title || (type === 'paste' ? 'New paste' : 'New thread');
        var slug = payload && payload.slug || '';
        var route = payload && payload.route_url;
        if (!route && slug) route = 'https://openvibe.community/p/' + encodeURIComponent(slug);
        if (!route) route = 'https://openvibe.community/';

        var card = document.createElement('article');
        card.className = 'glass-card';
        card.setAttribute('data-rt-community', '1');
        card.innerHTML =
            '<div class="eyebrow">' + escHtml(type === 'paste' ? 'Paste' : 'Thread') + '</div>' +
            '<h3 class="card-title">' + escHtml(title) + '</h3>' +
            '<p class="card-body">' + escHtml(payload && payload.preview_text || payload && payload.body || '') + '</p>' +
            '<div class="card-kicker">just now · <a class="link-inline" href="' + escHtml(route) + '">Open →</a></div>';
        return card;
    }

    function prependCommunitySignal(type, payload) {
        var grid = findCommunityPulseGrid();
        if (!grid) return;
        var card = buildCommunitySignal(type, payload);
        grid.insertBefore(card, grid.firstChild);
        // Keep at most 6 realtime signals in the pulse grid
        var signals = grid.querySelectorAll('[data-rt-community]');
        for (var i = 6; i < signals.length; i++) {
            signals[i].parentNode.removeChild(signals[i]);
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

        'stream.mirrored_to_live': function (data) {
            // Same as stream.started for display purposes
            HANDLERS['stream.started'](data);
        },

        'vod.created': function (data) {
            var p = data.payload || data;
            log('vod.created', p.media_id || p.id);
        },

        'vod.finalized': function (data) {
            var p = data.payload || data;
            log('vod.finalized', p.media_id || p.id);
        },

        'clip.created': function (data) {
            var p = data.payload || data;
            log('clip.created', p.clip_id || p.id);
        },

        'community.thread.created': function (data) {
            prependCommunitySignal('thread', data.payload || data);
        },

        'community.paste.created': function (data) {
            prependCommunitySignal('paste', data.payload || data);
        },

        'community.post.created': function (data) {
            log('community.post.created', data.payload && data.payload.thread_id);
        },

        'chat.message.created': function (data) {
            // The chat widget on the page handles its own rendering.
            // Emit a custom DOM event so other scripts can pick it up.
            var evt = new CustomEvent('openvibe-rt-chat', { detail: data, bubbles: true });
            document.dispatchEvent(evt);
        },
    };

    // ── SSE connection ────────────────────────────────────────
    function dispatch(eventName, rawData) {
        var data;
        try { data = JSON.parse(rawData); } catch { data = { raw: rawData }; }
        // Normalize event name: dots only, lowercase
        var name = String(eventName || '').toLowerCase().replace(/[^a-z0-9.]/g, '.');
        var handler = HANDLERS[name];
        if (handler) {
            try { handler(data); } catch (e) { log('handler error', name, e); }
        }
        // Emit a generic DOM event for external listeners
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

        // Attach handlers for all tracked event names
        var TRACKED_EVENTS = Object.keys(HANDLERS).concat([
            'stream.vod_attached', 'stream.created', 'billing.tip.sent',
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
