/**
 * dashboard.js — openre.stream dashboard  v=20260515-2
 *
 * Two-panel stream manager: sidebar channel slots + right editor.
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
        var panels = ['ingest', 'settings', 'destinations', 'streams'];
        for (var j = 0; j < panels.length; j++) {
            var p = el('dash-panel-' + panels[j]);
            if (p) p.style.display = panels[j] === tabName ? '' : 'none';
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

    // ── init ───────────────────────────────────────────────────────────────────

    renderSlots();
    renderDestSidebar();
    if (state.channels.length) {
        openChannel(state.channels[0].slug);
    }

})();
