'use strict';

const { resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');
const { renderIcon } = require('@openvibe/icons');

const COMMUNITY_URLS = Object.freeze({
    live:      resolvePublicOrigin({ surface: 'live' }),
    chat:      resolvePublicOrigin({ surface: 'chat' }),
    network:   resolvePublicOrigin({ surface: 'network' }),
    community: resolvePublicOrigin({ surface: 'community' }),
});

const SIGN_IN_URL = COMMUNITY_URLS.network && COMMUNITY_URLS.community
    ? `${COMMUNITY_URLS.network}/api/v1/session/bridge?return_to=${encodeURIComponent(COMMUNITY_URLS.community)}`
    : `${COMMUNITY_URLS.network || ''}/oauth/authorize`;

const ANON_URL = `${COMMUNITY_URLS.network || ''}/oauth/authorize?prompt=anonymous`;

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
    if (delta < 60)    return delta + 's ago';
    if (delta < 3600)  return Math.floor(delta / 60) + 'm ago';
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

function _styles() {
    return `<style>
        :root {
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
        .pill.warn    { background: rgba(251,191,36,0.12);  border-color: rgba(251,191,36,0.28); }
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
        .ov-nav-avatar {
            width: 26px; height: 26px; border-radius: 50%;
            object-fit: cover; display: block; flex-shrink: 0;
        }
        .ov-nav-initials {
            width: 26px; height: 26px; border-radius: 50%;
            background: linear-gradient(135deg, var(--accent, #22d3ee), #4f46e5);
            color: #fff; font-size: 0.65rem; font-weight: 800;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; letter-spacing: 0.02em;
        }
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

function _forumNav(active) {
    const items = [
        { href: '/forum',                          label: 'Home',    id: 'home',    icon: 'events' },
        { href: '/threads',                        label: 'Threads', id: 'threads', icon: 'chat'   },
        { href: '/pastes',                         label: 'Pastes',  id: 'pastes',  icon: 'codes'  },
        { href: COMMUNITY_URLS.community + '/pulse', label: 'Pulse', id: 'pulse',   icon: 'events' },
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
    <script src="/assets/openvibe.js" defer></script>
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
            <div id="ov-nav-session"></div>
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
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof OpenVibe === 'undefined') return;
        OpenVibe.primeEnvironment().catch(function(){});
        OpenVibe.renderChrome('community').catch(function(){});
    });
    </script>
</body>
</html>`;
}

module.exports = {
    COMMUNITY_URLS,
    SIGN_IN_URL,
    ANON_URL,
    escapeHtml,
    timeAgo,
    pasteLanguageLabel,
    _styles,
    _nav,
    _head,
    _shell,
    _threadCard,
    _pasteCard,
    _forumNav,
    _forumShell,
};
