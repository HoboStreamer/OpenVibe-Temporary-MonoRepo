'use strict';

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
    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenVibe Tips — hobo-friendly tipping</title>
<meta name="description" content="OpenVibe Tips is the hobo-friendly tipping surface. No subscription gates, no 30 percent platform tax, no fake hype meters.">
<meta name="robots" content="noindex">
<style>
  body { margin: 0; font: 15px/1.55 system-ui, sans-serif; color: #f3f4f6; background: radial-gradient(circle at top, rgba(245,158,11,.18), transparent 35%), #0b1018; }
  main { max-width: 760px; margin: 0 auto; padding: 56px 22px; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 .5rem; }
  p { color: #cbd5e1; max-width: 60ch; }
  .chip { display: inline-block; padding: .35rem .75rem; border-radius: 999px; background: rgba(245,158,11,.16); color: #fbd38d; font-size: .82rem; letter-spacing: .08em; text-transform: uppercase; }
  ul { color: #cbd5e1; }
  code { color: #fbd38d; }
</style>
</head><body><main>
<span class="chip">OpenVibe Tips · draft surface</span>
<h1>OpenVibe Tips</h1>
<p>OpenVibe Tips is the hobo-friendly tipping surface. No subscription gates, no 30% platform tax, no fake hype meters. Just a tip jar that loads, a credits ledger that adds up, and a creator that gets paid.</p>
<p>This is a draft host shell. The tipping API already lives at <code>POST /api/tips</code> on the billing service; this surface is staged so operators can validate host routing, smoke checks, and policy copy before launch.</p>
<ul>
  <li>Non-profit by design — platform fee stays disclosed, never hidden.</li>
  <li>No "tier" theatre — a tip is a tip.</li>
  <li>Operator freeze controls are documented, not buried.</li>
</ul>
</main></body></html>`;
}

function renderVipShell() {
    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenVibe VIP — hobo-tier subscriptions</title>
<meta name="description" content="OpenVibe VIP is a draft subscriptions surface. No premium-content paywalls on basic features, no fake exclusivity, no surprise renewals.">
<meta name="robots" content="noindex">
<style>
  body { margin: 0; font: 15px/1.55 system-ui, sans-serif; color: #f3f4f6; background: radial-gradient(circle at top, rgba(125,211,252,.16), transparent 35%), #0b1018; }
  main { max-width: 760px; margin: 0 auto; padding: 56px 22px; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 .5rem; }
  p { color: #cbd5e1; max-width: 60ch; }
  .chip { display: inline-block; padding: .35rem .75rem; border-radius: 999px; background: rgba(125,211,252,.16); color: #bae6fd; font-size: .82rem; letter-spacing: .08em; text-transform: uppercase; }
  ul { color: #cbd5e1; }
  code { color: #bae6fd; }
</style>
</head><body><main>
<span class="chip">OpenVibe VIP · draft surface</span>
<h1>OpenVibe VIP</h1>
<p>OpenVibe VIP is a draft subscriptions surface. No paywalls on basic features, no fake exclusivity, no surprise renewals. The platform stays usable without VIP; this is for folks who want to support the hobo internet on purpose.</p>
<p>The VIP API already lives at <code>POST /api/vip/plans</code> and <code>POST /api/vip/subscriptions</code> on the billing service. This shell is staged so operators can exercise host routing, smoke checks, and policy copy before public launch.</p>
<ul>
  <li>Cancel any time at <code>POST /api/vip/subscriptions/:id/cancel</code> — no email-only cancellation theatre.</li>
  <li>No "premium content" silos for features that should be free.</li>
  <li>Renewals are disclosed in the subscription record, not the fine print.</li>
</ul>
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
