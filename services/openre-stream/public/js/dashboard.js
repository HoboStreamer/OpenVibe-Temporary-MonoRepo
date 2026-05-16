/**
 * dashboard.js — openre.stream dashboard  v=20260603-1
 *
 * Two-panel stream manager: sidebar channel slots + right editor.
 * Includes browser broadcast via WHIP (WebRTC-HTTP Ingestion Protocol).
 * Reads window.__DASH_DATA__ embedded by server SSR.
 */
(function () {
    'use strict';

    var raw = window.__DASH_DATA__;
    if (!raw) return; // not on dashboard page

    // ── helpers ────────────────────────────────────────────────────────────────

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function el(id) { return document.getElementById(id); }

    function setStatus(id, text, isError) {
        var e = el(id);
        if (!e) return;
        e.textContent = text;
        e.className = 'dash-status' + (isError ? ' err' : (text ? ' ok' : ''));
        if (text && !isError) setTimeout(function () { if (e.textContent === text) { e.textContent = ''; e.className = 'dash-status'; } }, 2500);
    }

    function timeAgo(ts) {
        if (!ts) return '';
        var d = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
        if (d < 60)    return d + 's ago';
        if (d < 3600)  return Math.floor(d / 60) + 'm ago';
        if (d < 86400) return Math.floor(d / 3600) + 'h ago';
        return Math.floor(d / 86400) + 'd ago';
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
        return Promise.resolve();
    }

    function api(method, path, body) {
        var opts = { method: method, credentials: 'same-origin', headers: {} };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        return fetch(path, opts).then(function (res) {
            if (!res.ok) {
                return res.json().catch(function () { return {}; }).then(function (e) {
                    throw new Error(e.error || e.message || ('Request failed (' + res.status + ')'));
                });
            }
            return res.json();
        });
    }

    var COPY_SVG  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var PILL_LIVE = '<span class="pill live">Live</span>';

    // ── state ──────────────────────────────────────────────────────────────────

    var state = {
        channels:     (raw.channels     || []).slice(),
        destinations: (raw.destinations || []).slice(),
        streams:      (raw.streams      || []).slice(),
        liveUrl:      raw.live_url   || '',
        userId:       raw.user_id    || '',
        activeSlug:   null,
    };

    // ── sidebar ────────────────────────────────────────────────────────────────

    function renderSlots() {
        var slotsEl = el('dash-slots');
        if (!slotsEl) return;
        if (!state.channels.length) {
            slotsEl.innerHTML = '<div class="dash-slot-empty">No channels \u2014 <a href="' + esc(state.liveUrl) + '/go-live" class="link-inline">create one</a>.</div>';
            return;
        }
        slotsEl.innerHTML = state.channels.map(function (c) {
            var proto  = (c.default_protocol || 'rtmp').toLowerCase();
            var isLive = !!c.is_live;
            var active = state.activeSlug === c.slug ? ' active' : '';
            return '<div class="dash-slot-item' + active + '" data-slot="' + esc(c.slug) + '">' +
                '<div class="dash-slot-dot' + (isLive ? ' live' : '') + '"></div>' +
                '<div class="dash-slot-info">' +
                    '<div class="dash-slot-title">' + esc(c.display_name || c.slug) + '</div>' +
                    '<div class="dash-slot-meta">' +
                        '<span class="dash-slot-proto ' + esc(proto) + '">' + esc(proto.toUpperCase()) + '</span>' +
                        '<span>/' + esc(c.slug) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function renderDestSidebar() {
        var sidebarEl = el('dash-dest-sidebar');
        if (!sidebarEl) return;
        if (!state.destinations.length) {
            sidebarEl.innerHTML = '<div class="dash-slot-empty" style="font-size:.78rem">None yet</div>';
            return;
        }
        sidebarEl.innerHTML = state.destinations.map(function (d) {
            return '<div class="dash-dest-item">' +
                '<span class="dash-dest-badge">' + esc(d.kind || 'rtmp') + '</span>' +
                '<span class="dash-dest-name">' + esc(d.label || d.kind || 'Destination') + '</span>' +
            '</div>';
        }).join('');
    }

    // ── channel editor ─────────────────────────────────────────────────────────

    function openChannel(slug) {
        var ch = null;
        for (var i = 0; i < state.channels.length; i++) {
            if (state.channels[i].slug === slug) { ch = state.channels[i]; break; }
        }
        if (!ch) return;
        state.activeSlug = slug;
        renderSlots();

        var nameEl = el('dash-ch-name');
        var urlEl  = el('dash-ch-url');
        var liveEl = el('dash-ch-live-link');
        if (nameEl) nameEl.textContent = ch.display_name || ('@' + ch.slug);
        if (urlEl) {
            urlEl.textContent = 'openre.stream/@' + ch.slug;
            urlEl.href = state.liveUrl + '/@' + ch.slug;
        }
        if (liveEl) liveEl.href = state.liveUrl + '/@' + ch.slug;

        renderIngest(ch);
        populateSettingsForm(ch);
        renderDestList();
        renderStreamsList(slug);

        var noEl = el('dash-no-channel');
        var edEl = el('dash-channel-editor');
        if (noEl) noEl.style.display = 'none';
        if (edEl) edEl.style.display = '';

        activateTab('ingest');
    }

    function getChannel(slug) {
        for (var i = 0; i < state.channels.length; i++) {
            if (state.channels[i].slug === (slug || state.activeSlug)) return state.channels[i];
        }
        return null;
    }

    // ── ingest tab ─────────────────────────────────────────────────────────────

    function renderIngest(ch) {
        var container = el('dash-ingest-details');
        if (!container) return;

        var rtmp = ch.rtmp_url  || '';
        var whip = ch.whip_url  || '';
        var key  = ch.stream_key || '';

        function endpointRow(label, value) {
            if (!value) return '';
            return '<div class="dash-endpoint-row">' +
                '<div class="dash-endpoint-label">' + esc(label) + '</div>' +
                '<div class="dash-endpoint-value-row">' +
                    '<div class="dash-endpoint-code">' + esc(value) + '</div>' +
                    '<button type="button" class="dash-icon-btn" data-copy="' + esc(value) + '" title="Copy">' + COPY_SVG + '</button>' +
                '</div>' +
            '</div>';
        }

        var keyHtml = '';
        if (key) {
            keyHtml =
                '<div class="dash-endpoint-row">' +
                    '<div class="dash-endpoint-label">STREAM KEY</div>' +
                    '<div class="dash-endpoint-value-row">' +
                        '<div class="dash-endpoint-code" id="dash-ingest-key-val">' + esc(key.substring(0, 8)) + '\u2026</div>' +
                        '<button type="button" class="dash-icon-btn" id="dash-ingest-key-show" title="Show full key">' +
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
                        '</button>' +
                        '<button type="button" class="dash-icon-btn" data-copy="' + esc(key) + '" title="Copy key">' + COPY_SVG + '</button>' +
                        '<button type="button" class="dash-icon-btn dash-icon-btn-danger" data-action="regen-key" data-slug="' + esc(ch.slug) + '" title="Regenerate key">' +
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
                        '</button>' +
                    '</div>' +
                '</div>';
        }

        container.innerHTML =
            endpointRow('RTMP SERVER URL', rtmp) +
            keyHtml +
            endpointRow('WHIP ENDPOINT', whip) +
            ((!rtmp && !key && !whip) ? '<p class="dash-note">No ingest details found. Check service configuration.</p>' : '') +
            '<p class="dash-note" style="margin-top:.8rem;padding-top:.8rem;border-top:1px solid rgba(255,255,255,0.06)">Paste RTMP URL + stream key into OBS &rarr; Settings &rarr; Stream to go live.</p>';

        var keyValEl = el('dash-ingest-key-val');
        var showBtn  = el('dash-ingest-key-show');
        var keyShown = false;
        if (showBtn && keyValEl) {
            showBtn.addEventListener('click', function () {
                keyShown = !keyShown;
                keyValEl.textContent = keyShown ? key : (key.substring(0, 8) + '\u2026');
            });
        }
    }

    // ── settings tab ───────────────────────────────────────────────────────────

    function populateSettingsForm(ch) {
        var form = el('dash-settings-form');
        if (!form) return;
        form.querySelector('[name="slug"]').value         = ch.slug;
        form.querySelector('[name="display_name"]').value = ch.display_name || '';
        form.querySelector('[name="description"]').value  = ch.description  || '';
        var skInp = el('dash-sk-input');
        if (skInp) skInp.value = ch.stream_key || '';
        setStatus('dash-settings-status', '');
    }

    // ── destinations tab ────────────────────────────────────────────────────────

    function renderDestList() {
        var listEl = el('dash-dest-list');
        if (!listEl) return;
        if (!state.destinations.length) {
            listEl.innerHTML = '<p class="dash-note">No destinations yet. Add one below.</p>';
            return;
        }
        listEl.innerHTML = state.destinations.map(function (d) {
            var enabled = d.enabled !== false;
            return '<div class="dash-dest-list-item">' +
                '<div>' +
                    '<span class="dash-dest-badge">' + esc(d.kind || 'rtmp') + '</span> ' +
                    '<strong>' + esc(d.label || d.kind || 'Destination') + '</strong>' +
                    (!enabled ? ' <span class="pill soft" style="font-size:.72rem">Disabled</span>' : '') +
                    (d.target_url ? '<div class="dash-note" style="margin-top:.15rem;font-size:.76rem">' + esc(d.target_url) + '</div>' : '') +
                '</div>' +
                '<button type="button" class="dash-icon-btn dash-icon-btn-danger" data-action="delete-dest" data-dest-id="' + esc(d.id) + '" title="Remove destination">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
                '</button>' +
            '</div>';
        }).join('');
    }

    // ── streams tab ────────────────────────────────────────────────────────────

    function renderStreamsList(slug) {
        var listEl = el('dash-streams-list');
        if (!listEl) return;
        var items = state.streams.filter(function (s) { return !slug || s.channel_slug === slug; });
        if (!items.length) {
            listEl.innerHTML = '<p class="dash-note">No recent streams for this channel.</p>';
            return;
        }
        listEl.innerHTML = items.slice(0, 20).map(function (s) {
            var badge = s.is_live ? PILL_LIVE : ('<span class="pill soft">' + esc(s.status || 'ended') + '</span>');
            return '<div class="dash-history-item">' +
                '<div>' +
                    '<div class="dash-history-title">' + badge + ' ' + esc(s.title || 'Untitled stream') + '</div>' +
                    '<div class="dash-history-meta">' + esc(timeAgo(s.started_at || s.created_at)) + '</div>' +
                '</div>' +
                '<a class="btn" href="' + esc(state.liveUrl + '/@' + (s.channel_slug || '')) + '" style="padding:.3rem .7rem;font-size:.78rem;white-space:nowrap">View &rarr;</a>' +
            '</div>';
        }).join('');
    }

    // ── tab switching ──────────────────────────────────────────────────────────

    function activateTab(tabName) {
        var tabs = document.querySelectorAll('.dash-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabName);
        }
        var panels = ['ingest', 'settings', 'destinations', 'streams', 'broadcast'];
        for (var j = 0; j < panels.length; j++) {
            var p = el('dash-panel-' + panels[j]);
            if (p) p.style.display = panels[j] === tabName ? '' : 'none';
        }
        if (tabName === 'broadcast') {
            bcast.onTabOpen();
        }
    }

    // ── event delegation ───────────────────────────────────────────────────────

    document.addEventListener('click', function (e) {
        var tabBtn = e.target.closest('.dash-tab');
        if (tabBtn && tabBtn.getAttribute('data-tab')) { activateTab(tabBtn.getAttribute('data-tab')); return; }

        var slotItem = e.target.closest('[data-slot]');
        if (slotItem) { openChannel(slotItem.getAttribute('data-slot')); return; }

        var copyBtn = e.target.closest('[data-copy]');
        if (copyBtn) {
            var val = copyBtn.getAttribute('data-copy');
            if (!val) return;
            copyText(val).then(function () {
                var orig = copyBtn.innerHTML;
                copyBtn.innerHTML = CHECK_SVG;
                setTimeout(function () { copyBtn.innerHTML = orig; }, 1400);
            });
            return;
        }

        var actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        var action = actionBtn.getAttribute('data-action');

        if (action === 'regen-key') {
            var slug = actionBtn.getAttribute('data-slug') || state.activeSlug;
            if (!slug) return;
            if (!confirm('Regenerate stream key for @' + slug + '?\n\nAny currently running stream will be disconnected.')) return;
            actionBtn.disabled = true;
            api('POST', '/api/v1/channels/' + encodeURIComponent(slug) + '/regenerate-key', {})
                .then(function (res) {
                    var ch = res.channel || res;
                    if (ch && ch.stream_key) {
                        for (var k = 0; k < state.channels.length; k++) {
                            if (state.channels[k].slug === ch.slug) {
                                state.channels[k] = Object.assign({}, state.channels[k], { stream_key: ch.stream_key });
                                break;
                            }
                        }
                        var curCh = getChannel(slug);
                        if (curCh) renderIngest(curCh);
                        var skInp = el('dash-sk-input');
                        if (skInp) skInp.value = ch.stream_key;
                        setStatus('dash-settings-status', 'New key generated!');
                    }
                })
                .catch(function (err) { alert('Failed: ' + err.message); })
                .finally(function () { actionBtn.disabled = false; });
            return;
        }

        if (action === 'delete-dest') {
            var destId = actionBtn.getAttribute('data-dest-id');
            if (!destId) return;
            if (!confirm('Remove this destination?')) return;
            actionBtn.disabled = true;
            api('DELETE', '/api/v1/destinations/' + encodeURIComponent(destId))
                .then(function () {
                    state.destinations = state.destinations.filter(function (d) { return String(d.id) !== String(destId); });
                    renderDestSidebar();
                    renderDestList();
                })
                .catch(function (err) { alert('Failed: ' + err.message); actionBtn.disabled = false; });
            return;
        }
    });

    // ── settings form ──────────────────────────────────────────────────────────

    var skToggle = el('dash-sk-toggle');
    if (skToggle) {
        skToggle.addEventListener('click', function () {
            var inp = el('dash-sk-input');
            if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
        });
    }

    var skCopy = el('dash-sk-copy');
    if (skCopy) {
        skCopy.addEventListener('click', function () {
            var inp = el('dash-sk-input');
            if (inp && inp.value) copyText(inp.value).then(function () { setStatus('dash-settings-status', 'Key copied!'); });
        });
    }

    var skRegen = el('dash-sk-regen');
    if (skRegen) {
        skRegen.addEventListener('click', function () {
            var slug = state.activeSlug;
            if (!slug) return;
            if (!confirm('Regenerate stream key for @' + slug + '?\n\nAny currently running stream will be disconnected.')) return;
            skRegen.disabled = true;
            api('POST', '/api/v1/channels/' + encodeURIComponent(slug) + '/regenerate-key', {})
                .then(function (res) {
                    var ch = res.channel || res;
                    if (ch && ch.stream_key) {
                        for (var k = 0; k < state.channels.length; k++) {
                            if (state.channels[k].slug === ch.slug) {
                                state.channels[k] = Object.assign({}, state.channels[k], { stream_key: ch.stream_key });
                                break;
                            }
                        }
                        var inp = el('dash-sk-input');
                        if (inp) inp.value = ch.stream_key;
                        var curCh = getChannel(slug);
                        if (curCh) renderIngest(curCh);
                        setStatus('dash-settings-status', 'New key generated!');
                    }
                })
                .catch(function (err) { setStatus('dash-settings-status', err.message, true); })
                .finally(function () { skRegen.disabled = false; });
        });
    }

    var settingsForm = el('dash-settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd   = new FormData(settingsForm);
            var slug = fd.get('slug') || state.activeSlug;
            if (!slug) return;
            var btn = settingsForm.querySelector('[type="submit"]');
            if (btn) btn.disabled = true;
            setStatus('dash-settings-status', '');
            api('PATCH', '/api/v1/channels/' + encodeURIComponent(slug), {
                display_name: fd.get('display_name'),
                description:  fd.get('description'),
            })
                .then(function (res) {
                    var ch = res.channel || res;
                    if (ch && ch.slug) {
                        for (var k = 0; k < state.channels.length; k++) {
                            if (state.channels[k].slug === ch.slug) {
                                state.channels[k] = Object.assign({}, state.channels[k], ch);
                                break;
                            }
                        }
                        renderSlots();
                        setStatus('dash-settings-status', 'Saved!');
                        var nameEl = el('dash-ch-name');
                        if (nameEl) nameEl.textContent = ch.display_name || ('@' + ch.slug);
                    }
                })
                .catch(function (err) { setStatus('dash-settings-status', err.message, true); })
                .finally(function () { if (btn) btn.disabled = false; });
        });
    }

    // ── destination form ────────────────────────────────────────────────────────

    var destForm = el('dash-dest-form');
    if (destForm) {
        destForm.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!state.userId) { alert('Cannot determine user ID \u2014 please refresh and try again.'); return; }
            var fd  = new FormData(destForm);
            var btn = destForm.querySelector('[type="submit"]');
            if (btn) btn.disabled = true;
            setStatus('dash-dest-status', '');
            api('POST', '/api/v1/destinations', {
                owner_user_id: state.userId,
                kind:          fd.get('kind')       || 'custom',
                label:         fd.get('label')      || '',
                target_url:    fd.get('target_url') || '',
                target_key:    fd.get('target_key') || '',
                enabled:       fd.get('enabled') === '1',
            })
                .then(function (res) {
                    var d = res.destination || res;
                    if (d && d.id) {
                        state.destinations.push(d);
                        destForm.reset();
                        var ecb = destForm.querySelector('[name="enabled"]');
                        if (ecb) ecb.checked = true;
                        renderDestSidebar();
                        renderDestList();
                        setStatus('dash-dest-status', 'Destination saved!');
                    }
                })
                .catch(function (err) { setStatus('dash-dest-status', err.message, true); })
                .finally(function () { if (btn) btn.disabled = false; });
        });
    }

    // ── browser broadcast (WHIP) ──────────────────────────────────────────────

    var bcast = (function () {
        var localStream = null;
        var screenStream = null;
        var pc = null;
        var whipResourceUrl = null;
        var timerInterval = null;
        var startedAt = null;
        var videoMuted = false;
        var audioMuted = false;
        var currentSource = 'camera';
        var initialized = false;

        function setStatus(msg, isErr) {
            var s = el('bcast-status');
            if (!s) return;
            s.textContent = msg;
            s.className = 'dash-status' + (isErr ? ' err' : (msg ? '' : ''));
        }

        function getWhipUrl() {
            var slug = state.activeSlug;
            if (!slug) return null;
            var ch = null;
            for (var i = 0; i < state.channels.length; i++) {
                if (state.channels[i].slug === slug) { ch = state.channels[i]; break; }
            }
            if (!ch || !ch.stream_key) return null;
            return '/whip/' + encodeURIComponent(slug) + '?key=' + encodeURIComponent(ch.stream_key);
        }

        function enumerateDevices() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
            navigator.mediaDevices.enumerateDevices().then(function (devices) {
                var vidSel = el('bcast-video-select');
                var audSel = el('bcast-audio-select');
                if (!vidSel || !audSel) return;
                var vids = devices.filter(function (d) { return d.kind === 'videoinput'; });
                var auds = devices.filter(function (d) { return d.kind === 'audioinput'; });
                if (vids.length) {
                    vidSel.innerHTML = vids.map(function (d, i) {
                        return '<option value="' + esc(d.deviceId) + '">' + esc(d.label || 'Camera ' + i) + '</option>';
                    }).join('');
                }
                if (auds.length) {
                    audSel.innerHTML = auds.map(function (d, i) {
                        return '<option value="' + esc(d.deviceId) + '">' + esc(d.label || 'Mic ' + i) + '</option>';
                    }).join('');
                }
            }).catch(function () {});
        }

        function getVideoConstraints() {
            var resSel = el('bcast-res');
            var fpsSel = el('bcast-fps');
            var vidSel = el('bcast-video-select');
            var res = resSel ? resSel.value : '1280x720';
            var parts = res.split('x');
            var w = parseInt(parts[0]) || 1280;
            var h = parseInt(parts[1]) || 720;
            var fps = parseInt(fpsSel ? fpsSel.value : '30') || 30;
            var deviceId = vidSel ? vidSel.value : '';
            var c = { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps } };
            if (deviceId) c.deviceId = { exact: deviceId };
            return c;
        }

        function getAudioConstraints() {
            var audSel = el('bcast-audio-select');
            var deviceId = audSel ? audSel.value : '';
            var c = { echoCancellation: true, noiseSuppression: true };
            if (deviceId) c.deviceId = { exact: deviceId };
            return c;
        }

        function acquireMedia(source) {
            currentSource = source;
            stopStreams();

            if (source === 'camera') {
                return navigator.mediaDevices.getUserMedia({ video: getVideoConstraints(), audio: getAudioConstraints() })
                    .then(function (stream) {
                        localStream = stream;
                        var preview = el('bcast-preview');
                        if (preview) { preview.srcObject = stream; }
                        var pipWrap = el('bcast-pip-overlay');
                        if (pipWrap) pipWrap.style.display = 'none';
                        enumerateDevices();
                    });
            } else if (source === 'screen') {
                return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true })
                    .then(function (stream) {
                        screenStream = stream;
                        var preview = el('bcast-preview');
                        if (preview) { preview.srcObject = stream; }
                        var pipWrap = el('bcast-pip-overlay');
                        if (pipWrap) pipWrap.style.display = 'none';
                        stream.getVideoTracks()[0].addEventListener('ended', function () {
                            if (pc) stopBroadcast('Screen share ended');
                            else stopStreams();
                        });
                        // Try to get mic
                        return navigator.mediaDevices.getUserMedia({ audio: getAudioConstraints() })
                            .then(function (micStream) { localStream = micStream; })
                            .catch(function () {});
                    });
            } else if (source === 'screen+camera') {
                return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false })
                    .then(function (scStream) {
                        screenStream = scStream;
                        return navigator.mediaDevices.getUserMedia({ video: getVideoConstraints(), audio: getAudioConstraints() });
                    })
                    .then(function (camStream) {
                        localStream = camStream;
                        var mainPreview = el('bcast-preview');
                        if (mainPreview) { mainPreview.srcObject = screenStream; }
                        var pipVideo = el('bcast-pip-video');
                        if (pipVideo) { pipVideo.srcObject = camStream; }
                        var pipWrap = el('bcast-pip-overlay');
                        if (pipWrap) pipWrap.style.display = '';
                        screenStream.getVideoTracks()[0].addEventListener('ended', function () {
                            if (pc) stopBroadcast('Screen share ended');
                            else stopStreams();
                        });
                        enumerateDevices();
                    });
            }
            return Promise.resolve();
        }

        function stopStreams() {
            if (localStream) { localStream.getTracks().forEach(function (t) { t.stop(); }); localStream = null; }
            if (screenStream) { screenStream.getTracks().forEach(function (t) { t.stop(); }); screenStream = null; }
            var preview = el('bcast-preview');
            if (preview) { try { preview.srcObject = null; } catch (_) {} }
        }

        function startBroadcast() {
            var startBtn = el('bcast-start-btn');
            if (startBtn) startBtn.disabled = true;
            setStatus('Requesting media access…');

            var whipUrl = getWhipUrl();
            if (!whipUrl) {
                setStatus('Select a channel with a stream key first.', true);
                if (startBtn) startBtn.disabled = false;
                return;
            }

            var mediaPromise = (localStream || screenStream) ? Promise.resolve() : acquireMedia(currentSource);

            mediaPromise
                .then(function () {
                    setStatus('Connecting…');
                    var iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
                    pc = new RTCPeerConnection({ iceServers: iceServers });

                    var videoTrack = null, audioTrack = null;

                    if (currentSource === 'screen+camera') {
                        if (screenStream) screenStream.getVideoTracks().forEach(function (t) { videoTrack = t; pc.addTrack(t, screenStream); });
                        if (localStream) localStream.getAudioTracks().forEach(function (t) { audioTrack = t; pc.addTrack(t, localStream); });
                    } else if (currentSource === 'screen') {
                        if (screenStream) {
                            screenStream.getVideoTracks().forEach(function (t) { videoTrack = t; pc.addTrack(t, screenStream); });
                            screenStream.getAudioTracks().forEach(function (t) { audioTrack = t; pc.addTrack(t, screenStream); });
                        }
                        if (localStream) localStream.getAudioTracks().forEach(function (t) { if (!audioTrack) { audioTrack = t; pc.addTrack(t, localStream); } });
                    } else {
                        if (localStream) localStream.getTracks().forEach(function (t) {
                            if (t.kind === 'video') videoTrack = t;
                            if (t.kind === 'audio') audioTrack = t;
                            pc.addTrack(t, localStream);
                        });
                    }

                    return pc.createOffer().then(function (offer) {
                        return pc.setLocalDescription(offer);
                    }).then(function () {
                        return new Promise(function (resolve) {
                            var timeout = setTimeout(function () { resolve(pc.localDescription.sdp); }, 3000);
                            pc.addEventListener('icegatheringstatechange', function () {
                                if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(pc.localDescription.sdp); }
                            });
                            if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(pc.localDescription.sdp); }
                        });
                    }).then(function (sdp) {
                        return fetch(whipUrl, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: sdp });
                    }).then(function (resp) {
                        if (!resp.ok) return resp.json().catch(function () { return {}; }).then(function (e) {
                            throw new Error(e.error || 'WHIP failed (' + resp.status + ')');
                        });
                        whipResourceUrl = resp.headers.get('Location') || null;
                        return resp.text();
                    }).then(function (answerSdp) {
                        return pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
                    }).then(function () {
                        pc.addEventListener('connectionstatechange', function () {
                            var s = pc.connectionState;
                            if (s === 'failed' || s === 'disconnected') stopBroadcast('Connection lost');
                        });
                        showLiveControls(videoTrack, audioTrack);
                        setStatus('');
                    });
                })
                .catch(function (err) {
                    setStatus(err.message, true);
                    if (pc) { try { pc.close(); } catch (_) {} pc = null; }
                    if (startBtn) startBtn.disabled = false;
                });
        }

        function showLiveControls(videoTrack, audioTrack) {
            var idleEl = el('bcast-idle-controls');
            var liveEl = el('bcast-live-controls');
            var badgeEl = el('bcast-live-badge');
            if (idleEl) idleEl.style.display = 'none';
            if (liveEl) liveEl.style.display = '';
            if (badgeEl) badgeEl.style.display = '';

            startedAt = Date.now();
            timerInterval = setInterval(function () {
                var elapsed = Math.floor((Date.now() - startedAt) / 1000);
                var h = Math.floor(elapsed / 3600);
                var m = Math.floor((elapsed % 3600) / 60);
                var s = elapsed % 60;
                var timerEl = el('bcast-timer');
                if (timerEl) {
                    timerEl.textContent = (h ? String(h).padStart(2, '0') + ':' : '') +
                        String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
                }
            }, 1000);

            var muteVidBtn = el('bcast-mute-video');
            if (muteVidBtn) {
                muteVidBtn.onclick = function () {
                    videoMuted = !videoMuted;
                    if (videoTrack) videoTrack.enabled = !videoMuted;
                    muteVidBtn.textContent = videoMuted ? 'Cam Off' : 'Cam On';
                    muteVidBtn.classList.toggle('dash-btn-danger', videoMuted);
                };
            }

            var muteAudBtn = el('bcast-mute-audio');
            if (muteAudBtn) {
                muteAudBtn.onclick = function () {
                    audioMuted = !audioMuted;
                    if (audioTrack) audioTrack.enabled = !audioMuted;
                    muteAudBtn.textContent = audioMuted ? 'Mic Off' : 'Mic On';
                    muteAudBtn.classList.toggle('dash-btn-danger', audioMuted);
                };
            }

            var endBtn = el('bcast-end-btn');
            if (endBtn) {
                endBtn.onclick = function () {
                    if (confirm('End this broadcast?')) stopBroadcast('Ended by user');
                };
            }
        }

        function stopBroadcast(reason) {
            clearInterval(timerInterval); timerInterval = null;
            if (whipResourceUrl) {
                fetch(whipResourceUrl, { method: 'DELETE' }).catch(function () {});
                whipResourceUrl = null;
            }
            if (pc) { try { pc.close(); } catch (_) {} pc = null; }
            stopStreams();

            var idleEl = el('bcast-idle-controls');
            var liveEl = el('bcast-live-controls');
            var badgeEl = el('bcast-live-badge');
            if (idleEl) idleEl.style.display = '';
            if (liveEl) liveEl.style.display = 'none';
            if (badgeEl) badgeEl.style.display = 'none';

            var startBtn = el('bcast-start-btn');
            if (startBtn) startBtn.disabled = false;

            setStatus(reason ? 'Broadcast ended: ' + reason : 'Broadcast ended.');
            videoMuted = false; audioMuted = false;
        }

        function setupListeners() {
            if (initialized) return;
            initialized = true;

            // Source buttons
            var srcBtns = document.querySelectorAll('.bcast-source-btn');
            for (var i = 0; i < srcBtns.length; i++) {
                (function (btn) {
                    btn.addEventListener('click', function () {
                        var source = btn.getAttribute('data-source');
                        if (!source) return;
                        for (var j = 0; j < srcBtns.length; j++) srcBtns[j].classList.remove('active');
                        btn.classList.add('active');
                        currentSource = source;
                        var vg = el('bcast-video-group');
                        if (vg) vg.style.display = (source === 'camera' || source === 'screen+camera') ? '' : 'none';
                        acquireMedia(source).catch(function (err) { setStatus(err.message, true); });
                    });
                })(srcBtns[i]);
            }

            var startBtn = el('bcast-start-btn');
            if (startBtn) {
                startBtn.addEventListener('click', function () { startBroadcast(); });
            }
        }

        function onTabOpen() {
            setupListeners();
            enumerateDevices();
            var whipUrl = getWhipUrl();
            var noteEl = el('bcast-note');
            if (noteEl) {
                noteEl.textContent = whipUrl ? '' : 'Select a channel in the sidebar to enable broadcasting.';
                noteEl.style.display = whipUrl ? 'none' : '';
            }
            // Start camera preview if nothing active
            if (!localStream && !screenStream) {
                acquireMedia('camera').catch(function () {});
            }
        }

        return { onTabOpen: onTabOpen, stopBroadcast: stopBroadcast };
    })();

    // ── init ───────────────────────────────────────────────────────────────────

    renderSlots();
    renderDestSidebar();
    if (state.channels.length) {
        openChannel(state.channels[0].slug);
    }

})();
