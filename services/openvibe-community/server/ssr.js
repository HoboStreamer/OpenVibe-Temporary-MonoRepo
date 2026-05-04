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

const COMMUNITY_URLS = Object.freeze({
    live:      resolvePublicOrigin({ surface: 'live' }),
    chat:      resolvePublicOrigin({ surface: 'chat' }),
    network:   resolvePublicOrigin({ surface: 'network' }),
    community: resolvePublicOrigin({ surface: 'community' }),
});

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
            background: radial-gradient(circle at top, rgba(34,211,238,0.12), transparent 30%),
                        linear-gradient(180deg, #020617 0%, #050916 32%, #0f172a 100%);
            color: var(--text);
            line-height: 1.6;
        }
        a { color: inherit; text-decoration: none; }
        .page { width: min(1080px, calc(100vw - 2rem)); margin: 0 auto; }
        .topbar {
            position: sticky; top: 0; z-index: 20;
            backdrop-filter: blur(18px);
            background: rgba(5,9,22,0.72);
            border-bottom: 1px solid rgba(255,255,255,0.08);
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
            background: linear-gradient(135deg, var(--accent-2), var(--accent));
            color: white;
        }
        .brand-name { font-weight: 800; letter-spacing: -0.03em; }
        .nav-links { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .nav-link {
            display: inline-flex; align-items: center; min-height: 2.4rem;
            padding: 0.55rem 0.9rem; border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.04); font-weight: 600;
            transition: border-color 0.15s, background 0.15s;
        }
        .nav-link:hover, .nav-link.active {
            border-color: rgba(34,211,238,0.35);
            background: rgba(34,211,238,0.08);
        }
        .nav-link.active { color: var(--accent); }
        main { padding: 1.5rem 0 4rem; }
        .hero { margin-bottom: 1.5rem; }
        .eyebrow {
            color: var(--accent); font-size: 0.78rem;
            text-transform: uppercase; letter-spacing: 0.14em;
            font-weight: 800; margin-bottom: 0.4rem;
        }
        .page-title { margin: 0; font-size: clamp(1.6rem,4vw,2.6rem); letter-spacing: -0.04em; }
        .page-sub { color: var(--muted); margin: 0.4rem 0 0; }
        .card-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
        .glass-card {
            border-radius: var(--radius);
            background: linear-gradient(180deg, rgba(15,23,42,0.9), rgba(7,13,28,0.94));
            border: 1px solid var(--border);
            padding: 1.1rem; display: grid; gap: 0.55rem;
        }
        .card-title { margin: 0; font-size: 1rem; line-height: 1.3; }
        .card-body { margin: 0; color: var(--muted); font-size: 0.9rem; }
        .pill {
            display: inline-flex; align-items: center; padding: 0.3rem 0.6rem;
            border-radius: 999px; font-size: 0.72rem; font-weight: 800;
            letter-spacing: 0.08em; text-transform: uppercase;
            background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08);
        }
        .pill.primary { background: rgba(34,211,238,0.14); border-color: rgba(34,211,238,0.28); }
        .pill.success { background: rgba(74,222,128,0.12); border-color: rgba(74,222,128,0.28); }
        .pill.warn    { background: rgba(251,191,36,0.12); border-color: rgba(251,191,36,0.28); }
        .pill-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .card-kicker { color: var(--muted); font-size: 0.82rem; }
        .link-inline { color: var(--accent); text-decoration: underline; text-underline-offset: 0.2em; }
        .empty-state {
            border-radius: var(--radius);
            background: rgba(15,23,42,0.5); border: 1px solid var(--border);
            padding: 2.5rem; text-align: center; color: var(--muted);
        }
        .section-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .section-title { margin: 0; font-size: 1.2rem; font-weight: 700; }
        .section-link {
            display: inline-flex; align-items: center; min-height: 2.2rem;
            padding: 0.5rem 0.85rem; border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.12); font-weight: 600;
            background: rgba(255,255,255,0.04); font-size: 0.88rem;
            transition: border-color 0.15s, background 0.15s;
        }
        .section-link:hover { border-color: var(--accent); background: rgba(34,211,238,0.08); }
        .search-bar { display: flex; gap: 0.7rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .filter-input {
            flex: 1; min-width: 200px; min-height: 2.8rem;
            padding: 0.75rem 0.9rem; border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.05); color: white;
        }
        .paste-content {
            background: rgba(2,6,23,0.92); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 18px; padding: 1.2rem;
            font-family: 'SFMono-Regular', Consolas, monospace;
            font-size: 0.88rem; overflow-x: auto;
            white-space: pre-wrap; word-break: break-word;
            color: #e2e8f0;
        }
        .data-points { display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fit, minmax(120px,1fr)); margin-top: 1rem; }
        .data-point { border-radius: 16px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); padding: 0.8rem; }
        .data-point-label { color: var(--muted); font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
        .data-point-value { margin-top: 0.25rem; font-size: 1rem; font-weight: 800; }
        footer.page { padding-bottom: 3rem; }
        .footer-row { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; padding: 1.5rem 0; border-top: 1px solid rgba(255,255,255,0.08); color: var(--muted); font-size: 0.88rem; }
        @media (max-width: 700px) { .topbar-inner { flex-wrap: wrap; justify-content: center; } }
    </style>`;
}

function _nav(active) {
    const items = [
        { href: '/pulse',   label: 'Pulse',   id: 'pulse'   },
        { href: '/threads', label: 'Threads', id: 'threads' },
        { href: '/pastes',  label: 'Pastes',  id: 'pastes'  },
    ];
    return items.map((item) => `<a class="nav-link${item.id === active ? ' active' : ''}" href="${item.href}">${item.label}</a>`).join('');
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
            <div>
                <a class="nav-link" href="${COMMUNITY_URLS.network}/auth/login">Sign in</a>
            </div>
        </div>
    </header>
    <main class="page">
        ${bodyHtml}
    </main>
    <footer class="page">
        <div class="footer-row">
            <span>OpenVibe Community</span>
            <a class="link-inline" href="${COMMUNITY_URLS.live}">openvibe.live</a>
            <a class="link-inline" href="${COMMUNITY_URLS.chat}">OpenVibe Chat</a>
            <a class="link-inline" href="/threads">Threads</a>
            <a class="link-inline" href="/pastes">Pastes</a>
            <a class="link-inline" href="${COMMUNITY_URLS.network}">Account</a>
        </div>
    </footer>
</body>
</html>`;
}

// ── thread card ───────────────────────────────────────────────────────────────
function _threadCard(thread) {
    const title = thread.title || 'Untitled thread';
    const href = `/threads/${encodeURIComponent(thread.id || thread.slug || '')}`;
    const bodyPreview = thread.body
        ? escapeHtml(String(thread.body).slice(0, 180)) + (thread.body.length > 180 ? '…' : '')
        : '';
    const category = thread.category || null;
    return `<article class="glass-card">
        <div class="pill-row">
            <span class="pill primary">Thread</span>
            ${category ? `<span class="pill">${escapeHtml(category)}</span>` : ''}
        </div>
        <a href="${escapeHtml(href)}"><h3 class="card-title">${escapeHtml(title)}</h3></a>
        ${bodyPreview ? `<p class="card-body">${bodyPreview}</p>` : ''}
        <div class="card-kicker">
            ${thread.post_count ? `${thread.post_count} post${thread.post_count === 1 ? '' : 's'} · ` : ''}
            ${timeAgo(thread.last_activity_at || thread.created_at)}
        </div>
    </article>`;
}

// ── paste card ────────────────────────────────────────────────────────────────
function _pasteCard(paste) {
    const title = paste.title || 'Untitled paste';
    const href  = `/p/${encodeURIComponent(paste.slug || paste.id || '')}`;
    const lang  = paste.language || 'txt';
    const preview = paste.content
        ? escapeHtml(String(paste.content).split('\n').slice(0, 4).join('\n')).replace(/\n/g, '<br>') + (paste.content.split('\n').length > 4 ? '\n…' : '')
        : '';
    return `<article class="glass-card">
        <div class="pill-row">
            <span class="pill success">Paste</span>
            <span class="pill">${escapeHtml(pasteLanguageLabel(lang))}</span>
            ${paste.visibility === 'public' ? '' : `<span class="pill warn">${escapeHtml(paste.visibility || 'unlisted')}</span>`}
        </div>
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
    const limit = opts.limit || 40;
    const items = (threads || []).slice(0, limit);
    const cardsHtml = items.map(_threadCard).join('');
    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Threads</h1>
            <p class="page-sub">Community discussions, Q&amp;A, and announcements from the OpenVibe network.</p>
        </section>
        <div class="section-head">
            <h2 class="section-title">${items.length} thread${items.length === 1 ? '' : 's'}</h2>
            <div style="display:flex;gap:.5rem">
                <a class="section-link" href="/pulse">View pulse</a>
                <a class="section-link" href="/pastes">Pastes</a>
            </div>
        </div>
        <div class="search-bar">
            <input class="filter-input" type="search" placeholder="Filter threads…" data-filter-input="threads" aria-label="Filter threads">
        </div>
        ${items.length
            ? `<div class="card-grid" id="threads-grid">
                ${items.map((t) => `<div data-filter-group="threads" data-filter-text="${escapeHtml((t.title || '') + ' ' + (t.category || '') + ' ' + (t.body || '').slice(0, 200))}">${_threadCard(t)}</div>`).join('')}
               </div>`
            : `<div class="empty-state"><p>No threads yet. Start a discussion on the network.</p><a class="link-inline" href="${COMMUNITY_URLS.network}">Go to network →</a></div>`}
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
        </script>`;
    return _shell({ title: 'Threads · OpenVibe Community', description: 'Community discussions from the OpenVibe network.', active: 'threads', bodyHtml });
}

// ── renderPastesPage ──────────────────────────────────────────────────────────
function renderPastesPage(pastes, opts) {
    opts = opts || {};
    const limit = opts.limit || 60;
    const items = (pastes || []).slice(0, limit);
    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Pastes</h1>
            <p class="page-sub">Public code snippets, configuration shares, and quick notes.</p>
        </section>
        <div class="section-head">
            <h2 class="section-title">${items.length} paste${items.length === 1 ? '' : 's'}</h2>
            <div style="display:flex;gap:.5rem">
                <a class="section-link" href="/pulse">View pulse</a>
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
    return _shell({ title: 'Pastes · OpenVibe Community', description: 'Public code snippets and notes from the OpenVibe network.', active: 'pastes', bodyHtml });
}

// ── renderPasteViewPage ───────────────────────────────────────────────────────
function renderPasteViewPage(paste, opts) {
    opts = opts || {};
    if (!paste) {
        const bodyHtml = `<div class="empty-state"><h2>Paste not found</h2><p>This paste may have been deleted or is not publicly visible.</p><a class="link-inline" href="/pastes">← Back to pastes</a></div>`;
        return _shell({ title: 'Not found · OpenVibe Community', active: 'pastes', bodyHtml });
    }
    const title = paste.title || 'Untitled paste';
    const lang  = paste.language || 'txt';
    const content = paste.content || '';
    const contentHtml = escapeHtml(content);
    const copyId = 'paste-content-pre';
    const expiresHtml = paste.expires_at
        ? `<div class="data-point"><div class="data-point-label">Expires</div><div class="data-point-value">${escapeHtml(new Date(paste.expires_at).toLocaleString())}</div></div>`
        : '';
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
        <div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap">
            <a class="section-link" href="/pastes">← All pastes</a>
            <a class="section-link" href="/pulse">Community pulse</a>
        </div>
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
    return _shell({ title: `${title} · OpenVibe Community`, description: paste.description || `${pasteLanguageLabel(lang)} paste`, canonical, active: 'pastes', bodyHtml });
}

// ── renderPulsePage ───────────────────────────────────────────────────────────
function renderPulsePage(threads, pastes, opts) {
    opts = opts || {};
    const threadItems = (threads || []).slice(0, 12);
    const pasteItems  = (pastes || []).slice(0, 12);

    const threadCardsHtml = threadItems.map(_threadCard).join('');
    const pasteCardsHtml  = pasteItems.map(_pasteCard).join('');

    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Community Pulse</h1>
            <p class="page-sub">Recent threads, pastes, and activity from the OpenVibe network.</p>
        </section>
        <div class="data-points" style="margin-bottom:1.5rem">
            <div class="data-point"><div class="data-point-label">Threads</div><div class="data-point-value">${threadItems.length}</div></div>
            <div class="data-point"><div class="data-point-label">Pastes</div><div class="data-point-value">${pasteItems.length}</div></div>
        </div>
        ${threadItems.length ? `
        <section style="margin-bottom:1.5rem">
            <div class="section-head">
                <h2 class="section-title">Recent threads</h2>
                <a class="section-link" href="/threads">All threads →</a>
            </div>
            <div class="card-grid">${threadCardsHtml}</div>
        </section>` : ''}
        ${pasteItems.length ? `
        <section>
            <div class="section-head">
                <h2 class="section-title">Recent pastes</h2>
                <a class="section-link" href="/pastes">All pastes →</a>
            </div>
            <div class="card-grid">${pasteCardsHtml}</div>
        </section>` : ''}
        ${!threadItems.length && !pasteItems.length ? `
        <div class="empty-state">
            <p>Nothing in the pulse yet. Community activity will appear here.</p>
            <a class="link-inline" href="${COMMUNITY_URLS.network}">Visit the network →</a>
        </div>` : ''}`;
    return _shell({ title: 'Community Pulse · OpenVibe Community', description: 'Recent threads and pastes from the OpenVibe network.', active: 'pulse', bodyHtml });
}

module.exports = {
    renderThreadsPage,
    renderPastesPage,
    renderPasteViewPage,
    renderPulsePage,
};
