// OpenVibe shared frontend helpers — lightweight cross-service chrome for
// service apps outside the full network control plane.

(function (global) {
    'use strict';

    const API_BASE = (global.OV_API_BASE || '/api/v1').replace(/\/$/, '');
    const LOCAL_THEME_KEY = 'openvibe.theme';

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

    async function primeTheme() {
        return applySavedTheme();
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

    async function requestJson(url, opts, label) {
        const res = await fetch(url, Object.assign({
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
        }, opts || {}));
        const text = await res.text();
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = text; }
        if (!res.ok) {
            const err = new Error(`${label || url} failed: ${res.status}`);
            err.status = res.status;
            err.body = body;
            throw err;
        }
        return body;
    }

    async function api(pathname, opts) {
        return requestJson(`${API_BASE}${pathname}`, opts, `api ${pathname}`);
    }

    async function loadServices() {
        try {
            const data = await requestJson(resolveRegistryUrl(), null, 'registry api');
            return Array.isArray(data && data.items) ? data.items : [];
        } catch (e) {
            console.warn('[openvibe] failed to load services:', e.message);
            return [];
        }
    }

    const FALLBACK_SERVICES = [
        { service_id: 'openvibe-network', display_name: 'OpenVibe Network', description: 'The platform hub and identity surface.', public_url: resolveSurfaceUrl('network'), category: 'platform' },
        { service_id: 'openvibe-tools', display_name: 'OpenVibe Tools', description: 'Searchable directory of every OpenVibe service.', public_url: resolveSurfaceUrl('tools'), category: 'platform' },
        { service_id: 'openvibe-live', display_name: 'OpenVibe Live', description: 'Native live streaming.', public_url: resolveSurfaceUrl('live'), category: 'streaming' },
        { service_id: 'openre-stream', display_name: 'OpenRe.Stream', description: 'Restream / multi-destination broadcast.', public_url: resolveSurfaceUrl('restream'), category: 'streaming' },
        { service_id: 'openvibe-chat', display_name: 'OpenVibe Chat', description: 'Chat, DMs, voice rooms, TTS.', public_url: resolveSurfaceUrl('chat'), category: 'chat' },
        { service_id: 'openvibe-community', display_name: 'OpenVibe Community', description: 'Pastes, threads, forums.', public_url: resolveSurfaceUrl('community'), category: 'community' },
        { service_id: 'openvibe-media', display_name: 'OpenVibe Media', description: 'Shared media object storage.', public_url: resolveSurfaceUrl('media'), category: 'platform' },
        { service_id: 'openvibe-billing', display_name: 'OpenVibe Billing', description: 'Subscriptions, tips, ledger.', public_url: resolveSurfaceUrl('billing'), category: 'billing' },
        { service_id: 'openvibe-ai', display_name: 'OpenVibe AI', description: 'Provider routing, captions, search backbone.', public_url: resolveSurfaceUrl('ai'), category: 'ai' },
        { service_id: 'openvibe-games', display_name: 'OpenVibe Games', description: 'Shared MMORPG progression, canvas, cosmetics, and world state.', public_url: resolveSurfaceUrl('games'), category: 'games' },
        { service_id: 'openvibe-admin', display_name: 'Admin', description: 'Operator surface for staff.', public_url: resolveSurfaceUrl('admin'), category: 'admin' },
        { service_id: 'openvibe-my', display_name: 'My Account', description: 'Account hub, themes, linked accounts.', public_url: resolveSurfaceUrl('my'), category: 'account' },
        { service_id: 'openvibe-themes', display_name: 'Themes', description: 'Network-wide theme catalog.', public_url: resolveSurfaceUrl('themes'), category: 'account' },
    ];

    function safeParse(value, fallback) {
        if (typeof value !== 'string') return value || fallback;
        try { return JSON.parse(value); } catch { return fallback; }
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

    function iconLabel(name, label, className) {
        return `<span class="${escapeHtml(className || 'ov-icon-label')}">${icon(name)}<span>${escapeHtml(label)}</span></span>`;
    }

    function mergedServices(remote) {
        const map = new Map();
        for (const item of FALLBACK_SERVICES) map.set(item.service_id, Object.assign({}, item, { source: 'fallback' }));
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
            .sort((a, b) => (a.display_name || a.service_id).localeCompare(b.display_name || b.service_id));
    }

    function renderServiceCards(target, items) {
        if (!target) return;
        target.innerHTML = '';
        for (const item of items) {
            const a = global.document.createElement('a');
            a.className = 'ov-card';
            a.href = resolveServiceUrl(item);
            a.innerHTML = `
                <div class="title">${iconLabel(serviceIconName(item), item.display_name || item.service_id)}</div>
                <div class="desc">${escapeHtml(item.description || '')}</div>
                <div class="meta">
                    <span class="ov-tag">${escapeHtml(item.category || 'service')}</span>
                    ${item.source === 'registry' ? '<span class="ov-tag ok">live</span>' : '<span class="ov-tag">catalog</span>'}
                </div>`;
            target.appendChild(a);
        }
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function navbar(activeKey) {
        const links = [
            { key: 'home', href: resolveSurfaceUrl('network'), label: 'Home', icon: 'network' },
            { key: 'tools', href: resolveSurfaceUrl('tools'), label: 'Tools', icon: 'tools' },
            { key: 'themes', href: resolveSurfaceUrl('themes'), label: 'Themes', icon: 'themes' },
            { key: 'my', href: resolveSurfaceUrl('my'), label: 'My Account', icon: 'my' },
            { key: 'admin', href: resolveSurfaceUrl('admin'), label: 'Admin', icon: 'admin' },
            { key: 'docs', href: resolveRegistryUrl(), label: 'Registry API', icon: 'docs' },
        ];
        return `
            <header class="ov-nav"><div class="ov-nav-inner">
                <a href="${escapeHtml(resolveSurfaceUrl('network'))}" class="ov-brand">${icon('network')} <b>OpenVibe</b></a>
                <nav class="ov-nav-links">
                    ${links.map((link) => `<a href="${escapeHtml(link.href)}"${link.key === activeKey ? ' style="color:var(--ov-text)"' : ''}>${iconLabel(link.icon, link.label)}</a>`).join('')}
                </nav>
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
        function close() { root.classList.remove('open'); input.value = ''; }
        function open() { root.classList.add('open'); input.focus(); render(''); }
        function render(query) {
            const items = (getItems() || []).filter((item) => {
                const haystack = `${item.display_name || ''} ${item.description || ''} ${item.service_id || ''} ${item.category || ''}`.toLowerCase();
                return !query || haystack.includes(String(query).toLowerCase());
            }).slice(0, 12);
            renderServiceCards(results, items);
        }
        input.addEventListener('input', () => render(input.value));
        root.addEventListener('click', (event) => { if (event.target === root) close(); });
        global.document.addEventListener('keydown', (event) => {
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
        escapeHtml,
        footer,
        icon,
        iconLabel,
        loadServices,
        mergedServices,
        navbar,
        primeTheme,
        renderServiceCards,
        resolveRegistryUrl,
        resolveServiceUrl,
        resolveSurfaceUrl,
        serviceIconName,
    };
}(window));