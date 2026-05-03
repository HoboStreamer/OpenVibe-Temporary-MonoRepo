'use strict';

(function () {
    const openVibe = window.OpenVibe || null;
    const fallbackSurfaces = {
        restream: 'https://openre.stream',
        network: 'https://openvibe.network',
        my: 'https://my.openvibe.network',
        chat: 'https://openvibe.chat',
        community: 'https://openvibe.community',
    };
    let restreamStatePromise = null;
    let restreamStateKey = '';
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
        if (openVibe && typeof openVibe.resolveSurfaceUrl === 'function') {
            return openVibe.resolveSurfaceUrl(surface);
        }
        return fallbackSurfaces[surface] || '#';
    }

    function signInHref() {
        if (openVibe && typeof openVibe.signInUrl === 'function') {
            return openVibe.signInUrl(window.location.href);
        }
        return resolveSurfaceUrl('network');
    }

    function switchAccountHref() {
        if (openVibe && typeof openVibe.switchAccountUrl === 'function') {
            return openVibe.switchAccountUrl(window.location.href);
        }
        return resolveSurfaceUrl('my');
    }

    function getIdentity(session) {
        const user = session && session.user ? session.user : null;
        if (!user) return null;
        const id = String(user.id || user.sub || '').trim();
        if (!id) return null;
        return {
            id,
            handle: String(user.username || user.handle || user.slug || '').trim(),
            displayName: String(user.display_name || user.username || user.handle || 'OpenVibe creator').trim(),
            anonymous: !!(session && session.anonymous),
        };
    }

    async function fetchJsonWithAuth(url, options) {
        if (openVibe && typeof openVibe.fetchJson === 'function') {
            return openVibe.fetchJson(url, options);
        }
        const response = await fetch(url, Object.assign({
            credentials: /^[a-z]+:/i.test(String(url || '')) ? 'include' : 'same-origin',
            headers: { Accept: 'application/json' },
        }, options || {}));
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

    async function loadRestreamState(force) {
        const session = openVibe && typeof openVibe.loadSession === 'function'
            ? await openVibe.loadSession(!!force)
            : { authenticated: false, anonymous: false, user: null };
        const identity = getIdentity(session);
        const cacheKey = identity && identity.id ? identity.id : 'guest';
        if (!force && restreamStatePromise && restreamStateKey === cacheKey) {
            return restreamStatePromise;
        }
        restreamStateKey = cacheKey;
        restreamStatePromise = (async () => {
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
                const channelsPayload = await fetchJsonWithAuth(state.restreamUrl + '/api/v1/channels?owner_user_id=' + encodeURIComponent(identity.id) + '&limit=24');
                state.channels = Array.isArray(channelsPayload && channelsPayload.items) ? channelsPayload.items : [];
                const destinationsPayload = await fetchJsonWithAuth(state.restreamUrl + '/api/v1/destinations?owner_user_id=' + encodeURIComponent(identity.id));
                state.destinations = Array.isArray(destinationsPayload && destinationsPayload.items) ? destinationsPayload.items : [];
                const streamLists = await Promise.all(state.channels.map(async (channel) => {
                    try {
                        const payload = await fetchJsonWithAuth(state.restreamUrl + '/api/v1/streams?channel_id=' + encodeURIComponent(channel.id) + '&limit=8');
                        const items = Array.isArray(payload && payload.items) ? payload.items : [];
                        return items.map((stream) => Object.assign({}, stream, {
                            channel_slug: stream.channel_slug || channel.slug,
                            channel_display_name: channel.display_name || channel.slug,
                        }));
                    } catch {
                        return [];
                    }
                }));
                state.streams = streamLists.flat().sort(sortByRecent).slice(0, 12);
            } catch (error) {
                state.error = error;
            }
            return state;
        })();
        return restreamStatePromise;
    }

    function renderGuestCard(title, body, extraAction) {
        return '\n                    <div class="eyebrow">Your account</div>\n                    <h3 class="card-title">' + escapeInlineHtml(title) + '</h3>\n                    <p class="card-body">' + escapeInlineHtml(body) + '</p>\n                    <div class="form-actions" style="margin-top:1rem;">\n                        <a class="button" href="' + escapeInlineHtml(signInHref()) + '">Sign in</a>\n                        ' + (extraAction || ('<a class="button-secondary" href="' + escapeInlineHtml(resolveSurfaceUrl('network')) + '">Create account</a>')) + '\n                    </div>';
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
            panel.innerHTML = '\n                        <div class="eyebrow">Your account</div>\n                        <h3 class="card-title">' + escapeInlineHtml(identity.displayName) + '</h3>\n                        <p class="card-body">Your account is ready, but the stream manager could not load from openre.stream right now.</p>\n                        <div class="form-actions" style="margin-top:1rem;">\n                            <a class="button" href="/go-live">Open stream manager</a>\n                            <a class="button-secondary" href="' + escapeInlineHtml(state.restreamUrl) + '">Open openre.stream</a>\n                            <a class="button-ghost" href="' + escapeInlineHtml(resolveSurfaceUrl('my')) + '">Account</a>\n                        </div>';
            return;
        }
        const activeStream = state.streams.find((stream) => stream.status === 'started') || null;
        const primaryChannel = state.channels[0] || null;
        panel.innerHTML = '\n                    <div class="eyebrow">Your account</div>\n                    <h3 class="card-title">' + escapeInlineHtml(identity.displayName) + '</h3>\n                    <p class="card-body">' + escapeInlineHtml(primaryChannel
            ? (primaryChannel.display_name || primaryChannel.slug) + ' is ready for your next stream.'
            : 'You are signed in. Claim your public @route to start streaming.') + '</p>\n                    <div class="data-points">\n                        <div class="data-point">\n                            <div class="data-point-label">Channels</div>\n                            <div class="data-point-value">' + escapeInlineHtml(String(state.channels.length)) + '</div>\n                        </div>\n                        <div class="data-point">\n                            <div class="data-point-label">Destinations</div>\n                            <div class="data-point-value">' + escapeInlineHtml(String(state.destinations.length)) + '</div>\n                        </div>\n                        <div class="data-point">\n                            <div class="data-point-label">Current stream</div>\n                            <div class="data-point-value">' + escapeInlineHtml(activeStream ? 'Live / active' : 'Ready') + '</div>\n                        </div>\n                    </div>\n                    <div class="form-actions" style="margin-top:1rem;">\n                        <a class="button" href="/go-live">Open stream manager</a>\n                        ' + (primaryChannel ? ('<a class="button-secondary" href="/@' + encodeURIComponent(primaryChannel.slug) + '">Open @' + escapeInlineHtml(primaryChannel.slug) + '</a>') : '') + '\n                        <a class="button-ghost" href="' + escapeInlineHtml(resolveSurfaceUrl('my')) + '">Account</a>\n                    </div>';
    }

    function renderChannelItems(channels) {
        if (!channels.length) {
            return '<p class="manager-note">No channels yet. Create your public handle here, or open openre.stream for the fuller control plane.</p>';
        }
        return channels.map((channel) => '\n                    <div class="stack-item">\n                        <div class="pill-row">\n                            <span class="pill primary">@' + escapeInlineHtml(channel.slug) + '</span>\n                            ' + (channel.category ? ('<span class="pill muted">' + escapeInlineHtml(channel.category) + '</span>') : '') + '\n                        </div>\n                        <h4 style="margin-top:0.75rem;">' + escapeInlineHtml(channel.display_name || channel.slug) + '</h4>\n                        <p class="manager-note">' + escapeInlineHtml(channel.description || 'Public creator route ready for live sessions, replays, and clips.') + '</p>\n                        <div class="form-actions" style="margin-top:0.85rem;">\n                            <a class="button-secondary" href="/@' + encodeURIComponent(channel.slug) + '">Open channel</a>\n                            <a class="button-ghost" href="/vods?channel=' + encodeURIComponent(channel.slug) + '">Channel VODs</a>\n                        </div>\n                    </div>').join('');
    }

    function renderDestinationItems(destinations) {
        if (!destinations.length) {
            return '<p class="manager-note">No restream destinations saved yet. Add RTMP targets here to reuse them in openre.stream.</p>';
        }
        return destinations.map((destination) => '\n                    <div class="stack-item">\n                        <div class="pill-row">\n                            <span class="pill soft">' + escapeInlineHtml(destination.kind || 'custom') + '</span>\n                            <span class="pill muted">' + escapeInlineHtml(destination.enabled === false ? 'Disabled' : 'Enabled') + '</span>\n                        </div>\n                        <h4 style="margin-top:0.75rem;">' + escapeInlineHtml(destination.label || destination.kind || 'Destination') + '</h4>\n                        <p class="manager-note">' + escapeInlineHtml(destination.target_url || 'Target URL unavailable') + '</p>\n                    </div>').join('');
    }

    function renderStreamItems(streams) {
        if (!streams.length) {
            return '<p class="manager-note">No streams yet. Create one to generate fresh ingest details and wire it back into openvibe.live.</p>';
        }
        return streams.map((stream) => {
            const channelSlug = stream.channel_slug || 'unknown';
            const canStart = stream.status !== 'started' && stream.status !== 'ended';
            const canEnd = stream.status === 'started';
            return '\n                        <div class="stack-item">\n                            <div class="pill-row">\n                                <span class="pill ' + streamTone(stream) + '">' + escapeInlineHtml(stream.status || 'created') + '</span>\n                                ' + (stream.protocol ? ('<span class="pill muted">' + escapeInlineHtml(stream.protocol) + '</span>') : '') + '\n                                ' + (stream.category ? ('<span class="pill muted">' + escapeInlineHtml(stream.category) + '</span>') : '') + '\n                            </div>\n                            <h4 style="margin-top:0.75rem;">' + escapeInlineHtml(stream.title || 'Untitled stream') + '</h4>\n                            <p class="manager-note">@' + escapeInlineHtml(channelSlug) + ' · ' + escapeInlineHtml(relativeTime(stream.started_at || stream.created_at || stream.updated_at)) + ' · ' + escapeInlineHtml(formatTimestamp(stream.started_at || stream.created_at || stream.updated_at)) + '</p>\n                            <div class="form-actions" style="margin-top:0.85rem;">\n                                ' + (canStart ? ('<button class="button-secondary" type="button" data-stream-action="start" data-stream-id="' + escapeInlineHtml(stream.id) + '">Mark started</button>') : '') + '\n                                ' + (canEnd ? ('<button class="button-secondary" type="button" data-stream-action="end" data-stream-id="' + escapeInlineHtml(stream.id) + '">Mark ended</button>') : '') + '\n                                <a class="button-ghost" href="/@' + encodeURIComponent(channelSlug) + '/s/' + encodeURIComponent(stream.id) + '">Open route</a>\n                            </div>\n                        </div>';
        }).join('');
    }

    function renderIngestPanel(payload) {
        const target = document.querySelector('[data-go-live-ingest]');
        if (!target) return;
        if (!payload || !payload.ingest || !payload.stream || !payload.channel) {
            target.innerHTML = '<p class="manager-note">Create a stream to reveal ingest details and hand-off info for OBS or your restream workflow.</p>';
            return;
        }
        target.innerHTML = '\n                    <div class="stack-item">\n                        <div class="pill-row">\n                            <span class="pill primary">@' + escapeInlineHtml(payload.channel.slug) + '</span>\n                            <span class="pill soft">' + escapeInlineHtml(payload.stream.protocol || 'rtmp') + '</span>\n                        </div>\n                        <h4 style="margin-top:0.75rem;">' + escapeInlineHtml(payload.stream.title || 'Untitled stream') + '</h4>\n                        <p class="manager-note">Use the matching ingest URL below in OBS, WHIP-compatible tools, or your restream setup.</p>\n                        <ul class="flow-list" style="margin-top:0.75rem;">\n                            <li><strong>RTMP</strong> — <code>' + escapeInlineHtml(payload.ingest.rtmp || '') + '</code></li>\n                            <li><strong>WHIP</strong> — <code>' + escapeInlineHtml(payload.ingest.whip || '') + '</code></li>\n                            <li><strong>JSMPEG</strong> — <code>' + escapeInlineHtml(payload.ingest.jsmpeg || '') + '</code></li>\n                        </ul>\n                    </div>';
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
                sessionPanel.innerHTML = renderGuestCard('Browsing as ' + identity.displayName, 'Anonymous identities can watch and chat, but stream controls require a full OpenVibe account.', '<a class="button-secondary" href="' + escapeInlineHtml(signInHref()) + '">Create full account</a>');
            } else if (state.error) {
                sessionPanel.innerHTML = '\n                            <div class="eyebrow">Account status</div>\n                            <h3 class="card-title">' + escapeInlineHtml(identity.displayName) + '</h3>\n                            <p class="card-body">Your account is signed in, but openre.stream could not be reached for dashboard data right now.</p>\n                            <div class="form-actions" style="margin-top:1rem;">\n                                <a class="button" href="' + escapeInlineHtml(state.restreamUrl) + '">Open openre.stream</a>\n                                <a class="button-ghost" href="' + escapeInlineHtml(resolveSurfaceUrl('my')) + '">Account</a>\n                            </div>';
            } else {
                const activeStream = state.streams.find((stream) => stream.status === 'started') || null;
                sessionPanel.innerHTML = '\n                            <div class="eyebrow">Account status</div>\n                            <h3 class="card-title">' + escapeInlineHtml(identity.displayName) + '</h3>\n                            <p class="card-body">' + escapeInlineHtml(activeStream ? 'You have an active stream record. Use the controls below to keep it moving.' : 'You are signed in and ready to prep your next stream.') + '</p>\n                            <div class="data-points">\n                                <div class="data-point">\n                                    <div class="data-point-label">Channels</div>\n                                    <div class="data-point-value">' + escapeInlineHtml(String(state.channels.length)) + '</div>\n                                </div>\n                                <div class="data-point">\n                                    <div class="data-point-label">Destinations</div>\n                                    <div class="data-point-value">' + escapeInlineHtml(String(state.destinations.length)) + '</div>\n                                </div>\n                                <div class="data-point">\n                                    <div class="data-point-label">Latest stream</div>\n                                    <div class="data-point-value">' + escapeInlineHtml(activeStream ? 'Live' : (state.streams[0] && state.streams[0].status) || 'Ready') + '</div>\n                                </div>\n                            </div>\n                            <div class="form-actions" style="margin-top:1rem;">\n                                <a class="button-secondary" href="' + escapeInlineHtml(state.restreamUrl) + '">Open openre.stream</a>\n                                <a class="button-ghost" href="' + escapeInlineHtml(switchAccountHref()) + '">Switch account</a>\n                            </div>';
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
        const state = await loadRestreamState(force);
        renderHomeAccountPanel(state);
        renderGoLiveDashboard(state);
        return state;
    }

    const channelForm = document.getElementById('go-live-channel-form');
    if (channelForm) {
        channelForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const state = await loadRestreamState(false);
            if (!state.identity || !state.session || !state.session.authenticated || state.identity.anonymous) return;
            const payload = {
                owner_user_id: state.identity.id,
                slug: slugify(channelForm.querySelector('[name="slug"]').value || state.identity.handle || state.identity.displayName),
                display_name: String(channelForm.querySelector('[name="display_name"]').value || state.identity.displayName || '').trim(),
            };
            if (!payload.slug) return;
            await fetchJsonWithAuth(state.restreamUrl + '/api/v1/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            const state = await loadRestreamState(false);
            if (!state.identity || !state.session || !state.session.authenticated || state.identity.anonymous) return;
            const payload = {
                owner_user_id: state.identity.id,
                kind: String(destinationForm.querySelector('[name="kind"]').value || 'custom').trim(),
                label: String(destinationForm.querySelector('[name="label"]').value || '').trim(),
                target_url: String(destinationForm.querySelector('[name="target_url"]').value || '').trim(),
                target_key: String(destinationForm.querySelector('[name="target_key"]').value || '').trim(),
            };
            if (!payload.target_url) return;
            await fetchJsonWithAuth(state.restreamUrl + '/api/v1/destinations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            const state = await loadRestreamState(false);
            if (!state.identity || !state.session || !state.session.authenticated || state.identity.anonymous) return;
            const payload = {
                channel_slug: String(streamForm.querySelector('[name="channel_slug"]').value || '').trim(),
                title: String(streamForm.querySelector('[name="title"]').value || '').trim(),
                category: String(streamForm.querySelector('[name="category"]').value || '').trim(),
                protocol: String(streamForm.querySelector('[name="protocol"]').value || 'rtmp').trim(),
            };
            if (!payload.channel_slug) return;
            latestIngestPayload = await fetchJsonWithAuth(state.restreamUrl + '/api/v1/streams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            const state = await loadRestreamState(false);
            if (!state.identity || !state.session || !state.session.authenticated || state.identity.anonymous) return;
            const streamId = String(button.dataset.streamId || '').trim();
            const action = String(button.dataset.streamAction || '').trim();
            if (!streamId || !action) return;
            const path = action === 'start' ? 'start' : 'end';
            await fetchJsonWithAuth(state.restreamUrl + '/api/v1/streams/' + encodeURIComponent(streamId) + '/' + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            });
            await refreshDashboard(true);
        });
    }

    refreshDashboard(false).catch(() => {});
    document.addEventListener('openvibe-auth-changed', () => {
        restreamStatePromise = null;
        restreamStateKey = '';
        latestIngestPayload = null;
        refreshDashboard(true).catch(() => {});
    });
})();
