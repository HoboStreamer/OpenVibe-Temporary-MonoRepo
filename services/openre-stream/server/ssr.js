'use strict';

/**
 * ssr.js — openre.stream SSR HTML pages
 *
 * Routes wired in index.js:
 *   GET /dashboard   — authenticated creator dashboard
 *   GET /            — landing page (if no static/index.html redirect overrides)
 *
 * The landing page is served from public/index.html via express.static.
 * The dashboard route is server-rendered here and gated by auth.
 */

const { resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');
const { renderIcon } = require('@openvibe/icons');

const URLS = Object.freeze({
    live:    resolvePublicOrigin({ surface: 'live' }),
    network: resolvePublicOrigin({ surface: 'network' }),
    community: resolvePublicOrigin({ surface: 'community' }),
});

// ── helpers ───────────────────────────────────────────────────────────────────
function esc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

function pill(label, tone) {
    return `<span class="pill ${esc(tone || '')}">${esc(label)}</span>`;
}

// ── styles ────────────────────────────────────────────────────────────────────
function _styles() {
    return `<style>
        :root {
            --bg: #050916; --border: rgba(255,255,255,0.1); --text: #f8fafc;
            --muted: #94a3b8; --accent: #22d3ee; --accent-2: #8b5cf6;
            --radius: 24px; color-scheme: dark;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: radial-gradient(circle at top, rgba(34,211,238,0.12), transparent 28%),
                        linear-gradient(180deg, #020617 0%, #050916 32%, #0f172a 100%);
            color: var(--text); line-height: 1.6;
        }
        a { color: inherit; text-decoration: none; }
        .page { width: min(1120px, calc(100vw - 2rem)); margin: 0 auto; }
        .topbar {
            position: sticky; top: 0; z-index: 20;
            backdrop-filter: blur(18px);
            background: rgba(5,9,22,0.72); border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .topbar-inner { display: flex; gap: 1rem; align-items: center; justify-content: space-between; padding: 0.9rem 0; }
        .brand { display: inline-flex; align-items: center; gap: 0.7rem; }
        .brand-mark {
            display: inline-grid; place-items: center; width: 2.5rem; height: 2.5rem;
            border-radius: 14px; font-weight: 800; font-size: 0.85rem;
            background: linear-gradient(135deg, var(--accent-2), var(--accent)); color: white;
        }
        .brand-name { font-weight: 800; letter-spacing: -0.03em; }
        .nav-links { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .nav-link {
            display: inline-flex; align-items: center; min-height: 2.4rem;
            padding: 0.5rem 0.9rem; border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.04); font-weight: 600; font-size: 0.9rem;
            transition: border-color 0.15s, background 0.15s;
        }
        .nav-link:hover { border-color: rgba(34,211,238,0.35); background: rgba(34,211,238,0.08); }
        main { padding: 1.5rem 0 4rem; }
        .eyebrow {
            color: var(--accent); font-size: 0.78rem; text-transform: uppercase;
            letter-spacing: 0.14em; font-weight: 800; margin-bottom: 0.4rem;
        }
        .page-title { margin: 0; font-size: clamp(1.5rem,3.5vw,2.4rem); letter-spacing: -0.04em; }
        .page-sub { color: var(--muted); margin: 0.4rem 0 0; }
        .grid2 { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
        .grid3 { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
        .glass-card {
            border-radius: var(--radius);
            background: linear-gradient(180deg, rgba(15,23,42,0.9), rgba(7,13,28,0.94));
            border: 1px solid var(--border); padding: 1.1rem;
        }
        .card-title { margin: 0 0 0.4rem; font-size: 1rem; }
        .card-body { margin: 0; color: var(--muted); font-size: 0.9rem; }
        .pill {
            display: inline-flex; align-items: center; padding: 0.28rem 0.55rem;
            border-radius: 999px; font-size: 0.72rem; font-weight: 800;
            letter-spacing: 0.08em; text-transform: uppercase;
            background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08);
        }
        .pill.live    { background: rgba(34,211,238,0.14); border-color: rgba(34,211,238,0.28); }
        .pill.success { background: rgba(74,222,128,0.12); border-color: rgba(74,222,128,0.28); }
        .pill.warn    { background: rgba(251,191,36,0.12); border-color: rgba(251,191,36,0.28); }
        .pill.soft    { color: var(--muted); }
        .pill-row { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
        .muted { color: var(--muted); }
        .kicker { color: var(--muted); font-size: 0.82rem; margin-top: 0.35rem; }
        .link-inline { color: var(--accent); text-decoration: underline; text-underline-offset: 0.2em; }
        .section-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin: 1.5rem 0 0.8rem; }
        .section-title { margin: 0; font-size: 1.1rem; font-weight: 700; }
        .btn {
            display: inline-flex; align-items: center; min-height: 2.4rem;
            padding: 0.5rem 1rem; border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.04); font-weight: 700; font-size: 0.88rem; color: white;
            text-decoration: none; cursor: pointer;
            transition: border-color 0.15s, background 0.15s;
        }
        .btn:hover { border-color: var(--accent); background: rgba(34,211,238,0.1); }
        .btn.primary { background: linear-gradient(135deg,rgba(139,92,246,.85),rgba(34,211,238,.7)); border-color: transparent; }
        .data-points { display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); margin-top: 1rem; }
        .dp { border-radius: 16px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); padding: 0.8rem; }
        .dp-label { color: var(--muted); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
        .dp-value { margin-top: 0.25rem; font-size: 1rem; font-weight: 800; }
        .code-block {
            font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.82rem;
            background: rgba(2,6,23,0.9); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px; padding: 0.7rem 0.9rem; word-break: break-all; color: #e2e8f0;
        }
        .empty-state { border-radius: var(--radius); background: rgba(15,23,42,0.5); border: 1px solid var(--border); padding: 2rem; text-align: center; color: var(--muted); }
        footer.page { padding-bottom: 3rem; }
        .footer-row { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; padding: 1.5rem 0; border-top: 1px solid rgba(255,255,255,0.08); color: var(--muted); font-size: 0.88rem; }
        @media (max-width: 700px) { .topbar-inner { flex-wrap: wrap; justify-content: center; } }
        /* ── Dashboard two-panel layout ────────────────────────────────────── */
        .dash-page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
        .dash-header-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; margin-top: 0.4rem; }
        .dash-layout { display: grid; grid-template-columns: 260px 1fr; gap: 0; min-height: 540px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.09); background: rgba(7,13,28,0.72); overflow: hidden; }
        .dash-sidebar { border-right: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; background: rgba(5,9,22,0.6); }
        .dash-sidebar-head { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem 0.65rem; border-bottom: 1px solid rgba(255,255,255,0.07); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
        .dash-sidebar-label { display: flex; align-items: center; gap: 0.4rem; }
        .dash-add-btn { width: 24px; height: 24px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); color: white; font-size: 1rem; line-height: 1; display: grid; place-items: center; font-weight: 700; text-decoration: none; transition: background 0.15s, border-color 0.15s; }
        .dash-add-btn:hover { background: rgba(34,211,238,0.15); border-color: rgba(34,211,238,0.4); }
        .dash-slots { flex: 1; overflow-y: auto; padding: 0.5rem 0; }
        .dash-slot-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.65rem 1rem; cursor: pointer; border-left: 2px solid transparent; transition: background 0.12s, border-color 0.12s; }
        .dash-slot-item:hover { background: rgba(255,255,255,0.04); }
        .dash-slot-item.active { background: rgba(34,211,238,0.07); border-left-color: var(--accent); }
        .dash-slot-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: rgba(255,255,255,0.2); transition: background 0.2s; }
        .dash-slot-dot.live { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.6); }
        .dash-slot-info { flex: 1; min-width: 0; }
        .dash-slot-title { font-size: 0.88rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dash-slot-meta { font-size: 0.73rem; color: var(--muted); display: flex; align-items: center; gap: 0.35rem; margin-top: 0.1rem; }
        .dash-slot-proto { display: inline-flex; align-items: center; padding: 0.1rem 0.4rem; border-radius: 4px; background: rgba(255,255,255,0.07); font-size: 0.67rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }
        .dash-slot-proto.whip { color: #22d3ee; } .dash-slot-proto.rtmp { color: #f97316; } .dash-slot-proto.browser { color: #a78bfa; } .dash-slot-proto.cli { color: #94a3b8; }
        .dash-slot-empty { padding: 0.9rem 1rem; color: var(--muted); font-size: 0.82rem; }
        .dash-sidebar-sect-head { padding: 0.6rem 1rem 0.4rem; border-top: 1px solid rgba(255,255,255,0.07); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
        .dash-dest-sidebar { overflow-y: auto; max-height: 130px; padding-bottom: 0.5rem; }
        .dash-dest-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 1rem; font-size: 0.82rem; cursor: default; }
        .dash-dest-badge { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; padding: 0.1rem 0.35rem; border-radius: 4px; background: rgba(139,92,246,0.18); color: #a78bfa; flex-shrink: 0; }
        .dash-dest-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dash-main { display: flex; flex-direction: column; min-width: 0; }
        .dash-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8rem; padding: 3rem 2rem; text-align: center; color: var(--muted); }
        .dash-empty h3 { margin: 0; font-size: 1.3rem; color: var(--text); } .dash-empty p { margin: 0; font-size: 0.9rem; }
        .dash-channel-editor { padding: 1.2rem 1.4rem; flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
        .dash-channel-hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; gap: 0.8rem; }
        .dash-channel-name { font-size: 1.1rem; font-weight: 800; margin-bottom: 0.2rem; }
        .dash-channel-url { font-size: 0.8rem; color: var(--muted); font-family: ui-monospace, Consolas, monospace; transition: color 0.15s; }
        .dash-channel-url:hover { color: var(--accent); }
        .dash-view-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.85rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); font-size: 0.82rem; font-weight: 700; color: var(--muted); white-space: nowrap; transition: border-color 0.15s, background 0.15s, color 0.15s; }
        .dash-view-btn:hover { border-color: rgba(34,211,238,0.4); background: rgba(34,211,238,0.08); color: white; }
        .dash-tabs { display: flex; margin-bottom: 1.2rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .dash-tab { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.65rem 1rem; font-size: 0.84rem; font-weight: 700; color: var(--muted); border: none; background: none; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.15s, border-color 0.15s; }
        .dash-tab:hover { color: var(--text); } .dash-tab.active { color: var(--text); border-bottom-color: var(--accent); }
        .dash-tab-content { flex: 1; }
        .dash-form { display: flex; flex-direction: column; gap: 0.9rem; }
        .dash-field-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .dash-field-lbl { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
        .dash-input { width: 100%; padding: 0.7rem 0.85rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: white; font-size: 0.9rem; font-family: inherit; transition: border-color 0.15s, background 0.15s; box-sizing: border-box; }
        .dash-input:focus { outline: none; border-color: rgba(34,211,238,0.5); background: rgba(34,211,238,0.04); }
        .dash-input::placeholder { color: rgba(148,163,184,0.5); }
        .dash-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.75rem center; padding-right: 2.2rem; }
        .dash-checkbox { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; cursor: pointer; }
        .dash-checkbox input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); }
        .dash-key-row { display: flex; align-items: center; gap: 0.4rem; }
        .dash-key-input { flex: 1; font-family: ui-monospace, Consolas, monospace; font-size: 0.82rem; }
        .dash-icon-btn { width: 34px; height: 34px; flex-shrink: 0; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: var(--muted); cursor: pointer; display: grid; place-items: center; transition: border-color 0.15s, color 0.15s, background 0.15s; }
        .dash-icon-btn:hover { border-color: rgba(255,255,255,0.25); color: white; background: rgba(255,255,255,0.08); }
        .dash-icon-btn-danger:hover { border-color: rgba(248,113,113,0.5); color: #f87171; background: rgba(248,113,113,0.08); }
        .dash-form-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; }
        .dash-btn-primary { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.6rem 1.2rem; border-radius: 999px; font-weight: 700; font-size: 0.88rem; background: linear-gradient(135deg, rgba(139,92,246,0.9), rgba(34,211,238,0.75)); border: none; color: white; cursor: pointer; transition: opacity 0.15s, transform 0.15s; }
        .dash-btn-primary:hover { opacity: 0.88; transform: translateY(-1px); } .dash-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .dash-status { font-size: 0.82rem; color: var(--muted); } .dash-status.ok { color: #4ade80; } .dash-status.err { color: #f87171; }
        .dash-endpoint-row { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.75rem; }
        .dash-endpoint-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800; color: var(--muted); }
        .dash-endpoint-value-row { display: flex; align-items: center; gap: 0.4rem; }
        .dash-endpoint-code { flex: 1; padding: 0.65rem 0.85rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.09); background: rgba(0,0,0,0.3); font-size: 0.8rem; font-family: ui-monospace, Consolas, monospace; color: #e2e8f0; word-break: break-all; min-width: 0; }
        .dash-dest-list-item { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.65rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .dash-dest-list-item:last-child { border-bottom: none; }
        .dash-dest-add-sect { margin-top: 1.25rem; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 1rem; }
        .dash-sect-label { font-size: 0.9rem; font-weight: 800; margin-bottom: 0.8rem; }
        .dash-history-item { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.7rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .dash-history-item:last-child { border-bottom: none; }
        .dash-history-title { font-size: 0.9rem; font-weight: 600; }
        .dash-history-meta { font-size: 0.78rem; color: var(--muted); margin-top: 0.1rem; }
        .dash-note { color: var(--muted); font-size: 0.88rem; margin: 0; }
        .bcast-layout { display: grid; grid-template-columns: 1fr 280px; gap: 1rem; }
        .bcast-preview-wrap { position: relative; background: #000; border-radius: 8px; overflow: hidden; aspect-ratio: 16/9; }
        .bcast-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
        .bcast-pip-overlay { position: absolute; bottom: .5rem; right: .5rem; width: 25%; aspect-ratio: 16/9; border-radius: 4px; overflow: hidden; border: 2px solid rgba(255,255,255,0.4); }
        .bcast-pip-video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .bcast-live-badge { position: absolute; top: .5rem; left: .5rem; background: #ef4444; color: #fff; font-size: .7rem; font-weight: 700; letter-spacing: .06em; padding: .2rem .5rem; border-radius: 4px; display: flex; align-items: center; gap: .3rem; }
        .bcast-controls { display: flex; flex-direction: column; gap: .8rem; }
        .bcast-source-btn.active { background: var(--accent); color: #fff; }
        .bcast-live-row { display: flex; align-items: center; gap: .5rem; font-size: .82rem; color: #4ade80; font-weight: 600; }
        .bcast-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: bcast-pulse 1.2s infinite; }
        .bcast-timer { font-variant-numeric: tabular-nums; }
        @keyframes bcast-pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        @media (max-width: 700px) {
            .dash-layout { grid-template-columns: 1fr; }
            .dash-sidebar { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); max-height: 200px; }
            .dash-page-header { flex-direction: column; }
            .bcast-layout { grid-template-columns: 1fr; }
        }
    </style>`;
}

function _shell({ title, bodyHtml, user, extraScripts }) {
    const displayName = user && (user.display_name || user.username) || null;
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%238b5cf6'/%3E%3Cstop offset='100%25' stop-color='%2322d3ee'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial,sans-serif' font-size='20' font-weight='700' fill='white'%3EOR%3C/text%3E%3C/svg%3E">
    <title>${esc(title || 'OpenRe.Stream')}</title>
    ${_styles()}
    <link rel="stylesheet" href="/assets/openvibe-icons.css">
    <script src="/assets/openvibe-icons.js" defer></script>
</head>
<body>
    <header class="topbar">
        <div class="page topbar-inner">
            <a class="brand" href="/">
                <span class="brand-mark">OR</span>
                <span class="brand-name">openre.stream</span>
            </a>
            <nav class="nav-links">
                <a class="nav-link ov-icon-label" href="/dashboard">${renderIcon('restream', { decorative: true })}<span>Dashboard</span></a>
                <a class="nav-link ov-icon-label" href="${URLS.live}">${renderIcon('live', { decorative: true })}<span>openvibe.live</span></a>
                <a class="nav-link ov-icon-label" href="${URLS.network}">${renderIcon('my', { decorative: true })}<span>Account</span></a>
            </nav>
            <div>
                ${displayName
                    ? `<span class="nav-link">${esc(displayName)}</span>`
                    : `<a class="nav-link" href="/auth/login">Sign in</a>`}
            </div>
        </div>
    </header>
    <main class="page">
        ${bodyHtml}
    </main>
    <footer class="page">
        <div class="footer-row">
            <span>OpenRe.Stream — stream routing &amp; ingest control</span>
            <a class="link-inline" href="${URLS.live}">openvibe.live</a>
            <a class="link-inline" href="${URLS.network}">Network account</a>
            <a class="link-inline" href="/health">Health</a>
        </div>
    </footer>
    ${extraScripts || ''}
</body>
</html>`;
}

// ── dashboard ─────────────────────────────────────────────────────────────────
function renderDashboard({ user, channels, destinations, streams, outputs, ingestConfig }) {
    channels     = channels     || [];
    destinations = destinations || [];
    streams      = streams      || [];
    ingestConfig = ingestConfig || {};

    const rtmpBase = ingestConfig.rtmpBase || '';
    const whipBase = ingestConfig.whipBase || '';
    const userId   = String((user && (user.id || user.sub)) || '');

    // Build channel slot items for sidebar
    const channelSlotsHtml = channels.length
        ? channels.map((c, i) => {
            const proto   = ((c.metadata && c.metadata.default_protocol) || 'rtmp').toLowerCase();
            const isLive  = !!c.is_live;
            const active  = i === 0 ? ' active' : '';
            return `<div class="dash-slot-item${active}" data-slot="${esc(c.slug)}">
                <div class="dash-slot-dot${isLive ? ' live' : ''}"></div>
                <div class="dash-slot-info">
                    <div class="dash-slot-title">${esc(c.display_name || c.slug)}</div>
                    <div class="dash-slot-meta">
                        <span class="dash-slot-proto ${esc(proto)}">${esc(proto.toUpperCase())}</span>
                        <span>/${esc(c.slug)}</span>
                    </div>
                </div>
            </div>`;
        }).join('')
        : `<div class="dash-slot-empty">No channels — <a href="${esc(URLS.live)}/go-live" class="link-inline">create one</a>.</div>`;

    // Build destination sidebar items
    const destSidebarHtml = destinations.length
        ? destinations.map((d) => `<div class="dash-dest-item">
            <span class="dash-dest-badge">${esc(d.kind || 'rtmp')}</span>
            <span class="dash-dest-name">${esc(d.label || d.kind || 'Destination')}</span>
        </div>`).join('')
        : '<div class="dash-slot-empty" style="font-size:.78rem">None yet</div>';

    // Safe JSON for embedded state
    const safeJson = JSON.stringify({
        channels: channels.map((c) => ({
            slug:             c.slug,
            display_name:     c.display_name || c.slug,
            description:      c.description || (c.metadata && c.metadata.description) || '',
            is_live:          !!c.is_live,
            stream_key:       c.stream_key || c.default_stream_key || (c.metadata && c.metadata.stream_key) || '',
            default_protocol: (c.metadata && c.metadata.default_protocol) || 'rtmp',
            rtmp_url:         rtmpBase ? `${rtmpBase.replace(/\/$/, '')}/${c.slug}` : '',
            whip_url:         whipBase ? `${whipBase.replace(/\/$/, '')}/${c.slug}` : '',
            channel_url:      `${URLS.live}/@${c.slug}`,
        })),
        destinations: destinations.map((d) => ({
            id:         d.id,
            kind:       d.kind || 'custom',
            label:      d.label || d.kind || 'Destination',
            target_url: d.target_url || '',
            enabled:    d.enabled !== false,
            created_at: d.created_at,
        })),
        streams: streams.map((s) => ({
            id:           s.id,
            title:        s.title || 'Untitled stream',
            status:       s.status || 'idle',
            is_live:      !!s.is_live,
            channel_slug: s.channel_slug || '',
            started_at:   s.started_at,
            created_at:   s.created_at,
        })),
        live_url:    URLS.live,
        user_id:     userId,
    }).replace(/<\/script>/gi, '<\\/script>').replace(/<!--/g, '<\\!--');

    const bodyHtml = `
        <div class="dash-page-header">
            <div>
                <div class="eyebrow">Control room</div>
                <h1 class="page-title">Stream manager</h1>
                <p class="page-sub">Ingest, destinations, and broadcasts for <strong>${esc(user && (user.display_name || user.username) || 'your account')}</strong>.</p>
            </div>
            <div class="dash-header-actions">
                <a class="btn" href="${esc(URLS.live)}">openvibe.live</a>
                <a class="btn" href="${esc(URLS.live)}/go-live">Go Live</a>
            </div>
        </div>

        <div class="dash-layout">
            <!-- SIDEBAR -->
            <aside class="dash-sidebar">
                <div class="dash-sidebar-head">
                    <span class="dash-sidebar-label">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
                        My Channels
                    </span>
                    <a class="dash-add-btn" href="${esc(URLS.live)}/go-live" title="Create new channel">+</a>
                </div>
                <div class="dash-slots" id="dash-slots">${channelSlotsHtml}</div>
                <div class="dash-sidebar-sect-head">Destinations</div>
                <div class="dash-dest-sidebar" id="dash-dest-sidebar">${destSidebarHtml}</div>
            </aside>

            <!-- MAIN PANEL -->
            <div class="dash-main">
                <!-- No channel selected / empty state -->
                <div class="dash-empty" id="dash-no-channel"${channels.length ? ' style="display:none"' : ''}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:rgba(34,211,238,0.4)"><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>
                    <h3>Stream manager</h3>
                    <p>Select a channel from the sidebar to view ingest details, manage destinations, and review recent streams.</p>
                    <a class="btn" href="${esc(URLS.live)}/go-live">+ Create channel</a>
                </div>

                <!-- Channel editor -->
                <div class="dash-channel-editor" id="dash-channel-editor"${!channels.length ? ' style="display:none"' : ''}>
                    <div class="dash-channel-hdr">
                        <div>
                            <div class="dash-channel-name" id="dash-ch-name"></div>
                            <a class="dash-channel-url" id="dash-ch-url" href="#" target="_blank"></a>
                        </div>
                        <a class="dash-view-btn" id="dash-ch-live-link" href="#" target="_blank">
                            View Live
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                        </a>
                    </div>

                    <!-- Tab bar -->
                    <div class="dash-tabs">
                        <button class="dash-tab active" data-tab="ingest">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                            Ingest
                        </button>
                        <button class="dash-tab" data-tab="settings">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            Settings
                        </button>
                        <button class="dash-tab" data-tab="destinations">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                            Destinations
                        </button>
                        <button class="dash-tab" data-tab="streams">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>
                            Streams
                        </button>
                        <button class="dash-tab" data-tab="broadcast">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
                            Broadcast
                        </button>
                    </div>

                    <!-- Ingest tab -->
                    <div class="dash-tab-content" id="dash-panel-ingest">
                        <div id="dash-ingest-details"><p class="dash-note">Loading…</p></div>
                    </div>

                    <!-- Settings tab -->
                    <div class="dash-tab-content" id="dash-panel-settings" style="display:none">
                        <form id="dash-settings-form" class="dash-form">
                            <input type="hidden" name="slug">
                            <label class="dash-field-group">
                                <span class="dash-field-lbl">DISPLAY NAME</span>
                                <input class="dash-input" type="text" name="display_name" autocomplete="off">
                            </label>
                            <label class="dash-field-group">
                                <span class="dash-field-lbl">DESCRIPTION</span>
                                <textarea class="dash-input" name="description" rows="2"></textarea>
                            </label>
                            <div class="dash-field-group">
                                <div class="dash-field-lbl">STREAM KEY</div>
                                <div class="dash-key-row">
                                    <input class="dash-input dash-key-input" type="password" name="stream_key" id="dash-sk-input" readonly placeholder="••••••••••••">
                                    <button type="button" class="dash-icon-btn" id="dash-sk-toggle" title="Show/hide key">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    </button>
                                    <button type="button" class="dash-icon-btn" id="dash-sk-copy" title="Copy key">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    </button>
                                    <button type="button" class="dash-icon-btn dash-icon-btn-danger" id="dash-sk-regen" title="Regenerate key">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                    </button>
                                </div>
                            </div>
                            <div class="dash-form-actions">
                                <button class="dash-btn-primary" type="submit">Save changes</button>
                                <span id="dash-settings-status" class="dash-status"></span>
                            </div>
                        </form>
                    </div>

                    <!-- Destinations tab -->
                    <div class="dash-tab-content" id="dash-panel-destinations" style="display:none">
                        <div id="dash-dest-list"></div>
                        <div class="dash-dest-add-sect">
                            <div class="dash-sect-label">Add destination</div>
                            <form id="dash-dest-form" class="dash-form">
                                <div class="dash-field-group">
                                    <span class="dash-field-lbl">KIND</span>
                                    <select class="dash-input dash-select" name="kind">
                                        <option value="custom">Custom RTMP</option>
                                        <option value="youtube">YouTube</option>
                                        <option value="twitch">Twitch</option>
                                        <option value="kick">Kick</option>
                                        <option value="facebook">Facebook</option>
                                    </select>
                                </div>
                                <label class="dash-field-group">
                                    <span class="dash-field-lbl">LABEL</span>
                                    <input class="dash-input" type="text" name="label" placeholder="e.g. My Twitch stream" required>
                                </label>
                                <label class="dash-field-group">
                                    <span class="dash-field-lbl">TARGET URL</span>
                                    <input class="dash-input" type="url" name="target_url" placeholder="rtmp://live.twitch.tv/live" required>
                                </label>
                                <label class="dash-field-group">
                                    <span class="dash-field-lbl">STREAM KEY</span>
                                    <input class="dash-input" type="text" name="target_key" placeholder="Destination stream key">
                                </label>
                                <label class="dash-checkbox">
                                    <input type="checkbox" name="enabled" value="1" checked>
                                    <span>Enabled</span>
                                </label>
                                <div class="dash-form-actions">
                                    <button class="dash-btn-primary" type="submit">Save destination</button>
                                    <span id="dash-dest-status" class="dash-status"></span>
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- Streams tab -->
                    <div class="dash-tab-content" id="dash-panel-streams" style="display:none">
                        <div id="dash-streams-list"><p class="dash-note">No streams loaded yet.</p></div>
                    </div>

                    <!-- Broadcast tab -->
                    <div class="dash-tab-content" id="dash-panel-broadcast" style="display:none">
                        <div class="bcast-layout">
                            <div class="bcast-preview-wrap">
                                <video id="bcast-preview" class="bcast-preview" autoplay muted playsinline></video>
                                <div id="bcast-pip-overlay" class="bcast-pip-overlay" style="display:none">
                                    <video id="bcast-pip-video" class="bcast-pip-video" autoplay muted playsinline></video>
                                </div>
                                <div id="bcast-live-badge" class="bcast-live-badge" style="display:none">
                                    <span class="bcast-dot"></span> LIVE
                                </div>
                            </div>
                            <div class="bcast-controls">
                                <div class="dash-field-group">
                                    <div class="dash-field-label">SOURCE</div>
                                    <div style="display:flex;gap:.4rem;flex-wrap:wrap">
                                        <button type="button" class="btn bcast-source-btn active" data-source="camera">Camera</button>
                                        <button type="button" class="btn bcast-source-btn" data-source="screen">Screen</button>
                                        <button type="button" class="btn bcast-source-btn" data-source="screen+camera">Screen + Cam</button>
                                    </div>
                                </div>
                                <div id="bcast-video-group" class="dash-field-group">
                                    <div class="dash-field-label">CAMERA</div>
                                    <select id="bcast-video-select" class="dash-input">
                                        <option value="">Default camera</option>
                                    </select>
                                </div>
                                <div class="dash-field-group">
                                    <div class="dash-field-label">MICROPHONE</div>
                                    <select id="bcast-audio-select" class="dash-input">
                                        <option value="">Default microphone</option>
                                    </select>
                                </div>
                                <div class="dash-field-group">
                                    <div class="dash-field-label">QUALITY</div>
                                    <div style="display:flex;gap:.4rem;flex-wrap:wrap">
                                        <select id="bcast-res" class="dash-input" style="flex:1;min-width:100px">
                                            <option value="1280x720">720p</option>
                                            <option value="1920x1080">1080p</option>
                                            <option value="854x480">480p</option>
                                        </select>
                                        <select id="bcast-fps" class="dash-input" style="width:70px">
                                            <option value="30">30fps</option>
                                            <option value="60">60fps</option>
                                            <option value="24">24fps</option>
                                        </select>
                                    </div>
                                </div>
                                <div id="bcast-idle-controls">
                                    <button type="button" id="bcast-start-btn" class="btn btn-primary" style="width:100%;justify-content:center">
                                        &#9654; Start Broadcast
                                    </button>
                                    <p id="bcast-note" class="dash-note" style="margin-top:.5rem"></p>
                                </div>
                                <div id="bcast-live-controls" style="display:none">
                                    <div class="bcast-live-row">
                                        <span class="bcast-dot"></span>
                                        <span id="bcast-timer" class="bcast-timer">00:00</span>
                                    </div>
                                    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.6rem">
                                        <button type="button" id="bcast-mute-video" class="btn">Cam On</button>
                                        <button type="button" id="bcast-mute-audio" class="btn">Mic On</button>
                                        <button type="button" id="bcast-end-btn" class="btn" style="margin-left:auto;color:#f87171;border-color:rgba(248,113,113,0.3)">End Broadcast</button>
                                    </div>
                                </div>
                                <span id="bcast-status" class="dash-status" style="margin-top:.5rem;display:block"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script>window.__DASH_DATA__ = ${safeJson};</script>
    `;

    return _shell({ title: 'Dashboard · OpenRe.Stream', user, bodyHtml, extraScripts: '<script src="/js/dashboard.js?v=20260603-1"></script>' });
}

// ── auth gate (anonymous access to /dashboard) ────────────────────────────────
function renderDashboardAuthGate({ returnUrl }) {
    const loginHref = `/auth/login?return_to=${encodeURIComponent(returnUrl || '/dashboard')}`;
    const bodyHtml = `
        <div class="empty-state" style="max-width:520px;margin:4rem auto;padding:2.5rem">
            <div class="eyebrow">Authentication required</div>
            <h2 style="margin:0 0 .6rem;font-size:1.5rem">Sign in to view your dashboard</h2>
            <p>The stream dashboard shows your channels, ingest details, destinations, and recent broadcasts. Sign in with your OpenVibe account to continue.</p>
            <div style="margin-top:1.2rem;display:flex;gap:.7rem;flex-wrap:wrap;justify-content:center">
                <a class="btn primary" href="${esc(loginHref)}">Sign in with OpenVibe</a>
                <a class="btn" href="/">Back to landing page</a>
            </div>
        </div>`;
    return _shell({ title: 'Sign in · OpenRe.Stream', bodyHtml });
}

module.exports = {
    renderDashboard,
    renderDashboardAuthGate,
};
