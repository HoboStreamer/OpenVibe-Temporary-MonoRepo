'use strict';

// openvibe-tips — OBS overlay SSR renderer.
// Produces a self-contained HTML page with a tip-alert overlay.
// The page polls /api/v1/feed?creator_id=...&limit=1 every 5 seconds
// and animates new tips as they arrive.

function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

function renderOverlay(creator, recentTips, config) {
    const baseUrl     = String((config && config.publicBaseUrl) || '').replace(/\/$/, '');
    const accentColor = esc(creator.accent_color || '#f59e0b');
    const creatorId   = esc(creator.id);
    const displayName = esc(creator.display_name);

    const tipsJson = JSON.stringify(recentTips.map(t => ({
        id:        t.id,
        sender:    t.sender,
        amount:    t.amount_value,
        currency:  t.amount_currency,
        message:   t.message,
        source:    t.source,
        event_type: t.event_type,
        received_at: t.received_at,
    })));

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${displayName} — Tips Overlay — OpenVibe</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: transparent;
    font-family: 'Segoe UI', system-ui, sans-serif;
    overflow: hidden;
    width: 100vw;
    height: 100vh;
  }
  #overlay {
    position: fixed;
    bottom: 32px;
    left: 32px;
    right: 32px;
    pointer-events: none;
  }
  .tip-alert {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: rgba(0,0,0,0.82);
    backdrop-filter: blur(6px);
    border-left: 4px solid ${accentColor};
    border-radius: 10px;
    padding: 14px 18px;
    margin-bottom: 12px;
    max-width: 480px;
    animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards,
               fadeOut 0.4s ease-in 8s forwards;
    opacity: 0;
    transform: translateY(20px);
  }
  @keyframes slideIn {
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeOut {
    to { opacity: 0; transform: translateY(-10px); }
  }
  .tip-icon {
    font-size: 1.6rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .tip-body { min-width: 0; }
  .tip-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tip-sender {
    font-size: 1rem;
    font-weight: 700;
    color: ${accentColor};
    white-space: nowrap;
  }
  .tip-amount {
    font-size: 0.9rem;
    font-weight: 600;
    color: #fff;
    background: rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 1px 6px;
    white-space: nowrap;
  }
  .tip-source {
    font-size: 0.72rem;
    color: #888;
    margin-left: auto;
  }
  .tip-message {
    font-size: 0.88rem;
    color: #ddd;
    margin-top: 5px;
    word-break: break-word;
    line-height: 1.4;
  }
</style>
</head>
<body>
<div id="overlay"></div>
<script>
(function() {
  'use strict';

  const CREATOR_ID  = ${JSON.stringify(String(creatorId))};
  const BASE_URL    = ${JSON.stringify(baseUrl)};
  const ACCENT      = ${JSON.stringify(accentColor)};
  const POLL_MS     = 5000;
  const ALERT_TTL   = 9400; // slightly longer than CSS animation

  let lastSeenId = null;
  let seeding    = true;

  const overlay  = document.getElementById('overlay');

  function formatAmount(amount, currency) {
    const n = parseFloat(amount);
    if (isNaN(n)) return amount;
    const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '';
    return sym ? sym + n.toFixed(2) : n.toFixed(2) + ' ' + currency;
  }

  function sourceLabel(source) {
    const map = { native:'OpenVibe', streamlabs:'Streamlabs', streamelements:'StreamElements', powerchat:'PowerChat', generic:'Webhook' };
    return map[source] || source;
  }

  function showAlert(tip) {
    const el = document.createElement('div');
    el.className = 'tip-alert';
    const amount = formatAmount(tip.amount, tip.currency);
    const msg    = tip.message ? '<div class="tip-message">' + escHtml(tip.message) + '</div>' : '';
    const icon   = tip.event_type === 'tip' ? '💰' : tip.event_type === 'media_request' ? '🎵' : '🔔';
    el.innerHTML = '<div class="tip-icon">' + icon + '</div>' +
      '<div class="tip-body">' +
        '<div class="tip-header">' +
          '<span class="tip-sender">' + escHtml(tip.sender || 'Anonymous') + '</span>' +
          '<span class="tip-amount">' + escHtml(amount) + '</span>' +
          '<span class="tip-source">' + escHtml(sourceLabel(tip.source)) + '</span>' +
        '</div>' + msg +
      '</div>';
    overlay.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, ALERT_TTL);
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function poll() {
    const url = BASE_URL + '/api/v1/feed?creator_id=' + encodeURIComponent(CREATOR_ID) + '&limit=10';
    fetch(url).then(r => r.ok ? r.json() : null).then(data => {
      if (!data || !Array.isArray(data.events)) return;
      const events = data.events;
      if (seeding) {
        // On first load, just record the latest id — don't show alerts for old tips
        if (events.length > 0) lastSeenId = events[0].id;
        seeding = false;
        return;
      }
      // Show any events newer than lastSeenId
      const newEvents = lastSeenId
        ? events.filter(e => e.id > lastSeenId)
        : events;
      if (newEvents.length > 0) lastSeenId = newEvents[0].id;
      // Show in reverse order so latest appears on top
      for (let i = newEvents.length - 1; i >= 0; i--) {
        showAlert(newEvents[i]);
      }
    }).catch(() => {});
  }

  poll();
  setInterval(poll, POLL_MS);
})();
</script>
</body>
</html>`;
}

module.exports = { renderOverlay };
