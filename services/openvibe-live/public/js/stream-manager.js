/**
 * stream-manager.js — go-live page client logic  v=20260505
 *
 * Full tabbed stream manager for /go-live.
 * Plain JS IIFE — no module system, no bundler.
 * Runs only when [data-go-live-session] is found in the DOM.
 */
(function () {
    'use strict';

    if (!document.querySelector('[data-go-live-session]')) return;

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function el(s)  { return document.querySelector(s); }
    function els(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
    function setContent(sOrEl, html) {
        var t = typeof sOrEl === 'string' ? el(sOrEl) : sOrEl;
        if (t) t.innerHTML = html;
    }
    function setStatus(key, text, isError) {
        var span = el('[data-sm-status="' + key + '"]');
        if (!span) return;
        span.textContent = text;
        span.style.color = isError ? 'var(--color-danger,#e55)' : 'var(--color-ok,#5c5)';
    }
    function clearStatus(key) { var s = el('[data-sm-status="' + key + '"]'); if (s) s.textContent = ''; }
    function note(t) { return '<p class="manager-note">' + esc(t) + '</p>'; }
    function pill(label, tone) { return '<span class="pill ' + esc(tone || 'soft') + '">' + esc(label) + '</span>'; }
    function timeAgo(ts) {
        if (!ts) return 'just now';
        var d = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
        if (d < 60)    return d + 's ago';
        if (d < 3600)  return Math.floor(d / 60) + 'm ago';
        if (d < 86400) return Math.floor(d / 3600) + 'h ago';
        return Math.floor(d / 86400) + 'd ago';
    }
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
        return Promise.resolve();
    }
    function api(method, path, body) {
        var opts = { method: method, credentials: 'same-origin', headers: {} };
        if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
        return fetch(path, opts).then(function (res) {
            if (!res.ok) return res.json().catch(function () { return {}; }).then(function (e) {
                throw new Error(e.error || e.message || 'Request failed (' + res.status + ')');
            });
            return res.json();
        });
    }

    // ── tab switching ─────────────────────────────────────────────────────────
    var tabBar = el('[data-sm-tab-bar]');
    if (tabBar) {
        tabBar.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-sm-tab]');
            if (!btn) return;
            var tab = btn.getAttribute('data-sm-tab');
            els('[data-sm-tab-bar] [data-sm-tab]').forEach(function (b) {
                b.classList.remove('active'); b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
            els('[data-sm-panel]').forEach(function (p) {
                p.style.display = p.getAttribute('data-sm-panel') === tab ? '' : 'none';
            });
        });
    }

    var state = { channels: [], destinations: [], streams: [], restreamUrl: '', activeStreamId: null };

    // ── renderers ─────────────────────────────────────────────────────────────
    function renderChannelList(chs) {
        if (!chs || !chs.length) return note('No channels yet. Create one using the form.');
        return chs.map(function (c) {
            return '<div class="stack-item" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.4rem 0;">' +
                '<span>' + (c.is_live ? pill('Live', 'live') + ' ' : '') +
                '<strong>' + esc(c.display_name || c.slug) + '</strong> <code style="font-size:.8rem;opacity:.7">@' + esc(c.slug) + '</code></span>' +
                '<button class="button-secondary" style="padding:.2rem .6rem;font-size:.8rem;" data-sm-action="edit-channel" data-slug="' + esc(c.slug) + '">Edit</button>' +
            '</div>';
        }).join('');
    }

    function renderDestinationList(ds) {
        if (!ds || !ds.length) return note('No destinations yet. Add one using the form.');
        return ds.map(function (d) {
            return '<div class="stack-item" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.4rem 0;">' +
                '<span>' + pill(d.kind || 'custom') + ' <strong>' + esc(d.label || d.kind || 'Destination') + '</strong>' +
                (d.enabled === false ? ' ' + pill('Disabled', 'muted') : '') + '</span>' +
                '<button class="button-secondary" style="padding:.2rem .6rem;font-size:.8rem;" data-sm-action="delete-destination" data-dest-id="' + esc(d.id) + '">Remove</button>' +
            '</div>';
        }).join('');
    }

    function renderStreamList(ss) {
        if (!ss || !ss.length) return note('No recent streams found.');
        return ss.map(function (s) {
            var sp = s.is_live ? pill('Live', 'live') : (s.status ? pill(s.status, 'soft') : '');
            var act = '';
            if (s.is_live) {
                act = '<button class="button-secondary" style="padding:.2rem .6rem;font-size:.8rem;" data-sm-action="end-stream" data-stream-id="' + esc(s.id) + '">End</button>';
            } else if (s.status !== 'ended' && s.status !== 'archived') {
                act = '<button class="button-secondary" style="padding:.2rem .6rem;font-size:.8rem;" data-sm-action="start-stream" data-stream-id="' + esc(s.id) + '">Go live</button>';
            }
            return '<div class="stack-item" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.4rem 0;">' +
                '<span>' + sp + ' <strong>' + esc(s.title || 'Untitled') + '</strong> <small style="opacity:.6">' + esc(timeAgo(s.started_at || s.created_at)) + '</small></span>' +
                act + '</div>';
        }).join('');
    }

    function renderIngestDetails(stream) {
        if (!stream) return note('Create a stream to reveal ingest details.');
        var rtmpUrl   = stream.rtmp_url || (state.restreamUrl ? state.restreamUrl + '/live' : '');
        var streamKey = stream.stream_key || stream.key || '';
        var whipUrl   = stream.whip_url || '';
        function copyRow(label, value) {
            if (!value) return '';
            return '<div class="data-point" style="align-items:center;">' +
                '<div class="data-point-label">' + esc(label) + '</div>' +
                '<div class="data-point-value" style="display:flex;gap:.4rem;align-items:center;">' +
                    '<code style="font-size:.78rem;font-family:monospace;word-break:break-all;">' + esc(value) + '</code>' +
                    '<button class="button-secondary" style="padding:.15rem .5rem;font-size:.75rem;white-space:nowrap;" data-sm-action="copy-value" data-copy="' + esc(value) + '">Copy</button>' +
                '</div></div>';
        }
        var rows = [copyRow('RTMP URL', rtmpUrl), copyRow('Stream key', streamKey), copyRow('WHIP URL', whipUrl)].filter(Boolean).join('');
        if (!rows) rows = '<div class="data-point"><div class="data-point-label">Status</div><div class="data-point-value">Stream created — ingest details pending from openre.stream</div></div>';
        return '<div class="data-points">' + rows + '</div>' +
            '<p class="manager-note" style="margin-top:.75rem;">Copy RTMP URL + stream key into OBS Server settings.</p>';
    }

    function populateChannelSelects() {
        els('select[name="channel_slug"]').forEach(function (sel) {
            var cur = sel.value;
            sel.innerHTML = '<option value="">Select a channel</option>';
            state.channels.forEach(function (c) {
                var o = document.createElement('option');
                o.value = c.slug; o.textContent = (c.display_name || c.slug) + ' (@' + c.slug + ')';
                sel.appendChild(o);
            });
            if (cur) sel.value = cur;
        });
    }

    function openChannelEdit(slug) {
        var ch = state.channels.filter(function (c) { return c.slug === slug; })[0];
        if (!ch) return;
        var panel = el('#go-live-channel-edit-panel');
        if (!panel) return;
        panel.style.display = '';
        var form = el('#go-live-channel-edit-form');
        if (!form) return;
        form.querySelector('[name="slug"]').value          = ch.slug;
        form.querySelector('[name="display_name"]').value  = ch.display_name || '';
        form.querySelector('[name="description"]').value   = ch.description || '';
        form.querySelector('[name="stream_key_display"]').value = ch.stream_key || '(hidden)';
        var rtmpBase = ch.rtmp_ingest_base || state.restreamUrl || '';
        form.querySelector('[name="rtmp_url_display"]').value = rtmpBase ? rtmpBase + '/live' : '(not configured)';
        var vis = form.querySelector('[name="visibility"]'); if (vis) vis.value = ch.visibility || 'public';
        var nsfw = form.querySelector('[name="nsfw"]');              if (nsfw) nsfw.checked = !!(ch.nsfw || ch.is_nsfw);
        var rec  = form.querySelector('[name="recording_enabled"]'); if (rec)  rec.checked  = ch.recording_enabled !== false;
        var chat = form.querySelector('[name="chat_enabled"]');      if (chat) chat.checked  = ch.chat_enabled !== false;
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ── load dashboard ────────────────────────────────────────────────────────
    function loadDashboard() {
        api('GET', '/api/v1/go-live/dashboard').then(function (data) {
            state.channels     = data.channels     || [];
            state.destinations = data.destinations || [];
            state.streams      = data.streams      || [];
            state.restreamUrl  = data.restream_url || '';
            setContent('[data-go-live-channels]',    renderChannelList(state.channels));
            setContent('[data-go-live-destinations]', renderDestinationList(state.destinations));
            setContent('[data-go-live-streams]',      renderStreamList(state.streams));
            setContent('[data-go-live-ingest]',       renderIngestDetails(null));
            populateChannelSelects();
        }).catch(function (err) {
            setContent('[data-go-live-channels]',    note('Failed to load: ' + err.message));
            setContent('[data-go-live-destinations]', note('Failed to load.'));
            setContent('[data-go-live-streams]',      note('Failed to load.'));
        });
    }

    // ── forms ─────────────────────────────────────────────────────────────────
    var channelForm = el('#go-live-channel-form');
    if (channelForm) {
        channelForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(channelForm), btn = channelForm.querySelector('[type="submit"]');
            if (btn) btn.disabled = true; clearStatus('channel-form');
            api('POST', '/api/v1/go-live/channels', {
                slug: fd.get('slug'), display_name: fd.get('display_name'),
                description: fd.get('description'), nsfw: fd.get('nsfw') === '1',
            }).then(function (res) {
                var ch = res.live_channel || res.channel || res;
                if (ch && ch.slug) {
                    state.channels.push(ch);
                    setContent('[data-go-live-channels]', renderChannelList(state.channels));
                    populateChannelSelects(); channelForm.reset();
                    setStatus('channel-form', 'Channel created!');
                }
            }).catch(function (err) { setStatus('channel-form', err.message, true); })
              .finally(function () { if (btn) btn.disabled = false; });
        });
    }

    var channelEditForm = el('#go-live-channel-edit-form');
    if (channelEditForm) {
        channelEditForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(channelEditForm), slug = fd.get('slug');
            if (!slug) return;
            var btn = channelEditForm.querySelector('[type="submit"]');
            if (btn) btn.disabled = true; clearStatus('channel-edit-form');
            api('PATCH', '/api/v1/go-live/channels/' + encodeURIComponent(slug), {
                display_name: fd.get('display_name'), description: fd.get('description'),
                visibility: fd.get('visibility'), nsfw: fd.get('nsfw') === '1',
                recording_enabled: fd.get('recording_enabled') === '1',
                chat_enabled: fd.get('chat_enabled') === '1',
            }).then(function (res) {
                var ch = res.channel || res;
                if (ch && ch.slug) {
                    var idx = state.channels.findIndex(function (c) { return c.slug === ch.slug; });
                    if (idx >= 0) state.channels[idx] = ch; else state.channels.push(ch);
                    setContent('[data-go-live-channels]', renderChannelList(state.channels));
                    setStatus('channel-edit-form', 'Saved!');
                }
            }).catch(function (err) { setStatus('channel-edit-form', err.message, true); })
              .finally(function () { if (btn) btn.disabled = false; });
        });
    }

    var destForm = el('#go-live-destination-form');
    if (destForm) {
        destForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(destForm), btn = destForm.querySelector('[type="submit"]');
            if (btn) btn.disabled = true; clearStatus('destination-form');
            api('POST', '/api/v1/go-live/destinations', {
                kind: fd.get('kind'), label: fd.get('label'),
                target_url: fd.get('target_url'), target_key: fd.get('target_key'),
                enabled: fd.get('enabled') === '1',
            }).then(function (res) {
                var d = res.destination || res;
                if (d && d.id) {
                    state.destinations.push(d);
                    setContent('[data-go-live-destinations]', renderDestinationList(state.destinations));
                    destForm.reset();
                    var ecb = destForm.querySelector('[name="enabled"]'); if (ecb) ecb.checked = true;
                    setStatus('destination-form', 'Destination saved!');
                }
            }).catch(function (err) { setStatus('destination-form', err.message, true); })
              .finally(function () { if (btn) btn.disabled = false; });
        });
    }

    var streamForm = el('#go-live-stream-form');
    if (streamForm) {
        streamForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(streamForm), btn = streamForm.querySelector('[type="submit"]');
            if (btn) btn.disabled = true; clearStatus('stream-form');
            api('POST', '/api/v1/go-live/streams', {
                channel_slug: fd.get('channel_slug'), title: fd.get('title'),
                description: fd.get('description'), category: fd.get('category'),
                protocol: fd.get('protocol'), nsfw: fd.get('nsfw') === '1',
                recording_enabled: fd.get('recording_enabled') === '1',
            }).then(function (res) {
                var s = res.stream || res;
                if (s && s.id) {
                    state.activeStreamId = s.id; state.streams.unshift(s);
                    setContent('[data-go-live-streams]',  renderStreamList(state.streams));
                    setContent('[data-go-live-ingest]',    renderIngestDetails(s));
                    streamForm.reset();
                    var rcb = streamForm.querySelector('[name="recording_enabled"]'); if (rcb) rcb.checked = true;
                    setStatus('stream-form', 'Stream created — check Ingest details tab.');
                    var ingestBtn = el('[data-sm-tab="ingest"]'); if (ingestBtn) ingestBtn.click();
                }
            }).catch(function (err) { setStatus('stream-form', err.message, true); })
              .finally(function () { if (btn) btn.disabled = false; });
        });
    }

    // ── delegated actions ─────────────────────────────────────────────────────
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-sm-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-sm-action');

        if (action === 'copy-value' || action === 'copy-stream-key' || action === 'copy-rtmp-url') {
            var val = action === 'copy-value' ? btn.getAttribute('data-copy') :
                      action === 'copy-stream-key' ? (el('[name="stream_key_display"]') || {}).value :
                      (el('[name="rtmp_url_display"]') || {}).value;
            if (!val) return;
            copyToClipboard(val).then(function () {
                var orig = btn.textContent; btn.textContent = 'Copied!';
                setTimeout(function () { btn.textContent = orig; }, 1500);
            });
            return;
        }

        if (action === 'regenerate-key') {
            var form = el('#go-live-channel-edit-form');
            var slug = form ? form.querySelector('[name="slug"]').value : '';
            if (!slug) return;
            if (!confirm('Regenerate stream key for @' + slug + '? Any running stream using the old key will be cut.')) return;
            btn.disabled = true;
            api('POST', '/api/v1/go-live/channels/' + encodeURIComponent(slug) + '/regenerate-key', {})
                .then(function (res) {
                    var ch = res.channel || res;
                    if (ch && ch.stream_key) {
                        var ski = el('[name="stream_key_display"]'); if (ski) ski.value = ch.stream_key;
                        var idx = state.channels.findIndex(function (c) { return c.slug === ch.slug; });
                        if (idx >= 0) state.channels[idx] = Object.assign({}, state.channels[idx], ch);
                    }
                    setStatus('channel-edit-form', 'Key regenerated — copy it now!');
                }).catch(function (err) { setStatus('channel-edit-form', err.message, true); })
                  .finally(function () { btn.disabled = false; });
            return;
        }

        if (action === 'edit-channel') {
            openChannelEdit(btn.getAttribute('data-slug'));
            return;
        }

        if (action === 'delete-destination') {
            var id = btn.getAttribute('data-dest-id');
            if (!id || !confirm('Remove this destination?')) return;
            btn.disabled = true;
            api('DELETE', '/api/v1/go-live/destinations/' + encodeURIComponent(id))
                .then(function () {
                    state.destinations = state.destinations.filter(function (d) { return d.id !== id; });
                    setContent('[data-go-live-destinations]', renderDestinationList(state.destinations));
                }).catch(function (err) { alert('Delete failed: ' + err.message); btn.disabled = false; });
            return;
        }

        if (action === 'start-stream' || action === 'end-stream') {
            var sid = btn.getAttribute('data-stream-id');
            if (!sid) return;
            if (action === 'end-stream' && !confirm('End this stream?')) return;
            btn.disabled = true;
            var origText = btn.textContent;
            btn.textContent = action === 'start-stream' ? 'Starting…' : 'Ending…';
            var endpoint = action === 'start-stream' ? 'start' : 'end';
            api('POST', '/api/v1/go-live/streams/' + encodeURIComponent(sid) + '/' + endpoint, {})
                .then(function (res) {
                    var s = res.stream || res;
                    if (s && s.id) {
                        var idx = state.streams.findIndex(function (x) { return x.id === s.id; });
                        if (idx >= 0) state.streams[idx] = s;
                        setContent('[data-go-live-streams]', renderStreamList(state.streams));
                        if (action === 'start-stream' && (s.rtmp_url || s.stream_key || s.whip_url)) {
                            setContent('[data-go-live-ingest]', renderIngestDetails(s));
                        }
                    }
                }).catch(function (err) {
                    alert('Action failed: ' + err.message);
                    btn.disabled = false; btn.textContent = origText;
                });
            return;
        }
    });

    // ── dedicated start/end buttons in stream panel ───────────────────────────
    function wireStreamBtn(btnId, endpoint, label) {
        var b = el(btnId);
        if (!b) return;
        b.addEventListener('click', function () {
            var id = state.activeStreamId;
            if (!id) { setStatus('stream-form', 'No active stream.', true); return; }
            if (endpoint === 'end' && !confirm('End this stream?')) return;
            b.disabled = true; b.textContent = endpoint === 'start' ? 'Starting…' : 'Ending…';
            api('POST', '/api/v1/go-live/streams/' + encodeURIComponent(id) + '/' + endpoint, {})
                .then(function (res) {
                    var s = res.stream || res;
                    if (s && s.id) {
                        var idx = state.streams.findIndex(function (x) { return x.id === s.id; });
                        if (idx >= 0) state.streams[idx] = s;
                        setContent('[data-go-live-streams]', renderStreamList(state.streams));
                        if (endpoint === 'start' && (s.rtmp_url || s.stream_key || s.whip_url)) {
                            setContent('[data-go-live-ingest]', renderIngestDetails(s));
                        }
                        if (endpoint === 'end') state.activeStreamId = null;
                        setStatus('stream-form', endpoint === 'start' ? 'Stream is live!' : 'Stream ended.');
                    }
                }).catch(function (err) { setStatus('stream-form', err.message, true); })
                  .finally(function () { b.disabled = false; b.textContent = label; });
        });
    }
    wireStreamBtn('#go-live-start-btn', 'start', 'Mark live');
    wireStreamBtn('#go-live-end-btn',   'end',   'End stream');

    // ── boot ──────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadDashboard);
    } else {
        loadDashboard();
    }
})();
