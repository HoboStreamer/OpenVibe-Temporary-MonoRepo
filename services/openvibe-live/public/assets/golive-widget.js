/* golive-widget.js — standalone go-live button for the OpenVibe network topbar.
 * Injects a broadcast button next to the theme icon. Handles camera + screen
 * WHIP broadcasts inline. "Manage stream" always opens a new tab so the
 * active connection is never interrupted by navigation.
 */
(function () {
    'use strict';

    var TOKEN_KEY = 'openvibe.bridge.token';

    // ── surface resolution ────────────────────────────────────────────────────

    function resolveLiveBase() {
        if (window.OpenVibe && typeof OpenVibe.resolveSurfaceUrl === 'function') {
            return OpenVibe.resolveSurfaceUrl('live');
        }
        var h = location.hostname;
        if (h === 'localhost' || h.endsWith('.localhost')) return 'http://openvibe.live.localhost:4600';
        return 'https://openvibe.live';
    }

    function resolveRestreamBase() {
        if (window.OpenVibe && typeof OpenVibe.resolveSurfaceUrl === 'function') {
            return OpenVibe.resolveSurfaceUrl('restream');
        }
        var h = location.hostname;
        if (h === 'localhost' || h.endsWith('.localhost')) return 'http://openre.stream.localhost:4700';
        return 'https://openre.stream';
    }

    // ── auth ──────────────────────────────────────────────────────────────────

    function getBearerToken() {
        try { return sessionStorage.getItem(TOKEN_KEY) || null; } catch (_) { return null; }
    }

    async function liveApi(method, path, body) {
        var token = getBearerToken();
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        var opts = { method: method, mode: 'cors', credentials: 'include', headers: headers };
        if (body) opts.body = JSON.stringify(body);
        var r = await fetch(resolveLiveBase() + path, opts);
        if (!r.ok) {
            var msg = 'Live API error ' + r.status;
            try { var j = await r.json(); msg = j.error || msg; } catch (_) {}
            throw new Error(msg);
        }
        return r.json();
    }

    // ── channel resolution ────────────────────────────────────────────────────

    async function getOrCreateChannel() {
        var data = await liveApi('GET', '/api/v1/go-live/dashboard');
        var ch = data.channels && data.channels[0];
        if (!ch) {
            var created = await liveApi('POST', '/api/v1/go-live/channels', { protocol: 'whip' });
            ch = created.live_channel || created.channel || created;
        }
        if (!ch || !ch.slug) throw new Error('Could not resolve channel');
        return { slug: ch.slug, streamKey: ch.stream_key, restreamUrl: data.restream_url || resolveRestreamBase(), iceServers: data.ice_servers || null };
    }

    // ── WHIP ──────────────────────────────────────────────────────────────────

    var pc = null;
    var liveStream = null;
    var activeStreamId = null;

    function whipUrl(restreamUrl, slug) {
        return restreamUrl.replace(/\/$/, '') + '/whip/' + encodeURIComponent(slug);
    }

    async function startWhip(mediaStream, restreamUrl, slug, streamKey, iceServers) {
        pc = new RTCPeerConnection({ iceServers: (iceServers && iceServers.length) ? iceServers : [{ urls: 'stun:stun.l.google.com:19302' }] });
        mediaStream.getTracks().forEach(function (t) { pc.addTrack(t, mediaStream); });
        var offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        var sdp = await new Promise(function (resolve) {
            if (pc.iceGatheringState === 'complete') { resolve(pc.localDescription.sdp); return; }
            var done = false;
            var t = setTimeout(function () { if (!done) { done = true; resolve(pc.localDescription.sdp); } }, 3000);
            pc.onicegatheringstatechange = function () {
                if (pc.iceGatheringState === 'complete' && !done) {
                    done = true; clearTimeout(t); resolve(pc.localDescription.sdp);
                }
            };
        });
        var r = await fetch(whipUrl(restreamUrl, slug), {
            method: 'POST',
            headers: { 'Content-Type': 'application/sdp', 'Authorization': 'Bearer ' + streamKey },
            body: sdp,
        });
        if (!r.ok) {
            var msg = 'WHIP ' + r.status;
            try { var j = await r.json(); msg = j.error || msg; } catch (_) {}
            throw new Error(msg);
        }
        var answer = await r.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    }

    function stopWhip() {
        if (pc) { try { pc.close(); } catch (_) {} pc = null; }
        if (liveStream) { liveStream.getTracks().forEach(function (t) { t.stop(); }); liveStream = null; }
    }

    // ── styles ────────────────────────────────────────────────────────────────

    var CSS = [
        '.ov-golive-wrap{position:relative;display:flex;align-items:center;}',
        '.ov-golive-btn{all:unset;cursor:pointer;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;color:var(--ov-text-dim,#a7b5d2);transition:color .15s,background .15s;}',
        '.ov-golive-btn:hover{color:var(--ov-text,#eef4ff);background:rgba(255,255,255,.07);}',
        '.ov-golive-btn.is-live{color:#f87171;animation:ov-golive-pulse 2s ease-in-out infinite;}',
        '@keyframes ov-golive-pulse{0%,100%{opacity:1}50%{opacity:.55}}',
        '.ov-golive-panel{position:absolute;top:calc(100% + 10px);right:0;width:220px;background:color-mix(in srgb,var(--ov-bg,#060917) 92%,white);border:1px solid var(--ov-border,rgba(148,163,184,.14));border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.45);z-index:9999;overflow:hidden;padding:.5rem;}',
        '.ov-golive-panel[hidden]{display:none;}',
        '.ov-golive-panel-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ov-text-dim,#a7b5d2);padding:.35rem .6rem .2rem;margin:0;}',
        '.ov-golive-option{display:flex;align-items:center;gap:.6rem;width:100%;padding:.55rem .7rem;border-radius:10px;background:none;border:none;cursor:pointer;color:var(--ov-text,#eef4ff);font-size:.85rem;font-family:inherit;transition:background .12s;text-align:left;}',
        '.ov-golive-option:hover{background:rgba(255,255,255,.07);}',
        '.ov-golive-option svg{flex-shrink:0;color:var(--ov-text-dim,#a7b5d2);}',
        '.ov-golive-divider{border:none;border-top:1px solid var(--ov-border,rgba(148,163,184,.12));margin:.35rem 0;}',
        '.ov-golive-manage{display:flex;align-items:center;gap:.6rem;padding:.5rem .7rem;border-radius:10px;color:var(--ov-text-dim,#a7b5d2);font-size:.82rem;text-decoration:none;transition:background .12s,color .12s;}',
        '.ov-golive-manage:hover{background:rgba(255,255,255,.05);color:var(--ov-text,#eef4ff);}',
        '.ov-golive-status{font-size:.72rem;padding:.3rem .7rem .5rem;color:var(--ov-text-dim,#a7b5d2);display:none;}',
        '.ov-golive-status.visible{display:block;}',
        '.ov-golive-status.error{color:#f87171;}',
        '.ov-golive-live-row{display:flex;align-items:center;gap:.6rem;padding:.45rem .7rem;border-radius:10px;background:rgba(239,68,68,.08);margin-bottom:.25rem;}',
        '.ov-golive-live-dot{width:8px;height:8px;border-radius:50%;background:#f87171;flex-shrink:0;animation:ov-golive-pulse 1.5s ease-in-out infinite;}',
        '.ov-golive-live-label{font-size:.8rem;font-weight:700;color:#f87171;flex:1;}',
        '.ov-golive-stop{all:unset;cursor:pointer;font-size:.75rem;color:#f87171;padding:.2rem .5rem;border-radius:6px;border:1px solid rgba(248,113,113,.35);transition:background .12s;}',
        '.ov-golive-stop:hover{background:rgba(248,113,113,.12);}',
    ].join('');

    // ── icons ─────────────────────────────────────────────────────────────────

    var ICON_BROADCAST = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M7.76 7.76a6 6 0 0 0 0 8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/></svg>';
    var ICON_CAMERA    = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 7 16 12l7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
    var ICON_SCREEN    = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/></svg>';
    var ICON_MANAGE    = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

    // ── DOM injection ─────────────────────────────────────────────────────────

    function inject() {
        if (document.getElementById('ov-golive-wrap')) return;

        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        var wrap = document.createElement('div');
        wrap.className = 'ov-golive-wrap';
        wrap.id = 'ov-golive-wrap';
        wrap.innerHTML =
            '<button class="ov-golive-btn" id="ov-golive-btn" type="button" aria-label="Go live" title="Go live">' + ICON_BROADCAST + '</button>' +
            '<div class="ov-golive-panel" id="ov-golive-panel" hidden>' +
                '<p class="ov-golive-panel-title">Go live</p>' +
                '<div id="ov-golive-live-row" class="ov-golive-live-row" style="display:none;">' +
                    '<span class="ov-golive-live-dot"></span>' +
                    '<span class="ov-golive-live-label">Live</span>' +
                    '<button class="ov-golive-stop" id="ov-golive-stop-btn" type="button">End</button>' +
                '</div>' +
                '<button class="ov-golive-option" id="ov-golive-camera-btn" type="button">' + ICON_CAMERA + 'Camera</button>' +
                '<button class="ov-golive-option" id="ov-golive-screen-btn" type="button">' + ICON_SCREEN + 'Share screen</button>' +
                '<hr class="ov-golive-divider">' +
                '<a class="ov-golive-manage" id="ov-golive-manage-link" href="#">' + ICON_MANAGE + 'Manage stream</a>' +
                '<div class="ov-golive-status" id="ov-golive-status"></div>' +
            '</div>';

        // Insert before theme button
        var themeWrap = document.getElementById('ov-theme-btn-wrap');
        if (themeWrap && themeWrap.parentNode) {
            themeWrap.parentNode.insertBefore(wrap, themeWrap);
        } else {
            var navEnd = document.querySelector('.ov-nav-end');
            if (navEnd) navEnd.prepend(wrap);
            else document.body.appendChild(wrap);
        }

        // Manage link starts pointing at go-live; updated to /@slug/stream once live
        var manageLink = document.getElementById('ov-golive-manage-link');
        if (manageLink) manageLink.href = resolveLiveBase() + '/go-live';

        wireEvents();
    }

    // ── state ─────────────────────────────────────────────────────────────────

    var isLive = false;
    var panelOpen = false;

    function setStatus(msg, isError) {
        var el = document.getElementById('ov-golive-status');
        if (!el) return;
        if (msg) {
            el.textContent = msg;
            el.className = 'ov-golive-status visible' + (isError ? ' error' : '');
        } else {
            el.textContent = '';
            el.className = 'ov-golive-status';
        }
    }

    function setLiveUI(live) {
        isLive = live;
        var btn = document.getElementById('ov-golive-btn');
        var row = document.getElementById('ov-golive-live-row');
        var camBtn = document.getElementById('ov-golive-camera-btn');
        var scrBtn = document.getElementById('ov-golive-screen-btn');
        if (btn) btn.classList.toggle('is-live', live);
        if (row) row.style.display = live ? '' : 'none';
        if (camBtn) camBtn.style.display = live ? 'none' : '';
        if (scrBtn) scrBtn.style.display = live ? 'none' : '';
        if (!live) setStatus('');
    }

    function openPanel() {
        var panel = document.getElementById('ov-golive-panel');
        var btn = document.getElementById('ov-golive-btn');
        if (!panel || !btn) return;
        panelOpen = true;
        panel.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
    }

    function closePanel() {
        var panel = document.getElementById('ov-golive-panel');
        var btn = document.getElementById('ov-golive-btn');
        if (!panel || !btn) return;
        panelOpen = false;
        panel.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
    }

    // ── broadcast ─────────────────────────────────────────────────────────────

    async function startBroadcast(source) {
        setStatus('Resolving channel…');
        var channel;
        try {
            channel = await getOrCreateChannel();
        } catch (err) {
            setStatus('Could not load channel: ' + err.message, true);
            return;
        }

        setStatus('Requesting ' + (source === 'screen' ? 'screen access' : 'camera') + '…');
        try {
            if (source === 'screen') {
                var screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                var mic = null;
                try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_) {}
                if (mic) {
                    var ctx = new AudioContext();
                    var dest = ctx.createMediaStreamDestination();
                    ctx.createMediaStreamSource(screen).connect(dest);
                    ctx.createMediaStreamSource(mic).connect(dest);
                    var combined = new MediaStream();
                    screen.getVideoTracks().forEach(function (t) { combined.addTrack(t); });
                    dest.stream.getAudioTracks().forEach(function (t) { combined.addTrack(t); });
                    liveStream = combined;
                } else {
                    liveStream = screen;
                }
            } else {
                liveStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            }
        } catch (err) {
            setStatus('Media access denied: ' + err.message, true);
            return;
        }

        setStatus('Creating stream session…');
        try {
            var streamRes = await liveApi('POST', '/api/v1/go-live/streams', {
                channel_slug: channel.slug,
                protocol: 'whip',
                title: 'Quick broadcast',
                recording_enabled: true,
            });
            activeStreamId = (streamRes.stream && streamRes.stream.id) || streamRes.id || null;
        } catch (err) {
            setStatus('Could not create stream: ' + err.message, true);
            return;
        }

        setStatus('Connecting…');
        try {
            await startWhip(liveStream, channel.restreamUrl, channel.slug, channel.streamKey, channel.iceServers);
        } catch (err) {
            stopWhip();
            activeStreamId = null;
            setStatus('WHIP failed: ' + err.message, true);
            return;
        }

        setLiveUI(true);
        setStatus('');

        // Point "Manage stream" at the live stream page
        var manageLink = document.getElementById('ov-golive-manage-link');
        if (manageLink) manageLink.href = resolveLiveBase() + '/@' + encodeURIComponent(channel.slug);

        // Warn before page navigation while live
        window.addEventListener('beforeunload', onBeforeUnload);

        // End stream if tracks stop (e.g. user stops screen share from browser UI)
        liveStream.getTracks().forEach(function (t) {
            t.addEventListener('ended', function () {
                if (isLive) endBroadcast();
            });
        });
    }

    function endBroadcast() {
        stopWhip();
        setLiveUI(false);
        window.removeEventListener('beforeunload', onBeforeUnload);
        var manageLink = document.getElementById('ov-golive-manage-link');
        if (manageLink) manageLink.href = resolveLiveBase() + '/go-live';
        if (activeStreamId) {
            var sid = activeStreamId;
            activeStreamId = null;
            liveApi('POST', '/api/v1/go-live/streams/' + encodeURIComponent(sid) + '/end', {}).catch(function() {});
        }
    }

    function onBeforeUnload(e) {
        e.preventDefault();
        e.returnValue = 'Your stream is live. Leaving this page will end the broadcast.';
    }

    // ── events ────────────────────────────────────────────────────────────────

    function wireEvents() {
        var btn      = document.getElementById('ov-golive-btn');
        var panel    = document.getElementById('ov-golive-panel');
        var camBtn   = document.getElementById('ov-golive-camera-btn');
        var scrBtn   = document.getElementById('ov-golive-screen-btn');
        var stopBtn  = document.getElementById('ov-golive-stop-btn');

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            panelOpen ? closePanel() : openPanel();
        });

        camBtn.addEventListener('click', function () { startBroadcast('camera'); });
        scrBtn.addEventListener('click', function () { startBroadcast('screen'); });
        stopBtn.addEventListener('click', function () { endBroadcast(); });

        // Close on outside click
        document.addEventListener('click', function (e) {
            if (!panelOpen) return;
            if (!panel.contains(e.target) && e.target !== btn) closePanel();
        });

        // Close on Escape
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && panelOpen) closePanel();
        });
    }

    // ── init ──────────────────────────────────────────────────────────────────

    function tryInject() {
        if (document.getElementById('ov-theme-btn-wrap') || document.querySelector('.ov-nav-end')) {
            inject();
            return true;
        }
        return false;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            if (!tryInject()) {
                // Nav is rendered dynamically by openvibe.js — observe for it
                var obs = new MutationObserver(function () {
                    if (tryInject()) obs.disconnect();
                });
                obs.observe(document.body, { childList: true, subtree: true });
            }
        });
    } else {
        if (!tryInject()) {
            var obs = new MutationObserver(function () {
                if (tryInject()) obs.disconnect();
            });
            obs.observe(document.body, { childList: true, subtree: true });
        }
    }

})();
