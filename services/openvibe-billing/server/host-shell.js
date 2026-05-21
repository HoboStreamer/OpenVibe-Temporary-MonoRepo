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
        ? `<div class="empty-state"><div class="empty-icon">💸</div><p>No tip creators enrolled yet.</p><p class="muted">Streamers can enroll to receive tips from their audience.</p></div>`
        : `<div class="creator-grid">` + creators.map(c => `
          <div class="creator-card">
            <div class="creator-avatar">${escapeHtml(c.display_name).charAt(0).toUpperCase()}</div>
            <h3>${escapeHtml(c.display_name)}</h3>
            <p class="muted">${escapeHtml(c.currency)}</p>
            ${c.description ? `<p>${escapeHtml(c.description)}</p>` : ''}
            <a class="btn btn-primary btn-sm" href="/tip/${escapeHtml(c.owner_id)}">Send Tip</a>
          </div>`).join('') + `</div>`;

    const tipsHtml = recentTips.length === 0
        ? `<div class="empty-state"><div class="empty-icon">🎁</div><p>No recent tips yet.</p></div>`
        : `<div class="tips-feed">` + recentTips.map(t => `
          <div class="tip-item">
            <span class="tip-amount">${fmtMinor(t.amount_minor, t.currency)}</span>
            <span class="tip-type">${escapeHtml(t.interaction_type)}</span>
            ${t.message ? `<span class="tip-msg">"${escapeHtml(t.message).slice(0,120)}"</span>` : ''}
          </div>`).join('') + `</div>`;

    const banners = (economy.frozen ? `<div class="banner-warn">⚠️ Economy frozen — tip routes returning 423.</div>` : '');

    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>OpenVibe Tips — Send tips, get tipped.</title>
<meta name="description" content="OpenVibe Tips: hobo-friendly tipping. No subscription gates, no 30% platform tax. Powered by OpenVibe Credits.">
<link rel="icon" type="image/svg+xml" href="https://openvibe.network/favicon.svg">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--accent:#fbbf24;--accent2:#d97706;--bg:#0a0b0f;--bg2:#111318;--bg3:#1a1d28;--text:#e2e8f0;--muted:#94a3b8;--border:rgba(255,255,255,.08)}
body{font:15px/1.6 system-ui,sans-serif;color:var(--text);background:var(--bg);min-height:100vh}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.nav{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid var(--border);background:rgba(10,11,15,.9);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100}
.nav-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.1rem;color:#fff}
.nav-links{display:flex;gap:20px;align-items:center}
.nav-links a{color:var(--muted);font-size:.9rem}
.nav-links a:hover{color:#fff;text-decoration:none}
.btn{display:inline-block;padding:9px 20px;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;border:none;text-decoration:none;transition:all .15s}
.btn-primary{background:linear-gradient(135deg,var(--accent2),var(--accent));color:#000}
.btn-primary:hover{opacity:.9;text-decoration:none}
.btn-outline{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.btn-sm{padding:6px 14px;font-size:.82rem}
.hero{padding:80px 32px 60px;text-align:center;background:radial-gradient(ellipse at top,rgba(217,119,6,.2) 0%,transparent 70%)}
.hero-badge{display:inline-block;padding:5px 14px;background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.3);border-radius:999px;color:var(--accent);font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:24px}
h1{font-size:clamp(2.2rem,5vw,3.5rem);font-weight:800;line-height:1.15;margin-bottom:20px;background:linear-gradient(135deg,#fff,var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{color:var(--muted);font-size:1.1rem;max-width:56ch;margin:0 auto 32px}
.hero-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.section{padding:56px 32px;max-width:1100px;margin:0 auto}
.section-label{font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
h2{font-size:1.7rem;font-weight:700;margin-bottom:8px}
.section-sub{color:var(--muted);margin-bottom:36px;max-width:60ch}
.features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.feature-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px 22px}
.feature-icon{font-size:1.6rem;margin-bottom:10px}
.feature-card h3{font-size:1rem;font-weight:600;margin-bottom:6px}
.feature-card p{color:var(--muted);font-size:.88rem}
.creator-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.creator-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px;text-align:center}
.creator-avatar{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--accent2),var(--accent));display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;color:#000;margin:0 auto 12px}
.creator-card h3{margin-bottom:6px}
.creator-card p{margin-bottom:12px}
.empty-state{text-align:center;padding:48px 24px;color:var(--muted)}
.empty-icon{font-size:2.5rem;margin-bottom:12px}
.tips-feed{display:flex;flex-direction:column;gap:10px}
.tip-item{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.tip-amount{font-size:1.1rem;font-weight:700;color:var(--accent)}
.tip-type{background:rgba(251,191,36,.12);color:var(--accent);padding:3px 10px;border-radius:999px;font-size:.78rem;font-weight:600}
.tip-msg{color:var(--muted);font-style:italic;font-size:.9rem}
.banner-warn{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#fca5a5;padding:12px 18px;border-radius:8px;margin-bottom:20px}
.connector-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.connector-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px 18px}
.connector-name{font-weight:600;margin-bottom:4px}
.connector-desc{color:var(--muted);font-size:.85rem}
footer{border-top:1px solid var(--border);padding:32px;text-align:center;color:var(--muted);font-size:.85rem;margin-top:80px}
footer a{color:var(--muted)}footer a:hover{color:#fff}
</style>
</head>
<body>
<nav class="nav">
  <div class="nav-brand"><span>💸</span> OpenVibe Tips</div>
  <div class="nav-links">
    <a href="https://openvibe.network">Home</a>
    <a href="https://openvibe.live">Watch</a>
    <a href="https://openvibe.vip">VIP</a>
    <a href="https://my.openvibe.network">My Account</a>
  </div>
</nav>

<div class="hero">
  <div class="hero-badge">Creator Monetization</div>
  <h1>Tips that actually work.</h1>
  <p>No 30% platform cut. No subscription gate. Just a tip jar that loads, a ledger that adds up, and a creator that gets paid.</p>
  <div class="hero-cta">
    <a class="btn btn-primary" href="https://openvibe.live">Find a Creator</a>
    <a class="btn btn-outline" href="/api/tips/creators">Creator API</a>
  </div>
</div>

<section class="section">
  ${banners}
  <div class="section-label">How it works</div>
  <h2>Send appreciation, not invoices.</h2>
  <p class="section-sub">OpenVibe Tips supports multiple tip types — from simple donations to TTS messages and media requests.</p>

  <div class="features-grid">
    <div class="feature-card"><div class="feature-icon">💰</div><h3>Direct tips</h3><p>Send OVC directly to any creator. No escrow, no holds, instant ledger credit.</p></div>
    <div class="feature-card"><div class="feature-icon">📣</div><h3>Superchats</h3><p>Send a highlighted message that pins to the top of chat during a live stream.</p></div>
    <div class="feature-card"><div class="feature-icon">🔊</div><h3>TTS requests</h3><p>Text-to-speech messages delivered through the streamer's audio system in real time.</p></div>
    <div class="feature-card"><div class="feature-icon">🎵</div><h3>Media requests</h3><p>Song request, sound clip, or any media the creator has enabled in their queue.</p></div>
    <div class="feature-card"><div class="feature-icon">🔗</div><h3>Connector integrations</h3><p>Accept tips from Streamlabs, StreamElements, and PowerChat — events relay into the OpenVibe tip ledger.</p></div>
    <div class="feature-card"><div class="feature-icon">📡</div><h3>Overlay alerts</h3><p>Real-time tip alerts for OBS browser source. Animated, customizable, no third-party accounts required.</p></div>
  </div>
</section>

<section class="section">
  <div class="section-label">Connectors</div>
  <h2>Works with your existing setup.</h2>
  <p class="section-sub">Already using Streamlabs or StreamElements? Connect your account and tips flow into OpenVibe automatically.</p>
  <div class="connector-grid">
    <div class="connector-card"><div class="connector-name">Streamlabs</div><div class="connector-desc">Webhook-based tip relay. Configure your socket token and donations sync instantly.</div></div>
    <div class="connector-card"><div class="connector-name">StreamElements</div><div class="connector-desc">JWT webhook authentication. Tip events trigger OpenVibe credit allocation.</div></div>
    <div class="connector-card"><div class="connector-name">PowerChat</div><div class="connector-desc">PowerChat webhook normalization for cross-platform tip events.</div></div>
    <div class="connector-card"><div class="connector-name">Generic Webhook</div><div class="connector-desc">Custom webhook endpoint that accepts any standard donation payload format.</div></div>
  </div>
</section>

<section class="section">
  <div class="section-label">Creators</div>
  <h2>Enrolled tip creators</h2>
  <p class="section-sub">Streamers and creators accepting tips on OpenVibe.</p>
  ${creatorsHtml}
</section>

<section class="section">
  <div class="section-label">Recent activity</div>
  <h2>Live tip feed</h2>
  <p class="section-sub">Recent tips across the platform (public-visibility only).</p>
  ${tipsHtml}
</section>

<footer>
  <p>
    <a href="https://openvibe.network">OpenVibe</a> ·
    <a href="https://openvibe.vip">VIP</a> ·
    <a href="https://openvibe.live">Live</a> ·
    <a href="https://my.openvibe.network">Account</a>
  </p>
  <p style="margin-top:8px">Platform fee: ${escapeHtml(String(config.platformFeeBps || 0))} bps · Currency: ${escapeHtml(config.creditsCurrency || 'OVC')}</p>
</footer>
</body></html>`;
}

function renderVipShell() {
    const creators = safeRead(() => model.listVipCreatorProfiles({ status: 'active', limit: 12 }), []);
    const plans = safeRead(() => model.listPlans({ status: 'active', visibility: 'public', limit: 12 }), []);
    const subscriptionCount = safeRead(() => model.listSubscriptions({ status: 'active', limit: 200 }).length, 0);
    const economy = safeRead(() => model.getEconomyState(), { frozen: false });

    const creatorsHtml = creators.length === 0
        ? `<div class="empty-state"><div class="empty-icon">⭐</div><p>No creator profiles enrolled yet.</p><p class="muted">Streamers and creators can enroll their channel to offer VIP subscriptions to supporters.</p></div>`
        : `<div class="creator-grid">` + creators.map(c => `
          <div class="creator-card">
            <div class="creator-avatar">${escapeHtml(c.display_name).charAt(0).toUpperCase()}</div>
            <h3>${escapeHtml(c.display_name)}</h3>
            ${c.description ? `<p>${escapeHtml(c.description)}</p>` : ''}
            <a class="btn btn-sm" href="/api/vip/creators/${escapeHtml(c.owner_id)}">View Plans</a>
          </div>`).join('') + `</div>`;

    const plansHtml = plans.length === 0
        ? `<div class="empty-state"><div class="empty-icon">💎</div><p>No public subscription plans yet.</p><p class="muted">Once creators enroll and publish plans, they'll appear here.</p></div>`
        : `<div class="plans-grid">` + plans.map(p => `
          <div class="plan-card ${p.amount_minor === 0 ? 'plan-free' : ''}">
            <div class="plan-badge">${p.amount_minor === 0 ? 'FREE' : 'VIP'}</div>
            <h3>${escapeHtml(p.name)}</h3>
            <div class="plan-price">${p.amount_minor === 0 ? 'Free' : fmtMinor(p.amount_minor, p.currency)}<span class="plan-interval">/${escapeHtml(p.billing_interval)}</span></div>
            ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
            <a class="btn btn-primary" href="/subscribe/${escapeHtml(p.id)}">Subscribe</a>
          </div>`).join('') + `</div>`;

    const freezeBanner = economy.frozen
        ? `<div class="banner-warn">⚠️ Economy is currently paused — subscriptions temporarily unavailable.</div>`
        : '';

    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>OpenVibe VIP — Creator Subscriptions</title>
<meta name="description" content="Support your favorite creators on OpenVibe with VIP subscriptions. No platform tax. Powered by OpenVibe Credits.">
<link rel="icon" type="image/svg+xml" href="https://openvibe.network/favicon.svg">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--accent:#a78bfa;--accent2:#7c3aed;--gold:#fbbf24;--bg:#0a0b0f;--bg2:#111318;--bg3:#1a1d28;--text:#e2e8f0;--muted:#94a3b8;--border:rgba(255,255,255,.08)}
body{font:15px/1.6 system-ui,sans-serif;color:var(--text);background:var(--bg);min-height:100vh}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.nav{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid var(--border);background:rgba(10,11,15,.9);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100}
.nav-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.1rem;color:#fff}
.nav-brand span{font-size:1.5rem}
.nav-links{display:flex;gap:20px;align-items:center}
.nav-links a{color:var(--muted);font-size:.9rem}
.nav-links a:hover{color:#fff;text-decoration:none}
.btn{display:inline-block;padding:9px 20px;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;border:none;text-decoration:none;transition:all .15s}
.btn-primary{background:linear-gradient(135deg,var(--accent2),var(--accent));color:#fff}
.btn-primary:hover{opacity:.9;text-decoration:none;transform:translateY(-1px)}
.btn-outline{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.btn-outline:hover{background:rgba(124,58,237,.1);text-decoration:none}
.btn-sm{padding:6px 14px;font-size:.82rem}
.hero{padding:80px 32px 60px;text-align:center;background:radial-gradient(ellipse at top,rgba(124,58,237,.2) 0%,transparent 70%)}
.hero-badge{display:inline-block;padding:5px 14px;background:rgba(124,58,237,.2);border:1px solid rgba(167,139,250,.3);border-radius:999px;color:var(--accent);font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:24px}
h1{font-size:clamp(2.2rem,5vw,3.5rem);font-weight:800;line-height:1.15;margin-bottom:20px;background:linear-gradient(135deg,#fff,var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{color:var(--muted);font-size:1.1rem;max-width:56ch;margin:0 auto 32px}
.hero-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.section{padding:56px 32px;max-width:1100px;margin:0 auto}
.section-label{font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
h2{font-size:1.7rem;font-weight:700;margin-bottom:8px}
.section-sub{color:var(--muted);margin-bottom:36px;max-width:60ch}
.features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:48px}
.feature-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px 22px}
.feature-icon{font-size:1.6rem;margin-bottom:10px}
.feature-card h3{font-size:1rem;font-weight:600;margin-bottom:6px}
.feature-card p{color:var(--muted);font-size:.88rem}
.tiers-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.tier-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:28px 22px;text-align:center;position:relative}
.tier-card.featured{border-color:var(--accent);background:linear-gradient(135deg,rgba(124,58,237,.1),var(--bg2))}
.tier-badge{position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,var(--accent2),var(--accent));color:#fff;padding:3px 14px;border-radius:999px;font-size:.75rem;font-weight:700;text-transform:uppercase}
.tier-name{font-size:1rem;font-weight:600;color:var(--muted);margin-bottom:8px}
.tier-price{font-size:2rem;font-weight:800;color:#fff;line-height:1}
.tier-price .period{font-size:.85rem;font-weight:400;color:var(--muted)}
.tier-features{list-style:none;margin:20px 0;text-align:left;display:flex;flex-direction:column;gap:8px}
.tier-features li{font-size:.88rem;color:var(--muted)}
.tier-features li::before{content:'✓ ';color:var(--accent)}
.plans-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.plan-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px;position:relative}
.plan-badge{position:absolute;top:14px;right:14px;padding:3px 10px;border-radius:999px;font-size:.72rem;font-weight:700;text-transform:uppercase;background:rgba(124,58,237,.2);color:var(--accent)}
.plan-price{font-size:1.6rem;font-weight:800;margin:10px 0 12px;color:#fff}
.plan-interval{font-size:.85rem;font-weight:400;color:var(--muted)}
.creator-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.creator-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px;text-align:center}
.creator-avatar{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--accent2),var(--accent));display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;color:#fff;margin:0 auto 12px}
.empty-state{text-align:center;padding:48px 24px;color:var(--muted)}
.empty-icon{font-size:2.5rem;margin-bottom:12px}
.credits-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.credits-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px 24px}
.credits-amt{font-size:1.4rem;font-weight:700;color:var(--gold);margin-bottom:4px}
.stats-row{display:flex;gap:32px;flex-wrap:wrap;margin-bottom:40px}
.stat{text-align:center}
.stat-value{font-size:1.8rem;font-weight:800;color:#fff}
.stat-label{font-size:.82rem;color:var(--muted)}
.banner-warn{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#fca5a5;padding:12px 18px;border-radius:8px;margin-bottom:20px}
footer{border-top:1px solid var(--border);padding:32px;text-align:center;color:var(--muted);font-size:.85rem;margin-top:80px}
footer a{color:var(--muted)}footer a:hover{color:#fff}
</style>
</head>
<body>
<nav class="nav">
  <div class="nav-brand"><span>⭐</span> OpenVibe VIP</div>
  <div class="nav-links">
    <a href="https://openvibe.network">Home</a>
    <a href="https://openvibe.live">Watch</a>
    <a href="https://openvibe.tips">Tips</a>
    <a href="https://my.openvibe.network">My Account</a>
  </div>
</nav>

<div class="hero">
  <div class="hero-badge">Creator Economy</div>
  <h1>Support creators,<br>not platforms.</h1>
  <p>OpenVibe VIP lets you subscribe to your favorite streamers and creators — no hidden fees, no 30% platform cuts, fully transparent.</p>
  <div class="hero-cta">
    <a class="btn btn-primary" href="https://my.openvibe.network">Get Started</a>
    <a class="btn btn-outline" href="https://openvibe.live">Browse Channels</a>
  </div>
</div>

<section class="section">
  ${freezeBanner}
  <div class="stats-row">
    <div class="stat"><div class="stat-value">${subscriptionCount}</div><div class="stat-label">Active subscriptions</div></div>
    <div class="stat"><div class="stat-value">${creators.length || 0}</div><div class="stat-label">Enrolled creators</div></div>
    <div class="stat"><div class="stat-value">OVC</div><div class="stat-label">OpenVibe Credits</div></div>
    <div class="stat"><div class="stat-value">0%</div><div class="stat-label">Hidden fees</div></div>
  </div>

  <div class="section-label">Why VIP</div>
  <h2>Everything HoboStreamer had, done right.</h2>
  <p class="section-sub">Subscriptions that actually work for creators — not against them.</p>

  <div class="features-grid">
    <div class="feature-card"><div class="feature-icon">💎</div><h3>Real subscriptions</h3><p>Monthly tiers with perks you actually control — emotes, discord roles, queue priority.</p></div>
    <div class="feature-card"><div class="feature-icon">🪙</div><h3>OpenVibe Credits</h3><p>OVC is the native currency. Buy credits once, spend on subs, tips, TTS, soundboards.</p></div>
    <div class="feature-card"><div class="feature-icon">📡</div><h3>Stream perks</h3><p>VIP badge in chat, custom emote slots, priority in the sub-only queue, ad-free viewing.</p></div>
    <div class="feature-card"><div class="feature-icon">🔔</div><h3>Sub-only notifications</h3><p>Get notified first when creators go live. Sub-only chat rooms and Discord bridge.</p></div>
    <div class="feature-card"><div class="feature-icon">🛡️</div><h3>No platform tax</h3><p>We charge a transparent platform fee in bps, visible in the API. No surprise rate changes.</p></div>
    <div class="feature-card"><div class="feature-icon">🌐</div><h3>Cross-service perks</h3><p>VIP status recognized across openvibe.live, openvibe.games, openvibe.community, and more.</p></div>
  </div>

  <div class="section-label" style="margin-top:48px">Default tiers</div>
  <h2>Pick a level that works for you.</h2>
  <p class="section-sub">Creators can customize these tiers and add their own. These are the platform defaults.</p>

  <div class="tiers-grid">
    <div class="tier-card">
      <div class="tier-name">Viewer</div>
      <div class="tier-price">Free <span class="period">forever</span></div>
      <ul class="tier-features">
        <li>Watch all public streams</li>
        <li>Chat in public rooms</li>
        <li>Anonymous identity</li>
        <li>Clip and share VODs</li>
      </ul>
    </div>
    <div class="tier-card">
      <div class="tier-name">Supporter</div>
      <div class="tier-price">500 OVC <span class="period">/month</span></div>
      <ul class="tier-features">
        <li>Sub badge in chat</li>
        <li>Custom emote access</li>
        <li>Priority stream notifications</li>
        <li>Sub-only chat rooms</li>
      </ul>
    </div>
    <div class="tier-card featured">
      <div class="tier-badge">Most popular</div>
      <div class="tier-name">VIP</div>
      <div class="tier-price">1500 OVC <span class="period">/month</span></div>
      <ul class="tier-features">
        <li>Everything in Supporter</li>
        <li>VIP badge + name color</li>
        <li>TTS priority queue</li>
        <li>Extended soundboard access</li>
        <li>2× clip length limit</li>
      </ul>
    </div>
    <div class="tier-card">
      <div class="tier-name">Creator</div>
      <div class="tier-price">5000 OVC <span class="period">/month</span></div>
      <ul class="tier-features">
        <li>Everything in VIP</li>
        <li>Stream collab access</li>
        <li>Custom overlay themes</li>
        <li>API token quota 10×</li>
        <li>Priority support</li>
      </ul>
    </div>
  </div>
</section>

<section class="section" style="background:var(--bg2);border-radius:16px;margin:0 auto;max-width:1100px;padding:48px 40px">
  <div class="section-label">OpenVibe Credits</div>
  <h2>One currency. Every surface.</h2>
  <p class="section-sub">OVC (OpenVibe Credits) works across the entire platform — tips, subscriptions, TTS, soundboards, game items.</p>
  <div class="credits-grid">
    <div class="credits-card"><div class="credits-amt">1 OVC</div><p class="muted">≈ $0.01 USD — fixed rate, no volatility</p></div>
    <div class="credits-card"><div class="credits-amt">TTS</div><p class="muted">Spend OVC to send text-to-speech messages in stream chat</p></div>
    <div class="credits-card"><div class="credits-amt">Soundboard</div><p class="muted">Trigger sound alerts with OVC during live broadcasts</p></div>
    <div class="credits-card"><div class="credits-amt">Tips</div><p class="muted">Send OVC directly to creators — no 3rd party required</p></div>
  </div>
</section>

<section class="section" style="margin-top:48px">
  <div class="section-label">Active plans</div>
  <h2>Creator subscription plans</h2>
  <p class="section-sub">Published plans from enrolled creators.</p>
  ${plansHtml}
</section>

<section class="section">
  <div class="section-label">Creators</div>
  <h2>Enrolled creators</h2>
  <p class="section-sub">Streamers and creators who offer VIP subscriptions on OpenVibe.</p>
  ${creatorsHtml}
</section>

<footer>
  <p>
    <a href="https://openvibe.network">OpenVibe</a> ·
    <a href="https://openvibe.live">Live</a> ·
    <a href="https://openvibe.tips">Tips</a> ·
    <a href="https://openvibe.community">Community</a> ·
    <a href="https://my.openvibe.network">Account</a>
  </p>
  <p style="margin-top:8px">Platform fee: ${escapeHtml(String(config.platformFeeBps || 0))} bps · Currency: ${escapeHtml(config.creditsCurrency || 'OVC')} · Subscriptions: ${subscriptionCount} active</p>
</footer>
</body></html>`;
}

function renderVipSubscribePage(planId) {
    const plan = safeRead(() => model.getPlan(planId), null);
    const economy = safeRead(() => model.getEconomyState(), { frozen: false });

    const planHtml = plan
        ? `<div class="plan-card">
            <div class="plan-badge">${plan.amount_minor === 0 ? 'FREE' : 'VIP'}</div>
            <h2>${escapeHtml(plan.name)}</h2>
            <div class="plan-price">${plan.amount_minor === 0 ? 'Free' : fmtMinor(plan.amount_minor, plan.currency)}<span class="plan-interval">/${escapeHtml(plan.billing_interval)}</span></div>
            ${plan.description ? `<p class="plan-desc">${escapeHtml(plan.description)}</p>` : ''}
           </div>`
        : `<div class="plan-card"><p class="muted">Subscription plan not found or no longer available.</p></div>`;

    const formHtml = plan && !economy.frozen
        ? `<form id="subscribe-form" class="subscribe-form">
            <input type="hidden" name="plan_id" value="${escapeHtml(planId)}" />
            <div class="form-group">
                <label for="sub-email">Email (optional — for receipt)</label>
                <input id="sub-email" name="email" type="email" placeholder="you@example.com" autocomplete="email" />
            </div>
            <p class="form-note">Payment via <strong>OpenVibe Credits (OVC)</strong>. You need credits in your wallet at <a href="https://my.openvibe.network">my.openvibe.network</a> to complete this subscription.</p>
            <button class="btn btn-primary" type="submit">Subscribe with OVC</button>
            <a class="btn btn-outline" href="https://openvibe.vip/">Back to plans</a>
           </form>
           <div id="subscribe-result" hidden></div>
           <script>
           document.getElementById('subscribe-form').addEventListener('submit', async function(e) {
               e.preventDefault();
               const btn = e.target.querySelector('button[type=submit]');
               btn.disabled = true;
               btn.textContent = 'Processing…';
               const result = document.getElementById('subscribe-result');
               try {
                   const res = await fetch('/api/vip/subscribe', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       credentials: 'include',
                       body: JSON.stringify({ plan_id: '${escapeHtml(planId)}' }),
                   });
                   const data = await res.json();
                   result.hidden = false;
                   if (res.ok) {
                       result.className = 'result-ok';
                       result.innerHTML = '<p>✅ Subscribed! Your VIP access is now active.</p><p><a href="https://openvibe.vip/">Back to VIP</a> · <a href="https://my.openvibe.network">My Account</a></p>';
                       e.target.hidden = true;
                   } else {
                       result.className = 'result-err';
                       result.innerHTML = '<p>⚠️ ' + (data.error || 'Unable to complete subscription. Check your OVC balance.') + '</p>';
                       btn.disabled = false;
                       btn.textContent = 'Subscribe with OVC';
                   }
               } catch {
                   result.hidden = false;
                   result.className = 'result-err';
                   result.innerHTML = '<p>⚠️ Network error. Please try again.</p>';
                   btn.disabled = false;
                   btn.textContent = 'Subscribe with OVC';
               }
           });
           <\/script>`
        : economy.frozen
            ? `<div class="banner-warn">⚠️ Economy is paused — subscriptions temporarily unavailable.</div><a class="btn btn-outline" href="https://openvibe.vip/">Back to plans</a>`
            : `<div class="banner-warn">This plan is no longer available.</div><a class="btn btn-outline" href="https://openvibe.vip/">Browse plans</a>`;

    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Subscribe — OpenVibe VIP</title>
<link rel="icon" type="image/svg+xml" href="https://openvibe.network/favicon.svg">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--accent:#a78bfa;--accent2:#7c3aed;--bg:#0a0b0f;--bg2:#111318;--text:#e2e8f0;--muted:#94a3b8;--border:rgba(255,255,255,.08)}
body{font:15px/1.6 system-ui,sans-serif;color:var(--text);background:var(--bg);min-height:100vh;display:flex;flex-direction:column}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.nav{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid var(--border);background:rgba(10,11,15,.9);backdrop-filter:blur(12px)}
.nav-brand{font-weight:700;font-size:1.1rem;color:#fff}
.nav-brand span{margin-right:6px}
.btn{display:inline-block;padding:10px 22px;border-radius:8px;font-size:.95rem;font-weight:600;cursor:pointer;border:none;text-decoration:none;transition:all .15s;margin-top:8px}
.btn-primary{background:linear-gradient(135deg,var(--accent2),var(--accent));color:#fff}
.btn-primary:hover{opacity:.9;text-decoration:none;transform:translateY(-1px)}
.btn-primary:disabled{opacity:.5;cursor:not-allowed;transform:none}
.btn-outline{background:transparent;color:var(--accent);border:1px solid var(--accent);margin-left:8px}
.btn-outline:hover{background:rgba(124,58,237,.1);text-decoration:none}
.container{max-width:640px;margin:60px auto;padding:0 24px;flex:1}
.back-link{color:var(--muted);font-size:.9rem;display:inline-block;margin-bottom:24px}
.back-link:hover{color:#fff}
h1{font-size:1.8rem;font-weight:800;margin-bottom:6px;background:linear-gradient(135deg,#fff,var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.section-sub{color:var(--muted);margin-bottom:32px}
.plan-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px 28px;margin-bottom:28px;position:relative}
.plan-badge{position:absolute;top:14px;right:14px;padding:3px 10px;border-radius:999px;font-size:.72rem;font-weight:700;text-transform:uppercase;background:rgba(124,58,237,.2);color:var(--accent)}
.plan-price{font-size:1.8rem;font-weight:800;margin:10px 0 10px;color:#fff}
.plan-interval{font-size:.85rem;font-weight:400;color:var(--muted)}
.plan-desc{color:var(--muted);font-size:.9rem;margin-top:6px}
.subscribe-form{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px 28px}
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:.88rem;color:var(--muted);margin-bottom:6px}
.form-group input{width:100%;padding:9px 12px;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:7px;color:#fff;font-size:.95rem;outline:none}
.form-group input:focus{border-color:var(--accent)}
.form-note{font-size:.84rem;color:var(--muted);margin-bottom:16px}
.form-note a{color:var(--accent)}
.result-ok{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:#6ee7b7;padding:14px 18px;border-radius:8px;margin-top:16px}
.result-err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#fca5a5;padding:14px 18px;border-radius:8px;margin-top:16px}
.banner-warn{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#fca5a5;padding:12px 18px;border-radius:8px;margin-bottom:20px}
.muted{color:var(--muted)}
footer{border-top:1px solid var(--border);padding:24px 32px;text-align:center;color:var(--muted);font-size:.82rem;margin-top:auto}
footer a{color:var(--muted)}footer a:hover{color:#fff}
</style>
</head>
<body>
<nav class="nav">
  <div class="nav-brand"><span>⭐</span> OpenVibe VIP</div>
</nav>
<div class="container">
  <a class="back-link" href="https://openvibe.vip/">← Back to plans</a>
  <h1>Subscribe to a plan</h1>
  <p class="section-sub">Complete your VIP subscription below.</p>
  ${planHtml}
  ${formHtml}
</div>
<footer><a href="https://openvibe.vip/">OpenVibe VIP</a> · <a href="https://openvibe.network">OpenVibe Network</a> · <a href="https://my.openvibe.network">My Account</a></footer>
</body></html>`;
}

function attachBillingHostShell(app) {
    app.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        const surface = detectBillingSurface(req.headers && req.headers.host);

        // VIP subscribe page — serves before static fallthrough
        if (surface === 'vip' && req.path.startsWith('/subscribe/')) {
            const planId = req.path.replace(/^\/subscribe\//, '').split('/')[0];
            if (planId) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(200).send(renderVipSubscribePage(planId));
            }
        }

        if (req.path !== '/' && req.path !== '/index.html') return next();
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
    renderVipSubscribePage,
    TIPS_HOSTS,
    VIP_HOSTS,
};
