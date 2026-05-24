/**
 * stream-manager.js — go-live page client v=20260524-3
 *
 * Two-panel stream manager: sidebar channel slots + right editor panel.
 * Includes browser broadcast via WHIP (WebRTC-HTTP Ingestion Protocol).
 * Plain JS IIFE — no module system, no bundler.
 */
(function () {
    'use strict';

    if (!document.querySelector('[data-stream-manager]')) return;

    // ── helpers ──────────────────────────────────────────────────────────────
    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function el(s) { return document.querySelector(s); }
    function els(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
    function setContent(selector, html) {
        var t = typeof selector === 'string' ? el(selector) : selector;
        if (t) t.innerHTML = html;
    }
    function show(elem) { if (elem) elem.style.display = ''; }
    function hide(elem) { if (elem) elem.style.display = 'none'; }
    function setStatus(key, text, isError) {
        var span = el('[data-sm-status="' + key + '"]');
        if (!span) return;
        span.textContent = text;
        span.className = 'sm-status-text ' + (isError ? 'err' : text ? 'ok' : '');
    }
    function clearStatus(key) { setStatus(key, ''); }
    function pill(label, tone) { return '<span class="pill ' + esc(tone || 'soft') + '">' + esc(label) + '</span>'; }
    function timeAgo(ts) {
        if (!ts) return 'just now';
        var d = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
        if (d < 60)    return d + 's ago';
        if (d < 3600)  return Math.floor(d / 60) + 'm ago';
        if (d < 86400) return Math.floor(d / 3600) + 'h ago';
        return Math.floor(d / 86400) + 'd ago';
    }
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta); ta.focus(); ta.select();
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
            if (!res.ok) return res.json().catch(function () { return {}; }).then(function (e) {
                throw new Error(e.error || e.message || 'Request failed (' + res.status + ')');
            });
            return res.json();
        });
    }

    // ── state ────────────────────────────────────────────────────────────────
    var state = {
        channels: [],
        destinations: [],
        streams: [],
        restreamUrl: '',
        accountUrl: '',
        chatUrl: '',
        activeChannelSlug: null,
        activeStreamId: null,
        activeView: 'none',
        activeProtocol: 'whip',
        settingsDirty: false,
    };

    // ── floating save bar ────────────────────────────────────────────────────
    function ensureSaveBar() {
        if (el('#sm-save-bar')) return;
        var bar = document.createElement('div');
        bar.id = 'sm-save-bar';
        bar.className = 'sm-save-bar sm-save-bar-hidden';
        bar.innerHTML =
            '<span id="sm-save-status">Unsaved changes</span>' +
            '<button class="sm-btn-ghost" id="sm-save-discard-btn" type="button">Discard</button>' +
            '<button class="sm-btn-primary" id="sm-save-btn" type="button">Save changes</button>';
        document.body.appendChild(bar);
        el('#sm-save-btn').addEventListener('click', saveChannelSettings);
        el('#sm-save-discard-btn').addEventListener('click', discardSettings);
    }
    function markSettingsDirty() {
        state.settingsDirty = true;
        ensureSaveBar();
        var bar = el('#sm-save-bar');
        if (bar) bar.classList.remove('sm-save-bar-hidden');
        var s = el('#sm-save-status'); if (s) s.textContent = 'Unsaved changes';
    }
    function clearSmDirty() {
        state.settingsDirty = false;
        var bar = el('#sm-save-bar');
        if (bar) bar.classList.add('sm-save-bar-hidden');
    }
    function saveChannelSettings() {
        var slug = state.activeChannelSlug;
        var sf = el('#sm-settings-form');
        if (!slug || !sf) return;
        var saveBtn = el('#sm-save-btn');
        var staticBtn = sf.querySelector('[type="submit"]');
        if (saveBtn) saveBtn.disabled = true;
        if (staticBtn) staticBtn.disabled = true;
        var s = el('#sm-save-status'); if (s) s.textContent = 'Saving…';
        clearStatus('settings-form');
        var fd = new FormData(sf);
        api('PATCH', '/api/v1/go-live/channels/' + encodeURIComponent(slug), {
            display_name: fd.get('display_name'), description: fd.get('description'),
            visibility: fd.get('visibility'), nsfw: fd.get('nsfw') === '1',
            recording_enabled: fd.get('recording_enabled') === '1',
            chat_enabled: fd.get('chat_enabled') === '1',
            metadata: { default_protocol: fd.get('preferred_protocol') || 'whip' },
        }).then(function (res) {
            var ch = res.channel || res;
            if (ch && ch.slug) {
                var idx = state.channels.findIndex(function (c) { return c.slug === ch.slug; });
                if (idx >= 0) state.channels[idx] = Object.assign({}, state.channels[idx], ch);
                renderSlots();
            }
            clearSmDirty();
            setStatus('settings-form', 'Saved!');
            if (s) { s.textContent = 'Saved!'; setTimeout(function () { if (!state.settingsDirty && s) s.textContent = 'Unsaved changes'; }, 1500); }
        }).catch(function (err) {
            setStatus('settings-form', err.message, true);
            if (s) s.textContent = 'Error: ' + err.message;
        }).finally(function () {
            if (saveBtn) saveBtn.disabled = false;
            if (staticBtn) staticBtn.disabled = false;
        });
    }
    function discardSettings() {
        clearSmDirty();
        if (state.activeChannelSlug) openChannel(state.activeChannelSlug);
    }

    // ── views ────────────────────────────────────────────────────────────────
    function showView(view) {
        state.activeView = view;
        hide(el('[data-sm-no-slot]'));
        hide(el('[data-sm-slot-editor]'));
        hide(el('[data-sm-new-channel]'));
        if (view === 'none')             show(el('[data-sm-no-slot]'));
        else if (view === 'slot')        show(el('[data-sm-slot-editor]'));
        else if (view === 'new-channel') show(el('[data-sm-new-channel]'));
    }

    // ── sidebar slot list ─────────────────────────────────────────────────────
    function protoLabel(ch) {
        var meta = ch.metadata || ch.metadata_json || {};
        var p = meta.default_protocol || meta.protocol || ch.default_protocol || 'rtmp';
        return p.toLowerCase();
    }

    function renderSlots() {
        var slotsEl = el('[data-sm-slots]');
        if (!slotsEl) return;
        if (!state.channels.length) {
            slotsEl.innerHTML = '<div class="sm-slot-skeleton">No channels — hit + to create one.</div>';
            return;
        }
        slotsEl.innerHTML = state.channels.map(function (ch) {
            var proto = protoLabel(ch);
            var isLive = !!(ch.is_live);
            var active = state.activeChannelSlug === ch.slug ? ' active' : '';
            return '<div class="sm-slot-item' + active + '" data-slot-slug="' + esc(ch.slug) + '">' +
                '<div class="sm-slot-dot' + (isLive ? ' live' : '') + '"></div>' +
                '<div class="sm-slot-info">' +
                    '<div class="sm-slot-title">' + esc(ch.display_name || ch.slug) + '</div>' +
                    '<div class="sm-slot-meta">' +
                        '<span class="sm-slot-proto ' + esc(proto) + '">' + esc(proto.toUpperCase()) + '</span>' +
                        ' <span>/' + esc(ch.slug) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function renderDestSidebar() {
        var listEl = el('[data-sm-dest-list]');
        if (!listEl) return;
        if (!state.destinations.length) {
            listEl.innerHTML = '<div class="sm-slot-skeleton" style="font-size:0.78rem">None yet</div>';
            return;
        }
        listEl.innerHTML = state.destinations.map(function (d) {
            var active = state.activeView === 'destinations' ? ' active' : '';
            return '<div class="sm-dest-item' + active + '" data-dest-item>' +
                '<span class="sm-dest-kind-badge">' + esc(d.kind || 'rtmp') + '</span>' +
                '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.82rem;">' + esc(d.label || d.kind || 'Destination') + '</span>' +
            '</div>';
        }).join('');
    }

    // ── open channel in editor ────────────────────────────────────────────────
    function openChannel(slug) {
        var ch = state.channels.filter(function (c) { return c.slug === slug; })[0];
        if (!ch) return;
        state.activeChannelSlug = slug;
        renderSlots();

        var nameEl = el('[data-sm-slot-name]');
        var linkEl = el('[data-sm-slot-link]');
        var chatEl = el('[data-sm-slot-chat]');
        var slugPrefixEl = el('[data-sm-slug-prefix]');

        if (nameEl) nameEl.textContent = ch.display_name || ('@' + ch.slug);
        if (linkEl) { linkEl.textContent = 'openvibe.live/@' + ch.slug; linkEl.href = '/channels/' + slug; }
        if (chatEl) chatEl.href = '/channels/' + slug + '#chat';
        if (slugPrefixEl) slugPrefixEl.textContent = 'openvibe.live/@' + ch.slug + '/';

        var settingsForm = el('#sm-settings-form');
        if (settingsForm) {
            settingsForm.querySelector('[name="slug"]').value = ch.slug;
            settingsForm.querySelector('[name="display_name"]').value = ch.display_name || '';
            settingsForm.querySelector('[name="description"]').value = ch.description || '';
            var vis = settingsForm.querySelector('[name="visibility"]');
            if (vis) vis.value = ch.visibility || 'public';
            var rec = settingsForm.querySelector('[name="recording_enabled"]');
            if (rec) rec.checked = ch.recording_enabled !== false;
            var chat = settingsForm.querySelector('[name="chat_enabled"]');
            if (chat) chat.checked = ch.chat_enabled !== false;
            var nsfw = settingsForm.querySelector('[name="nsfw"]');
            if (nsfw) nsfw.checked = !!(ch.nsfw || ch.is_nsfw);
            var keyInput = settingsForm.querySelector('[name="stream_key_display"]');
            if (keyInput) keyInput.value = ch.stream_key || '';
        }

        renderHistory(slug);

        var chStreams = state.streams.filter(function (s) { return s.channel_slug === slug; });
        var liveStream = chStreams.filter(function (s) { return s.is_live; })[0] || null;
        // Set activeProtocol from the current/latest stream's protocol if available;
        // fall back to the channel's saved preferred_protocol / metadata.default_protocol
        var currentStreamProto = (liveStream || chStreams[0] || null);
        var prefProto = (ch.metadata && (ch.metadata.default_protocol || ch.metadata.protocol)) || ch.preferred_protocol || 'whip';
        if (currentStreamProto && currentStreamProto.protocol) {
            state.activeProtocol = currentStreamProto.protocol;
        } else {
            state.activeProtocol = prefProto;
        }
        // Reflect method card selection on Stream form
        var streamForm2 = el('#sm-stream-form');
        if (streamForm2) {
            els('[data-method]').forEach(function (c) { c.classList.remove('active'); });
            var matchCard = el('[data-method="' + state.activeProtocol + '"]');
            if (matchCard) matchCard.classList.add('active');
            var methodInput = streamForm2.querySelector('[name="protocol"]');
            if (methodInput) methodInput.value = state.activeProtocol;
        }
        // Populate Settings preferred method
        if (settingsForm) {
            var prefInput = settingsForm.querySelector('[name="preferred_protocol"]');
            if (prefInput) prefInput.value = prefProto;
            els('#sm-settings-method-grid [data-settings-method]').forEach(function (c) {
                c.classList.toggle('active', c.getAttribute('data-settings-method') === prefProto);
            });
        }
        renderEndpoint(liveStream || chStreams[0] || null, ch);
        updateStreamButtons(liveStream);

        // Sync inline broadcast visibility
        var inlineBcast = el('#sm-inline-broadcast');
        if (inlineBcast) inlineBcast.style.display = state.activeProtocol === 'browser' ? '' : 'none';

        // Wire settings form fields to dirty tracker (once per channel load)
        clearSmDirty();
        var sForm = el('#sm-settings-form');
        if (sForm) {
            sForm.querySelectorAll('input, textarea, select').forEach(function (inp) {
                inp.removeEventListener('change', markSettingsDirty);
                inp.removeEventListener('input', markSettingsDirty);
                if (inp.type === 'hidden' || inp.name === 'stream_key_display') return;
                var ev = (inp.type === 'checkbox' || inp.tagName === 'SELECT') ? 'change' : 'input';
                inp.addEventListener(ev, markSettingsDirty);
            });
        }

        showView('slot');
        activateStab('stream');
    }

    // ── sub-tabs ──────────────────────────────────────────────────────────────
    function activateStab(tabName) {
        els('[data-sm-stab-bar] [data-sm-stab]').forEach(function (b) {
            var isActive = b.getAttribute('data-sm-stab') === tabName;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-selected', String(isActive));
        });
        els('[data-sm-stab-panel]').forEach(function (p) {
            p.style.display = p.getAttribute('data-sm-stab-panel') === tabName ? '' : 'none';
        });
    }

    var stabBar = el('[data-sm-stab-bar]');
    if (stabBar) {
        stabBar.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-sm-stab]');
            if (!btn) return;
            activateStab(btn.getAttribute('data-sm-stab'));
        });
    }

    // ── settings method cards ─────────────────────────────────────────────────
    document.addEventListener('click', function (e) {
        var sCard = e.target.closest('[data-settings-method]');
        if (sCard) {
            var grid = el('#sm-settings-method-grid');
            if (grid && grid.contains(sCard)) {
                els('#sm-settings-method-grid [data-settings-method]').forEach(function (c) { c.classList.remove('active'); });
                sCard.classList.add('active');
                var prefInput = el('#sm-settings-form [name="preferred_protocol"]');
                if (prefInput) prefInput.value = sCard.getAttribute('data-settings-method');
                markSettingsDirty();
                return;
            }
        }
    });

    // ── streaming method cards ────────────────────────────────────────────────
    document.addEventListener('click', function (e) {
        var card = e.target.closest('[data-method]');
        if (!card) return;
        var form = el('#sm-stream-form');
        if (!form || !form.contains(card)) return;
        els('[data-method]').forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        var m = card.getAttribute('data-method');
        var methodInput = form.querySelector('[name="protocol"]');
        if (methodInput) methodInput.value = m;
        state.activeProtocol = m;
        var autoBox = el('[data-sm-autodetect]');
        if (autoBox) {
            autoBox.style.display = (m === 'whip' || m === 'rtmp' || m === 'cli') ? '' : 'none';
        }
        // Show inline broadcast when browser method selected
        var inlineBcast = el('#sm-inline-broadcast');
        if (inlineBcast) inlineBcast.style.display = m === 'browser' ? '' : 'none';
        if (m === 'browser') {
            bcast.updatePrereqNote();
            if (inlineBcast) bcast.enumerateDevices();
        }
        // Refresh endpoint panel if we have an active channel
        if (state.activeChannelSlug) {
            var ch = state.channels.filter(function (c) { return c.slug === state.activeChannelSlug; })[0];
            var activeStream = state.activeStreamId ? state.streams.filter(function (s) { return String(s.id) === String(state.activeStreamId); })[0] : null;
            if (ch) renderEndpoint(activeStream || null, ch);
        }
    });

    // ── history panel ─────────────────────────────────────────────────────────
    function renderHistory(channelSlug) {
        var historyEl = el('[data-sm-history-panel]');
        if (!historyEl) return;
        var chStreams = channelSlug
            ? state.streams.filter(function (s) { return s.channel_slug === channelSlug; })
            : state.streams;
        if (!chStreams.length) {
            historyEl.innerHTML = '<p class="sm-note">No recent streams for this channel.</p>';
            return;
        }
        historyEl.innerHTML = chStreams.slice(0, 15).map(function (s) {
            var sp = s.is_live ? pill('Live', 'live') : pill(s.status || 'ended', 'soft');
            var endBtn = s.is_live
                ? '<button class="sm-btn-ghost" style="padding:0.35rem 0.7rem;font-size:0.78rem;" data-sm-action="end-stream" data-stream-id="' + esc(s.id) + '">End</button>'
                : '';
            return '<div class="sm-history-item">' +
                '<div>' +
                    '<div class="sm-history-title">' + sp + ' ' + esc(s.title || 'Untitled stream') + '</div>' +
                    '<div class="sm-history-meta">' + esc(timeAgo(s.started_at || s.created_at)) + '</div>' +
                '</div>' + endBtn + '</div>';
        }).join('');
    }

    // ── endpoint panel (inline, below method selection) ───────────────────────
    function renderEndpoint(stream, channel) {
        var panel = el('[data-sm-inline-endpoint]');
        if (!panel) return;
        var proto = (stream && stream.protocol) || state.activeProtocol || 'rtmp';
        var streamKey = (stream && (stream.stream_key || stream.key))
            || (channel && channel.stream_key)
            || (channel && channel.metadata && channel.metadata.stream_key) || '';
        var rtmpUrl   = (stream && stream.rtmp_url)
            || (channel && channel.rtmp_url)
            || (state.restreamUrl && channel ? state.restreamUrl.replace(/\/$/, '') + '/live' : '');
        var whipUrl   = (stream && stream.whip_url)
            || (channel && channel.whip_url)
            || (state.restreamUrl && channel ? state.restreamUrl.replace(/\/$/, '') + '/whip/' + channel.slug : '');

        function row(label, value) {
            if (!value) return '';
            return '<div class="sm-endpoint-row">' +
                '<div class="sm-endpoint-label">' + esc(label) + '</div>' +
                '<div class="sm-endpoint-value-row">' +
                    '<div class="sm-endpoint-code">' + esc(value) + '</div>' +
                    '<button class="sm-icon-btn" data-sm-action="copy-value" data-copy="' + esc(value) + '" title="Copy">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                    '</button>' +
                '</div>' +
            '</div>';
        }

        if (proto === 'browser') {
            panel.style.display = 'none';
            panel.innerHTML = '';
            return;
        }

        if (!rtmpUrl && !whipUrl && !streamKey) {
            panel.style.display = 'none';
            panel.innerHTML = '';
            return;
        }

        panel.style.display = '';

        if (proto === 'whip') {
            var sessionNote = !stream
                ? '<p class="sm-note" style="margin-top:0.75rem;color:#fbbf24;">No active stream session — go to the Stream tab to create one before broadcasting.</p>'
                : '';
            panel.innerHTML =
                row('WHIP ENDPOINT', whipUrl) +
                row('STREAM KEY', streamKey) +
                sessionNote +
                '<p class="sm-note" style="margin-top:0.5rem;">In OBS 30+: Settings → Stream → Service: WHIP → paste the endpoint URL. Use the stream key as the bearer token.</p>';
        } else if (proto === 'cli') {
            var rtmpFull = rtmpUrl && streamKey ? rtmpUrl.replace(/\/$/, '') + '/' + streamKey : '';
            var rtmpTarget = rtmpFull || (rtmpUrl ? rtmpUrl.replace(/\/$/, '') + '/<stream-key>' : 'rtmp://ingest.openre.stream/live/<stream-key>');
            var whipTarget = whipUrl || 'https://openre.stream/whip/<channel-slug>';
            var sessionNote = !streamKey ? '<p class="sm-note" style="color:#fbbf24;margin:0 0 0.75rem;">No stream key — select a channel to load your persistent credentials.</p>' : '';
            panel.innerHTML =
                sessionNote +
                '<div class="sm-cli-section">' +
                    '<div class="sm-cli-section-title">RTMP — OBS / Streamlabs / FFmpeg</div>' +
                    row('RTMP SERVER', rtmpUrl || 'rtmp://ingest.openre.stream/live') +
                    row('STREAM KEY', streamKey) +
                    cliCmd('Webcam + Audio', 'ffmpeg -f v4l2 -i /dev/video0 -f alsa -i default \\\n  -c:v libx264 -preset veryfast -b:v 2500k \\\n  -c:a aac -b:a 128k -f flv ' + rtmpTarget) +
                    cliCmd('Screen Capture (Linux X11)', 'ffmpeg -f x11grab -s 1920x1080 -r 30 -i :0.0 \\\n  -f pulse -i default \\\n  -c:v libx264 -preset veryfast -b:v 3000k \\\n  -c:a aac -b:a 128k -f flv ' + rtmpTarget) +
                    cliCmd('Screen Capture (macOS)', 'ffmpeg -f avfoundation -framerate 30 -i "1:0" \\\n  -c:v libx264 -preset veryfast -b:v 3000k \\\n  -c:a aac -b:a 128k -f flv ' + rtmpTarget) +
                    cliCmd('MP4 / File Loop (24/7)', 'ffmpeg -re -stream_loop -1 -i video.mp4 \\\n  -c:v libx264 -preset veryfast -b:v 2500k \\\n  -c:a aac -b:a 128k -f flv ' + rtmpTarget) +
                    cliCmd('RTSP / IP Camera', 'ffmpeg -rtsp_transport tcp -i rtsp://user:pass@192.168.1.100:554/stream \\\n  -c:v libx264 -preset veryfast -b:v 2000k \\\n  -c:a aac -b:a 96k -f flv ' + rtmpTarget) +
                    cliCmd('Raspberry Pi Camera → RTMP', 'rpicam-vid -t 0 --width 1280 --height 720 --framerate 30 \\\n  --codec h264 --bitrate 2000000 -o - | \\\n  ffmpeg -f h264 -i - -c:v copy -an -f flv ' + rtmpTarget) +
                '</div>' +
                '<div class="sm-cli-section">' +
                    '<div class="sm-cli-section-title">WHIP — WebRTC (FFmpeg 7+ / GStreamer)</div>' +
                    row('WHIP ENDPOINT', whipTarget) +
                    '<div class="sm-endpoint-row"><div class="sm-endpoint-label">BEARER TOKEN</div><div class="sm-note" style="font-size:0.8rem;padding:0.2rem 0 0;">Use stream key as bearer token — FFmpeg -f whip passes it automatically</div></div>' +
                    cliCmd('Camera + Audio → WHIP (FFmpeg 7+)', 'ffmpeg -f v4l2 -i /dev/video0 -f alsa -i default \\\n  -c:v libx264 -preset veryfast -tune zerolatency -b:v 2500k \\\n  -c:a libopus -b:a 128k -ar 48000 \\\n  -f whip "' + whipTarget + '"') +
                    cliCmd('Screen Capture (Linux) → WHIP', 'ffmpeg -f x11grab -s 1920x1080 -r 30 -i :0.0 \\\n  -f pulse -i default \\\n  -c:v libx264 -preset veryfast -tune zerolatency -b:v 3000k \\\n  -c:a libopus -b:a 128k -ar 48000 \\\n  -f whip "' + whipTarget + '"') +
                    cliCmd('MP4 / File Loop → WHIP', 'ffmpeg -re -stream_loop -1 -i video.mp4 \\\n  -c:v libx264 -preset veryfast -tune zerolatency -b:v 2500k \\\n  -c:a libopus -b:a 128k -ar 48000 \\\n  -f whip "' + whipTarget + '"') +
                    cliCmd('Raspberry Pi Camera → WHIP', 'rpicam-vid -t 0 --width 1280 --height 720 --framerate 30 \\\n  --codec h264 --bitrate 2000000 -o - | \\\n  ffmpeg -f h264 -i - -c:v copy \\\n  -c:a libopus -b:a 96k -ar 48000 \\\n  -f whip "' + whipTarget + '"') +
                    cliCmd('GStreamer WHIP', 'gst-launch-1.0 v4l2src ! videoconvert ! \\\n  x264enc tune=zerolatency bitrate=2500 ! video/x-h264,profile=baseline ! \\\n  whipsink whip-endpoint="' + whipTarget + '"') +
                '</div>';
        } else {
            panel.innerHTML =
                row('RTMP SERVER URL', rtmpUrl) +
                row('STREAM KEY', streamKey) +
                '<p class="sm-note" style="margin-top:0.75rem;">Paste RTMP URL and stream key into OBS → Settings → Stream.</p>';
        }
    }

    // ── destinations full panel ───────────────────────────────────────────────
    function renderDestFull() {
        var listEl = el('[data-sm-dest-list-full]');
        if (!listEl) return;
        if (!state.destinations.length) {
            listEl.innerHTML = '<p class="sm-note">No destinations yet.</p>';
            return;
        }
        listEl.innerHTML = state.destinations.map(function (d) {
            var meta = d.metadata || {};
            var qualityParts = [];
            if (meta.resolution) qualityParts.push(meta.resolution);
            if (meta.bitrate_kbps) qualityParts.push(meta.bitrate_kbps + ' kbps');
            var qualityNote = qualityParts.length ? ' · ' + qualityParts.join(', ') : '';
            return '<div class="sm-dest-full-item">' +
                '<div>' +
                    '<span class="sm-dest-kind-badge">' + esc(d.kind || 'rtmp') + '</span> ' +
                    '<strong>' + esc(d.label || d.kind || 'Destination') + '</strong>' +
                    (d.enabled === false ? ' <span class="pill soft">Disabled</span>' : '') +
                    (d.target_url ? '<div class="sm-note" style="margin-top:0.15rem;font-size:0.76rem;">' + esc(d.target_url) + esc(qualityNote) + '</div>' : '') +
                '</div>' +
                '<button class="sm-icon-btn sm-icon-btn-danger" data-sm-action="delete-destination" data-dest-id="' + esc(d.id) + '" title="Remove">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
                '</button>' +
            '</div>';
        }).join('');
    }

    // ── stream form button state ──────────────────────────────────────────────
    function updateStreamButtons(liveStream) {
        var createBtn = el('#sm-create-stream-btn');
        var goLiveBtn = el('#sm-go-live-btn');
        var endBtn    = el('#sm-end-stream-btn');
        var liveTab   = el('[data-sm-stab="live"]');
        if (liveStream && liveStream.is_live) {
            hide(createBtn); hide(goLiveBtn); show(endBtn);
            if (liveTab) show(liveTab);
            activateLiveTab(liveStream);
            startChatPoll(liveStream);
        } else {
            if (state.activeStreamId) { hide(createBtn); show(goLiveBtn); hide(endBtn); }
            else { show(createBtn); hide(goLiveBtn); hide(endBtn); }
            if (liveTab) hide(liveTab);
            stopChatPoll();
        }
    }

    // ── live tab ──────────────────────────────────────────────────────────────
    var _whepPreviewPc = null;
    var _whepPreviewResourceUrl = null;

    function activateLiveTab(stream) {
        activateStab('live');
        var slug = stream.channel_slug || state.activeChannelSlug || '';
        var watchUrl = slug ? '/@' + slug : '/';
        var previewInner = el('#sm-live-preview-inner');
        if (previewInner && !previewInner.querySelector('video')) {
            var video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true;
            video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;border-radius:6px;';
            previewInner.appendChild(video);
            var whepBase = state.restreamUrl ? state.restreamUrl.replace(/\/$/, '') : '';
            if (whepBase && slug) startWhepPreview(video, whepBase, slug);
        }
        var watchLink = el('#sm-live-watch-link');
        if (watchLink) watchLink.href = watchUrl;
        var chatPopout = el('#sm-live-chat-popout');
        if (chatPopout) chatPopout.href = watchUrl + '#chat';
        var liveEndBtn = el('#sm-live-end-btn');
        if (liveEndBtn && !liveEndBtn._wired) {
            liveEndBtn._wired = true;
            liveEndBtn.addEventListener('click', function () {
                var endBtn2 = el('#sm-end-stream-btn');
                if (endBtn2) endBtn2.click();
            });
        }
    }

    async function startWhepPreview(video, whepBase, slug) {
        try {
            if (_whepPreviewPc) { try { _whepPreviewPc.close(); } catch (_) {} _whepPreviewPc = null; }
            var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            pc.addTransceiver('video', { direction: 'recvonly' });
            pc.addTransceiver('audio', { direction: 'recvonly' });
            pc.ontrack = function (ev) {
                if (ev.streams && ev.streams[0] && !video.srcObject) {
                    video.srcObject = ev.streams[0];
                    video.play().catch(function () {});
                }
            };
            var offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (pc.iceGatheringState !== 'complete') {
                await new Promise(function (resolve) {
                    var fn = function () { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', fn); resolve(); } };
                    pc.addEventListener('icegatheringstatechange', fn);
                    setTimeout(resolve, 5000);
                });
            }
            var resp = await fetch(whepBase + '/whep/' + encodeURIComponent(slug), {
                method: 'POST',
                headers: { 'Content-Type': 'application/sdp' },
                body: pc.localDescription.sdp,
            });
            if (!resp.ok) { console.warn('[live-tab] WHEP ' + resp.status); pc.close(); return; }
            _whepPreviewResourceUrl = resp.headers.get('Location') || null;
            var answer = await resp.text();
            await pc.setRemoteDescription({ type: 'answer', sdp: answer });
            _whepPreviewPc = pc;
            pc.onconnectionstatechange = function () {
                if (pc.connectionState === 'failed') {
                    setTimeout(function () { if (_whepPreviewPc === pc) startWhepPreview(video, whepBase, slug); }, 3000);
                }
            };
        } catch (err) {
            console.warn('[live-tab] WHEP preview error:', err.message);
        }
    }

    // ── inline chat ───────────────────────────────────────────────────────────
    var _chatPollTimer = null;
    var _chatLastTs = null;
    var _chatStreamId = null;
    var _viewerPollTimer = null;
    var _liveTimerInterval = null;
    var _liveStartedAt = null;

    function startChatPoll(stream) {
        if (_chatStreamId === String(stream.id)) return;
        stopChatPoll();
        _chatStreamId = String(stream.id);
        _chatLastTs = null;
        pollChat(stream.id);
        _chatPollTimer = setInterval(function () { pollChat(stream.id); }, 4000);

        // Viewer count polling
        var slug = stream.channel_slug || state.activeChannelSlug || '';
        if (slug && state.restreamUrl) {
            pollViewerCount(slug);
            _viewerPollTimer = setInterval(function () { pollViewerCount(slug); }, 8000);
        }

        // Live timer
        _liveStartedAt = stream.started_at ? new Date(stream.started_at).getTime() : Date.now();
        updateLiveTimer();
        _liveTimerInterval = setInterval(updateLiveTimer, 1000);
    }

    function stopChatPoll() {
        if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
        if (_viewerPollTimer) { clearInterval(_viewerPollTimer); _viewerPollTimer = null; }
        if (_liveTimerInterval) { clearInterval(_liveTimerInterval); _liveTimerInterval = null; }
        _chatStreamId = null;
        _chatLastTs = null;
        _liveStartedAt = null;
        if (_whepPreviewPc) {
            try { _whepPreviewPc.close(); } catch (_) {}
            _whepPreviewPc = null;
        }
        if (_whepPreviewResourceUrl) {
            try { fetch(_whepPreviewResourceUrl, { method: 'DELETE' }).catch(function () {}); } catch (_) {}
            _whepPreviewResourceUrl = null;
        }
        var preview = el('#sm-live-preview-inner');
        if (preview) preview.innerHTML = '';
    }

    function pollViewerCount(slug) {
        var base = state.restreamUrl ? state.restreamUrl.replace(/\/$/, '') : '';
        if (!base || !slug) return;
        fetch(base + '/viewer-count/' + encodeURIComponent(slug))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data) return;
                var countEl = el('#sm-live-viewers-display');
                if (countEl) countEl.textContent = (data.viewer_count || 0) + ' viewer' + (data.viewer_count === 1 ? '' : 's');
            })
            .catch(function () {});
    }

    function updateLiveTimer() {
        if (!_liveStartedAt) return;
        var elapsed = Math.floor((Date.now() - _liveStartedAt) / 1000);
        var h = Math.floor(elapsed / 3600);
        var m = Math.floor((elapsed % 3600) / 60);
        var s = elapsed % 60;
        var timerEl = el('#sm-live-timer-display');
        if (timerEl) {
            timerEl.textContent = (h ? String(h).padStart(2, '0') + ':' : '') +
                String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }
    }

    function pollChat(streamId) {
        var base = state.chatUrl || '';
        if (!base) return;
        var url = base + '/api/chat/stream/' + encodeURIComponent(streamId) + '/history?limit=40';
        fetch(url, { mode: 'cors', credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
            if (!data || !data.items) return;
            var msgs = data.items;
            if (!msgs.length) return;
            _chatLastTs = msgs[msgs.length - 1].created_at || null;
            appendChatMessages(msgs);
        }).catch(function () {});
    }

    function appendChatMessages(msgs) {
        var box = el('#sm-chat-messages');
        if (!box) return;
        var placeholder = box.querySelector('.sm-note');
        if (placeholder) placeholder.remove();
        var atBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 60;
        msgs.forEach(function (m) {
            var line = document.createElement('div');
            line.style.cssText = 'display:flex;gap:0.35rem;align-items:flex-start;line-height:1.4;';
            var sender = esc(m.sender_name || m.actor_display_name || 'Anon');
            var text = esc(m.content || m.body || '');
            line.innerHTML = '<span style="font-weight:600;white-space:nowrap;opacity:0.85;">' + sender + '</span>' +
                '<span style="opacity:0.7;">' + text + '</span>';
            box.appendChild(line);
        });
        if (atBottom) box.scrollTop = box.scrollHeight;
    }

    var chatSendForm = el('#sm-chat-send-form');
    if (chatSendForm) {
        chatSendForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var input = el('#sm-chat-input');
            var text = input ? input.value.trim() : '';
            var base = state.chatUrl || '';
            if (!text || !_chatStreamId || !base) return;
            fetch(base + '/api/chat/stream/' + encodeURIComponent(_chatStreamId) + '/send', {
                method: 'POST', mode: 'cors', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: text }),
            }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
                if (data && data.message) appendChatMessages([data.message]);
            }).catch(function () {});
            if (input) input.value = '';
        });
    }

    // ── load dashboard ────────────────────────────────────────────────────────
    function loadDashboard() {
        api('GET', '/api/v1/go-live/dashboard').then(function (data) {
            state.channels     = data.channels     || [];
            state.destinations = data.destinations || [];
            state.streams      = data.streams      || [];
            state.restreamUrl  = data.restream_url  || '';
            state.accountUrl   = data.account_url   || '';
            state.chatUrl      = data.chat_url       || '';
            renderSlots();
            renderDestSidebar();
            renderDestFull();
            if (state.channels.length) openChannel(state.channels[0].slug);
            else showView('none');
        }).catch(function (err) {
            var slotsEl = el('[data-sm-slots]');
            if (slotsEl) slotsEl.innerHTML = '<div class="sm-slot-skeleton" style="color:#f87171">Failed to load: ' + esc(err.message) + '</div>';
            showView('none');
        });
    }

    // ── delegated click handler ───────────────────────────────────────────────
    document.addEventListener('click', function (e) {
        var slotItem = e.target.closest('[data-slot-slug]');
        if (slotItem) { openChannel(slotItem.getAttribute('data-slot-slug')); return; }

        var destItem = e.target.closest('[data-dest-item]');
        if (destItem) {
            renderDestFull();
            if (state.activeChannelSlug) {
                activateStab('restream');
            } else if (state.channels.length) {
                openChannel(state.channels[0].slug);
                activateStab('restream');
            }
            return;
        }

        var btn = e.target.closest('[data-sm-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-sm-action');

        if (action === 'new-channel') {
            state.activeChannelSlug = null; renderSlots(); showView('new-channel'); return;
        }
        if (action === 'cancel-new-channel') {
            if (state.channels.length) openChannel(state.channels[0].slug); else showView('none'); return;
        }
        if (action === 'copy-value') {
            var val = btn.getAttribute('data-copy');
            if (!val) return;
            copyText(val).then(function () {
                var orig = btn.innerHTML;
                btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                setTimeout(function () { btn.innerHTML = orig; }, 1500);
            });
            return;
        }
        if (action === 'copy-stream-key') {
            var sf = el('#sm-settings-form');
            var ki = sf && sf.querySelector('[name="stream_key_display"]');
            if (ki && ki.value) copyText(ki.value).then(function () { setStatus('settings-form', 'Key copied!'); setTimeout(function () { clearStatus('settings-form'); }, 1500); });
            return;
        }
        if (action === 'toggle-key-visibility') {
            var ki2 = el('#sm-settings-form [name="stream_key_display"]');
            if (ki2) ki2.type = ki2.type === 'password' ? 'text' : 'password';
            return;
        }
        if (action === 'regenerate-key') {
            var slug = state.activeChannelSlug;
            if (!slug || !confirm('Regenerate stream key for @' + slug + '? Any running stream will be cut.')) return;
            btn.disabled = true;
            api('POST', '/api/v1/go-live/channels/' + encodeURIComponent(slug) + '/regenerate-key', {})
                .then(function (res) {
                    var ch = res.channel || res;
                    if (ch && ch.stream_key) {
                        var ki3 = el('#sm-settings-form [name="stream_key_display"]');
                        if (ki3) ki3.value = ch.stream_key;
                        var idx = state.channels.findIndex(function (c) { return c.slug === ch.slug; });
                        if (idx >= 0) state.channels[idx] = Object.assign({}, state.channels[idx], ch);
                        setStatus('settings-form', 'New key — copy it now!');
                    }
                }).catch(function (err) { setStatus('settings-form', err.message, true); })
                  .finally(function () { btn.disabled = false; });
            return;
        }
        if (action === 'end-stream') {
            var sid = btn.getAttribute('data-stream-id') || state.activeStreamId;
            if (!sid || !confirm('End this stream?')) return;
            btn.disabled = true;
            api('POST', '/api/v1/go-live/streams/' + encodeURIComponent(sid) + '/end', {})
                .then(function (res) {
                    var s = res.stream || res;
                    if (s) {
                        var idx2 = state.streams.findIndex(function (x) { return x.id === s.id; });
                        if (idx2 >= 0) state.streams[idx2] = s;
                        if (String(state.activeStreamId) === String(sid)) state.activeStreamId = null;
                        if (state.activeChannelSlug) renderHistory(state.activeChannelSlug);
                        updateStreamButtons(null); setStatus('stream-form', 'Stream ended.');
                    }
                }).catch(function (err) { alert('Failed: ' + err.message); btn.disabled = false; });
            return;
        }
        if (action === 'delete-destination') {
            var id = btn.getAttribute('data-dest-id');
            if (!id || !confirm('Remove this destination?')) return;
            btn.disabled = true;
            api('DELETE', '/api/v1/go-live/destinations/' + encodeURIComponent(id))
                .then(function () {
                    state.destinations = state.destinations.filter(function (d) { return d.id !== id; });
                    renderDestSidebar(); renderDestFull();
                }).catch(function (err) { alert('Delete failed: ' + err.message); btn.disabled = false; });
            return;
        }
    });

    // ── new channel form ──────────────────────────────────────────────────────
    var newChannelForm = el('#sm-new-channel-form');
    if (newChannelForm) {
        newChannelForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(newChannelForm);
            var btn2 = newChannelForm.querySelector('[type="submit"]');
            if (btn2) btn2.disabled = true; clearStatus('new-channel');
            api('POST', '/api/v1/go-live/channels', {
                slug: fd.get('slug'), display_name: fd.get('display_name'),
                description: fd.get('description'), nsfw: fd.get('nsfw') === '1',
            }).then(function (res) {
                var ch = res.live_channel || res.channel || res;
                if (ch && ch.slug) {
                    state.channels.push(ch); newChannelForm.reset();
                    setStatus('new-channel', 'Channel created!');
                    setTimeout(function () { openChannel(ch.slug); }, 600);
                }
            }).catch(function (err) { setStatus('new-channel', err.message, true); })
              .finally(function () { if (btn2) btn2.disabled = false; });
        });
    }

    // ── settings form ─────────────────────────────────────────────────────────
    var settingsForm = el('#sm-settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', function (e) {
            e.preventDefault();
            saveChannelSettings();
        });
    }

    // ── stream form ───────────────────────────────────────────────────────────
    var streamForm = el('#sm-stream-form');
    if (streamForm) {
        streamForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var slug = state.activeChannelSlug;
            if (!slug) { setStatus('stream-form', 'Select a channel first.', true); return; }
            var fd = new FormData(streamForm);
            var btn4 = streamForm.querySelector('[type="submit"]');
            if (btn4) btn4.disabled = true; clearStatus('stream-form');
            var proto = fd.get('protocol') || 'whip';
            state.activeProtocol = proto;
            api('POST', '/api/v1/go-live/streams', {
                channel_slug: slug, title: fd.get('title'),
                description: fd.get('description'), category: fd.get('category'),
                protocol: fd.get('protocol') || 'whip', nsfw: fd.get('nsfw') === '1',
                recording_enabled: true, url_slug: fd.get('url_slug') || undefined,
            }).then(function (res) {
                var s = res.stream || res;
                if (s && s.id) {
                    state.activeStreamId = s.id; s.channel_slug = slug; state.streams.unshift(s);
                    var ch = state.channels.filter(function (c) { return c.slug === slug; })[0];
                    renderEndpoint(s, ch); renderHistory(slug); updateStreamButtons(s.is_live ? s : null);
                    setStatus('stream-form', 'Stream created — ingest details shown above.');
                }
            }).catch(function (err) { setStatus('stream-form', err.message, true); })
              .finally(function () { if (btn4) btn4.disabled = false; });
        });
    }

    var goLiveBtn = el('#sm-go-live-btn');
    if (goLiveBtn) {
        goLiveBtn.addEventListener('click', function () {
            var id = state.activeStreamId;
            if (!id) { setStatus('stream-form', 'No stream created yet.', true); return; }
            goLiveBtn.disabled = true;
            api('POST', '/api/v1/go-live/streams/' + encodeURIComponent(id) + '/start', {})
                .then(function (res) {
                    var s = res.stream || res;
                    if (s) {
                        var idx = state.streams.findIndex(function (x) { return x.id === s.id; });
                        if (idx >= 0) state.streams[idx] = s;
                        updateStreamButtons(s); setStatus('stream-form', 'Stream is live!');
                        if (state.activeChannelSlug) renderHistory(state.activeChannelSlug);
                    }
                }).catch(function (err) { setStatus('stream-form', err.message, true); })
                  .finally(function () { goLiveBtn.disabled = false; });
        });
    }

    var endStreamBtn = el('#sm-end-stream-btn');
    if (endStreamBtn) {
        endStreamBtn.addEventListener('click', function () {
            var id = state.activeStreamId;
            if (!id || !confirm('End this stream?')) return;
            endStreamBtn.disabled = true;
            api('POST', '/api/v1/go-live/streams/' + encodeURIComponent(id) + '/end', {})
                .then(function (res) {
                    var s = res.stream || res;
                    if (s) {
                        var idx = state.streams.findIndex(function (x) { return x.id === s.id; });
                        if (idx >= 0) state.streams[idx] = s;
                        state.activeStreamId = null; updateStreamButtons(null);
                        if (state.activeChannelSlug) renderHistory(state.activeChannelSlug);
                        setStatus('stream-form', 'Stream ended.');
                    }
                }).catch(function (err) { setStatus('stream-form', err.message, true); })
                  .finally(function () { endStreamBtn.disabled = false; });
        });
    }

    // ── destinations form ─────────────────────────────────────────────────────
    var destForm = el('#sm-dest-form');
    if (destForm) {
        // Preset quick-add buttons pre-fill the form fields
        var presetContainer = destForm.closest('[data-sm-stab-panel]');
        if (presetContainer) {
            presetContainer.addEventListener('click', function (e) {
                var btn = e.target.closest('.sm-dest-preset-btn');
                if (!btn) return;
                var kind = btn.getAttribute('data-preset-kind') || 'custom';
                var label = btn.getAttribute('data-preset-label') || '';
                var url = btn.getAttribute('data-preset-url') || '';
                var kindSel = destForm.querySelector('[name="kind"]');
                var labelInput = destForm.querySelector('[name="label"]');
                var urlInput = destForm.querySelector('[name="target_url"]');
                var keyInput = destForm.querySelector('[name="target_key"]');
                if (kindSel) kindSel.value = kind;
                if (labelInput) labelInput.value = label;
                if (urlInput) urlInput.value = url;
                if (keyInput) { keyInput.value = ''; keyInput.focus(); }
                var hintEl = document.getElementById('sm-dest-key-hint');
                var hintText = btn.getAttribute('data-preset-key-hint') || '';
                if (hintEl) { hintEl.textContent = hintText; hintEl.style.display = hintText ? '' : 'none'; }
                destForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        }
        destForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(destForm);
            var btn5 = destForm.querySelector('[type="submit"]');
            if (btn5) btn5.disabled = true; clearStatus('dest-form');
            api('POST', '/api/v1/go-live/destinations', {
                kind: fd.get('kind'), label: fd.get('label'),
                target_url: fd.get('target_url'), target_key: fd.get('target_key'),
                enabled: fd.get('enabled') === '1',
                metadata: {
                    resolution: fd.get('dest_resolution') || null,
                    bitrate_kbps: fd.get('dest_bitrate') ? parseInt(fd.get('dest_bitrate'), 10) : null,
                },
            }).then(function (res) {
                var d = res.destination || res;
                if (d && d.id) {
                    state.destinations.push(d); destForm.reset();
                    var ecb = destForm.querySelector('[name="enabled"]'); if (ecb) ecb.checked = true;
                    renderDestSidebar(); renderDestFull(); setStatus('dest-form', 'Destination saved!');
                }
            }).catch(function (err) { setStatus('dest-form', err.message, true); })
              .finally(function () { if (btn5) btn5.disabled = false; });
        });
    }

    // ── browser broadcast (WHIP) ──────────────────────────────────────────────
    var bcast = (function () {
        var localStream = null;     // camera/mic
        var screenStream = null;    // screen share
        var pc = null;              // RTCPeerConnection
        var whipResourceUrl = null; // DELETE endpoint
        var timerInterval = null;
        var startedAt = null;
        var videoMuted = false;
        var audioMuted = false;
        var currentSource = 'camera';

        function statusEl() { return el('#sm-bcast-status'); }
        function setStatus(msg, isErr) {
            var s = statusEl(); if (!s) return;
            s.textContent = msg;
            s.className = 'sm-status-text' + (isErr ? ' err' : (msg ? '' : ''));
        }
        function liveStatusEl() { return el('#sm-bcast-live-status'); }
        function setLiveStatus(msg) { var s = liveStatusEl(); if (s) s.textContent = msg; }

        function getWhipBase() {
            return state.restreamUrl ? state.restreamUrl.replace(/\/$/, '') : 'https://openre.stream';
        }
        function getWhipUrl() {
            var slug = state.activeChannelSlug;
            var ch = state.channels.filter(function (c) { return c.slug === slug; })[0];
            var key = ch && ch.stream_key;
            if (!slug || !key) return null;
            return getWhipBase() + '/whip/' + encodeURIComponent(slug) + '?key=' + encodeURIComponent(key);
        }

        function updatePrereqNote() {
            var noteEl = el('#sm-bcast-prereq-note');
            if (!noteEl) return;
            if (!state.activeChannelSlug) {
                noteEl.textContent = 'Select a channel first, then create a stream on the Stream tab.';
            } else if (!state.activeStreamId) {
                noteEl.textContent = 'Create a stream on the Stream tab first, then start broadcasting here.';
            } else {
                noteEl.textContent = '';
            }
        }

        function enumerateDevices() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
            navigator.mediaDevices.enumerateDevices().then(function (devices) {
                var vidSel = el('#sm-bcast-video-select');
                var audSel = el('#sm-bcast-audio-select');
                if (!vidSel || !audSel) return;
                var vids = devices.filter(function (d) { return d.kind === 'videoinput'; });
                var auds = devices.filter(function (d) { return d.kind === 'audioinput'; });
                if (vids.length) {
                    vidSel.innerHTML = vids.map(function (d) {
                        return '<option value="' + esc(d.deviceId) + '">' + esc(d.label || 'Camera ' + vids.indexOf(d)) + '</option>';
                    }).join('');
                }
                if (auds.length) {
                    audSel.innerHTML = auds.map(function (d) {
                        return '<option value="' + esc(d.deviceId) + '">' + esc(d.label || 'Mic ' + auds.indexOf(d)) + '</option>';
                    }).join('');
                }
            }).catch(function () {});
        }

        function getVideoConstraints() {
            var resSel = el('#sm-bcast-res');
            var fpsSel = el('#sm-bcast-fps');
            var vidSel = el('#sm-bcast-video-select');
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
            var audSel = el('#sm-bcast-audio-select');
            var deviceId = audSel ? audSel.value : '';
            var c = { echoCancellation: true, noiseSuppression: true };
            if (deviceId) c.deviceId = { exact: deviceId };
            return c;
        }

        async function acquireMedia(source) {
            currentSource = source;
            stopStreams();

            if (source === 'camera') {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: getVideoConstraints(),
                    audio: getAudioConstraints(),
                });
                var preview = el('#sm-bcast-preview');
                if (preview) { preview.srcObject = localStream; }
                hide(el('#sm-bcast-pip-overlay'));
            } else if (source === 'screen') {
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: { ideal: 30 } },
                    audio: true,
                });
                // Also get mic
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({ audio: getAudioConstraints() });
                } catch (_) {}
                var preview2 = el('#sm-bcast-preview');
                if (preview2) { preview2.srcObject = screenStream; }
                hide(el('#sm-bcast-pip-overlay'));
                // Stop broadcast if screen share ends
                screenStream.getVideoTracks()[0].addEventListener('ended', function () {
                    if (pc) stopBroadcast('Screen share ended');
                    else stopPreview();
                });
            } else if (source === 'screen+camera') {
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: { ideal: 30 } },
                    audio: false,
                });
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: getVideoConstraints(),
                    audio: getAudioConstraints(),
                });
                var mainPreview = el('#sm-bcast-preview');
                if (mainPreview) { mainPreview.srcObject = screenStream; }
                var pipVideo = el('#sm-bcast-pip');
                if (pipVideo) { pipVideo.srcObject = localStream; }
                show(el('#sm-bcast-pip-overlay'));
                screenStream.getVideoTracks()[0].addEventListener('ended', function () {
                    if (pc) stopBroadcast('Screen share ended');
                    else stopPreview();
                });
            }
            // Re-enumerate devices after getUserMedia (labels become available)
            enumerateDevices();
            return localStream || screenStream;
        }

        function stopStreams() {
            if (localStream) { localStream.getTracks().forEach(function (t) { t.stop(); }); localStream = null; }
            if (screenStream) { screenStream.getTracks().forEach(function (t) { t.stop(); }); screenStream = null; }
            var preview = el('#sm-bcast-preview');
            if (preview) { try { preview.srcObject = null; } catch (_) {} }
        }

        function stopPreview() {
            stopStreams();
        }

        async function startBroadcast() {
            var startBtn = el('#sm-bcast-start-btn');
            if (startBtn) startBtn.disabled = true;
            setStatus('Requesting media access…');

            var whipUrl = getWhipUrl();
            if (!whipUrl) {
                setStatus('Create a stream first (Stream tab) to get a stream key.', true);
                if (startBtn) startBtn.disabled = false;
                return;
            }

            try {
                // Acquire media if not already previewing
                if (!localStream && !screenStream) {
                    await acquireMedia(currentSource);
                }

                setStatus('Connecting to ingest server…');

                // Build RTC peer connection with TURN/STUN
                var iceServers = [
                    { urls: 'stun:stun.l.google.com:19302' },
                ];
                // Use server TURN if available
                if (state.turnConfig) {
                    iceServers.push(state.turnConfig);
                }

                pc = new RTCPeerConnection({ iceServers: iceServers });

                // Add tracks to peer connection
                var videoTrack = null;
                var audioTrack = null;

                if (currentSource === 'screen+camera') {
                    // Main video: screen
                    var screenVideoTracks = screenStream ? screenStream.getVideoTracks() : [];
                    if (screenVideoTracks.length) {
                        videoTrack = screenVideoTracks[0];
                        pc.addTrack(videoTrack, screenStream);
                    }
                    // Mix camera audio + screen audio
                    var camAudioTracks = localStream ? localStream.getAudioTracks() : [];
                    if (camAudioTracks.length) {
                        audioTrack = camAudioTracks[0];
                        pc.addTrack(audioTrack, localStream);
                    }
                } else if (currentSource === 'screen') {
                    var sVideoTracks = screenStream ? screenStream.getVideoTracks() : [];
                    if (sVideoTracks.length) {
                        videoTrack = sVideoTracks[0];
                        pc.addTrack(videoTrack, screenStream);
                    }
                    // Use mic audio if available
                    var micTracks = localStream ? localStream.getAudioTracks() : [];
                    var screenAudioTracks = screenStream ? screenStream.getAudioTracks() : [];
                    var micOrScreen = micTracks.length ? micTracks[0] : (screenAudioTracks.length ? screenAudioTracks[0] : null);
                    if (micOrScreen) {
                        audioTrack = micOrScreen;
                        pc.addTrack(audioTrack, micOrScreen.stream || localStream || screenStream);
                    }
                } else {
                    // Camera
                    if (localStream) {
                        localStream.getTracks().forEach(function (t) {
                            if (t.kind === 'video') videoTrack = t;
                            if (t.kind === 'audio') audioTrack = t;
                            pc.addTrack(t, localStream);
                        });
                    }
                }

                // Create SDP offer
                var offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                // Wait for ICE gathering
                var sdp = await new Promise(function (resolve, reject) {
                    var timeout = setTimeout(function () { resolve(pc.localDescription.sdp); }, 3000);
                    pc.addEventListener('icegatheringstatechange', function () {
                        if (pc.iceGatheringState === 'complete') {
                            clearTimeout(timeout);
                            resolve(pc.localDescription.sdp);
                        }
                    });
                    if (pc.iceGatheringState === 'complete') {
                        clearTimeout(timeout);
                        resolve(pc.localDescription.sdp);
                    }
                });

                // Send WHIP offer
                var resp = await fetch(whipUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/sdp' },
                    body: sdp,
                });

                if (!resp.ok) {
                    var errJson = await resp.json().catch(function () { return {}; });
                    throw new Error(errJson.error || 'WHIP offer failed (' + resp.status + ')');
                }

                whipResourceUrl = resp.headers.get('Location') || null;
                var answerSdp = await resp.text();
                await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

                pc.addEventListener('connectionstatechange', function () {
                    var cstate = pc.connectionState;
                    setLiveStatus(cstate === 'connected' ? '' : cstate);
                    if (cstate === 'failed' || cstate === 'disconnected') {
                        stopBroadcast('Connection lost');
                    }
                });

                // Success — show live controls
                setStatus('');
                showLiveControls(videoTrack, audioTrack);
                setStatus('');

                // Signal stream as started via openvibe-live API
                if (state.activeStreamId) {
                    api('POST', '/api/v1/go-live/streams/' + encodeURIComponent(state.activeStreamId) + '/start', {})
                        .catch(function () {});
                }

            } catch (err) {
                setStatus(err.message, true);
                if (pc) { try { pc.close(); } catch (_) {} pc = null; }
                if (startBtn) startBtn.disabled = false;
            }
        }

        function showLiveControls(videoTrack, audioTrack) {
            hide(el('#sm-bcast-idle-controls'));
            show(el('#sm-bcast-live-controls'));
            show(el('#sm-bcast-live-badge'));

            startedAt = Date.now();
            timerInterval = setInterval(function () {
                var elapsed = Math.floor((Date.now() - startedAt) / 1000);
                var h = Math.floor(elapsed / 3600);
                var m = Math.floor((elapsed % 3600) / 60);
                var s = elapsed % 60;
                var timerEl = el('#sm-bcast-timer');
                if (timerEl) {
                    timerEl.textContent = (h ? String(h).padStart(2, '0') + ':' : '') +
                        String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
                }
            }, 1000);

            // Mute video
            var muteVideoBtn = el('#sm-bcast-mute-video-btn');
            if (muteVideoBtn) {
                muteVideoBtn.onclick = function () {
                    videoMuted = !videoMuted;
                    if (videoTrack) videoTrack.enabled = !videoMuted;
                    muteVideoBtn.innerHTML = videoMuted
                        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/></svg> Cam Off'
                        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg> Cam On';
                };
            }

            // Mute audio
            var muteAudioBtn = el('#sm-bcast-mute-audio-btn');
            if (muteAudioBtn) {
                muteAudioBtn.onclick = function () {
                    audioMuted = !audioMuted;
                    if (audioTrack) audioTrack.enabled = !audioMuted;
                    muteAudioBtn.innerHTML = audioMuted
                        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Mic Off'
                        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Mic On';
                };
            }

            // End broadcast
            var endBtn = el('#sm-bcast-end-btn');
            if (endBtn) {
                endBtn.onclick = function () {
                    if (confirm('End this broadcast?')) stopBroadcast('Ended by user');
                };
            }
        }

        function stopBroadcast(reason) {
            clearInterval(timerInterval); timerInterval = null;

            // Send WHIP DELETE
            if (whipResourceUrl) {
                fetch(whipResourceUrl, { method: 'DELETE' }).catch(function () {});
                whipResourceUrl = null;
            }

            if (pc) { try { pc.close(); } catch (_) {} pc = null; }

            stopStreams();

            hide(el('#sm-bcast-live-controls'));
            hide(el('#sm-bcast-live-badge'));
            show(el('#sm-bcast-idle-controls'));
            var startBtn = el('#sm-bcast-start-btn');
            if (startBtn) startBtn.disabled = false;

            setStatus(reason ? 'Broadcast ended: ' + reason : 'Broadcast ended.');

            // End stream via API
            if (state.activeStreamId) {
                api('POST', '/api/v1/go-live/streams/' + encodeURIComponent(state.activeStreamId) + '/end', {})
                    .then(function (res) {
                        var s = res.stream || res;
                        if (s) {
                            var idx = state.streams.findIndex(function (x) { return x.id === s.id; });
                            if (idx >= 0) state.streams[idx] = s;
                            state.activeStreamId = null;
                            updateStreamButtons(null);
                            if (state.activeChannelSlug) renderHistory(state.activeChannelSlug);
                        }
                    }).catch(function () {});
            }

            videoMuted = false; audioMuted = false;
        }

        // Source selection buttons
        document.addEventListener('click', function (e) {
            var srcBtn = e.target.closest('.sm-bcast-source-btn');
            if (!srcBtn) return;
            var source = srcBtn.getAttribute('data-source');
            if (!source) return;
            els('.sm-bcast-source-btn').forEach(function (b) { b.classList.remove('active'); });
            srcBtn.classList.add('active');
            currentSource = source;
            var videoGroup = el('#sm-bcast-video-group');
            if (videoGroup) videoGroup.style.display = (source === 'camera' || source === 'screen+camera') ? '' : 'none';
            // Start preview
            acquireMedia(source).catch(function (err) { setStatus(err.message, true); });
        });

        // Start broadcast button
        var startBtn = el('#sm-bcast-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', function () {
                startBroadcast();
            });
        }

        return { updatePrereqNote: updatePrereqNote, stopBroadcast: stopBroadcast, enumerateDevices: enumerateDevices };
    })();

    // ── boot ──────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadDashboard);
    } else {
        loadDashboard();
    }
})();
