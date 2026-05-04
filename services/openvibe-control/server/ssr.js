'use strict';

/* eslint-disable no-unused-vars */

// Minimal HTML renderer for the control panel.
// All pages are dark-themed and use the same CSS variable set as openvibe.live.

const PAGE_TITLE = 'OpenVibe Control';

function escHtml(v) {
    if (v === null || v === undefined) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function statusDot(ok) {
    return ok
        ? '<span style="color:var(--color-success,#4ade80)">●</span>'
        : '<span style="color:var(--color-danger,#f87171)">●</span>';
}

const BASE_CSS = `
:root {
    --bg: #0f1117;
    --bg-surface: #1a1d27;
    --bg-card: #22273a;
    --text: #e2e8f0;
    --text-muted: #718096;
    --color-accent: #7c3aed;
    --color-success: #4ade80;
    --color-warning: #fbbf24;
    --color-danger: #f87171;
    --border: #2d3748;
    --radius: 8px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
header { background: var(--bg-surface); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; gap: 16px; }
header h1 { font-size: 18px; font-weight: 700; color: var(--color-accent); }
header nav a { color: var(--text-muted); text-decoration: none; margin-left: 16px; font-size: 13px; }
header nav a:hover { color: var(--text); }
main { max-width: 1280px; margin: 0 auto; padding: 24px; }
h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--text); }
h3 { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--text-muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.stat-num { font-size: 28px; font-weight: 700; color: var(--text); margin: 6px 0 2px; }
.stat-label { font-size: 12px; color: var(--text-muted); }
table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: var(--radius); overflow: hidden; }
th { background: var(--bg-surface); padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
td { padding: 10px 12px; border-top: 1px solid var(--border); font-size: 13px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge-ok { background: rgba(74,222,128,.15); color: var(--color-success); }
.badge-warn { background: rgba(251,191,36,.15); color: var(--color-warning); }
.badge-err { background: rgba(248,113,113,.15); color: var(--color-danger); }
pre { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; overflow-x: auto; font-size: 12px; }
.error-box { background: rgba(248,113,113,.1); border: 1px solid var(--color-danger); border-radius: var(--radius); padding: 12px; color: var(--color-danger); margin-bottom: 16px; }
`;

function shell(title, content, userEmail) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)} — ${PAGE_TITLE}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<header>
  <h1>${PAGE_TITLE}</h1>
  <nav>
    <a href="/control">Dashboard</a>
    <a href="/control/events">Events</a>
    <a href="/control/streams">Streams</a>
    <a href="/control/realtime">Realtime</a>
    <a href="/control/community">Community</a>
    <a href="/control/services">Services</a>
  </nav>
  <div style="margin-left:auto;color:var(--text-muted);font-size:12px;">${escHtml(userEmail || 'admin')}</div>
</header>
<main>
${content}
</main>
</body>
</html>`;
}

function renderUnauthorized() {
    return shell('Unauthorized', `
<div class="error-box">Admin access required. Please sign in with an admin account.</div>
<p><a href="/control" style="color:var(--color-accent)">Try again</a></p>
`);
}

function renderDashboard(data, userEmail) {
    const { events, realtime, streams, community, services } = data;
    const evTotal  = (events && events.total)   || 0;
    const evTopics = (events && events.topics && events.topics.length) || 0;
    const rtConns  = (realtime && realtime.connections && realtime.connections.total) || 0;
    const activeStreams = (streams && streams.active) || 0;
    const totalPosts    = (community && community.post_count) || 0;
    const totalMembers  = (community && community.member_count) || 0;

    const svcRows = Array.isArray(services) ? services.map((s) => `
<tr>
  <td>${escHtml(s.name)}</td>
  <td>${statusDot(s.ok)} <span class="badge ${s.ok ? 'badge-ok' : 'badge-err'}">${s.ok ? 'up' : 'down'}</span></td>
  <td style="color:var(--text-muted)">${escHtml(s.latencyMs !== undefined ? s.latencyMs + 'ms' : '—')}</td>
</tr>`).join('') : '<tr><td colspan="3" style="color:var(--text-muted)">Loading...</td></tr>';

    return shell('Dashboard', `
<h2>System Overview</h2>
<div class="grid">
  <div class="card">
    <div class="stat-label">Events published</div>
    <div class="stat-num">${evTotal.toLocaleString()}</div>
    <div class="stat-label">${evTopics} active topics</div>
  </div>
  <div class="card">
    <div class="stat-label">Realtime connections</div>
    <div class="stat-num">${rtConns.toLocaleString()}</div>
    <div class="stat-label">across all namespaces</div>
  </div>
  <div class="card">
    <div class="stat-label">Active streams</div>
    <div class="stat-num">${activeStreams}</div>
  </div>
  <div class="card">
    <div class="stat-label">Community posts</div>
    <div class="stat-num">${totalPosts.toLocaleString()}</div>
    <div class="stat-label">${totalMembers.toLocaleString()} members</div>
  </div>
</div>

<h2>Service Health</h2>
<table>
  <thead><tr><th>Service</th><th>Status</th><th>Latency</th></tr></thead>
  <tbody>${svcRows}</tbody>
</table>
`, userEmail);
}

function renderEventsPage(data, userEmail) {
    const { recent, topics } = data;

    const topicRows = Array.isArray(topics) ? topics.map((t) => `
<tr>
  <td>${escHtml(t.topic)}</td>
  <td>${escHtml(t.canonical ? 'yes' : 'no')}</td>
  <td>${escHtml(t.event_count || 0)}</td>
</tr>`).join('') : '';

    const eventRows = Array.isArray(recent) ? recent.map((e) => `
<tr>
  <td style="font-size:11px;color:var(--text-muted)">${escHtml(e.id || '').slice(0, 12)}…</td>
  <td>${escHtml(e.topic)}</td>
  <td>${escHtml(e.event_type || e.type || '—')}</td>
  <td style="font-size:11px;color:var(--text-muted)">${escHtml(e.published_at || e.created_at || '')}</td>
</tr>`).join('') : '';

    return shell('Events', `
<h2>Topics</h2>
<table>
  <thead><tr><th>Topic</th><th>Canonical</th><th>Events</th></tr></thead>
  <tbody>${topicRows}</tbody>
</table>
<br>
<h2>Recent Events</h2>
<table>
  <thead><tr><th>ID</th><th>Topic</th><th>Type</th><th>At</th></tr></thead>
  <tbody>${eventRows}</tbody>
</table>
`, userEmail);
}

function renderStreamsPage(data, userEmail) {
    const { streams } = data;
    const rows = Array.isArray(streams) ? streams.map((s) => `
<tr>
  <td>${escHtml(s.id || s.stream_id || '')}</td>
  <td>${escHtml(s.channel || s.channel_handle || '—')}</td>
  <td>${escHtml(s.title || '—')}</td>
  <td><span class="badge ${s.status === 'live' ? 'badge-ok' : 'badge-warn'}">${escHtml(s.status || 'unknown')}</span></td>
  <td style="font-size:11px;color:var(--text-muted)">${escHtml(s.started_at || '')}</td>
</tr>`).join('') : '<tr><td colspan="5" style="color:var(--text-muted)">No active streams</td></tr>';

    return shell('Streams', `
<h2>Active Streams</h2>
<table>
  <thead><tr><th>ID</th><th>Channel</th><th>Title</th><th>Status</th><th>Started</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
`, userEmail);
}

function renderRealtimePage(data, userEmail) {
    const { stats } = data;
    const conns = (stats && stats.connections) || {};
    const bridge = (stats && stats.bridge)    || {};
    const redis  = (stats && stats.redis)     || {};

    const nsRows = conns.by_namespace ? Object.entries(conns.by_namespace).map(([ns, count]) => `
<tr><td>${escHtml(ns)}</td><td>${escHtml(count)}</td></tr>`).join('') : '';

    return shell('Realtime', `
<h2>Connection Stats</h2>
<div class="grid">
  <div class="card">
    <div class="stat-label">Total connections</div>
    <div class="stat-num">${conns.total || 0}</div>
  </div>
  <div class="card">
    <div class="stat-label">Redis</div>
    <div class="stat-num">${statusDot(redis.connected)}</div>
    <div class="stat-label">${redis.configured ? 'configured' : 'not configured'}</div>
  </div>
  <div class="card">
    <div class="stat-label">Bridge mode</div>
    <div class="stat-num" style="font-size:18px">${escHtml(bridge.mode || '—')}</div>
    <div class="stat-label">${bridge.topics_subscribed || 0} topics subscribed</div>
  </div>
</div>
${nsRows ? `<h2>By Namespace</h2>
<table>
  <thead><tr><th>Namespace</th><th>Connections</th></tr></thead>
  <tbody>${nsRows}</tbody>
</table>` : ''}
`, userEmail);
}

function renderCommunityPage(data, userEmail) {
    const { stats } = data;
    const keys = stats && typeof stats === 'object' ? Object.entries(stats) : [];

    const rows = keys.map(([k, v]) => `
<tr><td>${escHtml(k)}</td><td>${escHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('');

    return shell('Community', `
<h2>Community Stats</h2>
<table>
  <thead><tr><th>Metric</th><th>Value</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="2" style="color:var(--text-muted)">No data</td></tr>'}</tbody>
</table>
`, userEmail);
}

function renderServicesPage(services, userEmail) {
    const rows = Array.isArray(services) ? services.map((s) => `
<tr>
  <td>${escHtml(s.name)}</td>
  <td>${escHtml(s.url)}</td>
  <td>${statusDot(s.ok)} <span class="badge ${s.ok ? 'badge-ok' : 'badge-err'}">${s.ok ? 'up' : 'down'}</span></td>
  <td style="font-size:11px;color:var(--text-muted)">${escHtml(s.latencyMs !== undefined ? s.latencyMs + 'ms' : '—')}</td>
  <td style="font-size:11px;color:var(--text-muted)">${escHtml(s.error || '')}</td>
</tr>`).join('') : '';

    return shell('Services', `
<h2>Service Status</h2>
<table>
  <thead><tr><th>Service</th><th>URL</th><th>Status</th><th>Latency</th><th>Error</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
`, userEmail);
}

module.exports = {
    renderUnauthorized,
    renderDashboard,
    renderEventsPage,
    renderStreamsPage,
    renderRealtimePage,
    renderCommunityPage,
    renderServicesPage,
};
