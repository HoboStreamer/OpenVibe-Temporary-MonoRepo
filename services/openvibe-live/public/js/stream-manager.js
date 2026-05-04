/**
 * stream-manager.js — go-live page client logic
 *
 * Populates the authenticated stream manager on /go-live using the
 * /api/v1/go-live/dashboard endpoint. Handles:
 *   - Loading channels, destinations, recent streams
 *   - Channel creation form submission
 *   - Destination creation form submission
 *   - Stream creation form and ingest display
 *   - Quick start/end stream actions
 *
 * Plain JS IIFE — no module system, no bundler.
 * Runs only when [data-go-live-session] is found in the DOM.
 */
(function () {
    'use strict';

    // ── guard: only run on the go-live page for authenticated users ───────────
    if (!document.querySelector('[data-go-live-session]')) return;

    // ── helpers ───────────────────────────────────────────────────────────────
    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function setHtml(selector, html) {
        var el = document.querySelector(selector);
        if (el) el.innerHTML = html;
    }

    function setContent(selector, html) {
        var el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.innerHTML = html;
    }

    function note(text) {
        return '<p class="manager-note">' + esc(text) + '</p>';
    }

    function pillHtml(label, tone) {
        return '<span class="pill ' + esc(tone || '') + '">' + esc(label) + '</span>';
    }

    function timeAgo(ts) {
        if (!ts) return 'just now';
        var delta = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
        if (delta < 60)  return delta + 's ago';
        if (delta < 3600) return Math.floor(delta / 60) + 'm ago';
        if (delta < 86400) return Math.floor(delta / 3600) + 'h ago';
        return Math.floor(delta / 86400) + 'd ago';
    }

    // ── API fetch wrapper ─────────────────────────────────────────────────────
    function api(method, path, body) {
        var opts = { method: method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
        if (body) opts.body = JSON.stringify(body);
        return fetch(path, opts).then(function (res) {
            if (!res.ok) return res.json().then(function (err) { throw new Error(err.error || 'Request failed (' + res.status + ')'); });
            return res.json();
        });
    }

    // ── render helpers ────────────────────────────────────────────────────────
    function renderChannelList(channels) {
        if (!channels || !channels.length) return note('No channels yet. Create one below to claim your @handle.');
        return channels.map(function (c) {
            return '<div class="stack-item" style="margin-bottom:.5rem">' +
                '<strong>' + esc(c.display_name || c.slug) + '</strong>' +
                ' <code>@' + esc(c.slug) + '</code>' +
                (c.is_live ? ' ' + pillHtml('Live now', 'live') : '') +
                '</div>';
        }).join('');
    }

    function renderDestinationList(destinations) {
        if (!destinations || !destinations.length) return note('No destinations yet. Add an RTMP target below.');
        return destinations.map(function (d) {
            return '<div class="stack-item" style="margin-bottom:.5rem">' +
                pillHtml(d.kind || 'custom', 'soft') + ' ' +
                '<strong>' + esc(d.label || d.kind || 'Destination') + '</strong>' +
                (d.target_url ? ' <code style="font-size:.75rem;opacity:.7">' + esc(d.target_url) + '</code>' : '') +
                '</div>';
        }).join('');
    }

    function renderStreamList(streams) {
        if (!streams || !streams.length) return note('No recent streams found.');
        return streams.map(function (s) {
            var statusPill = s.is_live ? pillHtml('Live', 'live') : (s.status ? pillHtml(s.status, 'soft') : '');
            var actions = '';
            if (!s.is_live && s.status !== 'ended') {
                actions = '<button class="section-link stream-start-btn" data-stream-id="' + esc(s.id) + '" style="margin-left:.5rem">Start</button>';
            } else if (s.is_live) {
                actions = '<button class="section-link stream-end-btn" data-stream-id="' + esc(s.id) + '" style="margin-left:.5rem">End</button>';
            }
            return '<div class="stack-item" style="margin-bottom:.5rem">' +
                statusPill +
                ' <strong>' + esc(s.title || 'Untitled stream') + '</strong>' +
                ' · ' + esc(timeAgo(s.started_at || s.created_at)) +
                actions +
                '</div>';
        }).join('');
    }

    function renderIngestDetails(stream, restreamUrl) {
        if (!stream) return '';
        var rtmpUrl  = stream.rtmp_url || (restreamUrl ? restreamUrl + '/live' : '');
        var streamKey = stream.stream_key || stream.key || '';
        var whipUrl  = stream.whip_url || '';

        var rows = [];
        if (rtmpUrl)   rows.push('<div class="data-point"><div class="data-point-label">RTMP URL</div><div class="data-point-value" style="font-size:.8rem;font-family:monospace">' + esc(rtmpUrl) + '</div></div>');
        if (streamKey) rows.push('<div class="data-point"><div class="data-point-label">Stream key</div><div class="data-point-value" style="font-size:.8rem;font-family:monospace">' + esc(streamKey) + '</div></div>');
        if (whipUrl)   rows.push('<div class="data-point"><div class="data-point-label">WHIP URL</div><div class="data-point-value" style="font-size:.8rem;font-family:monospace">' + esc(whipUrl) + '</div></div>');
        if (!rows.length) rows.push('<div class="data-point"><div class="data-point-label">Status</div><div class="data-point-value">Stream created — ingest details pending from openre.stream</div></div>');

        return '<div class="data-points">' + rows.join('') + '</div>' +
            '<p class="manager-note" style="margin-top:.75rem">Copy these into OBS or your restream tool. The stream key is single-use per session.</p>';
    }

    // ── channel select in stream form ─────────────────────────────────────────
    function populateChannelSelect(channels) {
        var select = document.querySelector('#go-live-stream-form select[name="channel_slug"]');
        if (!select) return;
        select.innerHTML = '<option value="">Select a channel</option>';
        (channels || []).forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c.slug;
            opt.textContent = (c.display_name || c.slug) + ' (@' + c.slug + ')';
            select.appendChild(opt);
        });
    }

    // ── state ─────────────────────────────────────────────────────────────────
    var state = { channels: [], destinations: [], streams: [], restreamUrl: '' };

    // ── load dashboard ────────────────────────────────────────────────────────
    function loadDashboard() {
        var sessionCard = document.querySelector('[data-go-live-session]');
        if (!sessionCard) return;

        api('GET', '/api/v1/go-live/dashboard').then(function (data) {
            state.channels     = data.channels || [];
            state.destinations = data.destinations || [];
            state.streams      = data.streams || [];
            state.restreamUrl  = data.restream_url || '';

            // Update session card
            var heading = sessionCard.querySelector('h3');
            if (heading) heading.textContent = 'Stream manager ready';
            var body = sessionCard.querySelector('p.card-body');
            if (body) body.textContent =
                state.channels.length + ' channel' + (state.channels.length === 1 ? '' : 's') + ', ' +
                state.destinations.length + ' destination' + (state.destinations.length === 1 ? '' : 's') + ', ' +
                state.streams.length + ' recent stream' + (state.streams.length === 1 ? '' : 's') + '.';

            setContent('[data-go-live-channels]',    renderChannelList(state.channels));
            setContent('[data-go-live-destinations]', renderDestinationList(state.destinations));
            setContent('[data-go-live-streams]',      renderStreamList(state.streams));
            setContent('[data-go-live-ingest]',
                '<p class="manager-note">Create a stream to reveal ingest details.</p>');
            populateChannelSelect(state.channels);
            bindStreamActions();

        }).catch(function (err) {
            var heading = document.querySelector('[data-go-live-session] h3');
            if (heading) heading.textContent = 'Could not load manager';
            var body = document.querySelector('[data-go-live-session] p.card-body');
            if (body) body.textContent = 'Error: ' + err.message + '. The API may be unavailable.';
        });
    }

    // ── form: create channel ──────────────────────────────────────────────────
    var channelForm = document.querySelector('#go-live-channel-form');
    if (channelForm) {
        channelForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var data = new FormData(channelForm);
            var btn = channelForm.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;
            api('POST', '/api/v1/go-live/channels', {
                slug: data.get('slug'),
                display_name: data.get('display_name'),
            }).then(function (res) {
                if (res.channel) {
                    state.channels.push(res.live_channel || res.channel);
                    setContent('[data-go-live-channels]', renderChannelList(state.channels));
                    populateChannelSelect(state.channels);
                    channelForm.reset();
                }
            }).catch(function (err) {
                alert('Channel creation failed: ' + err.message);
            }).finally(function () {
                if (btn) btn.disabled = false;
            });
        });
    }

    // ── form: create destination ──────────────────────────────────────────────
    var destForm = document.querySelector('#go-live-destination-form');
    if (destForm) {
        destForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var data = new FormData(destForm);
            var btn = destForm.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;
            api('POST', '/api/v1/go-live/destinations', {
                kind:       data.get('kind'),
                label:      data.get('label'),
                target_url: data.get('target_url'),
                target_key: data.get('target_key'),
            }).then(function (res) {
                var dest = res.destination || res;
                if (dest && dest.id) {
                    state.destinations.push(dest);
                    setContent('[data-go-live-destinations]', renderDestinationList(state.destinations));
                    destForm.reset();
                }
            }).catch(function (err) {
                alert('Destination creation failed: ' + err.message);
            }).finally(function () {
                if (btn) btn.disabled = false;
            });
        });
    }

    // ── form: create stream ───────────────────────────────────────────────────
    var streamForm = document.querySelector('#go-live-stream-form');
    if (streamForm) {
        streamForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var data = new FormData(streamForm);
            var btn = streamForm.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;
            api('POST', '/api/v1/go-live/streams', {
                channel_slug: data.get('channel_slug'),
                title:        data.get('title'),
                category:     data.get('category'),
                protocol:     data.get('protocol'),
            }).then(function (res) {
                var stream = res.stream || res;
                if (stream && stream.id) {
                    state.streams.unshift(stream);
                    setContent('[data-go-live-streams]', renderStreamList(state.streams));
                    setContent('[data-go-live-ingest]', renderIngestDetails(stream, state.restreamUrl));
                    streamForm.reset();
                    bindStreamActions();
                    // Scroll to ingest area
                    var ingestEl = document.querySelector('[data-go-live-ingest]');
                    if (ingestEl) ingestEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }).catch(function (err) {
                alert('Stream creation failed: ' + err.message);
            }).finally(function () {
                if (btn) btn.disabled = false;
            });
        });
    }

    // ── stream start/end action buttons ──────────────────────────────────────
    function bindStreamActions() {
        document.querySelectorAll('.stream-start-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-stream-id');
                btn.disabled = true;
                btn.textContent = 'Starting…';
                api('POST', '/api/v1/go-live/streams/' + id + '/start', {}).then(function (res) {
                    var s = res.stream || res;
                    if (s && s.id) {
                        var idx = state.streams.findIndex ? state.streams.findIndex(function (x) { return x.id === s.id; }) : -1;
                        if (idx >= 0) state.streams[idx] = s;
                        setContent('[data-go-live-streams]', renderStreamList(state.streams));
                        bindStreamActions();
                    }
                }).catch(function (err) {
                    alert('Failed to start stream: ' + err.message);
                    btn.disabled = false;
                    btn.textContent = 'Start';
                });
            });
        });

        document.querySelectorAll('.stream-end-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-stream-id');
                if (!confirm('End this stream?')) return;
                btn.disabled = true;
                btn.textContent = 'Ending…';
                api('POST', '/api/v1/go-live/streams/' + id + '/end', {}).then(function (res) {
                    var s = res.stream || res;
                    if (s && s.id) {
                        var idx = state.streams.findIndex ? state.streams.findIndex(function (x) { return x.id === s.id; }) : -1;
                        if (idx >= 0) state.streams[idx] = s;
                        setContent('[data-go-live-streams]', renderStreamList(state.streams));
                        bindStreamActions();
                    }
                }).catch(function (err) {
                    alert('Failed to end stream: ' + err.message);
                    btn.disabled = false;
                    btn.textContent = 'End';
                });
            });
        });
    }

    // ── boot ──────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadDashboard);
    } else {
        loadDashboard();
    }
})();
