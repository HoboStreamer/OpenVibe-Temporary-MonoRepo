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
</head>
<body>
    <header class="topbar">
        <div class="page topbar-inner">
            <a class="brand" href="/">
                <span class="brand-mark">OR</span>
                <span class="brand-name">openre.stream</span>
            </a>
            <nav class="nav-links">
                <a class="nav-link" href="/dashboard">Dashboard</a>
                <a class="nav-link" href="${URLS.live}">openvibe.live</a>
                <a class="nav-link" href="${URLS.network}">Account</a>
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
    channels = channels || [];
    destinations = destinations || [];
    streams = streams || [];
    outputs = outputs || [];
    ingestConfig = ingestConfig || {};

    const rtmpBase = ingestConfig.rtmpBase || '';
    const whipBase = ingestConfig.whipBase || '';

    // channels section
    const channelCardsHtml = channels.length
        ? channels.map((c) => {
            const streamKey = c.stream_key || c.default_stream_key || (c.metadata && c.metadata.stream_key) || '';
            const rtmpUrl   = rtmpBase ? `${rtmpBase.replace(/\/$/, '')}/${esc(c.slug || '')}` : '';
            const whipUrl   = whipBase ? `${whipBase.replace(/\/$/, '')}/${esc(c.slug || '')}` : '';
            return `<article class="glass-card" data-channel-slug="${esc(c.slug)}">
                <div class="pill-row">
                    ${c.is_live ? pill('Live', 'live') : pill('Offline', 'soft')}
                </div>
                <h3 class="card-title">${esc(c.display_name || c.slug)}</h3>
                <p class="muted">@${esc(c.slug)}</p>
                ${c.description ? `<p class="card-body">${esc(c.description)}</p>` : ''}
                ${rtmpUrl ? `<div style="margin-top:.7rem"><div class="dp-label">RTMP URL</div>
                    <div style="display:flex;gap:.4rem;align-items:center;">
                        <div class="code-block" style="flex:1">${esc(rtmpUrl)}</div>
                        <button class="btn" data-dash-action="copy" data-copy="${esc(rtmpUrl)}" style="padding:.2rem .6rem;font-size:.75rem;">Copy</button>
                    </div></div>` : ''}
                ${streamKey ? `<div style="margin-top:.5rem"><div class="dp-label">Stream key</div>
                    <div style="display:flex;gap:.4rem;align-items:center;">
                        <div class="code-block" style="flex:1" data-stream-key="${esc(streamKey)}">${esc(streamKey.substring(0, 8))}…</div>
                        <button class="btn" data-dash-action="copy" data-copy="${esc(streamKey)}" style="padding:.2rem .6rem;font-size:.75rem;">Copy key</button>
                        <button class="btn" data-dash-action="regenerate-key" data-slug="${esc(c.slug)}" style="padding:.2rem .6rem;font-size:.75rem;">Regenerate</button>
                    </div></div>` : ''}
                ${whipUrl ? `<div style="margin-top:.5rem"><div class="dp-label">WHIP URL</div><div class="code-block">${esc(whipUrl)}</div></div>` : ''}
                <div class="kicker">Created ${timeAgo(c.created_at)}</div>
                <div class="inline-actions" style="margin-top:.7rem;">
                    <button class="btn" data-dash-action="edit-channel" data-slug="${esc(c.slug)}"
                        data-display-name="${esc(c.display_name || '')}"
                        data-description="${esc((c.metadata && c.metadata.description) || c.description || '')}">Edit</button>
                </div>
            </article>`;
        }).join('')
        : `<div class="empty-state">No channels yet. Create one from <a class="link-inline" href="${URLS.live}/go-live">openvibe.live/go-live</a>.</div>`;

    // channel edit panel (hidden, populated by JS)
    const channelEditPanelHtml = `
        <div id="dash-channel-edit-panel" style="display:none;margin-bottom:1.5rem;">
            <article class="glass-card">
                <div class="eyebrow">Edit channel</div>
                <form class="form-stack" id="dash-channel-edit-form">
                    <input type="hidden" name="slug">
                    <label><span class="dp-label">Display name</span>
                        <input class="filter-input" type="text" name="display_name" autocomplete="off">
                    </label>
                    <label><span class="dp-label">Description</span>
                        <textarea class="filter-input" name="description" rows="2" style="resize:vertical;"></textarea>
                    </label>
                    <div class="form-actions" style="margin-top:.7rem;">
                        <button class="btn primary" type="submit">Save</button>
                        <button class="btn" type="button" data-dash-action="close-channel-edit">Cancel</button>
                        <span id="dash-channel-edit-status" style="margin-left:.5rem;font-size:.85rem;"></span>
                    </div>
                </form>
            </article>
        </div>`;

    // destinations section
    const destCardsHtml = destinations.length
        ? destinations.map((d) => `<article class="glass-card" data-dest-id="${esc(d.id)}">
            <div class="pill-row">${pill(d.kind || 'custom', 'soft')}${d.enabled ? '' : ' ' + pill('Disabled', 'muted')}</div>
            <h3 class="card-title">${esc(d.label || d.kind || 'Destination')}</h3>
            ${d.target_url ? `<div class="code-block" style="margin-top:.5rem;font-size:.78rem">${esc(d.target_url)}</div>` : ''}
            <div class="kicker">Added ${timeAgo(d.created_at)}</div>
            <div class="inline-actions" style="margin-top:.7rem;">
                <button class="btn" data-dash-action="delete-destination" data-dest-id="${esc(d.id)}" style="color:var(--color-danger,#e55);">Remove</button>
            </div>
        </article>`).join('')
        : `<div class="empty-state">No destinations yet.</div>`;

    // recent streams section
    const streamRowsHtml = streams.length
        ? streams.map((s) => {
            const statusPill = s.is_live ? pill('Live', 'live') : (s.status === 'ended' ? pill('Ended', 'soft') : pill(s.status || 'Idle', 'warn'));
            const channelName = s.channel_slug || s.channel_display_name || '';
            return `<div class="glass-card" style="display:grid;grid-template-columns:1fr auto;gap:.5rem;align-items:center;padding:.8rem 1rem">
                <div>
                    <div class="pill-row">${statusPill}${channelName ? ` <span class="pill soft">@${esc(channelName)}</span>` : ''}</div>
                    <strong>${esc(s.title || 'Untitled stream')}</strong>
                    <div class="kicker">${timeAgo(s.started_at || s.created_at)}</div>
                </div>
                <div>
                    <a class="btn" href="${URLS.live}/@${esc(s.channel_slug || '')}">View →</a>
                </div>
            </div>`;
        }).join('')
        : `<div class="empty-state">No recent streams found. Go live from <a class="link-inline" href="${URLS.live}/go-live">openvibe.live/go-live</a> to create your first broadcast.</div>`;

    const bodyHtml = `
        <section style="margin-bottom:1.5rem">
            <div class="eyebrow">Control room</div>
            <h1 class="page-title">Your stream dashboard</h1>
            <p class="page-sub">Channels, destinations, ingest details, and recent broadcasts for <strong>${esc(user && (user.display_name || user.username) || 'your account')}</strong>.</p>
        </section>

        <div class="data-points">
            <div class="dp"><div class="dp-label">Channels</div><div class="dp-value">${channels.length}</div></div>
            <div class="dp"><div class="dp-label">Destinations</div><div class="dp-value">${destinations.length}</div></div>
            <div class="dp"><div class="dp-label">Recent streams</div><div class="dp-value">${streams.length}</div></div>
            <div class="dp"><div class="dp-label">Live now</div><div class="dp-value">${streams.filter((s) => s.is_live).length}</div></div>
        </div>

        <div class="section-head">
            <h2 class="section-title">My channels &amp; ingest details</h2>
            <a class="btn" href="${URLS.live}/go-live">+ New channel</a>
        </div>
        ${channelEditPanelHtml}
        <div class="grid2">${channelCardsHtml}</div>

        <div class="section-head">
            <h2 class="section-title">Destinations</h2>
            <a class="btn" href="${URLS.live}/go-live#stream-manager">+ Add destination</a>
        </div>
        <div class="grid3">${destCardsHtml}</div>

        <div class="section-head">
            <h2 class="section-title">Recent streams</h2>
            <a class="btn" href="${URLS.live}/channels">Browse live</a>
        </div>
        <div style="display:grid;gap:.6rem">${streamRowsHtml}</div>
    `;

    return _shell({ title: 'Dashboard · OpenRe.Stream', user, bodyHtml, extraScripts: '<script src="/js/dashboard.js"></script>' });
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
