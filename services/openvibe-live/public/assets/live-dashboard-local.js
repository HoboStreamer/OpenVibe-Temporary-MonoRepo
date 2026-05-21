'use strict';

(function () {
    const fallbackSurfaces = {
        restream: 'https://openre.stream',
        network: 'https://openvibe.network',
        my: 'https://my.openvibe.network',
        chat: 'https://openvibe.chat',
        community: 'https://openvibe.community',
    };

    let sessionPromise = null;
    let dashboardPromise = null;
    let dashboardKey = '';
    let latestIngestPayload = null;

    function escapeInlineHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function resolveSurfaceUrl(surface) {
        return fallbackSurfaces[surface] || '#';
    }

    function authUrl(pathname, options) {
        const url = new URL(pathname, window.location.origin);
        const opts = options || {};
        url.searchParams.set('return_to', opts.returnTo || window.location.href);
        if (opts.promptLogin) url.searchParams.set('prompt', 'login');
        return url.toString();
    }

    function signInHref() {
        return authUrl('/auth/login');
    }

    function switchAccountHref() {
        return authUrl('/auth/login', { promptLogin: true });
    }

    function signOutHref() {
        return authUrl('/auth/logout');
    }

    function getIdentity(session) {
        const user = session && session.user ? session.user : null;
        if (!user) return null;
        const id = String(user.id || user.sub || '').trim();
        if (!id) return null;
        const anonNum = user.anon_number != null ? String(user.anon_number) : null;
        const anonLabel = anonNum ? 'Anon #' + anonNum : 'Anonymous';
        const isAnon = !!(session && session.anonymous) || !!(user.anonymous) || user.actor_type === 'anon';
        return {
            id,
            handle: String(user.username || user.handle || user.slug || '').trim(),
            displayName: isAnon ? anonLabel : String(user.display_name || user.username || user.handle || 'OpenVibe creator').trim(),
            anonymous: isAnon,
            anonNumber: anonNum,
        };
    }

    async function fetchJson(url, options) {
        const request = Object.assign({}, options || {});
        const headers = Object.assign({ Accept: 'application/json' }, request.headers || {});
        if (request.body && !headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/json';
        }
        request.headers = headers;
        if (!Object.prototype.hasOwnProperty.call(request, 'credentials')) {
            request.credentials = /^[a-z]+:/i.test(String(url || '')) ? 'include' : 'same-origin';
        }
        const response = await fetch(url, request);
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = text;
        }
        if (!response.ok) {
            const error = new Error(body && body.error ? body.error : 'Request failed (' + response.status + ')');
            error.status = response.status;
            error.body = body;
            throw error;
        }
        return body;
    }

    function relativeTime(value) {
        if (!value) return 'just now';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'just now';
        const diffSeconds = Math.round((Date.now() - parsed.getTime()) / 1000);
        const abs = Math.abs(diffSeconds);
        if (abs < 60) return diffSeconds >= 0 ? 'just now' : 'in moments';
        const units = [
            ['year', 31536000],
            ['month', 2592000],
            ['day', 86400],
            ['hour', 3600],
            ['minute', 60],
        ];
        for (const [unit, size] of units) {
            if (abs >= size) {
                const amount = Math.round(diffSeconds / size);
                return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(amount, unit);
            }
        }
        return 'just now';
    }

    function formatTimestamp(value) {
        if (!value) return 'Unknown';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return String(value);
        return parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function slugify(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48);
    }

    function sortByRecent(a, b) {
        const aStamp = new Date(a.updated_at || a.started_at || a.created_at || a.ended_at || 0).getTime() || 0;
        const bStamp = new Date(b.updated_at || b.started_at || b.created_at || b.ended_at || 0).getTime() || 0;
        return bStamp - aStamp;
    }

    function setFormDisabled(form, disabled) {
        if (!form) return;
        form.querySelectorAll('input, select, textarea, button').forEach((element) => {
            element.disabled = !!disabled;
        });
    }

    function streamTone(stream) {
        if (stream && stream.status === 'started') return 'live';
        if (stream && stream.status === 'ended') return 'soft';
        return 'primary';
    }

    async function loadLocalSession(force) {
        if (!force && sessionPromise) return sessionPromise;
        sessionPromise = fetchJson('/api/v1/session').catch(() => ({ authenticated: false, anonymous: false, user: null }));
        return sessionPromise;
    }

    async function loadDashboard(force) {
        const session = await loadLocalSession(!!force);
        const identity = getIdentity(session);
        const cacheKey = identity && identity.id ? identity.id : 'guest';
        if (!force && dashboardPromise && dashboardKey === cacheKey) {
            return dashboardPromise;
        }
        dashboardKey = cacheKey;
        dashboardPromise = (async () => {
            const state = {
                session,
                identity,
                restreamUrl: resolveSurfaceUrl('restream'),
                channels: [],
                destinations: [],
                streams: [],
                error: null,
            };
            if (!identity || !identity.id || !session.authenticated || identity.anonymous) {
                return state;
            }
            try {
                const payload = await fetchJson('/api/v1/go-live/dashboard');
                state.restreamUrl = String(payload && payload.restream_url || state.restreamUrl);
                state.channels = Array.isArray(payload && payload.channels) ? payload.channels : [];
                state.destinations = Array.isArray(payload && payload.destinations) ? payload.destinations : [];
                state.streams = Array.isArray(payload && payload.streams) ? payload.streams.slice().sort(sortByRecent) : [];
            } catch (error) {
                state.error = error;
            }
            return state;
        })();
        return dashboardPromise;
    }

    function renderTopbarSession(state) {
        const mount = document.querySelector('[data-live-nav-session]');
        if (!mount) return;
        const identity = state && state.identity;
        if (identity && state.session && state.session.authenticated && !identity.anonymous) {
            const handle = escapeInlineHtml(identity.handle || identity.displayName || 'you');
            mount.innerHTML =
                '<div class="nav-user-menu" id="live-nav-user-menu">' +
                    '<button class="nav-user-btn" id="live-nav-user-btn" type="button" aria-expanded="false" aria-haspopup="true">' +
                        '@' + handle +
                        '<svg class="nav-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
                    '</button>' +
                    '<div class="nav-user-dropdown" id="live-nav-dropdown" role="menu">' +
                        '<a class="nav-user-item" href="' + escapeInlineHtml(resolveSurfaceUrl('my')) + '" role="menuitem">' +
                            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
                            'Account' +
                        '</a>' +
                        '<a class="nav-user-item" href="' + escapeInlineHtml(switchAccountHref()) + '" role="menuitem">' +
                            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>' +
                            'Switch account' +
                        '</a>' +
                        '<div class="nav-user-divider" role="separator"></div>' +
                        '<a class="nav-user-item nav-user-item-danger" href="' + escapeInlineHtml(signOutHref()) + '" role="menuitem">' +
                            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
                            'Sign out' +
                        '</a>' +
                    '</div>' +
                '</div>';
            // Wire dropdown toggle
            const btn = document.getElementById('live-nav-user-btn');
            const menu = document.getElementById('live-nav-dropdown');
            if (btn && menu) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const open = menu.classList.toggle('open');
                    btn.classList.toggle('open', open);
                    btn.setAttribute('aria-expanded', String(open));
                });
                document.addEventListener('click', function closeNav(e) {
                    if (!e.target.closest('#live-nav-user-menu')) {
                        menu.classList.remove('open');
                        btn.classList.remove('open');
                        btn.setAttribute('aria-expanded', 'false');
                    }
                }, { capture: false });
            }
            return;
        }
        if (identity && identity.anonymous) {
            mount.innerHTML = '<span class="nav-session-status">' + escapeInlineHtml(identity.displayName) + '</span>'
                + '<a class="button-secondary" href="' + escapeInlineHtml(signInHref()) + '">Sign in</a>';
            return;
        }
        mount.innerHTML = '<a class="button-secondary" href="' + escapeInlineHtml(signInHref()) + '">Sign in</a>';
    }

    function renderGuestCard(title, body, extraAction) {
        return '\n            <div class="eyebrow">Your account</div>\n            <h3 class="card-title">' + escapeInlineHtml(title) + '</h3>\n            <p class="card-body">' + escapeInlineHtml(body) + '</p>\n            <div class="form-actions" style="margin-top:1rem;">\n                <a class="button" href="' + escapeInlineHtml(signInHref()) + '">Sign in</a>\n                ' + (extraAction || ('<a class="button-secondary" href="' + escapeInlineHtml(resolveSurfaceUrl('network')) + '">Create account</a>')) + '\n            </div>';
    }

    function renderHomeAccountPanel(state) {
        const panel = document.querySelector('[data-live-account-panel]');
        if (!panel) return;
        const identity = state && state.identity;
        if (!identity) {
            panel.innerHTML = renderGuestCard('Sign in to load your channel tools', 'Use one OpenVibe account across live, chat, community, and openre.stream.');
            return;
        }
        if (identity.anonymous || !(state.session && state.session.authenticated)) {
            panel.innerHTML = renderGuestCard(
                'Browsing as ' + identity.displayName,
                'Anonymous browsing works for reading, but channel creation and stream controls need a full OpenVibe account.',
                '<a class="button-secondary" href="' + escapeInlineHtml(signInHref()) + '">Create full account</a>'
            );
            return;
        }
        if (state.error) {
            panel.innerHTML = '\n                <div class="eyebrow">Your account</div>\n                <h3 class="card-title">' + escapeInlineHtml(identity.displayName) + '</h3>\n                <p class="card-body">Your account is ready, but the stream manager could not reach OpenRe right now.</p>\n                <div class="form-actions" style="margin-top:1rem;">\n                    <a class="button" href="/go-live">Open stream manager</a>\n                    <a class="button-secondary" href="' + escapeInlineHtml(state.restreamUrl) + '">Open openre.stream</a>\n                    <a class="button-ghost" href="' + escapeInlineHtml(resolveSurfaceUrl('my')) + '">Account</a>\n                </div>';
            return;
        }
        const activeStream = state.streams.find((stream) => stream.status === 'started') || null;
        const primaryChannel = state.channels[0] || (state.session && state.session.primary_channel) || null;
        panel.innerHTML = '\n            <div class="eyebrow">Your account</div>\n            <h3 class="card-title">' + escapeInlineHtml(identity.displayName) + '</h3>\n            <p class="card-body">' + escapeInlineHtml(primaryChannel
                ? (primaryChannel.display_name || primaryChannel.slug) + ' is ready for your next stream.'
                : 'You are signed in. Claim your public @route to start streaming.') + '</p>\n            <div class="data-points">\n                <div class="data-point">\n                    <div class="data-point-label">Channels</div>\n                    <div class="data-point-value">' + escapeInlineHtml(String(state.channels.length)) + '</div>\n                </div>\n                <div class="data-point">\n                    <div class="data-point-label">Destinations</div>\n                    <div class="data-point-value">' + escapeInlineHtml(String(state.destinations.length)) + '</div>\n                </div>\n                <div class="data-point">\n                    <div class="data-point-label">Current stream</div>\n                    <div class="data-point-value">' + escapeInlineHtml(activeStream ? 'Live / active' : 'Ready') + '</div>\n                </div>\n            </div>\n            <div class="form-actions" style="margin-top:1rem;">\n                <a class="button" href="/go-live">Open stream manager</a>\n                ' + (primaryChannel && primaryChannel.slug ? ('<a class="button-secondary" href="/@' + encodeURIComponent(primaryChannel.slug) + '">Open @' + escapeInlineHtml(primaryChannel.slug) + '</a>') : '') + '\n                <a class="button-ghost" href="' + escapeInlineHtml(resolveSurfaceUrl('my')) + '">Account</a>\n            </div>';
    }

    function renderChannelItems(channels) {
        if (!channels.length) {
            return '<p class="manager-note">No channels yet. Create your public handle here, or open openre.stream for the fuller control plane.</p>';
        }
        return channels.map((channel) => '\n            <div class="stack-item">\n                <div class="pill-row">\n                    <span class="pill primary">@' + escapeInlineHtml(channel.slug) + '</span>\n                    ' + (channel.category ? ('<span class="pill muted">' + escapeInlineHtml(channel.category) + '</span>') : '') + '\n                </div>\n                <h4 style="margin-top:0.75rem;">' + escapeInlineHtml(channel.display_name || channel.slug) + '</h4>\n                <p class="manager-note">Public creator route ready for live sessions, replays, and clips.</p>\n                <div class="form-actions" style="margin-top:0.85rem;">\n                    <a class="button-secondary" href="/@' + encodeURIComponent(channel.slug) + '">Open channel</a>\n                    <a class="button-ghost" href="/vods?channel=' + encodeURIComponent(channel.slug) + '">Channel VODs</a>\n                </div>\n            </div>').join('');
    }

    function renderDestinationItems(destinations) {
        if (!destinations.length) {
            return '<p class="manager-note">No restream destinations saved yet. Add RTMP targets here to reuse them in OpenRe.</p>';
        }
        return destinations.map((destination) => '\n            <div class="stack-item">\n                <div class="pill-row">\n                    <span class="pill soft">' + escapeInlineHtml(destination.kind || 'custom') + '</span>\n                    <span class="pill muted">' + escapeInlineHtml(destination.enabled === false ? 'Disabled' : 'Enabled') + '</span>\n                </div>\n                <h4 style="margin-top:0.75rem;">' + escapeInlineHtml(destination.label || destination.kind || 'Destination') + '</h4>\n                <p class="manager-note">' + escapeInlineHtml(destination.target_url || 'Target URL unavailable') + '</p>\n            </div>').join('');
    }

    function renderStreamItems(streams) {
        if (!streams.length) {
            return '<p class="manager-note">No streams yet. Create one to generate fresh ingest details and wire it back into openvibe.live.</p>';
        }
        return streams.map((stream) => {
            const channelSlug = stream.channel_slug || 'unknown';
            const canStart = stream.status !== 'started' && stream.status !== 'ended';
            const canEnd = stream.status === 'started';
            return '\n                <div class="stack-item">\n                    <div class="pill-row">\n                        <span class="pill ' + streamTone(stream) + '">' + escapeInlineHtml(stream.status || 'created') + '</span>\n                        ' + (stream.protocol ? ('<span class="pill muted">' + escapeInlineHtml(stream.protocol) + '</span>') : '') + '\n                        ' + (stream.category ? ('<span class="pill muted">' + escapeInlineHtml(stream.category) + '</span>') : '') + '\n                    </div>\n                    <h4 style="margin-top:0.75rem;">' + escapeInlineHtml(stream.title || 'Untitled stream') + '</h4>\n                    <p class="manager-note">@' + escapeInlineHtml(channelSlug) + ' · ' + escapeInlineHtml(relativeTime(stream.started_at || stream.created_at || stream.updated_at)) + ' · ' + escapeInlineHtml(formatTimestamp(stream.started_at || stream.created_at || stream.updated_at)) + '</p>\n                    <div class="form-actions" style="margin-top:0.85rem;">\n                        ' + (canStart ? ('<button class="button-secondary" type="button" data-stream-action="start" data-stream-id="' + escapeInlineHtml(stream.id) + '">Mark started</button>') : '') + '\n                        ' + (canEnd ? ('<button class="button-secondary" type="button" data-stream-action="end" data-stream-id="' + escapeInlineHtml(stream.id) + '">Mark ended</button>') : '') + '\n                        <a class="button-ghost" href="/@' + encodeURIComponent(channelSlug) + '/s/' + encodeURIComponent(stream.id) + '">Open route</a>\n                    </div>\n                </div>';
        }).join('');
    }

    function copyToClipboard(text, btn) {
        if (!navigator.clipboard) {
            try { document.execCommand('copy'); } catch {}
            return;
        }
        navigator.clipboard.writeText(text).then(function() {
            const original = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function() { btn.textContent = original; }, 1500);
        }).catch(function() {});
    }

    function renderIngestRow(label, url) {
        const id = 'ingest-' + label.toLowerCase().replace(/[^a-z0-9]/g, '-');
        return '<div class="data-point" style="flex-direction:column;align-items:flex-start;gap:0.3rem;">' +
            '<div class="data-point-label">' + escapeInlineHtml(label) + '</div>' +
            '<div style="display:flex;align-items:center;gap:0.5rem;width:100%;">' +
            '<code id="' + id + '" style="font-size:0.78rem;word-break:break-all;flex:1;">' + escapeInlineHtml(url) + '</code>' +
            '<button type="button" class="button-ghost" style="white-space:nowrap;padding:0.2rem 0.6rem;font-size:0.75rem;" ' +
            'onclick="(function(btn){var url=document.getElementById(\'' + id + '\').textContent;' +
            'if(navigator.clipboard){navigator.clipboard.writeText(url).then(function(){var o=btn.textContent;btn.textContent=\'Copied!\';setTimeout(function(){btn.textContent=o;},1500);})}' +
            '})(this)">Copy</button>' +
            '</div>' +
            '</div>';
    }

    function renderIngestPanel(payload) {
        const target = document.querySelector('[data-go-live-ingest]');
        if (!target) return;
        if (!payload || !payload.ingest || !payload.stream || !payload.channel) {
            target.innerHTML = '<p class="manager-note">Create a stream to reveal ingest details and hand-off info for OBS or your restream workflow.</p>';
            return;
        }
        var ingest = payload.ingest;
        var protocol = payload.stream.protocol || 'rtmp';
        // Extract stream key from URL (everything after ?key=)
        var keyMatch = (ingest.rtmp || ingest.whip || '').match(/[?&]key=([^&]+)/);
        var streamKey = keyMatch ? decodeURIComponent(keyMatch[1]) : (payload.stream.id || '');
        // Extract server URL (everything before the ?key= part)
        var rtmpServer = (ingest.rtmp || '').replace(/\?.*$/, '');
        target.innerHTML = '<div class="stack-item">' +
            '<div class="pill-row">' +
            '<span class="pill primary">@' + escapeInlineHtml(payload.channel.slug) + '</span>' +
            '<span class="pill soft">' + escapeInlineHtml(protocol) + '</span>' +
            '</div>' +
            '<h4 style="margin-top:0.75rem;">' + escapeInlineHtml(payload.stream.title || 'Untitled stream') + '</h4>' +
            '<p class="manager-note">Copy these into OBS (Server + Stream Key) or your WHIP/restream client. Keep your stream key private.</p>' +
            '<div class="data-points" style="margin-top:0.75rem;flex-direction:column;">' +
            (rtmpServer ? renderIngestRow('RTMP Server', rtmpServer) : '') +
            renderIngestRow('Stream Key', streamKey) +
            (ingest.rtmp ? renderIngestRow('Full RTMP URL', ingest.rtmp) : '') +
            (ingest.whip ? renderIngestRow('WHIP URL', ingest.whip) : '') +
            (ingest.jsmpeg ? renderIngestRow('JSMPEG URL', ingest.jsmpeg) : '') +
            '</div>' +
            '</div>';
    }

    function populateChannelSelect(channels) {
        const select = document.querySelector('#go-live-stream-form select[name="channel_slug"]');
        if (!select) return;
        const currentValue = select.value;
        const options = ['<option value="">Select a channel</option>']
            .concat(channels.map((channel) => '<option value="' + escapeInlineHtml(channel.slug) + '">' + escapeInlineHtml(channel.display_name || channel.slug) + ' (@' + escapeInlineHtml(channel.slug) + ')</option>'));
        select.innerHTML = options.join('');
        if (currentValue && channels.some((channel) => channel.slug === currentValue)) {
            select.value = currentValue;
        }
    }

    function renderGoLiveDashboard(state) {
        const sessionPanel = document.querySelector('[data-go-live-session]');
        const channelsRoot = document.querySelector('[data-go-live-channels]');
        const destinationsRoot = document.querySelector('[data-go-live-destinations]');
        const streamsRoot = document.querySelector('[data-go-live-streams]');
        const channelForm = document.getElementById('go-live-channel-form');
        const destinationForm = document.getElementById('go-live-destination-form');
        const streamForm = document.getElementById('go-live-stream-form');
        if (!sessionPanel && !channelsRoot && !destinationsRoot && !streamsRoot) return;
        const identity = state && state.identity;
        const signedIn = !!(identity && state.session && state.session.authenticated && !identity.anonymous);

        if (sessionPanel) {
            if (!identity) {
                sessionPanel.innerHTML = renderGuestCard('Sign in to load your creator dashboard', 'You will be able to claim channels, save destinations, and manage stream records from this page.');
            } else if (identity.anonymous || !signedIn) {
                sessionPanel.innerHTML = renderGuestCard('Browsing as ' + identity.displayName, 'Anonymous identities can watch and read, but stream controls require a full OpenVibe account.', '<a class="button-secondary" href="' + escapeInlineHtml(signInHref()) + '">Create full account</a>');
            } else if (state.error) {
                sessionPanel.innerHTML = '\n                    <div class="eyebrow">Account status</div>\n                    <h3 class="card-title">' + escapeInlineHtml(identity.displayName) + '</h3>\n                    <p class="card-body">Your account is signed in, but OpenRe could not be reached for dashboard data right now.</p>\n                    <div class="form-actions" style="margin-top:1rem;">\n                        <a class="button" href="' + escapeInlineHtml(state.restreamUrl) + '">Open openre.stream</a>\n                        <a class="button-ghost" href="' + escapeInlineHtml(resolveSurfaceUrl('my')) + '">Account</a>\n                    </div>';
            } else {
                const activeStream = state.streams.find((stream) => stream.status === 'started') || null;
                sessionPanel.innerHTML = '\n                    <div class="eyebrow">Account status</div>\n                    <h3 class="card-title">' + escapeInlineHtml(identity.displayName) + '</h3>\n                    <p class="card-body">' + escapeInlineHtml(activeStream ? 'You have an active stream record. Use the controls below to keep it moving.' : 'You are signed in and ready to prep your next stream.') + '</p>\n                    <div class="data-points">\n                        <div class="data-point">\n                            <div class="data-point-label">Channels</div>\n                            <div class="data-point-value">' + escapeInlineHtml(String(state.channels.length)) + '</div>\n                        </div>\n                        <div class="data-point">\n                            <div class="data-point-label">Destinations</div>\n                            <div class="data-point-value">' + escapeInlineHtml(String(state.destinations.length)) + '</div>\n                        </div>\n                        <div class="data-point">\n                            <div class="data-point-label">Latest stream</div>\n                            <div class="data-point-value">' + escapeInlineHtml(activeStream ? 'Live' : (state.streams[0] && state.streams[0].status) || 'Ready') + '</div>\n                        </div>\n                    </div>\n                    <div class="form-actions" style="margin-top:1rem;">\n                        <a class="button-secondary" href="' + escapeInlineHtml(state.restreamUrl) + '">Open openre.stream</a>\n                        <a class="button-ghost" href="' + escapeInlineHtml(switchAccountHref()) + '">Switch account</a>\n                        <a class="button-ghost" href="' + escapeInlineHtml(signOutHref()) + '">Sign out</a>\n                    </div>';
            }
        }

        setFormDisabled(channelForm, !signedIn || !!state.error);
        setFormDisabled(destinationForm, !signedIn || !!state.error);
        setFormDisabled(streamForm, !signedIn || !!state.error || !(state.channels && state.channels.length));

        if (channelsRoot) {
            channelsRoot.innerHTML = signedIn && !state.error ? renderChannelItems(state.channels) : '<p class="manager-note">Sign in with a full account to manage creator channels here.</p>';
        }
        if (destinationsRoot) {
            destinationsRoot.innerHTML = signedIn && !state.error ? renderDestinationItems(state.destinations) : '<p class="manager-note">Sign in with a full account to save RTMP destinations here.</p>';
        }
        if (streamsRoot) {
            streamsRoot.innerHTML = signedIn && !state.error ? renderStreamItems(state.streams) : '<p class="manager-note">Sign in with a full account to create and manage stream records here.</p>';
        }
        populateChannelSelect(signedIn && !state.error ? state.channels : []);
        renderIngestPanel(latestIngestPayload);
    }

    async function refreshDashboard(force) {
        const state = await loadDashboard(force);
        renderTopbarSession(state);
        renderHomeAccountPanel(state);
        renderGoLiveDashboard(state);
        return state;
    }

    const channelForm = document.getElementById('go-live-channel-form');
    if (channelForm) {
        channelForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const state = await loadDashboard(false);
            if (!state.identity || !state.session || !state.session.authenticated || state.identity.anonymous) return;
            const payload = {
                slug: slugify(channelForm.querySelector('[name="slug"]').value || state.identity.handle || state.identity.displayName),
                display_name: String(channelForm.querySelector('[name="display_name"]').value || state.identity.displayName || '').trim(),
            };
            if (!payload.slug) return;
            await fetchJson('/api/v1/go-live/channels', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            channelForm.reset();
            await refreshDashboard(true);
        });
    }

    const destinationForm = document.getElementById('go-live-destination-form');
    if (destinationForm) {
        destinationForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const state = await loadDashboard(false);
            if (!state.identity || !state.session || !state.session.authenticated || state.identity.anonymous) return;
            const payload = {
                kind: String(destinationForm.querySelector('[name="kind"]').value || 'custom').trim(),
                label: String(destinationForm.querySelector('[name="label"]').value || '').trim(),
                target_url: String(destinationForm.querySelector('[name="target_url"]').value || '').trim(),
                target_key: String(destinationForm.querySelector('[name="target_key"]').value || '').trim(),
            };
            if (!payload.target_url) return;
            await fetchJson('/api/v1/go-live/destinations', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            destinationForm.reset();
            await refreshDashboard(true);
        });
    }

    const streamForm = document.getElementById('go-live-stream-form');
    if (streamForm) {
        streamForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const state = await loadDashboard(false);
            if (!state.identity || !state.session || !state.session.authenticated || state.identity.anonymous) return;
            const payload = {
                channel_slug: String(streamForm.querySelector('[name="channel_slug"]').value || '').trim(),
                title: String(streamForm.querySelector('[name="title"]').value || '').trim(),
                category: String(streamForm.querySelector('[name="category"]').value || '').trim(),
                protocol: String(streamForm.querySelector('[name="protocol"]').value || 'rtmp').trim(),
            };
            if (!payload.channel_slug) return;
            latestIngestPayload = await fetchJson('/api/v1/go-live/streams', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            streamForm.reset();
            await refreshDashboard(true);
        });
    }

    const streamsRoot = document.querySelector('[data-go-live-streams]');
    if (streamsRoot) {
        streamsRoot.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-stream-action]');
            if (!button) return;
            const state = await loadDashboard(false);
            if (!state.identity || !state.session || !state.session.authenticated || state.identity.anonymous) return;
            const streamId = String(button.dataset.streamId || '').trim();
            const action = String(button.dataset.streamAction || '').trim();
            if (!streamId || !action) return;
            await fetchJson('/api/v1/go-live/streams/' + encodeURIComponent(streamId) + '/' + (action === 'start' ? 'start' : 'end'), {
                method: 'POST',
                body: '{}',
            });
            await refreshDashboard(true);
        });
    }

    refreshDashboard(false).catch(() => {});
}());

// ── Pjax navigation ───────────────────────────────────────────
(function () {
    'use strict';
    var PJAX_PATHS = ['/', '/channels', '/vods', '/clips', '/updates'];
    var navigating = false;

    function isPjaxPath(pathname) {
        return PJAX_PATHS.some(function (p) {
            return pathname === p || (p !== '/' && pathname.startsWith(p + '?'));
        });
    }

    function setNavActive(pathname) {
        document.querySelectorAll('.nav-link[data-ov-pjax]').forEach(function (link) {
            var href = link.getAttribute('href') || '';
            link.classList.toggle('active', href === pathname || (href !== '/' && pathname.startsWith(href)));
        });
    }

    function pjaxNavigate(href, push) {
        if (navigating) return Promise.resolve();
        navigating = true;
        var url;
        try { url = new URL(href, window.location.origin); } catch (_) { window.location.href = href; navigating = false; return Promise.resolve(); }
        if (!isPjaxPath(url.pathname)) { window.location.href = href; navigating = false; return Promise.resolve(); }
        return fetch(url.href, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
            .then(function (res) {
                if (!res.ok) { window.location.href = href; return; }
                return res.text();
            })
            .then(function (html) {
                if (!html) return;
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');
                var newMain = doc.querySelector('main.page-shell');
                var currentMain = document.querySelector('main.page-shell');
                if (!newMain || !currentMain) { window.location.href = href; return; }
                currentMain.innerHTML = newMain.innerHTML;
                document.title = doc.title || document.title;
                if (push) history.pushState({ ovpjax: true, href: url.href }, document.title, url.href);
                setNavActive(url.pathname);
                window.scrollTo(0, 0);
                if (typeof window.OvInitContent === 'function') window.OvInitContent(currentMain);
            })
            .catch(function () { window.location.href = href; })
            .then(function () { navigating = false; });
    }

    document.addEventListener('click', function (e) {
        var link = e.target.closest('a[data-ov-pjax]');
        if (!link) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var href = link.getAttribute('href');
        if (!href) return;
        var url;
        try { url = new URL(href, window.location.origin); } catch (_) { return; }
        if (url.href === window.location.href) { e.preventDefault(); return; }
        e.preventDefault();
        pjaxNavigate(url.href, true);
    });

    window.addEventListener('popstate', function (e) {
        if (e.state && e.state.ovpjax) pjaxNavigate(window.location.href, false);
    });
}());

