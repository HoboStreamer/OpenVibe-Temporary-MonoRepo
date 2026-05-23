// OpenVibe shared frontend helpers — bridge/exchange auth plus common chrome
// for service surfaces outside the full network control plane.

(function (global) {
    'use strict';

    const API_BASE = (global.OV_API_BASE || '/api/v1').replace(/\/$/, '');
    const BRIDGE_TOKEN_KEY = 'openvibe.bridge.token';
    const LOCAL_THEME_KEY = 'openvibe.theme';
    const LOCAL_ANON_TOKENS_KEY = 'openvibe.anon_tokens';
    const LOCAL_ACTIVE_ANON_KEY = 'openvibe.anon_active';

    let sessionPromise = null;

    const BUILTIN_THEMES = [
        {
            id: 'openvibe-dark',
            accent: '#8b5cf6',
            accent2: '#22d3ee',
            bg: '#060917',
            bgElev: 'rgba(15, 23, 45, 0.88)',
            bgElev2: 'rgba(21, 31, 60, 0.94)',
            text: '#eef4ff',
            textDim: '#a7b5d2',
            textFaint: '#6d7c98',
            border: 'rgba(148, 163, 184, 0.14)',
            shadow: '0 28px 90px rgba(2, 8, 23, 0.42)',
        },
        {
            id: 'openvibe-dim',
            accent: '#2dd4bf',
            accent2: '#60a5fa',
            bg: '#0b1323',
            bgElev: 'rgba(21, 33, 54, 0.88)',
            bgElev2: 'rgba(28, 42, 66, 0.94)',
            text: '#edf6ff',
            textDim: '#b4c7dd',
            textFaint: '#7f94b0',
            border: 'rgba(96, 165, 250, 0.16)',
            shadow: '0 28px 90px rgba(5, 16, 32, 0.42)',
        },
        {
            id: 'openvibe-light',
            accent: '#5b3df0',
            accent2: '#0ea5e9',
            bg: '#eef4ff',
            bgElev: 'rgba(255, 255, 255, 0.92)',
            bgElev2: 'rgba(235, 243, 255, 0.96)',
            text: '#0f172a',
            textDim: '#475569',
            textFaint: '#64748b',
            border: 'rgba(71, 85, 105, 0.18)',
            shadow: '0 18px 48px rgba(15, 23, 42, 0.12)',
        },
        {
            id: 'sunset',
            accent: '#f97316',
            accent2: '#fb7185',
            bg: '#1a1118',
            bgElev: 'rgba(56, 26, 36, 0.88)',
            bgElev2: 'rgba(79, 33, 49, 0.94)',
            text: '#fff1f2',
            textDim: '#fecdd3',
            textFaint: '#fda4af',
            border: 'rgba(251, 113, 133, 0.18)',
            shadow: '0 28px 90px rgba(42, 16, 24, 0.45)',
        },
        {
            id: 'forest',
            accent: '#22c55e',
            accent2: '#2dd4bf',
            bg: '#0d1410',
            bgElev: 'rgba(18, 36, 29, 0.88)',
            bgElev2: 'rgba(24, 51, 40, 0.94)',
            text: '#ecfdf5',
            textDim: '#a7f3d0',
            textFaint: '#6ee7b7',
            border: 'rgba(45, 212, 191, 0.16)',
            shadow: '0 28px 90px rgba(8, 24, 18, 0.45)',
        },
        {
            id: 'cyberpunk',
            accent: '#ec4899',
            accent2: '#22d3ee',
            bg: '#0c0a18',
            bgElev: 'rgba(30, 18, 48, 0.9)',
            bgElev2: 'rgba(43, 23, 69, 0.94)',
            text: '#faf5ff',
            textDim: '#d8b4fe',
            textFaint: '#c084fc',
            border: 'rgba(236, 72, 153, 0.18)',
            shadow: '0 28px 90px rgba(15, 6, 32, 0.5)',
        },
        {
            id: 'hobostreamer',
            name: 'HoboStreamer',
            description: 'Campfire amber on near-black. The original hobo aesthetic.',
            accent: '#c0965c',
            accent2: '#dbb077',
            bg: '#0d0d0f',
            bgElev: 'rgba(22, 22, 26, 0.88)',
            bgElev2: 'rgba(30, 28, 22, 0.94)',
            text: '#e8e6e3',
            textDim: '#9a9a9a',
            textFaint: '#666666',
            border: 'rgba(192, 150, 92, 0.18)',
            shadow: '0 28px 90px rgba(0, 0, 0, 0.6)',
        },
        {
            id: 'custom',
            name: 'Custom Palette',
            description: 'Your own colors. Configure on the themes page.',
            accent: '#8b5cf6',
            accent2: '#22d3ee',
            bg: '#060917',
            bgElev: 'rgba(11, 16, 33, 0.88)',
            bgElev2: 'rgba(21, 31, 60, 0.94)',
            text: '#eef4ff',
            textDim: '#a7b5d2',
            textFaint: '#6d7c98',
            border: 'rgba(139, 92, 246, 0.18)',
            shadow: '0 28px 90px rgba(3, 5, 15, 0.5)',
        },
    ];

    const SURFACES = {
        network:   { origin: 'https://openvibe.network', localHost: 'openvibe.network.localhost', port: 4100 },
        auth:      { origin: 'https://auth.openvibe.network', localHost: 'auth.openvibe.network.localhost', port: 4100 },
        tools:     { origin: 'https://openvibe.tools', localHost: 'openvibe.tools.localhost', port: 4100 },
        admin:     { origin: 'https://admin.openvibe.network', localHost: 'admin.openvibe.network.localhost', port: 4100 },
        my:        { origin: 'https://my.openvibe.network', localHost: 'my.openvibe.network.localhost', port: 4100 },
        themes:    { origin: 'https://themes.openvibe.network', localHost: 'themes.openvibe.network.localhost', port: 4100 },
        live:      { origin: 'https://openvibe.live', localHost: 'openvibe.live.localhost', port: 4600 },
        restream:  { origin: 'https://openre.stream', localHost: 'openre.stream.localhost', port: 4700 },
        chat:      { origin: 'https://openvibe.chat', localHost: 'openvibe.chat.localhost', port: 4800 },
        community: { origin: 'https://openvibe.community', localHost: 'openvibe.community.localhost', port: 4900 },
        media:     { origin: 'https://openvibe.media', localHost: 'openvibe.media.localhost', port: 4500 },
        billing:   { origin: 'https://billing.openvibe.network', localHost: 'billing.openvibe.network.localhost', port: 5000 },
        ai:        { origin: 'https://ai.openvibe.network', localHost: 'ai.openvibe.network.localhost', port: 5100 },
        games:     { origin: 'https://openvibe.games', localHost: 'openvibe.games.localhost', port: 5200 },
    };

    const SERVICE_SURFACES = {
        'openvibe-network': 'network',
        'openvibe-tools': 'tools',
        'openvibe-live': 'live',
        'openre-stream': 'restream',
        'openvibe-chat': 'chat',
        'openvibe-community': 'community',
        'openvibe-media': 'media',
        'openvibe-billing': 'billing',
        'openvibe-ai': 'ai',
        'openvibe-games': 'games',
        'openvibe-admin': 'admin',
        'openvibe-my': 'my',
        'openvibe-themes': 'themes',
    };

    const CATEGORY_ICONS = {
        platform: 'network',
        streaming: 'live',
        chat: 'chat',
        community: 'community',
        billing: 'billing',
        ai: 'ai',
        games: 'games',
        admin: 'admin',
        account: 'my',
        service: 'runtime',
    };

    const FALLBACK_SERVICES = [
        { service_id: 'openvibe-network', display_name: 'OpenVibe Network', description: 'The platform hub and identity surface.', public_url: resolveSurfaceUrl('network'), category: 'platform' },
        { service_id: 'openvibe-tools', display_name: 'OpenVibe Tools', description: 'Searchable directory of every OpenVibe service.', public_url: resolveSurfaceUrl('tools'), category: 'platform' },
        { service_id: 'openvibe-live', display_name: 'OpenVibe Live', description: 'Native live streaming.', public_url: resolveSurfaceUrl('live'), category: 'streaming' },
        { service_id: 'openre-stream', display_name: 'OpenRe.Stream', description: 'Restream / multi-destination broadcast.', public_url: resolveSurfaceUrl('restream'), category: 'streaming' },
        { service_id: 'openvibe-chat', display_name: 'OpenVibe Chat', description: 'Chat, DMs, voice rooms, TTS.', public_url: resolveSurfaceUrl('chat'), category: 'chat' },
        { service_id: 'openvibe-community', display_name: 'Pastes', description: 'Public pastes and snippets.', public_url: resolveSurfaceUrl('community'), category: 'community' },
        { service_id: 'openvibe-media', display_name: 'OpenVibe Media', description: 'Shared media object storage.', public_url: resolveSurfaceUrl('media'), category: 'platform' },
        { service_id: 'openvibe-billing', display_name: 'OpenVibe Billing', description: 'Subscriptions, tips, ledger.', public_url: resolveSurfaceUrl('billing'), category: 'billing' },
        { service_id: 'openvibe-ai', display_name: 'OpenVibe AI', description: 'Provider routing, captions, search backbone.', public_url: resolveSurfaceUrl('ai'), category: 'ai' },
        { service_id: 'openvibe-games', display_name: 'OpenVibe Games', description: 'Shared MMORPG progression, canvas, cosmetics, and world state.', public_url: resolveSurfaceUrl('games'), category: 'games' },
        { service_id: 'openvibe-admin', display_name: 'Admin', description: 'Operator surface for staff.', public_url: resolveSurfaceUrl('admin'), category: 'admin' },
        { service_id: 'openvibe-my', display_name: 'My Account', description: 'Account hub, themes, linked accounts.', public_url: resolveSurfaceUrl('my'), category: 'account' },
        { service_id: 'openvibe-themes', display_name: 'Themes', description: 'Network-wide theme catalog.', public_url: resolveSurfaceUrl('themes'), category: 'account' },
    ];

    function isLocalHostname() {
        const hostname = global.location && global.location.hostname ? global.location.hostname : '';
        return /localhost$/i.test(hostname);
    }

    function themeById(themeId) {
        return BUILTIN_THEMES.find((theme) => theme.id === themeId) || BUILTIN_THEMES[0];
    }

    function applyTheme(themeId, options) {
        const theme = themeById(themeId);
        const root = global.document && global.document.documentElement;
        if (!root) return theme;
        root.dataset.openvibeTheme = theme.id;
        root.style.setProperty('color-scheme', theme.id === 'openvibe-light' ? 'light' : 'dark');
        root.style.setProperty('--ov-accent', theme.accent);
        root.style.setProperty('--ov-accent-2', theme.accent2);
        root.style.setProperty('--ov-bg', theme.bg);
        root.style.setProperty('--ov-bg-elev', theme.bgElev);
        root.style.setProperty('--ov-bg-elev-2', theme.bgElev2);
        root.style.setProperty('--ov-text', theme.text);
        root.style.setProperty('--ov-text-dim', theme.textDim);
        root.style.setProperty('--ov-text-faint', theme.textFaint);
        root.style.setProperty('--ov-border', theme.border);
        root.style.setProperty('--ov-shadow', theme.shadow);
        // Legacy aliases for SSR services (openvibe-live etc.) that use --bg/--accent/--text/--panel/--border
        root.style.setProperty('--accent', theme.accent);
        root.style.setProperty('--accent-2', theme.accent2);
        root.style.setProperty('--bg', theme.bg);
        root.style.setProperty('--panel', theme.bgElev);
        root.style.setProperty('--panel-strong', theme.bgElev2);
        root.style.setProperty('--border', theme.border);
        root.style.setProperty('--text', theme.text);
        root.style.setProperty('--muted', theme.textFaint);
        root.style.setProperty('--muted-strong', theme.textDim);
        if (themeId === 'custom') {
            try {
                const cc = JSON.parse(localStorage.getItem('openvibe.theme.custom') || '{}');
                const hp = (h) => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null; };
                if (cc.bg) { const p = hp(cc.bg); root.style.setProperty('--ov-bg', cc.bg); root.style.setProperty('--bg', cc.bg); root.style.setProperty('--ov-nav-bg', cc.bg); if (p) { root.style.setProperty('--ov-bg-elev', `rgba(${p[0]},${p[1]},${p[2]},0.88)`); root.style.setProperty('--ov-bg-elev-2', `rgba(${Math.min(p[0]+8,255)},${Math.min(p[1]+8,255)},${Math.min(p[2]+8,255)},0.94)`); root.style.setProperty('--panel', `rgba(${p[0]},${p[1]},${p[2]},0.88)`); } }
                if (cc.accent) { root.style.setProperty('--ov-accent', cc.accent); root.style.setProperty('--accent', cc.accent); const p = hp(cc.accent); if (p) root.style.setProperty('--ov-border', `rgba(${p[0]},${p[1]},${p[2]},0.18)`); }
                if (cc.accent2) { root.style.setProperty('--ov-accent-2', cc.accent2); root.style.setProperty('--accent-2', cc.accent2); }
                if (cc.text) { root.style.setProperty('--ov-text', cc.text); root.style.setProperty('--text', cc.text); }
                if (cc.textDim) { root.style.setProperty('--ov-text-dim', cc.textDim); root.style.setProperty('--ov-text-faint', cc.textDim); root.style.setProperty('--muted', cc.textDim); }
            } catch { /* ignore */ }
        }
        if (!options || options.persistLocal !== false) {
            try {
                global.localStorage.setItem(LOCAL_THEME_KEY, theme.id);
            } catch {
                // ignore storage failures
            }
        }
        return theme;
    }

    function applySavedTheme() {
        try {
            const saved = global.localStorage.getItem(LOCAL_THEME_KEY);
            if (saved) return applyTheme(saved, { persistLocal: false });
        } catch {
            // ignore storage failures
        }
        return applyTheme(BUILTIN_THEMES[0].id, { persistLocal: false });
    }

    function resolveSurfaceUrl(surface) {
        const cfg = SURFACES[surface];
        if (!cfg) return '#';
        if (isLocalHostname()) {
            return `${global.location.protocol || 'http:'}//${cfg.localHost}:${cfg.port}`;
        }
        return cfg.origin;
    }

    function resolveRegistryUrl() {
        return `${resolveSurfaceUrl('network')}/api/v1/services`;
    }

    function bridgeReturnUrl(returnTo) {
        const target = new URL(returnTo || global.location.href, global.location.href);
        target.hash = '';
        return target.toString();
    }

    function buildBridgeUrl(returnTo) {
        return `${resolveSurfaceUrl('network')}/api/v1/session/bridge?return_to=${encodeURIComponent(bridgeReturnUrl(returnTo))}`;
    }

    function signInUrl(returnTo) {
        return buildBridgeUrl(returnTo || global.location.href);
    }

    function switchAccountUrl(returnTo) {
        const authorizeUrl = new URL('/oauth/authorize', resolveSurfaceUrl('auth'));
        authorizeUrl.searchParams.set('prompt', 'login');
        authorizeUrl.searchParams.set('return_to', buildBridgeUrl(returnTo || global.location.href));
        return authorizeUrl.toString();
    }

    function signOutUrl(returnTo) {
        return `${resolveSurfaceUrl('auth')}/oauth/logout?return_to=${encodeURIComponent(bridgeReturnUrl(returnTo))}`;
    }

    function loadBridgeToken() {
        try {
            return global.sessionStorage.getItem(BRIDGE_TOKEN_KEY) || '';
        } catch {
            return '';
        }
    }

    function saveBridgeToken(token) {
        try {
            if (token) global.sessionStorage.setItem(BRIDGE_TOKEN_KEY, token);
            else global.sessionStorage.removeItem(BRIDGE_TOKEN_KEY);
        } catch {
            // ignore storage failures
        }
    }

    function clearBridgeToken() {
        saveBridgeToken('');
    }

    function consumeBridgeToken() {
        const hash = String(global.location && global.location.hash || '').replace(/^#/, '');
        if (!hash) return '';
        const params = new URLSearchParams(hash);
        const token = params.get('openvibe_token');
        if (!token) return '';
        saveBridgeToken(token);
        params.delete('openvibe_token');
        const nextHash = params.toString();
        const nextUrl = `${global.location.pathname}${global.location.search}${nextHash ? `#${nextHash}` : ''}`;
        global.history.replaceState({}, global.document.title, nextUrl);
        return token;
    }

    function safeParse(value, fallback) {
        if (typeof value !== 'string') return value || fallback;
        try { return JSON.parse(value); } catch { return fallback; }
    }

    function readAnonTokens() {
        try {
            return safeParse(global.localStorage.getItem(LOCAL_ANON_TOKENS_KEY), {}) || {};
        } catch {
            return {};
        }
    }

    function writeAnonTokens(tokens) {
        try {
            global.localStorage.setItem(LOCAL_ANON_TOKENS_KEY, JSON.stringify(tokens || {}));
        } catch {
            // ignore storage failures
        }
    }

    function setActiveAnonId(value) {
        try {
            if (value) global.localStorage.setItem(LOCAL_ACTIVE_ANON_KEY, value);
            else global.localStorage.removeItem(LOCAL_ACTIVE_ANON_KEY);
        } catch {
            // ignore storage failures
        }
    }

    function rememberAnonymousIdentity(user) {
        if (!user || !user.id || !user.session_token) return;
        const tokens = readAnonTokens();
        tokens[user.id] = {
            id: user.id,
            anon_number: user.anon_number || null,
            display_name: user.display_name || user.username || 'Anonymous',
            session_token: user.session_token,
            updated_at: new Date().toISOString(),
        };
        writeAnonTokens(tokens);
        setActiveAnonId(user.id);
    }

    function isAnonymousUser(user) {
        return !!(user && (
            user.anonymous === true
            || user.actor_type === 'anon'
            || String(user.id || user.sub || '').startsWith('anon:')
        ));
    }

    function dispatchAuthChanged(session) {
        if (!global.document || typeof global.CustomEvent !== 'function') return;
        global.document.dispatchEvent(new global.CustomEvent('openvibe-auth-changed', {
            detail: session || null,
        }));
    }

    async function parseJsonResponse(response) {
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = text;
        }
        if (!response.ok) {
            const error = new Error(body && body.error ? body.error : `Request failed (${response.status})`);
            error.status = response.status;
            error.body = body;
            throw error;
        }
        return body;
    }

    async function requestJson(url, opts, label) {
        const response = await fetch(url, Object.assign({
            credentials: 'include',
            headers: { Accept: 'application/json' },
        }, opts || {}));
        try {
            return await parseJsonResponse(response);
        } catch (error) {
            if (label) error.message = `${label}: ${error.message}`;
            throw error;
        }
    }

    async function networkRequestJson(pathname, opts) {
        const options = Object.assign({}, opts || {});
        const omitStoredToken = !!options.omitStoredToken;
        delete options.omitStoredToken;
        const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
        const storedToken = omitStoredToken ? '' : loadBridgeToken();
        if (storedToken && !headers.Authorization && !headers.authorization) {
            headers.Authorization = `Bearer ${storedToken}`;
        }
        options.headers = headers;
        if (!Object.prototype.hasOwnProperty.call(options, 'credentials')) {
            options.credentials = 'include';
        }
        const response = await fetch(`${resolveSurfaceUrl('network')}${pathname}`, options);
        return parseJsonResponse(response);
    }

    function normalizeSession(exchange) {
        const user = exchange && exchange.user ? exchange.user : null;
        const anonymous = isAnonymousUser(user);
        return {
            authenticated: !!user && !anonymous,
            anonymous,
            user,
            access_token: exchange && exchange.access_token ? exchange.access_token : loadBridgeToken(),
        };
    }

    async function exchangeNetworkSession() {
        consumeBridgeToken();
        if (!loadBridgeToken()) {
            try {
                const currentSession = await networkRequestJson('/api/v1/session', {
                    method: 'GET',
                    omitStoredToken: true,
                });
                const normalizedCurrent = normalizeSession(currentSession || {});
                if (!normalizedCurrent.user) {
                    const guestSession = { authenticated: false, anonymous: false, user: null, access_token: '' };
                    dispatchAuthChanged(guestSession);
                    return guestSession;
                }
            } catch {
                // fall through to exchange if the session probe fails unexpectedly
            }
        }
        try {
            const exchange = await networkRequestJson('/api/v1/session/exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            });
            if (exchange && exchange.access_token) saveBridgeToken(exchange.access_token);
            const session = normalizeSession(exchange || {});
            if (session.anonymous && session.user) rememberAnonymousIdentity(session.user);
            dispatchAuthChanged(session);
            return session;
        } catch (error) {
            if (error.status === 401 && loadBridgeToken()) {
                clearBridgeToken();
                try {
                    const exchange = await networkRequestJson('/api/v1/session/exchange', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: '{}',
                        omitStoredToken: true,
                    });
                    if (exchange && exchange.access_token) saveBridgeToken(exchange.access_token);
                    const session = normalizeSession(exchange || {});
                    if (session.anonymous && session.user) rememberAnonymousIdentity(session.user);
                    dispatchAuthChanged(session);
                    return session;
                } catch {
                    // fall through to guest response
                }
            }
            const guest = { authenticated: false, anonymous: false, user: null, access_token: '' };
            dispatchAuthChanged(guest);
            return guest;
        }
    }

    async function loadSession(force) {
        consumeBridgeToken();
        if (!force && sessionPromise) return sessionPromise;
        sessionPromise = exchangeNetworkSession();
        return sessionPromise;
    }

    async function loadSyncedThemePreference() {
        const session = await loadSession();
        if (!session || !session.authenticated) return null;
        try {
            const moduleState = await networkRequestJson('/api/v1/user-modules/me/openvibe.theme');
            const themeId = moduleState && moduleState.data && moduleState.data.theme_id
                ? String(moduleState.data.theme_id)
                : '';
            if (themeId) {
                applyTheme(themeId);
                return themeId;
            }
        } catch (error) {
            if (!error || error.status !== 404) {
                console.warn('[openvibe] failed to load synced theme:', error.message);
            }
        }
        return null;
    }

    async function primeTheme() {
        applySavedTheme();
        return loadSyncedThemePreference();
    }

    async function syncThemePreference(themeId) {
        applyTheme(themeId);
        const session = await loadSession().catch(() => null);
        if (!session || !session.authenticated) return;
        networkRequestJson('/api/v1/user-modules/me/openvibe.theme', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { theme_id: themeId, updated_at: new Date().toISOString() } }),
        }).catch(() => {});
    }

    function initThemePicker() {
        const wrap = global.document && global.document.getElementById('ov-theme-btn-wrap');
        if (!wrap) return;
        const triggerBtn = wrap.querySelector('#ov-theme-btn');
        const popup = wrap.querySelector('#ov-theme-popup');
        const swatchContainer = wrap.querySelector('#ov-theme-swatches');
        if (!triggerBtn || !popup || !swatchContainer) return;

        swatchContainer.innerHTML = BUILTIN_THEMES.slice(0, 6).map((t) =>
            `<button class="ov-theme-swatch" data-theme-id="${escapeHtml(t.id)}" type="button" title="${escapeHtml(t.name)}">
                <span class="ov-theme-swatch-preview" style="background:${escapeHtml(t.preview)}">
                    <span class="ov-theme-swatch-accent" style="background:${escapeHtml(t.accent)}"></span>
                    <span class="ov-theme-swatch-accent" style="background:${escapeHtml(t.accent2)}"></span>
                </span>
                <span class="ov-theme-swatch-name">${escapeHtml(t.name)}</span>
            </button>`
        ).join('');

        try {
            const saved = localStorage.getItem(LOCAL_THEME_KEY);
            if (saved) {
                const activeEl = swatchContainer.querySelector(`[data-theme-id="${CSS.escape(saved)}"]`);
                if (activeEl) activeEl.classList.add('ov-theme-swatch--active');
            }
        } catch { /* ignore */ }

        swatchContainer.querySelectorAll('[data-theme-id]').forEach((swatchBtn) => {
            swatchBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                syncThemePreference(swatchBtn.dataset.themeId);
                swatchContainer.querySelectorAll('[data-theme-id]').forEach((s) => s.classList.remove('ov-theme-swatch--active'));
                swatchBtn.classList.add('ov-theme-swatch--active');
                popup.hidden = true;
                triggerBtn.setAttribute('aria-expanded', 'false');
            });
        });

        triggerBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const open = !popup.hidden;
            popup.hidden = open;
            triggerBtn.setAttribute('aria-expanded', String(!open));
        });

        global.document.addEventListener('click', function () {
            popup.hidden = true;
            triggerBtn.setAttribute('aria-expanded', 'false');
        });
    }

    async function startAnonymousSession(options) {
        await networkRequestJson('/api/v1/session/anonymous', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options || {}),
        });
        sessionPromise = null;
        return loadSession(true);
    }

    async function loadAnonymousIdentities(options) {
        const params = new URLSearchParams();
        if (options && options.fingerprint) params.set('fingerprint', options.fingerprint);
        const suffix = params.toString() ? `?${params.toString()}` : '';
        const result = await networkRequestJson(`/api/v1/session/anonymous/identities${suffix}`, { omitStoredToken: false }).catch(() => ({ items: [] }));
        (result.items || []).forEach(rememberAnonymousIdentity);
        return result;
    }

    async function switchAnonymousIdentity(identity, options) {
        const payload = Object.assign({}, options || {});
        if (typeof identity === 'string') {
            const stored = readAnonTokens()[identity];
            if (stored && stored.session_token) payload.session_token = stored.session_token;
            else payload.anon_user_id = identity;
        } else if (identity && typeof identity === 'object') {
            if (identity.session_token) payload.session_token = identity.session_token;
            else if (identity.id) payload.anon_user_id = identity.id;
            if (identity.anon_number && !payload.anon_number) payload.anon_number = identity.anon_number;
        }
        return startAnonymousSession(payload);
    }

    async function createAnonymousIdentity(options) {
        return startAnonymousSession(Object.assign({ force_new: true }, options || {}));
    }

    async function fetchWithAuth(url, opts) {
        const options = Object.assign({}, opts || {});
        const headers = Object.assign({}, options.headers || {});
        if (!headers.Authorization && !headers.authorization) {
            const session = await loadSession();
            if (session && session.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        }
        options.headers = headers;
        if (!Object.prototype.hasOwnProperty.call(options, 'credentials')) {
            options.credentials = /^[a-z]+:/i.test(String(url || '')) ? 'include' : 'same-origin';
        }
        return fetch(url, options);
    }

    async function fetchJson(url, opts) {
        const response = await fetchWithAuth(url, opts);
        return parseJsonResponse(response);
    }

    async function api(pathname, opts) {
        return fetchJson(`${API_BASE}${pathname}`, opts);
    }

    async function loadServices() {
        try {
            const data = await requestJson(resolveRegistryUrl(), null, 'registry api');
            return Array.isArray(data && data.items) ? data.items : [];
        } catch (error) {
            console.warn('[openvibe] failed to load services:', error.message);
            return [];
        }
    }

    function resolveServiceUrl(item) {
        const surface = SERVICE_SURFACES[item && item.service_id];
        return surface ? resolveSurfaceUrl(surface) : ((item && item.public_url) || '#');
    }

    function icon(name, options) {
        const icons = global.OpenVibeIcons;
        return icons && typeof icons.icon === 'function'
            ? icons.icon(name, Object.assign({ decorative: true }, options || {}))
            : '';
    }

    function serviceIconName(item) {
        return SERVICE_SURFACES[item && item.service_id]
            || CATEGORY_ICONS[item && item.category]
            || 'runtime';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[char]));
    }

    function iconLabel(name, label, className) {
        return `<span class="${escapeHtml(className || 'ov-icon-label')}">${icon(name)}<span>${escapeHtml(label)}</span></span>`;
    }

    function mergedServices(remote) {
        const map = new Map();
        for (const item of FALLBACK_SERVICES) {
            map.set(item.service_id, Object.assign({}, item, { source: 'fallback' }));
        }
        for (const item of remote || []) {
            const meta = item.metadata_json ? safeParse(item.metadata_json, {}) : (item.metadata || {});
            const merged = Object.assign({}, map.get(item.service_id) || {}, item, {
                category: (meta && meta.category) || item.category || 'service',
                tags: (meta && meta.tags) || [],
                public_url: resolveServiceUrl(item),
                source: 'registry',
            });
            map.set(item.service_id, merged);
        }
        return [...map.values()]
            .map((item) => Object.assign({}, item, { public_url: resolveServiceUrl(item) }))
            .sort((left, right) => (left.display_name || left.service_id).localeCompare(right.display_name || right.service_id));
    }

    function renderServiceCards(target, items) {
        if (!target) return;
        target.innerHTML = '';
        for (const item of items) {
            const link = global.document.createElement('a');
            link.className = 'ov-card';
            link.href = resolveServiceUrl(item);
            link.innerHTML = `
                <div class="title">${iconLabel(serviceIconName(item), item.display_name || item.service_id)}</div>
                <div class="desc">${escapeHtml(item.description || '')}</div>
                <div class="meta">
                    <span class="ov-tag">${escapeHtml(item.category || 'service')}</span>
                    ${item.source === 'registry' ? '<span class="ov-tag ok">live</span>' : '<span class="ov-tag">catalog</span>'}
                </div>`;
            target.appendChild(link);
        }
    }

    function navbar(activeKey) {
        const links = [
            { key: 'home', href: resolveSurfaceUrl('network'), label: 'Home', icon: 'network' },
            { key: 'tools', href: resolveSurfaceUrl('tools'), label: 'Tools', icon: 'tools' },
            { key: 'themes', href: resolveSurfaceUrl('themes'), label: 'Themes', icon: 'themes' },
            { key: 'admin', href: resolveSurfaceUrl('admin'), label: 'Admin', icon: 'admin' },
            { key: 'docs', href: resolveRegistryUrl(), label: 'Registry API', icon: 'docs' },
        ];
        return `
            <header class="ov-nav"><div class="ov-nav-inner">
                <a href="${escapeHtml(resolveSurfaceUrl('network'))}" class="ov-brand">${icon('network')} <b>OpenVibe</b></a>
                <nav class="ov-nav-links">
                    ${links.map((link) => `<a href="${escapeHtml(link.href)}"${link.key === activeKey ? ' style="color:var(--ov-text)"' : ''}>${iconLabel(link.icon, link.label)}</a>`).join('')}
                </nav>
                <div class="ov-nav-end">
                    <div class="ov-theme-btn-wrap" id="ov-theme-btn-wrap">
                        <button class="ov-theme-btn" id="ov-theme-btn" type="button" aria-label="Change theme" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></button>
                        <div class="ov-theme-popup" id="ov-theme-popup" hidden>
                            <div class="ov-theme-swatches" id="ov-theme-swatches"></div>
                            <a class="ov-theme-explore" href="${escapeHtml(resolveSurfaceUrl('themes'))}">Explore more themes!</a>
                        </div>
                    </div>
                    <div class="ov-nav-session" id="ov-nav-session"><span class="ov-chip soft">Checking session…</span></div>
                </div>
            </div></header>`;
    }

    function footer() {
        return `<footer class="ov-footer">
            OpenVibe is open source and community-run. ·
            <a href="https://github.com/openvibe">GitHub</a> ·
            <a href="${escapeHtml(resolveRegistryUrl())}">Registry</a> ·
            <a href="${escapeHtml(resolveSurfaceUrl('auth'))}/.well-known/openid-configuration">OIDC</a> ·
            <a href="/health">Health</a>
        </footer>`;
    }

    async function hydrateNavSession() {
        const target = global.document.getElementById('ov-nav-session');
        if (!target) return;
        const session = await loadSession();
        if (session && session.authenticated && session.user) {
            target.innerHTML = `
                <span class="ov-chip ok">@${escapeHtml(session.user.username || session.user.id || 'you')}</span>
                <span class="ov-chip soft">${escapeHtml(session.user.role || 'user')}</span>
                <a class="ov-btn" href="${escapeHtml(resolveSurfaceUrl('my'))}">Account</a>
                <a class="ov-btn" href="${escapeHtml(switchAccountUrl(global.location.href))}">Switch account</a>
                <a class="ov-btn ov-btn-ghost" href="${escapeHtml(signOutUrl(global.location.href))}">Sign out</a>`;
            return;
        }
        if (session && session.anonymous && session.user) {
            target.innerHTML = `
                <span class="ov-chip warn">${escapeHtml(session.user.display_name || session.user.username || 'Anonymous')}</span>
                <a class="ov-btn" href="${escapeHtml(resolveSurfaceUrl('my'))}">Switch identity</a>
                <button class="ov-btn" type="button" data-openvibe-new-anon="true">New anon</button>
                <a class="ov-btn ov-btn-primary" href="${escapeHtml(signInUrl(global.location.href))}">Create account</a>
                <a class="ov-btn ov-btn-ghost" href="${escapeHtml(signOutUrl(global.location.href))}">Leave anonymous</a>`;
            const newAnonButton = target.querySelector('[data-openvibe-new-anon]');
            if (newAnonButton) {
                newAnonButton.addEventListener('click', async function () {
                    newAnonButton.disabled = true;
                    newAnonButton.textContent = 'Creating anon…';
                    try {
                        await createAnonymousIdentity();
                        global.location.reload();
                    } catch (error) {
                        console.warn('[openvibe] failed to create anonymous identity:', error.message);
                        newAnonButton.disabled = false;
                        newAnonButton.textContent = 'New anon';
                    }
                });
            }
            return;
        }
        target.innerHTML = `
            <button class="ov-btn" type="button" data-openvibe-anon-session="true">Anonymous</button>
            <a class="ov-btn ov-btn-primary" href="${escapeHtml(signInUrl(global.location.href))}">Sign in</a>`;
        const anonButton = target.querySelector('[data-openvibe-anon-session]');
        if (anonButton) {
            anonButton.addEventListener('click', async function () {
                anonButton.disabled = true;
                anonButton.textContent = 'Starting anonymous session…';
                try {
                    await startAnonymousSession();
                    global.location.reload();
                } catch (error) {
                    console.warn('[openvibe] failed to start anonymous session:', error.message);
                    anonButton.disabled = false;
                    anonButton.textContent = 'Anonymous';
                }
            });
        }
    }

    async function renderChrome(activeKey) {
        const navMount = global.document.getElementById('nav-mount');
        const footerMount = global.document.getElementById('footer-mount');
        if (navMount) navMount.innerHTML = navbar(activeKey);
        if (footerMount) footerMount.innerHTML = footer();
        initThemePicker();
        await Promise.all([
            hydrateNavSession(),
            loadSyncedThemePreference(),
        ]);
    }

    function attachLauncher(getItems) {
        const root = global.document.createElement('div');
        root.className = 'ov-launcher';
        root.innerHTML = `<div class="ov-launcher-box">
            <input class="ov-input" placeholder="Search OpenVibe services… (Esc to close)" />
            <div class="ov-launcher-results"></div>
        </div>`;
        global.document.body.appendChild(root);
        const input = root.querySelector('input');
        const results = root.querySelector('.ov-launcher-results');

        function close() {
            root.classList.remove('open');
            input.value = '';
        }

        function open() {
            root.classList.add('open');
            input.focus();
            render('');
        }

        function render(query) {
            const items = (getItems() || []).filter((item) => {
                const haystack = `${item.display_name || ''} ${item.description || ''} ${item.service_id || ''} ${item.category || ''}`.toLowerCase();
                return !query || haystack.includes(String(query).toLowerCase());
            }).slice(0, 12);
            renderServiceCards(results, items);
        }

        input.addEventListener('input', function () {
            render(input.value);
        });
        root.addEventListener('click', function (event) {
            if (event.target === root) close();
        });
        global.document.addEventListener('keydown', function (event) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                open();
            }
            if (event.key === 'Escape') close();
        });
        return { open, close };
    }

    applySavedTheme();

    global.OpenVibe = {
        FALLBACK_SERVICES,
        api,
        attachLauncher,
        createAnonymousIdentity,
        escapeHtml,
        fetchJson,
        fetchWithAuth,
        footer,
        icon,
        iconLabel,
        loadAnonymousIdentities,
        loadServices,
        loadSession,
        mergedServices,
        navbar,
        primeTheme,
        renderChrome,
        renderServiceCards,
        resolveRegistryUrl,
        resolveServiceUrl,
        resolveSurfaceUrl,
        serviceIconName,
        signInUrl,
        signOutUrl,
        startAnonymousSession,
        switchAccountUrl,
        switchAnonymousIdentity,
        syncThemePreference,
        initThemePicker,
    };
}(window));
