// OpenVibe shared frontend helpers — environment-aware chrome, account tools,
// favorites/recents sync, and theme utilities for openvibe-network surfaces.

(function (global) {
    'use strict';

    const API_BASE = (global.OV_API_BASE || '/api/v1').replace(/\/$/, '');
    const LOCAL_LAUNCHER_KEY = 'openvibe.launcher';
    const LOCAL_THEME_KEY = 'openvibe.theme';
    const LOCAL_ANON_TOKENS_KEY = 'openvibe.anon_tokens';
    const LOCAL_ACTIVE_ANON_KEY = 'openvibe.anon_active';
    const relativeTime = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
        ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
        : null;

    const SURFACE_URL_KEYS = {
        network: 'OPENVIBE_NETWORK_URL',
        auth: 'OPENVIBE_AUTH_URL',
        tools: 'OPENVIBE_TOOLS_URL',
        admin: 'OPENVIBE_ADMIN_URL',
        my: 'OPENVIBE_MY_URL',
        themes: 'OPENVIBE_THEMES_URL',
        live: 'OPENVIBE_LIVE_URL',
        media: 'OPENVIBE_MEDIA_URL',
        restream: 'OPENRE_STREAM_URL',
        chat: 'OPENVIBE_CHAT_URL',
        community: 'OPENVIBE_COMMUNITY_URL',
        billing: 'OPENVIBE_BILLING_URL',
        ai: 'OPENVIBE_AI_URL',
        games: 'OPENVIBE_GAMES_URL',
    };

    const SURFACE_FALLBACKS = {
        network: 'https://openvibe.network',
        auth: 'https://auth.openvibe.network',
        admin: 'https://admin.openvibe.network',
        my: 'https://my.openvibe.network',
        themes: 'https://themes.openvibe.network',
        tools: 'https://openvibe.tools',
        live: 'https://openvibe.live',
        media: 'https://openvibe.media',
        restream: 'https://openre.stream',
        chat: 'https://openvibe.chat',
        community: 'https://openvibe.community',
        billing: 'https://billing.openvibe.network',
        ai: 'https://ai.openvibe.network',
        games: 'https://openvibe.games',
    };

    const LOCAL_SURFACE_HOSTS = {
        network: 'openvibe.network.localhost',
        auth: 'auth.openvibe.network.localhost',
        tools: 'openvibe.tools.localhost',
        admin: 'admin.openvibe.network.localhost',
        my: 'my.openvibe.network.localhost',
        themes: 'themes.openvibe.network.localhost',
        live: 'openvibe.live.localhost',
        media: 'openvibe.media.localhost',
        restream: 'openre.stream.localhost',
        chat: 'openvibe.chat.localhost',
        community: 'openvibe.community.localhost',
        billing: 'billing.openvibe.network.localhost',
        ai: 'ai.openvibe.network.localhost',
        games: 'openvibe.games.localhost',
    };

    const LOCAL_SURFACE_PORTS = {
        network: 4100,
        auth: 4100,
        tools: 4100,
        admin: 4100,
        my: 4100,
        themes: 4100,
        live: 4600,
        media: 4500,
        restream: 4700,
        chat: 4800,
        community: 4900,
        billing: 5000,
        ai: 5100,
        games: 5200,
    };

    const SERVICE_SURFACE_MAP = {
        'openvibe-network': 'network',
        'openvibe-tools': 'tools',
        'openvibe-admin': 'admin',
        'openvibe-my': 'my',
        'openvibe-themes': 'themes',
        'openvibe-live': 'live',
        'openvibe-media': 'media',
        'openre-stream': 'restream',
        'openvibe-chat': 'chat',
        'openvibe-community': 'community',
        'openvibe-billing': 'billing',
        'openvibe-ai': 'ai',
        'openvibe-games': 'games',
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

    const BUILTIN_THEMES = [
        {
            id: 'openvibe-dark',
            name: 'OpenVibe Dark',
            description: 'The default neon-night palette for the network.',
            accent: '#8b5cf6',
            accent2: '#22d3ee',
            bg: '#060917',
            bgSoft: 'rgba(11, 16, 33, 0.84)',
            text: '#eef4ff',
            textDim: '#a7b5d2',
            preview: 'linear-gradient(135deg, #080d1b 0%, #151d39 55%, #102b46 100%)',
        },
        {
            id: 'openvibe-dim',
            name: 'OpenVibe Dim',
            description: 'Cooler blues and seafoam with softer contrast.',
            accent: '#2dd4bf',
            accent2: '#60a5fa',
            bg: '#0b1323',
            bgSoft: 'rgba(17, 24, 39, 0.88)',
            text: '#edf6ff',
            textDim: '#b4c7dd',
            preview: 'linear-gradient(135deg, #0c1528 0%, #18304d 50%, #0e3b44 100%)',
        },
        {
            id: 'openvibe-light',
            name: 'OpenVibe Light',
            description: 'Bright, crisp, and still unmistakably OpenVibe.',
            accent: '#5b3df0',
            accent2: '#0ea5e9',
            bg: '#eef4ff',
            bgSoft: 'rgba(255, 255, 255, 0.92)',
            text: '#0f172a',
            textDim: '#475569',
            preview: 'linear-gradient(135deg, #ffffff 0%, #e8f0ff 55%, #dff7ff 100%)',
        },
        {
            id: 'sunset',
            name: 'Sunset Broadcast',
            description: 'Orange/pink glow built for creator dashboards.',
            accent: '#f97316',
            accent2: '#fb7185',
            bg: '#1a1118',
            bgSoft: 'rgba(38, 20, 28, 0.9)',
            text: '#fff1f2',
            textDim: '#fecdd3',
            preview: 'linear-gradient(135deg, #241018 0%, #52203c 55%, #9a3412 100%)',
        },
        {
            id: 'forest',
            name: 'Forest Signal',
            description: 'Deep green tones for a calmer operator feel.',
            accent: '#22c55e',
            accent2: '#2dd4bf',
            bg: '#0d1410',
            bgSoft: 'rgba(16, 28, 23, 0.9)',
            text: '#ecfdf5',
            textDim: '#a7f3d0',
            preview: 'linear-gradient(135deg, #07130d 0%, #0f3a22 50%, #0d5f46 100%)',
        },
        {
            id: 'cyberpunk',
            name: 'Cyberpunk Relay',
            description: 'Hot magenta + cyan for maximal arcade energy.',
            accent: '#ec4899',
            accent2: '#22d3ee',
            bg: '#0c0a18',
            bgSoft: 'rgba(21, 14, 38, 0.9)',
            text: '#faf5ff',
            textDim: '#d8b4fe',
            preview: 'linear-gradient(135deg, #12091f 0%, #2b0f58 50%, #0e7490 100%)',
        },
        {
            id: 'hobostreamer',
            name: 'HoboStreamer',
            description: 'Campfire amber on near-black. The original hobo aesthetic.',
            accent: '#c0965c',
            accent2: '#dbb077',
            bg: '#0d0d0f',
            bgSoft: 'rgba(22, 22, 26, 0.88)',
            text: '#e8e6e3',
            textDim: '#9a9a9a',
            preview: 'linear-gradient(135deg, #0d0d0f 0%, #1e1810 50%, #2e2010 100%)',
        },
        {
            id: 'custom',
            name: 'Custom Palette',
            description: 'Your own colors. Configure on the themes page.',
            accent: '#8b5cf6',
            accent2: '#22d3ee',
            bg: '#060917',
            bgSoft: 'rgba(11, 16, 33, 0.84)',
            text: '#eef4ff',
            textDim: '#a7b5d2',
            preview: 'linear-gradient(135deg, #ff0066 0%, #fb923c 22%, #facc15 40%, #4ade80 55%, #22d3ee 72%, #818cf8 100%)',
        },
    ];

    const FALLBACK_SERVICES = [
        { service_id: 'openvibe-network', display_name: 'OpenVibe Network', description: 'The platform hub, identity directory, and registry surface.', public_url: resolveSurfaceFallback('network'), category: 'platform', tags: ['hub', 'identity', 'network'], spotlight: true },
        { service_id: 'openvibe-tools', display_name: 'OpenVibe Tools', description: 'Search and launch every OpenVibe surface from one directory.', public_url: resolveSurfaceFallback('tools'), category: 'platform', tags: ['search', 'directory', 'launcher'], spotlight: true },
        { service_id: 'openvibe-live', display_name: 'OpenVibe Live', description: 'Native live streaming, clips, VODs, discovery, and creator routes.', public_url: resolveSurfaceFallback('live'), category: 'streaming', tags: ['live', 'vods', 'clips'], spotlight: true },
        { service_id: 'openre-stream', display_name: 'OpenRe.Stream', description: 'Low-latency ingest and restream control plane for creators.', public_url: resolveSurfaceFallback('restream'), category: 'streaming', tags: ['rtmp', 'whip', 'restream'], spotlight: true },
        { service_id: 'openvibe-chat', display_name: 'OpenVibe Chat', description: 'Rooms, DMs, calls, TTS, and cross-surface chat.', public_url: resolveSurfaceFallback('chat'), category: 'chat', tags: ['chat', 'dms', 'tts'], spotlight: true },
        { service_id: 'openvibe-community', display_name: 'Pastes', description: 'Public pastes and snippets.', public_url: resolveSurfaceFallback('community'), category: 'community', tags: ['pastes'], spotlight: true },
        { service_id: 'openvibe-media', display_name: 'OpenVibe Media', description: 'Shared uploads, derivatives, lifecycle, and storage diagnostics.', public_url: resolveSurfaceFallback('media'), category: 'platform', tags: ['uploads', 'storage', 'derivatives'] },
        { service_id: 'openvibe-billing', display_name: 'OpenVibe Billing', description: 'Tips, VIP plans, subscriptions, and creator ledger flows.', public_url: resolveSurfaceFallback('billing'), category: 'billing', tags: ['tips', 'vip', 'ledger'] },
        { service_id: 'openvibe-ai', display_name: 'OpenVibe AI', description: 'AI provider routing, captions, automation, and enrichment.', public_url: resolveSurfaceFallback('ai'), category: 'ai', tags: ['captions', 'automation', 'search'] },
        { service_id: 'openvibe-games', display_name: 'OpenVibe Games', description: 'MMORPG progression, canvas, cosmetics, and shared world state.', public_url: resolveSurfaceFallback('games'), category: 'games', tags: ['canvas', 'mmorpg', 'quests'], spotlight: true },
        { service_id: 'openvibe-admin', display_name: 'Admin', description: 'Operator surface for staff, migration readiness, and audit.', public_url: resolveSurfaceFallback('admin'), category: 'admin', tags: ['audit', 'ops', 'readiness'] },
        { service_id: 'openvibe-my', display_name: 'My Account', description: 'Profile, sessions, notifications, themes, and linked account hub.', public_url: resolveSurfaceFallback('my'), category: 'account', tags: ['profile', 'security', 'account'] },
        { service_id: 'openvibe-themes', display_name: 'Themes', description: 'Network-wide theme catalog and previews.', public_url: resolveSurfaceFallback('themes'), category: 'account', tags: ['themes', 'design', 'prefs'] },
    ];

    let sessionPromise = null;
    let launcherStatePromise = null;
    let urlRegistryPromise = null;
    let urlRegistryCache = null;
    let accountProfilePromise = null;

    function readAnonTokens() {
        try {
            return safeParse(localStorage.getItem(LOCAL_ANON_TOKENS_KEY), {}) || {};
        } catch {
            return {};
        }
    }

    function writeAnonTokens(tokens) {
        try {
            localStorage.setItem(LOCAL_ANON_TOKENS_KEY, JSON.stringify(tokens || {}));
        } catch {
            // ignore storage write failures
        }
    }

    function activeAnonId() {
        try {
            return localStorage.getItem(LOCAL_ACTIVE_ANON_KEY) || '';
        } catch {
            return '';
        }
    }

    function setActiveAnonId(value) {
        try {
            if (value) localStorage.setItem(LOCAL_ACTIVE_ANON_KEY, value);
            else localStorage.removeItem(LOCAL_ACTIVE_ANON_KEY);
        } catch {
            // ignore storage write failures
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

    function dispatchAuthChanged(session) {
        if (!global.document || typeof global.CustomEvent !== 'function') return;
        global.document.dispatchEvent(new global.CustomEvent('openvibe-auth-changed', {
            detail: session || null,
        }));
    }

    function resolveSurfaceFallback(surface) {
        const local = inferLocalOrigin(surface);
        return local || SURFACE_FALLBACKS[surface] || '#';
    }

    function mergeFetchOptions(opts) {
        const headers = Object.assign({ Accept: 'application/json' }, opts && opts.headers ? opts.headers : {});
        return Object.assign({ credentials: 'include', headers }, opts || {});
    }

    async function api(pathname, opts) {
        const response = await fetch(`${API_BASE}${pathname}`, mergeFetchOptions(opts));
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = text;
        }
        if (!response.ok) {
            const error = new Error(`api ${pathname} failed: ${response.status}`);
            error.status = response.status;
            error.body = body;
            throw error;
        }
        return body;
    }

    function safeParse(value, fallback) {
        if (typeof value !== 'string') return value == null ? fallback : value;
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
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

    function slugifyLabel(value) {
        return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function getInitials(value) {
        const words = String(value || 'OV').trim().split(/\s+/).filter(Boolean).slice(0, 2);
        return (words.length ? words : ['OV']).map((word) => word.charAt(0).toUpperCase()).join('');
    }

    function inferLocalOrigin(surface) {
        const hostname = global.location && global.location.hostname ? global.location.hostname : '';
        if (!/localhost$/i.test(hostname)) return null;
        const protocol = global.location.protocol || 'http:';
        const localHost = LOCAL_SURFACE_HOSTS[surface];
        const localPort = LOCAL_SURFACE_PORTS[surface];
        if (!localHost || !localPort) return null;
        return `${protocol}//${localHost}:${localPort}`;
    }

    function registryValue(key) {
        return urlRegistryCache && urlRegistryCache.registry && urlRegistryCache.registry[key]
            ? urlRegistryCache.registry[key].value
            : null;
    }

    async function loadUrlRegistry(force) {
        if (!force && urlRegistryPromise) return urlRegistryPromise;
        urlRegistryPromise = api('/url-registry/resolved').then((data) => {
            urlRegistryCache = data && data.registry ? data : { registry: {} };
            return urlRegistryCache;
        }).catch(() => {
            urlRegistryCache = { registry: {} };
            return urlRegistryCache;
        });
        return urlRegistryPromise;
    }

    function resolveSurfaceUrl(surface) {
        if (!surface) return '#';
        const local = inferLocalOrigin(surface);
        if (local) return local;
        const fromRegistry = registryValue(SURFACE_URL_KEYS[surface]);
        return fromRegistry || inferLocalOrigin(surface) || SURFACE_FALLBACKS[surface] || '#';
    }

    function resolveServiceUrl(item) {
        const surface = SERVICE_SURFACE_MAP[item && item.service_id];
        return surface ? resolveSurfaceUrl(surface) : (item && item.public_url) || '#';
    }

    async function loadSession(force) {
        if (!force && sessionPromise) return sessionPromise;
        sessionPromise = api('/session').then((result) => {
            if (result && result.anonymous && result.user) {
                rememberAnonymousIdentity(result.user);
            }
            return result;
        }).catch(() => ({ authenticated: false, anonymous: false, user: null }));
        return sessionPromise;
    }

    async function startAnonymousSession(options) {
        const payload = Object.assign({}, options || {});
        const result = await api('/session/anonymous', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        sessionPromise = Promise.resolve(result);
        if (result && result.anonymous && result.user) {
            rememberAnonymousIdentity(result.user);
        }
        accountProfilePromise = null;
        dispatchAuthChanged(result);
        return result;
    }

    async function loadAnonymousIdentities(options) {
        const payload = Object.assign({}, options || {});
        const params = new URLSearchParams();
        if (payload.fingerprint) params.set('fingerprint', payload.fingerprint);
        const suffix = params.toString() ? `?${params.toString()}` : '';
        const result = await api(`/session/anonymous/identities${suffix}`).catch(() => ({ items: [] }));
        (result.items || []).forEach((item) => {
            if (item && item.session_token) rememberAnonymousIdentity(item);
        });
        return result;
    }

    async function switchAnonymousIdentity(identity, options) {
        const payload = Object.assign({}, options || {});
        if (typeof identity === 'string') {
            const stored = readAnonTokens()[identity];
            if (stored && stored.session_token) {
                payload.session_token = stored.session_token;
            } else {
                payload.anon_user_id = identity;
            }
        } else if (identity && typeof identity === 'object') {
            if (identity.session_token) payload.session_token = identity.session_token;
            else if (identity.id) payload.anon_user_id = identity.id;
            if (identity.anon_number && !payload.anon_number) payload.anon_number = identity.anon_number;
        }
        return startAnonymousSession(payload);
    }

    async function createAnonymousIdentity(options) {
        const payload = Object.assign({ force_new: true }, options || {});
        return startAnonymousSession(payload);
    }

    async function loadServices() {
        try {
            const data = await api('/services');
            return Array.isArray(data && data.items) ? data.items : [];
        } catch (error) {
            console.warn('[openvibe] failed to load services:', error.message);
            return [];
        }
    }

    function mergedServices(remote) {
        const map = new Map();
        for (const item of FALLBACK_SERVICES) {
            map.set(item.service_id, Object.assign({}, item, { source: 'fallback' }));
        }
        for (const item of remote || []) {
            const metadata = safeParse(item.metadata_json, null) || item.metadata || {};
            const merged = Object.assign({}, map.get(item.service_id) || {}, item, {
                metadata,
                category: metadata.category || item.category || 'service',
                tags: Array.isArray(metadata.tags) ? metadata.tags : (Array.isArray(item.tags) ? item.tags : []),
                spotlight: Boolean(metadata.spotlight || item.spotlight),
                public_url: resolveServiceUrl(item) || item.public_url,
                source: 'registry',
            });
            map.set(item.service_id, merged);
        }
        return [...map.values()]
            .map((item) => Object.assign({}, item, { public_url: resolveServiceUrl(item) || item.public_url || '#' }))
            .sort((left, right) => (left.display_name || left.service_id).localeCompare(right.display_name || right.service_id));
    }

    function readLocalLauncherState() {
        try {
            const parsed = safeParse(localStorage.getItem(LOCAL_LAUNCHER_KEY), null);
            return Object.assign({ favorites: [], recents: [] }, parsed || {});
        } catch {
            return { favorites: [], recents: [] };
        }
    }

    function writeLocalLauncherState(state) {
        try {
            localStorage.setItem(LOCAL_LAUNCHER_KEY, JSON.stringify(state));
        } catch {
            // ignore local storage write failures
        }
    }

    async function loadRemoteLauncherState() {
        try {
            const session = await loadSession();
            if (!session || !session.authenticated) return null;
            const profile = await loadAccountProfile();
            return profile && profile.launcher && profile.launcher.data ? profile.launcher.data : null;
        } catch {
            return null;
        }
    }

    async function loadLauncherState(force) {
        if (!force && launcherStatePromise) return launcherStatePromise;
        launcherStatePromise = (async function () {
            const local = readLocalLauncherState();
            const remote = await loadRemoteLauncherState();
            const merged = {
                favorites: Array.from(new Set([...(remote && remote.favorites || []), ...(local.favorites || [])])).slice(0, 20),
                recents: Array.from(new Set([...(local.recents || []), ...(remote && remote.recents || [])])).slice(0, 20),
            };
            writeLocalLauncherState(merged);
            return merged;
        }());
        return launcherStatePromise;
    }

    async function saveLauncherState(state) {
        const normalized = {
            favorites: Array.from(new Set(state && state.favorites || [])).slice(0, 20),
            recents: Array.from(new Set(state && state.recents || [])).slice(0, 20),
        };
        writeLocalLauncherState(normalized);
        launcherStatePromise = Promise.resolve(normalized);
        try {
            const session = await loadSession();
            if (session && session.authenticated) {
                await api('/user-modules/me/control.launcher', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: normalized }),
                });
            }
        } catch (error) {
            console.warn('[openvibe] launcher state sync failed:', error.message);
        }
        return normalized;
    }

    async function toggleFavorite(serviceId) {
        const current = await loadLauncherState();
        const nextFavorites = current.favorites.includes(serviceId)
            ? current.favorites.filter((id) => id !== serviceId)
            : [serviceId, ...current.favorites].slice(0, 20);
        return saveLauncherState(Object.assign({}, current, { favorites: nextFavorites }));
    }

    async function recordLaunch(serviceId) {
        const current = await loadLauncherState();
        const nextRecents = [serviceId, ...current.recents.filter((id) => id !== serviceId)].slice(0, 20);
        return saveLauncherState(Object.assign({}, current, { recents: nextRecents }));
    }

    function signInUrl(returnTo) {
        return `/oauth/authorize?return_to=${encodeURIComponent(returnTo || global.location.href)}`;
    }

    function signOutUrl(returnTo) {
        return `/oauth/logout?return_to=${encodeURIComponent(returnTo || global.location.href)}`;
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
        root.style.setProperty('--ov-bg-soft', theme.bgSoft);
        root.style.setProperty('--ov-nav-bg', theme.bg);
        root.style.setProperty('--ov-text', theme.text);
        root.style.setProperty('--ov-text-dim', theme.textDim);
        if (themeId === 'custom') {
            try {
                const cc = JSON.parse(localStorage.getItem('openvibe.theme.custom') || '{}');
                const hp = (h) => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null; };
                if (cc.bg) { const p = hp(cc.bg); root.style.setProperty('--ov-bg', cc.bg); root.style.setProperty('--ov-nav-bg', cc.bg); if (p) root.style.setProperty('--ov-bg-soft', `rgba(${p[0]},${p[1]},${p[2]},0.85)`); }
                if (cc.accent) { root.style.setProperty('--ov-accent', cc.accent); const p = hp(cc.accent); if (p) root.style.setProperty('--ov-border', `rgba(${p[0]},${p[1]},${p[2]},0.18)`); }
                if (cc.accent2) root.style.setProperty('--ov-accent-2', cc.accent2);
                if (cc.text) root.style.setProperty('--ov-text', cc.text);
                if (cc.textDim) root.style.setProperty('--ov-text-dim', cc.textDim);
            } catch { /* ignore */ }
        }
        if (!options || options.persistLocal !== false) {
            try { localStorage.setItem(LOCAL_THEME_KEY, theme.id); } catch { /* ignore */ }
        }
        return theme;
    }

    function applySavedTheme() {
        try {
            const saved = localStorage.getItem(LOCAL_THEME_KEY);
            if (saved) return applyTheme(saved, { persistLocal: false });
        } catch {
            // ignore
        }
        return applyTheme(BUILTIN_THEMES[0].id, { persistLocal: false });
    }

    async function getUserModule(namespace) {
        return api(`/user-modules/me/${encodeURIComponent(namespace)}`);
    }

    async function putUserModule(namespace, data) {
        return api(`/user-modules/me/${encodeURIComponent(namespace)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: data || {} }),
        });
    }

    async function loadAccountProfile(force) {
        if (!force && accountProfilePromise) return accountProfilePromise;
        accountProfilePromise = api('/account/profile');
        return accountProfilePromise;
    }

    async function saveAccountProfile(payload) {
        const result = await api('/account/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {}),
        });
        accountProfilePromise = Promise.resolve(result);
        if (result && result.user) {
            sessionPromise = Promise.resolve({ authenticated: true, anonymous: false, user: result.user });
        }
        return result;
    }

    async function loadAccountSessions() {
        return api('/account/sessions').catch(() => ({ items: [] }));
    }

    async function loadAccountLinked() {
        return api('/account/linked').catch(() => ({ items: [] }));
    }

    async function syncThemePreference(themeId) {
        applyTheme(themeId);
        try {
            const payload = {
                theme_id: themeId,
                updated_at: new Date().toISOString(),
                source: 'openvibe-network-ui',
            };
            await putUserModule('openvibe.theme', payload);
        } catch { /* ignore — theme is already applied locally */ }
    }

    async function primeEnvironment(force) {
        applySavedTheme();
        await Promise.all([
            loadUrlRegistry(force),
            loadSession(force),
            loadLauncherState(force),
        ]);
    }

    function getServiceTags(item) {
        const tags = Array.isArray(item && item.tags) ? item.tags : [];
        return tags.slice(0, 4);
    }

    function formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString();
    }

    function formatRelativeTime(value) {
        if (!value) return 'just now';
        const date = new Date(value);
        if (Number.isNaN(date.getTime()) || !relativeTime) return formatDateTime(value);
        const diffMs = date.getTime() - Date.now();
        const diffMinutes = Math.round(diffMs / 60000);
        const absMinutes = Math.abs(diffMinutes);
        if (absMinutes < 60) return relativeTime.format(diffMinutes, 'minute');
        const diffHours = Math.round(diffMinutes / 60);
        if (Math.abs(diffHours) < 48) return relativeTime.format(diffHours, 'hour');
        const diffDays = Math.round(diffHours / 24);
        return relativeTime.format(diffDays, 'day');
    }

    function getServiceHref(item) {
        return resolveServiceUrl(item);
    }

    function icon(name, options) {
        const icons = global.OpenVibeIcons;
        return icons && typeof icons.icon === 'function'
            ? icons.icon(name, Object.assign({ decorative: true }, options || {}))
            : '';
    }

    function serviceIconName(item) {
        return SERVICE_SURFACE_MAP[item && item.service_id]
            || CATEGORY_ICONS[item && item.category]
            || 'runtime';
    }

    function iconLabel(name, label, className) {
        return `<span class="${escapeHtml(className || 'ov-icon-label')}">${icon(name)}<span>${escapeHtml(label)}</span></span>`;
    }

    function buildServiceCardMarkup(item, state) {
        const tags = getServiceTags(item);
        const href = getServiceHref(item);
        const favorited = !!(state && state.favorites && state.favorites.includes(item.service_id));
        const sourceLabel = item.source === 'registry' ? 'live registry' : 'catalog';
        return `<article class="ov-service-card" data-service-id="${escapeHtml(item.service_id)}">
            <div class="ov-service-top">
                <div style="display:flex; gap:.85rem; align-items:flex-start;">
                    <div class="ov-service-icon">${icon(serviceIconName(item)) || escapeHtml(getInitials(item.display_name || item.service_id))}</div>
                    <div>
                        <h3 class="ov-service-title">${iconLabel(serviceIconName(item), item.display_name || item.service_id)}</h3>
                        <div class="ov-chip-row" style="margin-top:.45rem;">
                            <span class="ov-chip ${item.source === 'registry' ? 'ok' : 'soft'}">${escapeHtml(sourceLabel)}</span>
                            <span class="ov-chip primary">${escapeHtml(item.category || 'service')}</span>
                            ${item.spotlight ? '<span class="ov-chip warn">featured</span>' : ''}
                        </div>
                    </div>
                </div>
                <button class="ov-btn ov-favorite-btn" type="button" data-favorite-toggle="${escapeHtml(item.service_id)}" data-favorited="${favorited ? 'true' : 'false'}" aria-label="${favorited ? 'Remove favorite' : 'Add favorite'}">★</button>
            </div>
            <p class="ov-service-desc">${escapeHtml(item.description || 'OpenVibe surface')}</p>
            <div class="ov-service-meta">
                ${tags.map((tag) => `<span class="ov-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
            <div class="ov-card-actions">
                <a class="ov-btn ov-btn-primary" href="${escapeHtml(href)}" data-launch-service="${escapeHtml(item.service_id)}">Open</a>
                <a class="ov-btn ov-btn-ghost" href="${escapeHtml(href)}">Details</a>
            </div>
        </article>`;
    }

    async function renderServiceCards(target, items, options) {
        if (!target) return;
        const state = await loadLauncherState();
        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
            target.innerHTML = '<div class="ov-empty">Nothing matches this view yet.</div>';
            return;
        }
        target.innerHTML = list.map((item) => buildServiceCardMarkup(item, state)).join('');
        target.querySelectorAll('[data-launch-service]').forEach((link) => {
            link.addEventListener('click', function () {
                recordLaunch(link.dataset.launchService).catch(() => {});
                if (options && typeof options.onLaunch === 'function') options.onLaunch(link.dataset.launchService);
            });
        });
        target.querySelectorAll('[data-favorite-toggle]').forEach((button) => {
            button.addEventListener('click', async function (event) {
                event.preventDefault();
                event.stopPropagation();
                const serviceId = button.dataset.favoriteToggle;
                const nextState = await toggleFavorite(serviceId);
                const favorited = nextState.favorites.includes(serviceId);
                global.document.querySelectorAll('[data-favorite-toggle]').forEach((candidate) => {
                    if (candidate.dataset.favoriteToggle !== serviceId) return;
                    candidate.dataset.favorited = favorited ? 'true' : 'false';
                    candidate.setAttribute('aria-label', favorited ? 'Remove favorite' : 'Add favorite');
                });
                if (options && typeof options.onFavoriteChange === 'function') await options.onFavoriteChange(nextState);
            });
        });
    }

    function navbar(activeKey) {
        const links = [
            { key: 'home', href: resolveSurfaceUrl('network'), label: 'Home', icon: 'network' },
            { key: 'tools', href: resolveSurfaceUrl('tools'), label: 'Tools', icon: 'tools' },
            { key: 'community', href: resolveSurfaceUrl('community'), label: 'Community', icon: 'community' },
            { key: 'admin', href: resolveSurfaceUrl('admin'), label: 'Admin', icon: 'admin' },
            { key: 'docs', href: '/api/v1/services', label: 'Registry API', icon: 'docs' },
        ];
        const paintSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`;
        const bellSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>`;
        return `<header class="ov-nav"><div class="ov-nav-inner">
            <a href="${escapeHtml(resolveSurfaceUrl('network'))}" class="ov-brand">
                <span class="ov-brand-mark">${icon('network') || 'OV'}</span>
                <span class="ov-brand-copy"><b>OpenVibe</b><span>One account. Every surface.</span></span>
            </a>
            <nav class="ov-nav-links">
                ${links.map((link) => `<a href="${escapeHtml(link.href)}" ${link.key === activeKey ? 'data-active="true"' : ''}>${iconLabel(link.icon, link.label)}</a>`).join('')}
            </nav>
            <div class="ov-nav-end">
                <div class="ov-theme-btn-wrap" id="ov-theme-btn-wrap">
                    <button class="ov-theme-btn" id="ov-theme-btn" type="button" aria-label="Change theme" aria-expanded="false">${icon('themes') || paintSvg}</button>
                    <div class="ov-theme-popup" id="ov-theme-popup" hidden>
                        <div class="ov-theme-swatches" id="ov-theme-swatches"></div>
                        <a class="ov-theme-explore" href="${escapeHtml(resolveSurfaceUrl('themes'))}">Explore more themes!</a>
                    </div>
                </div>
                <div class="ov-bell-wrap" id="ov-bell-wrap" style="position:relative;display:none;">
                    <button class="ov-theme-btn" id="ov-bell-btn" type="button" aria-label="Notifications" aria-expanded="false">${bellSvg}<span class="ov-bell-badge" id="ov-bell-badge" style="display:none;position:absolute;top:-4px;right:-4px;background:var(--ov-danger,#fb7185);color:#fff;border-radius:999px;font-size:0.65rem;font-weight:800;padding:1px 5px;line-height:1.4;"></span></button>
                    <div class="ov-bell-panel" id="ov-bell-panel" hidden style="position:absolute;top:calc(100% + 8px);right:0;width:320px;background:color-mix(in srgb,var(--ov-bg) 92%,white);border:1px solid var(--ov-border);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:999;overflow:hidden;">
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1rem;border-bottom:1px solid var(--ov-border);">
                            <span style="font-weight:700;font-size:0.9rem;">Notifications</span>
                            <button id="ov-bell-read-all" type="button" style="font-size:0.75rem;color:var(--ov-accent);background:none;border:none;cursor:pointer;padding:0;">Mark all read</button>
                        </div>
                        <div id="ov-bell-list" style="max-height:360px;overflow-y:auto;"></div>
                        <div style="padding:0.6rem 1rem;border-top:1px solid var(--ov-border);text-align:center;">
                            <a href="${escapeHtml(resolveSurfaceUrl('my'))}#notifications" style="font-size:0.8rem;color:var(--ov-accent);">View all notifications</a>
                        </div>
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
            <a href="/api/v1/services">Registry</a> ·
            <a href="${escapeHtml(resolveSurfaceUrl('auth'))}/.well-known/openid-configuration">OIDC</a> ·
            <a href="/health">Health</a>
        </footer>`;
    }

    async function hydrateNavSession() {
        const target = global.document.getElementById('ov-nav-session');
        if (!target) return;
        const session = await loadSession();
        if (session && session.anonymous && session.user) {
            const displayName = escapeHtml(session.user.display_name || session.user.username || 'Anonymous');
            target.innerHTML = `
                <div class="ov-anon-menu" id="ov-anon-menu">
                    <button class="ov-anon-trigger" id="ov-anon-trigger" type="button" aria-label="Account menu" aria-expanded="false">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                        </svg>
                        <span class="ov-anon-trigger-name">${displayName}</span>
                    </button>
                    <div class="ov-anon-dropdown" id="ov-anon-dropdown" hidden>
                        <div class="ov-anon-dropdown-name">${displayName}</div>
                        <a class="ov-anon-dropdown-item" href="${escapeHtml(resolveSurfaceUrl('my'))}">Switch identity</a>
                        <a class="ov-anon-dropdown-item" href="${signInUrl(global.location.href)}">Create account</a>
                        <a class="ov-anon-dropdown-item ov-anon-dropdown-item--danger" href="${signOutUrl(global.location.href)}">Leave anonymous</a>
                    </div>
                </div>`;
            const trigger  = target.querySelector('#ov-anon-trigger');
            const dropdown = target.querySelector('#ov-anon-dropdown');
            trigger.addEventListener('click', function (e) {
                e.stopPropagation();
                const open = !dropdown.hidden;
                dropdown.hidden = open;
                trigger.setAttribute('aria-expanded', String(!open));
            });
            global.document.addEventListener('click', function () {
                dropdown.hidden = true;
                trigger.setAttribute('aria-expanded', 'false');
            });
            return;
        }
        if (!session || !session.authenticated || !session.user) {
            target.innerHTML = `
                <button class="ov-btn" type="button" data-openvibe-anon-session="true">Anonymous</button>
                <a class="ov-btn ov-btn-primary" href="${signInUrl(global.location.href)}">Sign in</a>`;
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
            return;
        }
        const displayNameAuth = escapeHtml(session.user.display_name || session.user.username || session.user.id || 'you');
        target.innerHTML = `
            <div class="ov-anon-menu" id="ov-anon-menu">
                <button class="ov-anon-trigger" id="ov-anon-trigger" type="button" aria-label="Account menu" aria-expanded="false">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                    </svg>
                </button>
                <div class="ov-anon-dropdown" id="ov-anon-dropdown" hidden>
                    <div class="ov-anon-dropdown-name">@${displayNameAuth}</div>
                    <a class="ov-anon-dropdown-item" href="${escapeHtml(resolveSurfaceUrl('my'))}">Account</a>
                    <a class="ov-anon-dropdown-item ov-anon-dropdown-item--danger" href="${signOutUrl(global.location.href)}">Sign out</a>
                </div>
            </div>`;
        const triggerAuth  = target.querySelector('#ov-anon-trigger');
        const dropdownAuth = target.querySelector('#ov-anon-dropdown');
        triggerAuth.addEventListener('click', function (e) {
            e.stopPropagation();
            const open = !dropdownAuth.hidden;
            dropdownAuth.hidden = open;
            triggerAuth.setAttribute('aria-expanded', String(!open));
        });
        global.document.addEventListener('click', function () {
            dropdownAuth.hidden = true;
            triggerAuth.setAttribute('aria-expanded', 'false');
        });
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

    async function initNotificationBell() {
        const session = await loadSession();
        if (!session || !session.authenticated || session.anonymous) return;
        const wrap = global.document.getElementById('ov-bell-wrap');
        const btn = global.document.getElementById('ov-bell-btn');
        const badge = global.document.getElementById('ov-bell-badge');
        const panel = global.document.getElementById('ov-bell-panel');
        const list = global.document.getElementById('ov-bell-list');
        const readAllBtn = global.document.getElementById('ov-bell-read-all');
        if (!wrap || !btn || !badge || !panel || !list) return;
        wrap.style.display = '';

        async function fetchUnreadCount() {
            try {
                const data = await api('/notifications/unread-count');
                const count = data && data.count || 0;
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : String(count);
                    badge.style.display = '';
                } else {
                    badge.style.display = 'none';
                }
            } catch { /* ignore */ }
        }

        async function loadNotifications() {
            try {
                const data = await api('/notifications?limit=10');
                const items = data && data.items || [];
                if (!items.length) {
                    list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--ov-text-dim);font-size:0.85rem;">No notifications yet.</div>';
                    return;
                }
                list.innerHTML = items.map((n) => `<div style="padding:0.75rem 1rem;border-bottom:1px solid var(--ov-border);cursor:pointer;opacity:${n.is_read ? 0.65 : 1};" data-notif-id="${escapeHtml(n.id)}" data-notif-url="${escapeHtml(n.url || '')}">
                    <div style="font-size:0.82rem;font-weight:${n.is_read ? 400 : 700};color:var(--ov-text);">${escapeHtml(n.title)}</div>
                    ${n.message ? `<div style="font-size:0.78rem;color:var(--ov-text-dim);margin-top:0.25rem;">${escapeHtml(n.message)}</div>` : ''}
                    <div style="font-size:0.72rem;color:var(--ov-text-dim);margin-top:0.2rem;">${formatRelativeTime(n.created_at)}</div>
                </div>`).join('');
                list.querySelectorAll('[data-notif-id]').forEach((row) => {
                    row.addEventListener('click', async function () {
                        const nid = row.dataset.notifId;
                        const url = row.dataset.notifUrl;
                        api(`/notifications/${encodeURIComponent(nid)}/read`, { method: 'POST' }).catch(() => {});
                        panel.hidden = true;
                        btn.setAttribute('aria-expanded', 'false');
                        if (url) global.location.href = url;
                        else await loadNotifications();
                        await fetchUnreadCount();
                    });
                });
            } catch { /* ignore */ }
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const open = !panel.hidden;
            panel.hidden = open;
            btn.setAttribute('aria-expanded', String(!open));
            if (!open) loadNotifications().catch(() => {});
        });
        global.document.addEventListener('click', function () {
            panel.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
        });
        if (readAllBtn) {
            readAllBtn.addEventListener('click', async function (e) {
                e.stopPropagation();
                await api('/notifications/read-all', { method: 'POST' }).catch(() => {});
                badge.style.display = 'none';
                await loadNotifications();
            });
        }

        await fetchUnreadCount();
        setInterval(fetchUnreadCount, 30000);
    }

    async function renderChrome(activeKey) {
        await loadUrlRegistry();
        const navMount = global.document.getElementById('nav-mount');
        const footerMount = global.document.getElementById('footer-mount');
        if (navMount) navMount.innerHTML = navbar(activeKey);
        if (footerMount) footerMount.innerHTML = footer();
        hydrateNavSession().catch(() => {});
        initThemePicker();
        initNotificationBell().catch(() => {});
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

        async function render(query) {
            const items = (getItems() || []).filter((item) => {
                const haystack = `${item.display_name || ''} ${item.description || ''} ${item.service_id || ''} ${item.category || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
                return !query || haystack.includes(String(query).toLowerCase());
            }).slice(0, 12);
            await renderServiceCards(results, items);
        }

        function open() {
            root.classList.add('open');
            input.focus();
            render('');
        }

        input.addEventListener('input', function () { render(input.value); });
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

    global.OpenVibe = {
        API_BASE,
        BUILTIN_THEMES,
        FALLBACK_SERVICES,
        api,
        applySavedTheme,
        applyTheme,
        attachLauncher,
        createAnonymousIdentity,
        escapeHtml,
        footer,
        formatDateTime,
        formatRelativeTime,
        getServiceHref,
        icon,
        iconLabel,
        getUserModule,
        initNotificationBell,
        loadAccountLinked,
        loadAccountProfile,
        loadAccountSessions,
        loadAnonymousIdentities,
        loadLauncherState,
        loadServices,
        loadSession,
        loadUrlRegistry,
        mergedServices,
        navbar,
        primeEnvironment,
        putUserModule,
        recordLaunch,
        renderChrome,
        renderServiceCards,
        resolveServiceUrl,
        resolveSurfaceUrl,
        saveAccountProfile,
        saveLauncherState,
        serviceIconName,
        signInUrl,
        signOutUrl,
        slugifyLabel,
        startAnonymousSession,
        switchAnonymousIdentity,
        syncThemePreference,
        themeById,
        toggleFavorite,
    };
}(window));
