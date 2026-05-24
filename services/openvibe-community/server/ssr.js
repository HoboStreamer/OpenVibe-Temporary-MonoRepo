'use strict';

/**
 * ssr.js — Server-side rendered HTML pages for openvibe-community.
 *
 * Routes exposed (wired in index.js):
 *   GET /threads          — threaded discussion listing
 *   GET /pastes           — paste library
 *   GET /p/:slug          — single paste view (HTML, Accept: text/html)
 *   GET /pulse            — community pulse (threads + pastes combined)
 */

const { resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');
const { renderIcon } = require('@openvibe/icons');

const COMMUNITY_URLS = Object.freeze({
    live:      resolvePublicOrigin({ surface: 'live' }),
    chat:      resolvePublicOrigin({ surface: 'chat' }),
    network:   resolvePublicOrigin({ surface: 'network' }),
    community: resolvePublicOrigin({ surface: 'community' }),
});

// Bridge-based sign-in: network validates session then redirects back here with token in hash.
// Falls back to oauth/authorize page if community URL is not yet resolved.
const SIGN_IN_URL = COMMUNITY_URLS.network && COMMUNITY_URLS.community
    ? `${COMMUNITY_URLS.network}/api/v1/session/bridge?return_to=${encodeURIComponent(COMMUNITY_URLS.community)}`
    : `${COMMUNITY_URLS.network || ''}/oauth/authorize`;
// Anonymous sessions are created via the OAuth authorize page (which has an anonymous option).
const ANON_URL = `${COMMUNITY_URLS.network || ''}/oauth/authorize?prompt=anonymous`;

// ── helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function timeAgo(value) {
    if (!value) return 'just now';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'just now';
    const delta = Math.round((Date.now() - parsed.getTime()) / 1000);
    if (delta < 60)   return delta + 's ago';
    if (delta < 3600) return Math.floor(delta / 60) + 'm ago';
    if (delta < 86400) return Math.floor(delta / 3600) + 'h ago';
    return Math.floor(delta / 86400) + 'd ago';
}

function pasteLanguageLabel(lang) {
    const MAP = {
        js: 'JavaScript', ts: 'TypeScript', py: 'Python', rb: 'Ruby',
        go: 'Go', rs: 'Rust', java: 'Java', c: 'C', cpp: 'C++',
        cs: 'C#', php: 'PHP', html: 'HTML', css: 'CSS', json: 'JSON',
        yaml: 'YAML', sql: 'SQL', bash: 'Bash', sh: 'Shell',
        md: 'Markdown', txt: 'Plain text',
    };
    return MAP[lang] || (lang ? lang.toUpperCase() : 'Plain text');
}

// ── styles shared across pages ────────────────────────────────────────────────
function _styles() {
    return `<style>
        :root {
            /* default dark palette — overridden at runtime by the theme system */
            --bg: #050916;
            --panel: rgba(15,23,42,0.82);
            --border: rgba(255,255,255,0.1);
            --text: #f8fafc;
            --muted: #94a3b8;
            --accent: #22d3ee;
            --accent-2: #8b5cf6;
            --radius: 24px;
            color-scheme: dark;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: var(--bg, #050916);
            color: var(--text, #f8fafc);
            line-height: 1.6;
        }
        a { color: inherit; text-decoration: none; }
        .page { width: min(1080px, calc(100vw - 2rem)); margin: 0 auto; }
        .topbar {
            position: sticky; top: 0; z-index: 20;
            backdrop-filter: blur(18px);
            background: color-mix(in srgb, var(--bg, #050916) 72%, transparent);
            border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
        }
        .topbar-inner {
            display: flex; gap: 1rem; align-items: center;
            justify-content: space-between; padding: 0.9rem 0;
        }
        .brand { display: inline-flex; align-items: center; gap: 0.7rem; }
        .brand-mark {
            display: inline-grid; place-items: center;
            width: 2.4rem; height: 2.4rem; border-radius: 14px;
            font-weight: 800; font-size: 0.9rem;
            background: linear-gradient(135deg, var(--accent-2, #8b5cf6), var(--accent, #22d3ee));
            color: white;
        }
        .brand-name { font-weight: 800; letter-spacing: -0.03em; }
        .nav-links { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .nav-link {
            display: inline-flex; align-items: center; min-height: 2.4rem;
            padding: 0.55rem 0.9rem; border-radius: 999px;
            border: 1px solid var(--border, rgba(255,255,255,0.08));
            background: color-mix(in srgb, var(--text, #f8fafc) 4%, transparent);
            font-weight: 600; transition: border-color 0.15s, background 0.15s;
        }
        .nav-link:hover, .nav-link.active {
            border-color: color-mix(in srgb, var(--accent, #22d3ee) 35%, transparent);
            background: color-mix(in srgb, var(--accent, #22d3ee) 8%, transparent);
        }
        .nav-link.active { color: var(--accent, #22d3ee); }
        main { padding: 1.5rem 0 4rem; }
        .hero { margin-bottom: 1.5rem; }
        .eyebrow {
            color: var(--accent, #22d3ee); font-size: 0.78rem;
            text-transform: uppercase; letter-spacing: 0.14em;
            font-weight: 800; margin-bottom: 0.4rem;
        }
        .page-title { margin: 0; font-size: clamp(1.6rem,4vw,2.6rem); letter-spacing: -0.04em; }
        .page-sub { color: var(--muted, #94a3b8); margin: 0.4rem 0 0; }
        .card-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
        .glass-card {
            border-radius: var(--radius, 24px);
            background: var(--panel, rgba(15,23,42,0.82));
            border: 1px solid var(--border, rgba(255,255,255,0.1));
            padding: 1.1rem; display: grid; gap: 0.55rem;
        }
        .card-title { margin: 0; font-size: 1rem; line-height: 1.3; }
        .card-body { margin: 0; color: var(--muted, #94a3b8); font-size: 0.9rem; }
        .pill {
            display: inline-flex; align-items: center; padding: 0.3rem 0.6rem;
            border-radius: 999px; font-size: 0.72rem; font-weight: 800;
            letter-spacing: 0.08em; text-transform: uppercase;
            background: color-mix(in srgb, var(--text, #f8fafc) 8%, transparent);
            border: 1px solid var(--border, rgba(255,255,255,0.08));
        }
        .pill.primary {
            background: color-mix(in srgb, var(--accent, #22d3ee) 14%, transparent);
            border-color: color-mix(in srgb, var(--accent, #22d3ee) 28%, transparent);
        }
        .pill.success { background: rgba(74,222,128,0.12); border-color: rgba(74,222,128,0.28); }
        .pill.warn    { background: rgba(251,191,36,0.12); border-color: rgba(251,191,36,0.28); }
        .pill-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .card-kicker { color: var(--muted, #94a3b8); font-size: 0.82rem; }
        .ov-thread-star {
            position: absolute; top: .65rem; right: .65rem;
            background: rgba(0,0,0,0.5); border: none; border-radius: 50%;
            width: 28px; height: 28px; cursor: pointer; font-size: 1rem;
            color: rgba(255,255,255,0.45); display: flex; align-items: center;
            justify-content: center; transition: background .15s, color .15s, transform .1s; z-index: 2;
        }
        .ov-thread-star:hover { background: rgba(0,0,0,0.8); transform: scale(1.15); }
        .ov-thread-star.is-fav { color: #facc15; }
        .link-inline { color: var(--accent, #22d3ee); text-decoration: underline; text-underline-offset: 0.2em; }
        .empty-state {
            border-radius: var(--radius, 24px);
            background: var(--panel, rgba(15,23,42,0.5)); border: 1px solid var(--border, rgba(255,255,255,0.1));
            padding: 2.5rem; text-align: center; color: var(--muted, #94a3b8);
        }
        .section-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .section-title { margin: 0; font-size: 1.2rem; font-weight: 700; }
        .section-link {
            display: inline-flex; align-items: center; min-height: 2.2rem;
            padding: 0.5rem 0.85rem; border-radius: 999px;
            border: 1px solid var(--border, rgba(255,255,255,0.12)); font-weight: 600;
            background: color-mix(in srgb, var(--text, #f8fafc) 4%, transparent); font-size: 0.88rem;
            transition: border-color 0.15s, background 0.15s;
        }
        .section-link:hover {
            border-color: var(--accent, #22d3ee);
            background: color-mix(in srgb, var(--accent, #22d3ee) 8%, transparent);
        }
        .search-bar { display: flex; gap: 0.7rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .filter-input {
            flex: 1; min-width: 200px; min-height: 2.8rem;
            padding: 0.75rem 0.9rem; border-radius: 16px;
            border: 1px solid var(--border, rgba(255,255,255,0.1));
            background: color-mix(in srgb, var(--text, #f8fafc) 5%, transparent); color: var(--text, #f8fafc);
        }
        .paste-content {
            background: color-mix(in srgb, var(--bg, #050916) 95%, transparent);
            border: 1px solid var(--border, rgba(255,255,255,0.1));
            border-radius: 18px; padding: 1.2rem;
            font-family: 'SFMono-Regular', Consolas, monospace;
            font-size: 0.88rem; overflow-x: auto;
            white-space: pre-wrap; word-break: break-word;
            color: var(--text, #e2e8f0);
        }
        .data-points { display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fit, minmax(120px,1fr)); margin-top: 1rem; }
        .data-point {
            border-radius: 16px;
            background: color-mix(in srgb, var(--text, #f8fafc) 4%, transparent);
            border: 1px solid var(--border, rgba(255,255,255,0.1)); padding: 0.8rem;
        }
        .data-point-label { color: var(--muted, #94a3b8); font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
        .data-point-value { margin-top: 0.25rem; font-size: 1rem; font-weight: 800; }
        footer.page { padding-bottom: 3rem; }
        .footer-row { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; padding: 1.5rem 0; border-top: 1px solid var(--border, rgba(255,255,255,0.08)); color: var(--muted, #94a3b8); font-size: 0.88rem; }
        @media (max-width: 700px) { .topbar-inner { flex-wrap: wrap; justify-content: center; } }
        /* ── buddy icon / session widget ── */
        #ov-nav-session { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
        #ov-nav-session .ov-btn {
            display: inline-flex; align-items: center; padding: 0.45rem 0.9rem;
            border-radius: 999px; border: 1px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.05); color: var(--text);
            font-weight: 700; font-size: 0.85rem; cursor: pointer; text-decoration: none;
            transition: background 0.15s, border-color 0.15s;
        }
        #ov-nav-session .ov-btn:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.13); }
        #ov-nav-session .ov-btn-primary {
            background: linear-gradient(135deg, var(--accent), #4f46e5 60%, var(--accent-2));
            border-color: transparent; color: #fff;
        }
        .ov-anon-menu { position: relative; }
        .ov-anon-trigger {
            display: flex; align-items: center; gap: 0.35rem;
            min-width: 34px; height: 34px; padding: 0 0.55rem;
            border-radius: 17px; border: 1.5px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.05); color: var(--muted);
            cursor: pointer; transition: border-color 0.15s, background 0.15s, color 0.15s;
        }
        .ov-anon-trigger:hover { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.1); color: var(--text); }
        .ov-anon-trigger-name { font-size: 0.75rem; font-weight: 600; white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
        .ov-anon-dropdown {
            position: absolute; top: calc(100% + 8px); right: 0;
            min-width: 200px; background: #0e1018;
            border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5); overflow: hidden; z-index: 9999;
        }
        .ov-anon-dropdown-name {
            padding: 0.65rem 1rem 0.5rem; font-size: 0.75rem; font-weight: 600;
            color: var(--muted); border-bottom: 1px solid rgba(255,255,255,0.06);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ov-anon-dropdown-item {
            display: block; padding: 0.6rem 1rem; font-size: 0.85rem;
            color: var(--text); text-decoration: none; cursor: pointer;
            width: 100%; text-align: left; background: none; border: none; font-family: inherit;
            transition: background 0.12s;
        }
        .ov-anon-dropdown-item:hover { background: rgba(255,255,255,0.06); }
        .ov-anon-dropdown-item--danger { color: #f87171; }
        .ov-anon-dropdown-item--danger:hover { background: rgba(248,113,113,0.08); }
    </style>`;
}

function _nav(active) {
    const items = [
        { href: '/pulse',   label: 'Pulse',   id: 'pulse',   icon: 'events'    },
        { href: '/threads', label: 'Threads', id: 'threads', icon: 'chat'      },
        { href: '/pastes',  label: 'Pastes',  id: 'pastes',  icon: 'codes'     },
        { href: '/pages',   label: 'Pages',   id: 'pages',   icon: 'community' },
        { href: '/chat',    label: 'Chat',    id: 'chat',    icon: 'chat'      },
    ];
    return items.map((item) => `<a class="nav-link ov-icon-label${item.id === active ? ' active' : ''}" href="${item.href}">${renderIcon(item.icon, { decorative: true })}<span>${item.label}</span></a>`).join('');
}

function _head({ title, description, canonical }) {
    return `<title>${escapeHtml(title || 'OpenVibe Community')}</title>
        <meta name="description" content="${escapeHtml(description || 'OpenVibe Community')}">
        ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
        <meta property="og:title" content="${escapeHtml(title || 'OpenVibe Community')}">
        <meta property="og:description" content="${escapeHtml(description || '')}">
        <meta property="og:type" content="website">`;
}

function _shell({ title, description, canonical, active, bodyHtml }) {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%238b5cf6'/%3E%3Cstop offset='100%25' stop-color='%2322d3ee'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial,sans-serif' font-size='24' font-weight='700' fill='white'%3EOC%3C/text%3E%3C/svg%3E">
    ${_head({ title, description, canonical })}
    ${_styles()}
    <link rel="stylesheet" href="/assets/openvibe-icons.css">
    <script src="/assets/openvibe-icons.js" defer></script>
    <script src="/assets/openvibe.js" defer></script>
</head>
<body>
    <header class="topbar">
        <div class="page topbar-inner">
            <a class="brand" href="/">
                <span class="brand-mark">OC</span>
                <span class="brand-name">openvibe.community</span>
            </a>
            <nav class="nav-links" aria-label="Primary">
                ${_nav(active)}
            </nav>
            <div id="ov-nav-session"></div>
        </div>
    </header>
    <main class="page">
        ${bodyHtml}
    </main>
    <footer class="page">
        <div class="footer-row">
            <span>Pastes</span>
            <a class="link-inline" href="${COMMUNITY_URLS.live}">openvibe.live</a>
            <a class="link-inline" href="${COMMUNITY_URLS.chat}">OpenVibe Chat</a>
            <a class="link-inline" href="/threads">Threads</a>
            <a class="link-inline" href="/pastes">Pastes</a>
            <a class="link-inline" href="${COMMUNITY_URLS.network}">Account</a>
        </div>
    </footer>
    <script src="/assets/chat-bubble.js" defer></script>
    <script defer>
    (async function() {
        try { await OpenVibe.primeEnvironment(); } catch(e) { console.warn('[community] primeEnvironment:', e); }
        try { await OpenVibe.renderChrome('community'); } catch(e) { console.warn('[community] renderChrome:', e); }
    })();
    </script>
</body>
</html>`;
}

// ── thread card ───────────────────────────────────────────────────────────────
function _threadCard(thread) {
    const title = thread.title || 'Untitled thread';
    const href = `/threads/${encodeURIComponent(thread.id || thread.slug || '')}`;
    const meta = thread.metadata || {};
    const lang = meta.paste_language || null;
    const imgUrl = meta.paste_image_url || null;
    const isPasteThread = thread.thread_type === 'paste_thread';
    const threadId = escapeHtml(thread.id || thread.slug || '');
    const threadTitle = escapeHtml(title);
    const communityBase = COMMUNITY_URLS.community || '';
    const threadUrl = escapeHtml(communityBase + href);
    return `<article class="glass-card" style="position:relative;">
        <button class="ov-thread-star" type="button" data-thread-id="${threadId}" data-thread-title="${threadTitle}" data-thread-url="${threadUrl}" aria-label="Add to favorites">☆</button>
        <div class="pill-row">
            <span class="pill primary">Thread</span>
            ${isPasteThread && lang ? `<span class="pill success">${escapeHtml(pasteLanguageLabel(lang))}</span>` : ''}
        </div>
        ${imgUrl ? `<a href="${escapeHtml(href)}"><img src="${escapeHtml(imgUrl)}" alt="" loading="lazy" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin:.25rem 0"></a>` : ''}
        <a href="${escapeHtml(href)}"><h3 class="card-title">${escapeHtml(title)}</h3></a>
        <div class="card-kicker">${timeAgo(thread.last_activity_at || thread.created_at)}</div>
    </article>`;
}

// ── paste card ────────────────────────────────────────────────────────────────
function _pasteCard(paste) {
    const title = paste.title || 'Untitled paste';
    const href  = `/p/${encodeURIComponent(paste.slug || paste.id || '')}`;
    const lang  = paste.language || 'txt';
    const imageUrl = paste.metadata && paste.metadata.image_url ? paste.metadata.image_url : null;
    const preview = !imageUrl && paste.body
        ? escapeHtml(String(paste.body).split('\n').slice(0, 4).join('\n')).replace(/\n/g, '<br>') + (paste.body.split('\n').length > 4 ? '\n…' : '')
        : '';
    return `<article class="glass-card">
        <div class="pill-row">
            <span class="pill success">Paste</span>
            <span class="pill">${escapeHtml(pasteLanguageLabel(lang))}</span>
            ${paste.visibility === 'public' ? '' : `<span class="pill warn">${escapeHtml(paste.visibility || 'unlisted')}</span>`}
        </div>
        ${imageUrl ? `<a href="${escapeHtml(href)}"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" class="paste-card-img" loading="lazy" style="width:100%;max-height:160px;object-fit:cover;border-radius:6px;margin:.5rem 0"></a>` : ''}
        <a href="${escapeHtml(href)}"><h3 class="card-title">${escapeHtml(title)}</h3></a>
        ${preview ? `<pre class="paste-content" style="max-height:120px;overflow:hidden">${preview}</pre>` : ''}
        <div class="card-kicker">
            ${paste.view_count ? `${paste.view_count} view${paste.view_count === 1 ? '' : 's'} · ` : ''}
            ${timeAgo(paste.created_at)}
        </div>
    </article>`;
}

// ── renderThreadsPage ─────────────────────────────────────────────────────────
function renderThreadsPage(threads, opts) {
    opts = opts || {};
    const limit = opts.limit || 60;
    const items = (threads || []).slice(0, limit);
    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Threads</h1>
            <p class="page-sub">Paste-based discussions. Start a thread from any paste — it becomes the OP.</p>
        </section>
        <div class="section-head">
            <h2 class="section-title">${items.length} thread${items.length === 1 ? '' : 's'}</h2>
            <div style="display:flex;gap:.5rem">
                <a class="section-link" href="/pastes">Browse pastes</a>
                <a class="section-link" href="/pulse">Pulse</a>
            </div>
        </div>
        <div class="search-bar">
            <input class="filter-input" type="search" placeholder="Filter threads…" data-filter-input="threads" aria-label="Filter threads">
        </div>
        ${items.length
            ? `<div class="card-grid" id="threads-grid">
                ${items.map((t) => `<div data-filter-group="threads" data-filter-text="${escapeHtml((t.title || '') + ' ' + (t.metadata && t.metadata.paste_language || ''))}">${_threadCard(t)}</div>`).join('')}
               </div>`
            : `<div class="empty-state"><p>No threads yet.</p><p>Open any paste and press <strong>Start Thread</strong> to kick one off.</p><a class="link-inline" href="/pastes">Browse pastes →</a></div>`}
        <script>
        (function(){
            var input = document.querySelector('[data-filter-input="threads"]');
            if (!input) return;
            var items = Array.from(document.querySelectorAll('[data-filter-group="threads"]'));
            input.addEventListener('input', function() {
                var q = input.value.trim().toLowerCase();
                items.forEach(function(el) { el.hidden = q && !el.dataset.filterText.toLowerCase().includes(q); });
            });
        })();
        (function(){
            var NETWORK_URL = '${escapeHtml(COMMUNITY_URLS.network)}';
            var LOCAL_KEY = 'ov-fav-threads';
            function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; } }
            function saveLocal(arr) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(arr)); } catch {} }
            function isFav(id) { return loadLocal().some(function(t){ return t.id === id; }); }
            function syncToNetwork(threads) {
                fetch(NETWORK_URL + '/api/v1/user-modules/me/openvibe.favorites', {
                    method: 'PUT', credentials: 'include',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ data: { threads: threads } }),
                }).catch(function(){});
            }
            function toggle(btn) {
                var id = btn.dataset.threadId;
                var title = btn.dataset.threadTitle;
                var url = btn.dataset.threadUrl;
                var favs = loadLocal();
                var idx = favs.findIndex(function(t){ return t.id === id; });
                if (idx >= 0) { favs.splice(idx, 1); } else { favs.unshift({ id: id, title: title, url: url, savedAt: new Date().toISOString() }); }
                saveLocal(favs);
                syncToNetwork(favs);
                var nowFav = idx < 0;
                btn.textContent = nowFav ? '\\u2605' : '\\u2606';
                btn.classList.toggle('is-fav', nowFav);
                btn.setAttribute('aria-label', nowFav ? 'Remove from favorites' : 'Add to favorites');
            }
            document.querySelectorAll('.ov-thread-star').forEach(function(btn) {
                if (isFav(btn.dataset.threadId)) { btn.textContent = '\\u2605'; btn.classList.add('is-fav'); btn.setAttribute('aria-label', 'Remove from favorites'); }
                btn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); toggle(btn); });
            });
        })();
        </script>`;
    return _shell({ title: 'Threads — OpenVibe Community', description: 'Paste-based threads on OpenVibe Community.', active: 'threads', bodyHtml });
}

// ── renderPastesPage ──────────────────────────────────────────────────────────
function renderPastesPage(pastes, opts) {
    opts = opts || {};
    const limit = opts.limit || 60;
    const sort = opts.sort || 'recent';
    const items = (pastes || []).slice(0, limit);
    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Pastes</h1>
            <p class="page-sub">Public code snippets, configuration shares, and quick notes.</p>
        </section>
        <div class="section-head">
            <h2 class="section-title">${items.length} paste${items.length === 1 ? '' : 's'}</h2>
            <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
                <a class="section-link${sort === 'recent' ? ' active' : ''}" href="/pastes?sort=recent" style="${sort === 'recent' ? 'border-color:rgba(34,211,238,.5);color:var(--accent);background:rgba(34,211,238,.08);' : ''}">Most recent</a>
                <a class="section-link${sort === 'views' ? ' active' : ''}" href="/pastes?sort=views" style="${sort === 'views' ? 'border-color:rgba(34,211,238,.5);color:var(--accent);background:rgba(34,211,238,.08);' : ''}">Most viewed</a>
                <a class="section-link" href="/pulse">Pulse</a>
                <a class="section-link" href="/threads">Threads</a>
            </div>
        </div>
        <div class="search-bar">
            <input class="filter-input" type="search" placeholder="Filter pastes…" data-filter-input="pastes" aria-label="Filter pastes">
        </div>
        ${items.length
            ? `<div class="card-grid">
                ${items.map((p) => `<div data-filter-group="pastes" data-filter-text="${escapeHtml((p.title || '') + ' ' + (p.language || '') + ' ' + (p.content || '').slice(0, 200))}">${_pasteCard(p)}</div>`).join('')}
               </div>`
            : `<div class="empty-state"><p>No public pastes yet.</p></div>`}
        <script>
        (function(){
            var input = document.querySelector('[data-filter-input="pastes"]');
            if (!input) return;
            var items = Array.from(document.querySelectorAll('[data-filter-group="pastes"]'));
            input.addEventListener('input', function() {
                var q = input.value.trim().toLowerCase();
                items.forEach(function(el) { el.hidden = q && !el.dataset.filterText.toLowerCase().includes(q); });
            });
        })();
        </script>`;
    return _shell({ title: 'Pastes — OpenVibe Community', description: 'Public code snippets and notes from the OpenVibe network.', active: 'pastes', bodyHtml });
}

// ── renderPasteViewPage ───────────────────────────────────────────────────────
function renderPasteViewPage(paste, opts) {
    opts = opts || {};
    if (!paste) {
        const bodyHtml = `<div class="empty-state"><h2>Paste not found</h2><p>This paste may have been deleted or is not publicly visible.</p><a class="link-inline" href="/pastes">← Back to pastes</a></div>`;
        return _shell({ title: 'Not found — OpenVibe Community', active: 'pastes', bodyHtml });
    }
    const title = paste.title || 'Untitled paste';
    const lang  = paste.language || 'txt';
    const content = paste.body || '';
    const imageUrl = paste.metadata && paste.metadata.image_url ? paste.metadata.image_url : null;
    const contentHtml = escapeHtml(content);
    const copyId = 'paste-content-pre';
    const expiresHtml = paste.expires_at
        ? `<div class="data-point"><div class="data-point-label">Expires</div><div class="data-point-value">${escapeHtml(new Date(paste.expires_at).toLocaleString())}</div></div>`
        : '';
    const morePastes = (opts && opts.morePastes) || [];
    const pasteStripHtml = morePastes.length ? `
        <div style="margin-top:2rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;">
                <span style="font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);">More pastes</span>
                <a class="section-link" href="/pastes" style="font-size:.8rem;">Browse all →</a>
            </div>
            <div style="display:flex;gap:.75rem;overflow-x:auto;padding-bottom:.75rem;scrollbar-width:thin;">
                ${morePastes.map((p) => {
                    const pTitle = escapeHtml(p.title || 'Untitled paste');
                    const pLang  = escapeHtml(pasteLanguageLabel(p.language || 'txt'));
                    const pImg   = p.metadata && p.metadata.image_url ? escapeHtml(p.metadata.image_url) : null;
                    const pHref  = `/p/${encodeURIComponent(p.slug || p.id || '')}`;
                    const pViews = p.view_count ? `${p.view_count} view${p.view_count === 1 ? '' : 's'} · ` : '';
                    const pTime  = timeAgo(p.created_at);
                    return `<a href="${escapeHtml(pHref)}" style="flex:0 0 220px;border-radius:16px;background:rgba(15,23,42,.9);border:1px solid rgba(255,255,255,.09);padding:.85rem;text-decoration:none;display:flex;flex-direction:column;gap:.4rem;transition:border-color .15s;" onmouseover="this.style.borderColor='rgba(34,211,238,.4)'" onmouseout="this.style.borderColor='rgba(255,255,255,.09)'">
                        ${pImg ? `<img src="${pImg}" alt="" loading="lazy" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:.2rem;">` : ''}
                        <span style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);opacity:.8;">${pLang}</span>
                        <span style="font-size:.88rem;font-weight:700;color:var(--text);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${pTitle}</span>
                        <span style="font-size:.75rem;color:var(--muted);margin-top:auto;">${pViews}${pTime}</span>
                    </a>`;
                }).join('')}
            </div>
        </div>` : '';
    const bodyHtml = `
        <section class="hero" style="margin-bottom:1rem">
            <div class="pill-row" style="margin-bottom:.5rem">
                <span class="pill success">Paste</span>
                <span class="pill">${escapeHtml(pasteLanguageLabel(lang))}</span>
                ${paste.visibility && paste.visibility !== 'public' ? `<span class="pill warn">${escapeHtml(paste.visibility)}</span>` : ''}
            </div>
            <h1 class="page-title" style="font-size:clamp(1.4rem,3vw,2.2rem)">${escapeHtml(title)}</h1>
            <p class="page-sub">
                Created ${timeAgo(paste.created_at)}
                ${paste.view_count ? ` · ${paste.view_count} view${paste.view_count === 1 ? '' : 's'}` : ''}
            </p>
        </section>
        ${imageUrl ? `<div style="margin-bottom:1.25rem;"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" style="width:100%;max-height:420px;object-fit:contain;border-radius:16px;border:1px solid rgba(255,255,255,.09);background:rgba(0,0,0,.4);"></div>` : ''}
        <div class="data-points">
            <div class="data-point"><div class="data-point-label">Language</div><div class="data-point-value">${escapeHtml(pasteLanguageLabel(lang))}</div></div>
            <div class="data-point"><div class="data-point-label">Lines</div><div class="data-point-value">${content.split('\n').length}</div></div>
            <div class="data-point"><div class="data-point-label">Characters</div><div class="data-point-value">${content.length}</div></div>
            ${expiresHtml}
        </div>
        <div style="margin-top:1.5rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
                <span style="color:var(--muted);font-size:.85rem">${escapeHtml(pasteLanguageLabel(lang))} · ${escapeHtml(paste.slug || paste.id || '')}</span>
                <button id="copy-btn" style="background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.28);color:var(--accent);border-radius:999px;padding:.35rem .8rem;font-weight:700;cursor:pointer;font-size:.82rem">Copy</button>
            </div>
            <pre id="${copyId}" class="paste-content">${contentHtml}</pre>
        </div>
        ${paste.description ? `<section class="glass-card" style="margin-top:1rem"><div class="eyebrow">Description</div><p>${escapeHtml(paste.description)}</p></section>` : ''}
        <div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">
            <a class="section-link" href="/pastes">← All pastes</a>
            ${opts && opts.thread
                ? `<a class="section-link" href="/threads/${encodeURIComponent(opts.thread.id)}" style="border-color:rgba(34,211,238,.35);color:var(--accent)">View Thread →</a>`
                : `<form method="POST" action="/pastes/${encodeURIComponent(paste.slug)}/promote" style="display:contents">
                    <button type="submit" style="display:inline-flex;align-items:center;min-height:2.2rem;padding:.5rem .85rem;border-radius:999px;border:1px solid rgba(139,92,246,.4);background:rgba(139,92,246,.08);color:#a78bfa;font-weight:600;font-size:.88rem;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s">Start Thread</button>
                   </form>`}
            <a class="section-link" href="/pulse">Community pulse</a>
        </div>
        ${pasteStripHtml}
        <script>
        (function(){
            var btn = document.getElementById('copy-btn');
            var pre = document.getElementById('${copyId}');
            if (!btn || !pre) return;
            btn.addEventListener('click', function() {
                var text = pre.textContent || '';
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(function() {
                        btn.textContent = 'Copied!';
                        setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
                    }).catch(function() {
                        btn.textContent = 'Failed';
                        setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
                    });
                } else {
                    try {
                        var range = document.createRange();
                        range.selectNodeContents(pre);
                        window.getSelection().removeAllRanges();
                        window.getSelection().addRange(range);
                        document.execCommand('copy');
                        window.getSelection().removeAllRanges();
                        btn.textContent = 'Copied!';
                        setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
                    } catch (e) {
                        btn.textContent = 'Select manually';
                        setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
                    }
                }
            });
        })();
        </script>`;
    const canonical = `${COMMUNITY_URLS.community}/p/${encodeURIComponent(paste.slug || '')}`;
    return _shell({ title: `${title} — OpenVibe Community`, description: paste.description || `${pasteLanguageLabel(lang)} paste`, canonical, active: 'pastes', bodyHtml });
}

// ── renderPulsePage ───────────────────────────────────────────────────────────
function renderPulsePage(threads, pastes) {
    const threadItems = (threads || []).slice(0, 12);
    const pasteItems  = (pastes  || []).slice(0, 12);
    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Community pulse</h1>
            <p class="page-sub">Recent threads and pastes from the OpenVibe community.</p>
        </section>
        ${threadItems.length ? `
        <div class="section-head">
            <h2 class="section-title">Recent threads</h2>
            <a class="section-link" href="/threads">All threads →</a>
        </div>
        <div class="card-grid">
            ${threadItems.map((t) => _threadCard(t)).join('')}
        </div>` : ''}
        ${pasteItems.length ? `
        <div class="section-head" style="margin-top:2rem">
            <h2 class="section-title">Recent pastes</h2>
            <a class="section-link" href="/pastes">All pastes →</a>
        </div>
        <div class="card-grid">
            ${pasteItems.map((p) => _pasteCard(p)).join('')}
        </div>` : ''}
        ${!threadItems.length && !pasteItems.length ? '<div class="empty-state"><p>Nothing here yet.</p></div>' : ''}
    `;
    return _shell({ title: 'Community Pulse — OpenVibe', description: 'Recent activity from the OpenVibe community.', active: 'pulse', bodyHtml });
}

// ── renderChatPage ────────────────────────────────────────────────────────────
function renderChatPage(discordMessages, opts) {
    opts = opts || {};
    const messages = (discordMessages || []).slice(0, 100);
    const messagesHtml = messages.length
        ? messages.map((m) => {
            const meta = m.metadata || {};
            const username = escapeHtml(meta.username || m.discord_channel_id || 'Unknown');
            const content  = escapeHtml(meta.content  || meta.text || '');
            const ts       = timeAgo(m.created_at);
            return `<div class="glass-card" style="padding:1rem 1.25rem;">
                <div style="display:flex;gap:0.7rem;align-items:baseline;">
                    <strong style="color:var(--accent);">${username}</strong>
                    <span style="color:var(--muted);font-size:0.82rem;">${ts}</span>
                </div>
                ${content ? `<p style="margin:0.4rem 0 0;">${content}</p>` : ''}
            </div>`;
        }).join('')
        : `<div class="empty-state"><p>No messages yet. Community Discord messages will appear here as they arrive.</p></div>`;

    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Chat</h1>
            <p class="hero-sub">Recent messages relayed from the OpenVibe Discord community.</p>
        </section>
        <section class="section-panel">
            <div class="section-head">
                <h2 class="section-title">Recent messages</h2>
            </div>
            <div class="list-stack" style="display:flex;flex-direction:column;gap:0.6rem;" data-chat-messages>
                ${messagesHtml}
            </div>
        </section>`;
    return _shell({ title: 'Chat — OpenVibe Community', description: 'Recent community chat messages relayed from Discord.', active: 'chat', bodyHtml });
}

// ── renderThreadDetailPage ────────────────────────────────────────────────────
function renderThreadDetailPage(thread, posts, opts) {
    opts = opts || {};
    if (!thread) {
        const bodyHtml = `<section class="hero"><h1 class="page-title">Thread not found</h1><p><a class="link-inline" href="/threads">Back to threads →</a></p></section>`;
        return _shell({ title: 'Thread not found — OpenVibe Community', active: 'threads', bodyHtml });
    }

    const title     = thread.title || 'Untitled thread';
    const paste     = opts.paste || null;
    const postItems = (posts || []).slice(0, 500);
    const threadId  = thread.id || thread.slug || '';
    const meta      = thread.metadata || {};

    // ── OP block (paste content) ──
    const opLang = paste ? (paste.language || null) : (meta.paste_language || null);
    const opImg  = paste ? (paste.metadata && paste.metadata.image_url || null) : (meta.paste_image_url || null);
    const opBody = paste ? (paste.body || '') : '';
    const opSlug = paste ? paste.slug : (meta.paste_slug || null);
    const opLines = opBody ? opBody.split('\n').length : 0;
    const opPreview = opBody.length > 3000
        ? escapeHtml(opBody.slice(0, 3000)) + '\n… (' + (opLines - opBody.slice(0, 3000).split('\n').length) + ' more lines)'
        : escapeHtml(opBody);

    const opHtml = `
        <div class="bbs-op">
            <div class="bbs-op-head">
                <span class="bbs-subject">${escapeHtml(title)}</span>
                <span class="bbs-meta">
                    ${opLang ? `<span class="pill success" style="font-size:.68rem;padding:.15rem .45rem">${escapeHtml(pasteLanguageLabel(opLang))}</span>` : ''}
                    ${opSlug ? `<a class="link-inline" href="/p/${encodeURIComponent(opSlug)}" style="font-size:.8rem">view paste</a>` : ''}
                    <span style="color:var(--muted);font-size:.8rem">${timeAgo(thread.created_at)}</span>
                    <span class="bbs-no">No.0</span>
                </span>
            </div>
            ${opImg ? `<div style="margin:.75rem 0"><img src="${escapeHtml(opImg)}" alt="" style="max-width:min(300px,100%);max-height:260px;object-fit:cover;border-radius:10px" loading="lazy"></div>` : ''}
            ${opBody ? `<pre class="bbs-code">${opPreview}</pre>` : '<p style="color:var(--muted);font-size:.9rem">No paste content.</p>'}
        </div>`;

    // ── reply posts ──
    const repliesHtml = postItems.length
        ? postItems.map((p, i) => {
            const name    = escapeHtml((p.metadata && p.metadata.display_name) || p.author_id || 'Anonymous');
            const content = escapeHtml(String(p.body || '').slice(0, 5000));
            const ts      = timeAgo(p.created_at);
            return `<div class="bbs-reply" id="r${i + 1}">
                <div class="bbs-reply-head">
                    <span class="bbs-name">${name}</span>
                    <span class="bbs-ts">${ts}</span>
                    <a class="bbs-no" href="#r${i + 1}">No.${i + 1}</a>
                </div>
                <div class="bbs-reply-body">${content}</div>
            </div>`;
        }).join('')
        : `<div class="bbs-empty">No replies yet. Be the first.</div>`;

    // ── reply form ──
    const replyForm = `
        <div class="bbs-form-wrap">
            <h3 style="margin:0 0 .75rem;font-size:1rem">Post a Reply</h3>
            <form method="POST" action="/threads/${encodeURIComponent(threadId)}/reply">
                <textarea name="body" placeholder="Write your reply…" maxlength="2000" required
                    style="width:100%;min-height:90px;resize:vertical;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:10px;padding:.65rem .9rem;color:var(--text);font-family:inherit;font-size:.9rem;outline:none;box-sizing:border-box"></textarea>
                <div style="margin-top:.6rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap">
                    <button type="submit" style="background:rgba(34,211,238,.12);border:1px solid rgba(34,211,238,.3);color:var(--accent);border-radius:999px;padding:.45rem 1.2rem;font-weight:700;cursor:pointer;font-size:.88rem;font-family:inherit">Post Reply</button>
                    <span style="color:var(--muted);font-size:.8rem">Requires an OpenVibe identity — <a class="link-inline" href="${SIGN_IN_URL}">sign in</a> or <a class="link-inline" href="${ANON_URL}">go anonymous</a>.</span>
                </div>
            </form>
        </div>`;

    const inlineStyles = `<style>
        .bbs-wrap { max-width: 820px; }
        .bbs-op { background: rgba(15,23,42,.7); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 1.1rem 1.25rem; margin-bottom: 1rem; }
        .bbs-op-head { display: flex; flex-wrap: wrap; gap: .5rem; align-items: baseline; margin-bottom: .6rem; }
        .bbs-subject { font-weight: 800; font-size: 1.05rem; color: var(--text); }
        .bbs-meta { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
        .bbs-no { font-size: .78rem; color: var(--muted); font-family: monospace; }
        .bbs-code { background: rgba(2,6,23,.92); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: .9rem 1rem; font-size: .83rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; color: #e2e8f0; margin: 0; font-family: 'SFMono-Regular', Consolas, monospace; }
        .bbs-replies { display: flex; flex-direction: column; gap: .6rem; }
        .bbs-reply { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); border-radius: 12px; padding: .75rem 1rem; }
        .bbs-reply-head { display: flex; gap: .6rem; align-items: baseline; flex-wrap: wrap; margin-bottom: .4rem; }
        .bbs-name { font-weight: 700; font-size: .82rem; color: var(--accent-2); }
        .bbs-ts { color: var(--muted); font-size: .78rem; }
        .bbs-reply-body { font-size: .9rem; white-space: pre-wrap; word-break: break-word; line-height: 1.55; }
        .bbs-empty { color: var(--muted); font-size: .88rem; padding: 1.5rem 0; text-align: center; }
        .bbs-form-wrap { background: rgba(15,23,42,.7); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 1.1rem 1.25rem; margin-top: 1.5rem; }
        .bbs-divider { border: none; border-top: 1px solid rgba(255,255,255,.07); margin: 1.25rem 0; }
    </style>`;

    const bodyHtml = `
        ${inlineStyles}
        <div class="bbs-wrap">
            <div style="margin-bottom:1rem">
                <a class="link-inline" href="/threads" style="font-size:.88rem">← Threads</a>
            </div>
            ${opHtml}
            <hr class="bbs-divider">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
                <span style="font-size:.88rem;color:var(--muted)">${postItems.length} ${postItems.length === 1 ? 'reply' : 'replies'}</span>
            </div>
            <div class="bbs-replies">${repliesHtml}</div>
            ${replyForm}
        </div>`;

    return _shell({
        title: `${title} — OpenVibe Community`,
        description: paste ? `${pasteLanguageLabel(opLang)} paste thread` : title,
        active: 'threads',
        bodyHtml,
    });
}

// ── renderPagesPage ───────────────────────────────────────────────────────────
function renderPagesPage(registry, opts) {
    opts = opts || {};
    const pages = (registry || []);
    const notFound = opts.notFound || null;

    const pageCards = pages.length
        ? pages.map((p) => {
            const views = p.view_count || 0;
            const tags = (p.tags || []).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join('');
            return `<a class="glass-card" href="/pages/${encodeURIComponent(p.slug)}" style="display:block;text-decoration:none;position:relative;">
                <div class="pill-row">
                    <span class="pill primary">Community Page</span>
                    ${tags}
                </div>
                <h3 class="card-title" style="margin-top:.5rem;">${escapeHtml(p.title || p.slug)}</h3>
                <p class="card-body">${escapeHtml(p.description || '')}</p>
                <div class="card-kicker" style="margin-top:.4rem;">
                    by ${escapeHtml(p.author || 'unknown')}
                    ${views ? ` · ${views} view${views === 1 ? '' : 's'}` : ''}
                </div>
            </a>`;
        }).join('')
        : `<div class="empty-state"><p>No community pages yet.</p><p><a class="link-inline" href="/pages/submit">Submit the first one →</a></p></div>`;

    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Community Pages</h1>
            <p class="page-sub">Vibecoded pages built by the community. Personal homepages, tools, and experiments.</p>
        </section>
        <div class="section-head">
            <h2 class="section-title">${pages.length} page${pages.length === 1 ? '' : 's'}</h2>
            <a class="section-link" href="/pages/submit">Submit your page →</a>
        </div>
        ${notFound ? `<div class="empty-state" style="margin-bottom:1rem;"><p>Page <strong>${escapeHtml(notFound)}</strong> not found in the registry.</p></div>` : ''}
        <div class="card-grid">${pageCards}</div>`;

    return _shell({ title: 'Community Pages — OpenVibe', description: 'User-built pages on OpenVibe Community.', active: 'pages', bodyHtml });
}

// ── renderSubmitPage ──────────────────────────────────────────────────────────
function renderSubmitPage() {
    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Submit a Community Page</h1>
            <p class="page-sub">Got a vibecoded page you want hosted here? Here's how to get it in.</p>
        </section>

        <div class="glass-card" style="margin-bottom:1.2rem;">
            <div class="pill-row"><span class="pill primary">Step 1</span></div>
            <h3 class="card-title" style="margin-top:.5rem;">Build your page</h3>
            <p class="card-body">Write a self-contained HTML file. It can use inline CSS and JS. No build step required. Aim for one file — link to external CDN resources if you need libraries.</p>
        </div>

        <div class="glass-card" style="margin-bottom:1.2rem;">
            <div class="pill-row"><span class="pill primary">Step 2</span></div>
            <h3 class="card-title" style="margin-top:.5rem;">Name your file</h3>
            <p class="card-body">Use a slug that matches your handle or page name: <code>yourname.html</code>. It'll live at <code>/pages/yourname</code> on openvibe.community.</p>
        </div>

        <div class="glass-card" style="margin-bottom:1.2rem;">
            <div class="pill-row"><span class="pill primary">Step 3</span></div>
            <h3 class="card-title" style="margin-top:.5rem;">Submit it</h3>
            <p class="card-body">Drop your file in the <strong>OpenVibe Discord</strong> or open a pull request on the monorepo. Add your entry to <code>services/openvibe-community/server/pages-registry.json</code> with a title, author, and description — a maintainer will review and merge it.</p>
        </div>

        <div class="glass-card">
            <div class="pill-row"><span class="pill success">Guidelines</span></div>
            <h3 class="card-title" style="margin-top:.5rem;">Keep it clean</h3>
            <ul class="card-body" style="padding-left:1.2rem;margin:0.5rem 0 0;">
                <li>No malicious scripts, trackers, or data exfiltration.</li>
                <li>Content must comply with the OpenVibe community standards.</li>
                <li>Keep external requests minimal — no loading 40 third-party SDKs.</li>
                <li>Your page can link back to openvibe.network, your channel, pastes, etc.</li>
            </ul>
        </div>

        <div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap;">
            <a class="section-link" href="/pages">← Community Pages</a>
            <a class="section-link" href="${COMMUNITY_URLS.network}">Join the network</a>
        </div>`;

    return _shell({ title: 'Submit a Page — OpenVibe Community', description: 'How to contribute a community page to OpenVibe.', active: 'pages', bodyHtml });
}

module.exports = {
    renderThreadsPage,
    renderPastesPage,
    renderPasteViewPage,
    renderPulsePage,
    renderChatPage,
    renderThreadDetailPage,
    renderPagesPage,
    renderSubmitPage,
    renderForumHomePage,
    renderForumSpacePage,
    renderForumThreadPage,
};

// ── Forum pages ───────────────────────────────────────────────────────────────

function _forumNav(active) {
    const items = [
        { href: '/forum',          label: 'Home',    id: 'home',    icon: 'events' },
        { href: '/threads',        label: 'Threads', id: 'threads', icon: 'chat'   },
        { href: '/pastes',         label: 'Pastes',  id: 'pastes',  icon: 'codes'  },
        { href: COMMUNITY_URLS.community + '/pulse', label: 'Pulse', id: 'pulse', icon: 'events' },
    ];
    return items.map((item) => `<a class="nav-link ov-icon-label${item.id === active ? ' active' : ''}" href="${item.href}">${renderIcon(item.icon, { decorative: true })}<span>${escapeHtml(item.label)}</span></a>`).join('');
}

function _forumShell({ title, description, active, bodyHtml }) {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%238b5cf6'/%3E%3Cstop offset='100%25' stop-color='%2322d3ee'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial,sans-serif' font-size='22' font-weight='700' fill='white'%3EOF%3C/text%3E%3C/svg%3E">
    <title>${escapeHtml(title || 'OpenVibe Forum')}</title>
    <meta name="description" content="${escapeHtml(description || 'OpenVibe community forum')}">
    <meta property="og:title" content="${escapeHtml(title || 'OpenVibe Forum')}">
    <meta property="og:type" content="website">
    ${_styles()}
    <link rel="stylesheet" href="/assets/openvibe-icons.css">
    <script src="/assets/openvibe-icons.js" defer></script>
</head>
<body>
    <header class="topbar">
        <div class="page topbar-inner">
            <a class="brand" href="/forum">
                <span class="brand-mark">OF</span>
                <span class="brand-name">openvibe.forum</span>
            </a>
            <nav class="nav-links" aria-label="Primary">
                ${_forumNav(active)}
            </nav>
            <div>
                <a class="nav-link" href="${SIGN_IN_URL}">Sign in</a>
            </div>
        </div>
    </header>
    <main class="page">${bodyHtml}</main>
    <footer class="page">
        <div class="footer-row">
            <span>openvibe.forum</span>
            <a class="link-inline" href="${COMMUNITY_URLS.community}">Community</a>
            <a class="link-inline" href="${COMMUNITY_URLS.live}">openvibe.live</a>
            <a class="link-inline" href="${COMMUNITY_URLS.network}">Account</a>
        </div>
    </footer>
</body>
</html>`;
}

function renderForumHomePage(spaces, recentThreads) {
    const spacesHtml = (spaces || []).length
        ? (spaces || []).map((s) => {
            const name = escapeHtml(s.name || s.slug || 'Space');
            const desc = s.description ? `<p style="color:var(--muted);font-size:0.9rem;margin:0.3rem 0 0;">${escapeHtml(String(s.description).slice(0, 120))}</p>` : '';
            const threadCount = s.thread_count || 0;
            return `<a class="card" href="/forum/s/${encodeURIComponent(s.slug || s.id)}" style="display:block;text-decoration:none;">
                <div class="card-kicker">${threadCount} thread${threadCount !== 1 ? 's' : ''}</div>
                <div style="font-weight:700;font-size:1rem;margin-top:0.25rem;">${name}</div>
                ${desc}
            </a>`;
        }).join('')
        : `<div class="empty-state">No spaces yet. Start a discussion!</div>`;

    const threadsHtml = (recentThreads || []).length
        ? (recentThreads || []).map((t) => {
            const title = escapeHtml(t.title || 'Untitled');
            const space = t.space_slug ? `<a class="link-inline" href="/forum/s/${encodeURIComponent(t.space_slug)}">${escapeHtml(t.space_slug)}</a>` : '';
            return `<a class="card" href="/forum/t/${encodeURIComponent(t.id)}" style="display:block;text-decoration:none;">
                <div class="card-kicker">${space} · ${timeAgo(t.created_at)}</div>
                <div style="font-weight:600;margin-top:0.2rem;">${title}</div>
                ${t.body ? `<div style="color:var(--muted);font-size:0.85rem;margin-top:0.25rem;">${escapeHtml(String(t.body).slice(0, 120))}</div>` : ''}
            </a>`;
        }).join('')
        : `<div class="empty-state">No recent discussions.</div>`;

    const bodyHtml = `
        <section class="hero">
            <h1 class="page-title">OpenVibe Forum</h1>
            <p style="color:var(--muted);max-width:540px;">Community discussions across the OpenVibe network. Ask questions, share ideas, get help.</p>
            <div class="ov-cta-row" style="margin-top:1rem;">
                <a class="button" href="${SIGN_IN_URL}">Sign in to post</a>
                <a class="button-secondary" href="/threads">Browse all threads</a>
            </div>
        </section>
        <section class="section-panel">
            <div class="section-head">
                <h2 class="section-title">Spaces</h2>
                <a class="section-link" href="/threads">See all threads →</a>
            </div>
            <div class="cards-grid">${spacesHtml}</div>
        </section>
        <section class="section-panel" style="margin-top:1.5rem;">
            <div class="section-head"><h2 class="section-title">Recent discussions</h2></div>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">${threadsHtml}</div>
        </section>`;

    return _forumShell({ title: 'OpenVibe Forum', description: 'Community discussions on OpenVibe', active: 'home', bodyHtml });
}

function renderForumSpacePage(space, threads) {
    if (!space) {
        const bodyHtml = `<div class="empty-state"><h2>Space not found</h2><p><a class="link-inline" href="/forum">Back to forum</a></p></div>`;
        return _forumShell({ title: 'Space Not Found · OpenVibe Forum', active: 'threads', bodyHtml });
    }
    const name = escapeHtml(space.name || space.slug || 'Space');
    const threadsHtml = (threads || []).length
        ? (threads || []).map((t) => {
            const title = escapeHtml(t.title || 'Untitled');
            return `<a class="card" href="/forum/t/${encodeURIComponent(t.id)}" style="display:block;text-decoration:none;">
                <div class="card-kicker">${timeAgo(t.created_at)} · ${t.score > 0 ? `▲${t.score}` : `${t.score} pts`}</div>
                <div style="font-weight:600;margin-top:0.2rem;">${title}</div>
                ${t.body ? `<div style="color:var(--muted);font-size:0.85rem;margin-top:0.2rem;">${escapeHtml(String(t.body).slice(0, 100))}</div>` : ''}
            </a>`;
        }).join('')
        : `<div class="empty-state">No threads in this space yet.</div>`;

    const bodyHtml = `
        <section class="hero">
            <a class="link-inline" href="/forum" style="font-size:0.9rem;">← Forum home</a>
            <h1 class="page-title" style="margin-top:0.5rem;">${name}</h1>
            ${space.description ? `<p style="color:var(--muted);">${escapeHtml(space.description)}</p>` : ''}
        </section>
        <section class="section-panel">
            <div class="section-head"><h2 class="section-title">Threads</h2></div>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">${threadsHtml}</div>
        </section>`;
    return _forumShell({ title: `${name} · OpenVibe Forum`, description: space.description || name, active: 'threads', bodyHtml });
}

function renderForumThreadPage(thread, posts) {
    if (!thread) {
        const bodyHtml = `<div class="empty-state"><h2>Thread not found</h2><p><a class="link-inline" href="/forum">Back to forum</a></p></div>`;
        return _forumShell({ title: 'Not Found · OpenVibe Forum', active: 'threads', bodyHtml });
    }
    const title = escapeHtml(thread.title || 'Untitled');
    const postsHtml = (posts || []).length
        ? (posts || []).map((p) => `<div class="card">
            <div class="card-kicker">${escapeHtml(p.author_user_id || 'anonymous')} · ${timeAgo(p.created_at)}</div>
            <div style="margin-top:0.5rem;white-space:pre-wrap;">${escapeHtml(String(p.body || '').slice(0, 2000))}</div>
        </div>`).join('')
        : `<div class="empty-state">No replies yet.</div>`;

    const bodyHtml = `
        <section class="hero">
            <a class="link-inline" href="/forum" style="font-size:0.9rem;">← Forum home</a>
            <h1 class="page-title" style="margin-top:0.5rem;">${title}</h1>
            ${thread.body ? `<div class="card" style="margin-top:1rem;white-space:pre-wrap;">${escapeHtml(String(thread.body).slice(0, 2000))}</div>` : ''}
        </section>
        <section class="section-panel" style="margin-top:1.5rem;">
            <div class="section-head"><h2 class="section-title">${(posts || []).length} ${(posts || []).length === 1 ? 'reply' : 'replies'}</h2></div>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">${postsHtml}</div>
        </section>
        <section class="section-panel" style="margin-top:1.5rem;">
            <div class="section-head"><h2 class="section-title">Reply</h2></div>
            <div class="empty-state" style="text-align:left;">
                <p style="margin:0;"><a class="link-inline" href="${SIGN_IN_URL}">Sign in</a> to post a reply.</p>
            </div>
        </section>`;
    return _forumShell({ title: `${title} · OpenVibe Forum`, description: thread.body ? String(thread.body).slice(0, 160) : title, active: 'threads', bodyHtml });
}

