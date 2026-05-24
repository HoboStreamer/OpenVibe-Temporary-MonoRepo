'use strict';

const { _shell, _threadCard, _pasteCard } = require('./ssr-shared');

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

module.exports = { renderPulsePage };
