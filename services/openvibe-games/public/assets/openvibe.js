// OpenVibe shared frontend helpers — used by all openvibe-network surfaces.
// No build step. ES modules optional; we expose globals for inline scripts.

(function (global) {
    'use strict';

    const API_BASE = (global.OV_API_BASE || '/api/v1').replace(/\/$/, '');

    async function api(pathname, opts) {
        const res = await fetch(`${API_BASE}${pathname}`, Object.assign({
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
        }, opts || {}));
        const text = await res.text();
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = text; }
        if (!res.ok) {
            const err = new Error(`api ${pathname} failed: ${res.status}`);
            err.status = res.status;
            err.body = body;
            throw err;
        }
        return body;
    }

    async function loadServices() {
        try {
            const data = await api('/services');
            return Array.isArray(data && data.items) ? data.items : [];
        } catch (e) {
            console.warn('[openvibe] failed to load services:', e.message);
            return [];
        }
    }

    const FALLBACK_SERVICES = [
        { service_id: 'openvibe-network', display_name: 'OpenVibe Network', description: 'The platform hub and identity surface.', public_url: 'https://openvibe.network', category: 'platform' },
        { service_id: 'openvibe-tools', display_name: 'OpenVibe Tools', description: 'Searchable directory of every OpenVibe service.', public_url: 'https://openvibe.tools', category: 'platform' },
        { service_id: 'openvibe-live', display_name: 'OpenVibe Live', description: 'Native live streaming.', public_url: 'https://openvibe.live', category: 'streaming' },
        { service_id: 'openre-stream', display_name: 'OpenRe.Stream', description: 'Restream / multi-destination broadcast.', public_url: 'https://openre.stream', category: 'streaming' },
        { service_id: 'openvibe-chat', display_name: 'OpenVibe Chat', description: 'Chat, DMs, voice rooms, TTS.', public_url: 'https://openvibe.chat', category: 'chat' },
        { service_id: 'openvibe-community', display_name: 'OpenVibe Community', description: 'Pastes, threads, forums.', public_url: 'https://openvibe.community', category: 'community' },
        { service_id: 'openvibe-media', display_name: 'OpenVibe Media', description: 'Shared media object storage.', public_url: 'https://openvibe.media', category: 'platform' },
        { service_id: 'openvibe-billing', display_name: 'OpenVibe Billing', description: 'Subscriptions, tips, ledger.', public_url: 'https://billing.openvibe.network', category: 'billing' },
        { service_id: 'openvibe-ai', display_name: 'OpenVibe AI', description: 'Provider routing, captions, search backbone.', public_url: 'https://ai.openvibe.network', category: 'ai' },
        { service_id: 'openvibe-games', display_name: 'OpenVibe Games', description: 'Shared MMORPG progression, canvas, cosmetics, and world state.', public_url: 'https://openvibe.games', category: 'games' },
        { service_id: 'openvibe-admin', display_name: 'Admin', description: 'Operator surface for staff.', public_url: 'https://admin.openvibe.network', category: 'admin' },
        { service_id: 'openvibe-my', display_name: 'My Account', description: 'Account hub, themes, linked accounts.', public_url: 'https://my.openvibe.network', category: 'account' },
        { service_id: 'openvibe-themes', display_name: 'Themes', description: 'Network-wide theme catalog.', public_url: 'https://themes.openvibe.network', category: 'account' }
    ];

    function mergedServices(remote) {
        const map = new Map();
        for (const item of FALLBACK_SERVICES) map.set(item.service_id, { ...item, source: 'fallback' });
        for (const item of remote || []) {
            const meta = item.metadata_json ? safeParse(item.metadata_json, {}) : (item.metadata || {});
            const merged = Object.assign({}, map.get(item.service_id) || {}, item, {
                category: (meta && meta.category) || item.category || 'service',
                tags: (meta && meta.tags) || [],
                source: 'registry',
            });
            map.set(item.service_id, merged);
        }
        return [...map.values()].sort((a, b) => (a.display_name || a.service_id).localeCompare(b.display_name || b.service_id));
    }

    function safeParse(value, fallback) {
        if (typeof value !== 'string') return value || fallback;
        try { return JSON.parse(value); } catch { return fallback; }
    }

    function renderServiceCards(target, items) {
        if (!target) return;
        target.innerHTML = '';
        for (const item of items) {
            const a = document.createElement('a');
            a.className = 'ov-card';
            a.href = item.public_url || '#';
            a.target = '_blank';
            a.rel = 'noopener';
            a.innerHTML = `
                <div class="title">${escapeHtml(item.display_name || item.service_id)}</div>
                <div class="desc">${escapeHtml(item.description || '')}</div>
                <div class="meta">
                    <span class="ov-tag">${escapeHtml(item.category || 'service')}</span>
                    ${item.source === 'registry' ? '<span class="ov-tag ok">live</span>' : '<span class="ov-tag">catalog</span>'}
                </div>`;
            target.appendChild(a);
        }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function navbar(activeKey) {
        const links = [
            { key: 'home', href: 'https://openvibe.network', label: 'Home' },
            { key: 'tools', href: 'https://openvibe.tools', label: 'Tools' },
            { key: 'games', href: 'https://openvibe.games', label: 'Games' },
            { key: 'themes', href: 'https://themes.openvibe.network', label: 'Themes' },
            { key: 'my', href: 'https://my.openvibe.network', label: 'My Account' },
            { key: 'admin', href: 'https://admin.openvibe.network', label: 'Admin' },
            { key: 'docs', href: '/api/v1/services', label: 'Registry API' },
        ];
        return `
            <header class="ov-nav"><div class="ov-nav-inner">
                <a href="/" class="ov-brand">⬢ <b>OpenVibe</b></a>
                <nav class="ov-nav-links">
                    ${links.map((l) => `<a href="${l.href}"${l.key === activeKey ? ' style="color:var(--ov-text)"' : ''}>${l.label}</a>`).join('')}
                </nav>
            </div></header>`;
    }

    function footer() {
        return `<footer class="ov-footer">
            OpenVibe is open source and community-run. ·
            <a href="https://github.com/openvibe">GitHub</a> ·
            <a href="/api/v1/services">Registry</a> ·
            <a href="/health">Health</a>
        </footer>`;
    }

    function attachLauncher(getItems) {
        const root = document.createElement('div');
        root.className = 'ov-launcher';
        root.innerHTML = `<div class="ov-launcher-box">
            <input class="ov-input" placeholder="Search OpenVibe services… (Esc to close)" />
            <div class="ov-launcher-results"></div>
        </div>`;
        document.body.appendChild(root);
        const input = root.querySelector('input');
        const results = root.querySelector('.ov-launcher-results');
        function close() { root.classList.remove('open'); input.value = ''; }
        function open() { root.classList.add('open'); input.focus(); render(''); }
        function render(q) {
            const items = (getItems() || []).filter((it) => {
                const hay = `${it.display_name || ''} ${it.description || ''} ${it.service_id || ''} ${it.category || ''}`.toLowerCase();
                return !q || hay.includes(q.toLowerCase());
            }).slice(0, 12);
            renderServiceCards(results, items);
        }
        input.addEventListener('input', () => render(input.value));
        root.addEventListener('click', (e) => { if (e.target === root) close(); });
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
            if (e.key === 'Escape') close();
        });
        return { open, close };
    }

    global.OpenVibe = {
        api,
        escapeHtml,
        footer,
        navbar,
        loadServices,
        mergedServices,
        renderServiceCards,
        attachLauncher,
        FALLBACK_SERVICES,
    };
}(window));
