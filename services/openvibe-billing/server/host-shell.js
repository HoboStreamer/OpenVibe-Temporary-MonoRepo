'use strict';

// openvibe-billing — host-aware shells for openvibe.tips and openvibe.vip.
// Phase 16: shells render DB-backed creator profiles, recent activity, and
// truthful chat-seam status without overpromising on adult or paid content.

const model = require('./model');
const config = require('./config');

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtMinor(n, c) { return `${Number(n||0).toLocaleString('en-US')} ${escapeHtml(c||'OVC')}`; }
function safeRead(fn, fb) { try { return fn(); } catch { return fb; } }

function normalizedHostname(host) {
    return String(host || '').split(':')[0].trim().toLowerCase();
}

const TIPS_HOSTS = new Set(['openvibe.tips', 'openvibe.tips.localhost']);
const VIP_HOSTS = new Set(['openvibe.vip', 'openvibe.vip.localhost']);

function detectBillingSurface(host) {
    const hostname = normalizedHostname(host);
    if (TIPS_HOSTS.has(hostname) || hostname.endsWith('.openvibe.tips')) return 'tips';
    if (VIP_HOSTS.has(hostname) || hostname.endsWith('.openvibe.vip')) return 'vip';
    return 'billing';
}

function renderTipsShell() {
    const creators = safeRead(() => model.listTipCreatorProfiles({ status: 'active', limit: 12 }), []);
    const recentTips = safeRead(() => model.listTips({ limit: 8 }), [])
        .filter(t => t.visibility !== 'private');
    const integrationSummary = safeRead(() => model.tipChatIntegrationSummary(), {});
    const economy = safeRead(() => model.getEconomyState(), { frozen: false });
    const chatConfigured = !!(config.chat && config.chat.url);

    const creatorsHtml = creators.length === 0
        ? `<p class="muted">No tip creator profiles yet. Operators or creators can <code>POST /api/tips/creators</code> to enroll. The tip jar still accepts direct tips by <code>recipient_owner_type</code>+<code>recipient_owner_id</code>.</p>`
        : `<ul class="cards">` + creators.map(c => `
          <li class="card">
            <h3>${escapeHtml(c.display_name)}</h3>
            <p class="muted">${escapeHtml(c.owner_type)}/${escapeHtml(c.owner_id)} · ${escapeHtml(c.currency)} · default ${escapeHtml(c.default_visibility)}</p>
            ${c.description ? `<p>${escapeHtml(c.description)}</p>` : ''}
          </li>`).join('') + `</ul>`;

    const tipsHtml = recentTips.length === 0
        ? `<p class="muted">No recent tips visible. Send one with <code>POST /api/tips</code>.</p>`
        : `<ul class="feed">` + recentTips.map(t => `
          <li><strong>${fmtMinor(t.amount_minor, t.currency)}</strong> · ${escapeHtml(t.interaction_type)} · to <code>${escapeHtml(t.recipient_owner_type)}/${escapeHtml(t.recipient_owner_id)}</code>${t.message ? ` — <em>${escapeHtml(t.message).slice(0,140)}</em>` : ''}</li>`).join('') + `</ul>`;

    const integrationLine = Object.keys(integrationSummary).length
        ? Object.entries(integrationSummary).map(([k,n]) => `<code>${escapeHtml(k)}</code>: ${n}`).join(' · ')
        : 'no chat side-effects recorded yet';

    const banners =
        (economy.frozen ? `<div class="banner warn">Economy frozen — money-moving routes are returning 423.</div>` : '') +
        (chatConfigured ? '' : `<div class="banner info">Chat URL not configured — TTS/audio side-effects will report <code>unavailable</code>.</div>`);

    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/openvibe-icons.css">
<script src="/assets/openvibe-icons.js" defer></script>
<title>OpenVibe Tips — hobo-friendly tipping</title>
<meta name="description" content="OpenVibe Tips: hobo-friendly tipping. No subscription gates, no 30 percent platform tax.">
<meta name="robots" content="noindex">
<style>
  body { margin: 0; font: 15px/1.55 system-ui, sans-serif; color: #f3f4f6; background: radial-gradient(circle at top, rgba(245,158,11,.18), transparent 35%), #0b1018; }
  main { max-width: 880px; margin: 0 auto; padding: 56px 22px; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 .5rem; }
  h2 { margin-top: 2.4rem; font-size: 1.25rem; color: #fbd38d; }
  h3 { margin: .25rem 0 .5rem; font-size: 1rem; }
  p { color: #cbd5e1; max-width: 70ch; }
  .chip { display: inline-block; padding: .35rem .75rem; border-radius: 999px; background: rgba(245,158,11,.16); color: #fbd38d; font-size: .82rem; letter-spacing: .08em; text-transform: uppercase; }
  .muted { color: #94a3b8; font-size: .92rem; }
  code { color: #fbd38d; }
  ul.cards { list-style: none; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  ul.cards .card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: 12px 14px; }
  ul.feed { list-style: none; padding: 0; }
  ul.feed li { padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,.08); }
  .banner { padding: 10px 14px; border-radius: 8px; margin: 14px 0; }
  .banner.warn { background: rgba(239,68,68,.14); color: #fca5a5; }
  .banner.info { background: rgba(125,211,252,.10); color: #bae6fd; }
  .lanes { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  .lanes .lane { padding: 10px 12px; background: rgba(255,255,255,.03); border-radius: 8px; }
</style>
</head><body><main data-runtime-panel="tips-product-shell">
<span class="chip">OpenVibe Tips · draft surface</span>
<h1>OpenVibe Tips</h1>
<p>Hobo-friendly tipping. No subscription gates. No 30 percent platform tax. No fake hype meters. Just a tip jar that loads, a credits ledger that adds up, and a creator that gets paid.</p>
<p class="muted">Platform fee: ${escapeHtml(String(config.platformFeeBps || 0))} bps · Currency: ${escapeHtml(config.creditsCurrency || 'OVC')}</p>
${banners}

<h2 data-runtime-panel="tips-creator-profiles">Tip creators</h2>
${creatorsHtml}

<h2 data-runtime-panel="tips-superchat-lanes">Superchat / TTS / media-request lanes</h2>
<div class="lanes">
  <div class="lane"><strong>Tip</strong><div class="muted"><code>POST /api/tips/create</code></div></div>
  <div class="lane"><strong>Superchat</strong><div class="muted"><code>POST /api/tips/superchat</code></div></div>
  <div class="lane"><strong>TTS request</strong><div class="muted"><code>POST /api/tips/tts-request</code></div></div>
  <div class="lane"><strong>Media request</strong><div class="muted"><code>POST /api/tips/media-request</code></div></div>
</div>

<h2 data-runtime-panel="tips-recent-feed">Recent activity</h2>
${tipsHtml}
<p class="muted">Chat-side delivery: ${integrationLine}</p>
</main></body></html>`;
}

function renderVipShell() {
    const creators = safeRead(() => model.listVipCreatorProfiles({ status: 'active', limit: 12 }), []);
    const plans = safeRead(() => model.listPlans({ status: 'active', visibility: 'public', limit: 12 }), []);
    const subscriptionCount = safeRead(() => model.listSubscriptions({ status: 'active', limit: 200 }).length, 0);
    const economy = safeRead(() => model.getEconomyState(), { frozen: false });

    const creatorsHtml = creators.length === 0
        ? `<p class="muted">No VIP creator profiles yet. Creators can <code>POST /api/vip/creators</code> to enroll. Plans can also exist standalone.</p>`
        : `<ul class="cards">` + creators.map(c => `
          <li class="card">
            <h3>${escapeHtml(c.display_name)}</h3>
            <p class="muted">${escapeHtml(c.owner_type)}/${escapeHtml(c.owner_id)} · rating ${escapeHtml(c.content_rating)}${c.requires_age_gate ? ' · age-gate required' : ''}</p>
            ${c.description ? `<p>${escapeHtml(c.description)}</p>` : ''}
          </li>`).join('') + `</ul>`;

    const plansHtml = plans.length === 0
        ? `<p class="muted">No public plans yet. Publish one with <code>POST /api/vip/plans</code>.</p>`
        : `<ul class="cards">` + plans.map(p => `
          <li class="card">
            <h3>${escapeHtml(p.name)}</h3>
            <p class="muted">${escapeHtml(p.owner_type)}/${escapeHtml(p.owner_id)} · ${fmtMinor(p.amount_minor, p.currency)} / ${escapeHtml(p.billing_interval)}</p>
            ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
          </li>`).join('') + `</ul>`;

    const ageGateNote = creators.some(c => c.requires_age_gate)
        ? `<p class="muted">Some membership profiles request an age-gate. Age-gate is opt-in metadata at the creator profile level; the public host does not promote adult content on the index.</p>`
        : '';

    const freezeBanner = economy.frozen
        ? `<div class="banner warn">Economy frozen — subscription create / renew routes are returning 423.</div>`
        : '';

    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenVibe VIP — hobo-tier subscriptions</title>
<meta name="description" content="OpenVibe VIP: draft subscriptions surface. No paywalls on basic features.">
<meta name="robots" content="noindex">
<style>
  body { margin: 0; font: 15px/1.55 system-ui, sans-serif; color: #f3f4f6; background: radial-gradient(circle at top, rgba(125,211,252,.16), transparent 35%), #0b1018; }
  main { max-width: 880px; margin: 0 auto; padding: 56px 22px; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 .5rem; }
  h2 { margin-top: 2.4rem; font-size: 1.25rem; color: #bae6fd; }
  h3 { margin: .25rem 0 .5rem; font-size: 1rem; }
  p { color: #cbd5e1; max-width: 70ch; }
  .chip { display: inline-block; padding: .35rem .75rem; border-radius: 999px; background: rgba(125,211,252,.16); color: #bae6fd; font-size: .82rem; letter-spacing: .08em; text-transform: uppercase; }
  .muted { color: #94a3b8; font-size: .92rem; }
  code { color: #bae6fd; }
  ul.cards { list-style: none; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  ul.cards .card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: 12px 14px; }
  .banner.warn { background: rgba(239,68,68,.14); color: #fca5a5; padding: 10px 14px; border-radius: 8px; margin: 14px 0; }
</style>
</head><body><main data-runtime-panel="vip-product-shell">
<span class="chip">OpenVibe VIP · draft surface</span>
<h1>OpenVibe VIP</h1>
<p>Draft subscriptions surface. No paywalls on basic features. No fake exclusivity. No surprise renewals.</p>
<p class="muted">Active subscriptions visible: ${subscriptionCount} · Currency: ${escapeHtml(config.creditsCurrency || 'OVC')} · Platform fee: ${escapeHtml(String(config.platformFeeBps || 0))} bps</p>
${freezeBanner}
${ageGateNote}

<h2 data-runtime-panel="vip-creator-profiles">VIP creators</h2>
${creatorsHtml}

<h2 data-runtime-panel="vip-public-plans">Public plans</h2>
${plansHtml}
</main></body></html>`;
}

function attachBillingHostShell(app) {
    app.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        if (req.path !== '/' && req.path !== '/index.html') return next();
        const surface = detectBillingSurface(req.headers && req.headers.host);
        if (surface === 'tips') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-OpenVibe-Surface', 'tips');
            return res.status(200).send(renderTipsShell());
        }
        if (surface === 'vip') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-OpenVibe-Surface', 'vip');
            return res.status(200).send(renderVipShell());
        }
        return next();
    });
}

module.exports = {
    attachBillingHostShell,
    detectBillingSurface,
    renderTipsShell,
    renderVipShell,
    TIPS_HOSTS,
    VIP_HOSTS,
};
