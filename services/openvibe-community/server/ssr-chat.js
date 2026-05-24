'use strict';

const { escapeHtml, timeAgo, _shell } = require('./ssr-shared');

function renderChatPage(discordMessages, opts) {
    opts = opts || {};
    const messages = (discordMessages || []).slice(0, 100);
    const messagesHtml = messages.length
        ? messages.map((m) => {
            const meta     = m.metadata || {};
            const username = escapeHtml(meta.username || m.discord_channel_id || 'Unknown');
            const content  = escapeHtml(meta.content  || meta.text || '');
            const ts       = timeAgo(m.created_at);
            return `<div class="glass-card" style="padding:1rem 1.25rem;">
                <div style="display:flex;gap:0.7rem;align-items:baseline;">
                    <strong style="color:var(--accent);">${username}</strong>
                    <span style="color:var(--muted);font-size:0.82rem;">${ts}</span>
                </div>
                ${content ? `<p style="margin:0.4rem 0 0;">${content}</p>` : ''}
            </div>`;
        }).join('')
        : `<div class="empty-state"><p>No messages yet. Community Discord messages will appear here as they arrive.</p></div>`;

    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Chat</h1>
            <p class="hero-sub">Recent messages relayed from the OpenVibe Discord community.</p>
        </section>
        <section class="section-panel">
            <div class="section-head">
                <h2 class="section-title">Recent messages</h2>
            </div>
            <div class="list-stack" style="display:flex;flex-direction:column;gap:0.6rem;" data-chat-messages>
                ${messagesHtml}
            </div>
        </section>`;
    return _shell({ title: 'Chat — OpenVibe Community', description: 'Recent community chat messages relayed from Discord.', active: 'chat', bodyHtml });
}

module.exports = { renderChatPage };
