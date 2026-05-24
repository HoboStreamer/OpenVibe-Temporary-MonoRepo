'use strict';

const { escapeHtml, timeAgo, _forumShell, SIGN_IN_URL, COMMUNITY_URLS } = require('./ssr-shared');

function renderForumHomePage(spaces, recentThreads) {
    const spacesHtml = (spaces || []).length
        ? (spaces || []).map((s) => {
            const name = escapeHtml(s.name || s.slug || 'Space');
            const desc = s.description ? `<p style="color:var(--muted);font-size:0.9rem;margin:0.3rem 0 0;">${escapeHtml(String(s.description).slice(0, 120))}</p>` : '';
            const threadCount = s.thread_count || 0;
            return `<a class="card" href="/forum/s/${encodeURIComponent(s.slug || s.id)}" style="display:block;text-decoration:none;">
                <div class="card-kicker">${threadCount} thread${threadCount !== 1 ? 's' : ''}</div>
                <div style="font-weight:700;font-size:1rem;margin-top:0.25rem;">${name}</div>
                ${desc}
            </a>`;
        }).join('')
        : `<div class="empty-state">No spaces yet. Start a discussion!</div>`;

    const threadsHtml = (recentThreads || []).length
        ? (recentThreads || []).map((t) => {
            const title = escapeHtml(t.title || 'Untitled');
            const space = t.space_slug ? `<a class="link-inline" href="/forum/s/${encodeURIComponent(t.space_slug)}">${escapeHtml(t.space_slug)}</a>` : '';
            return `<a class="card" href="/forum/t/${encodeURIComponent(t.id)}" style="display:block;text-decoration:none;">
                <div class="card-kicker">${space} · ${timeAgo(t.created_at)}</div>
                <div style="font-weight:600;margin-top:0.2rem;">${title}</div>
                ${t.body ? `<div style="color:var(--muted);font-size:0.85rem;margin-top:0.25rem;">${escapeHtml(String(t.body).slice(0, 120))}</div>` : ''}
            </a>`;
        }).join('')
        : `<div class="empty-state">No recent discussions.</div>`;

    const bodyHtml = `
        <section class="hero">
            <h1 class="page-title">OpenVibe Forum</h1>
            <p style="color:var(--muted);max-width:540px;">Community discussions across the OpenVibe network. Ask questions, share ideas, get help.</p>
            <div class="ov-cta-row" style="margin-top:1rem;">
                <a class="button" href="${SIGN_IN_URL}">Sign in to post</a>
                <a class="button-secondary" href="/threads">Browse all threads</a>
            </div>
        </section>
        <section class="section-panel">
            <div class="section-head">
                <h2 class="section-title">Spaces</h2>
                <a class="section-link" href="/threads">See all threads →</a>
            </div>
            <div class="cards-grid">${spacesHtml}</div>
        </section>
        <section class="section-panel" style="margin-top:1.5rem;">
            <div class="section-head"><h2 class="section-title">Recent discussions</h2></div>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">${threadsHtml}</div>
        </section>`;

    return _forumShell({ title: 'OpenVibe Forum', description: 'Community discussions on OpenVibe', active: 'home', bodyHtml });
}

function renderForumSpacePage(space, threads) {
    if (!space) {
        const bodyHtml = `<div class="empty-state"><h2>Space not found</h2><p><a class="link-inline" href="/forum">Back to forum</a></p></div>`;
        return _forumShell({ title: 'Space Not Found · OpenVibe Forum', active: 'threads', bodyHtml });
    }
    const name = escapeHtml(space.name || space.slug || 'Space');
    const threadsHtml = (threads || []).length
        ? (threads || []).map((t) => {
            const title = escapeHtml(t.title || 'Untitled');
            return `<a class="card" href="/forum/t/${encodeURIComponent(t.id)}" style="display:block;text-decoration:none;">
                <div class="card-kicker">${timeAgo(t.created_at)} · ${t.score > 0 ? `▲${t.score}` : `${t.score} pts`}</div>
                <div style="font-weight:600;margin-top:0.2rem;">${title}</div>
                ${t.body ? `<div style="color:var(--muted);font-size:0.85rem;margin-top:0.2rem;">${escapeHtml(String(t.body).slice(0, 100))}</div>` : ''}
            </a>`;
        }).join('')
        : `<div class="empty-state">No threads in this space yet.</div>`;

    const bodyHtml = `
        <section class="hero">
            <a class="link-inline" href="/forum" style="font-size:0.9rem;">← Forum home</a>
            <h1 class="page-title" style="margin-top:0.5rem;">${name}</h1>
            ${space.description ? `<p style="color:var(--muted);">${escapeHtml(space.description)}</p>` : ''}
        </section>
        <section class="section-panel">
            <div class="section-head"><h2 class="section-title">Threads</h2></div>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">${threadsHtml}</div>
        </section>`;
    return _forumShell({ title: `${name} · OpenVibe Forum`, description: space.description || name, active: 'threads', bodyHtml });
}

function renderForumThreadPage(thread, posts) {
    if (!thread) {
        const bodyHtml = `<div class="empty-state"><h2>Thread not found</h2><p><a class="link-inline" href="/forum">Back to forum</a></p></div>`;
        return _forumShell({ title: 'Not Found · OpenVibe Forum', active: 'threads', bodyHtml });
    }
    const title = escapeHtml(thread.title || 'Untitled');
    const postsHtml = (posts || []).length
        ? (posts || []).map((p) => `<div class="card">
            <div class="card-kicker">${escapeHtml(p.author_user_id || 'anonymous')} · ${timeAgo(p.created_at)}</div>
            <div style="margin-top:0.5rem;white-space:pre-wrap;">${escapeHtml(String(p.body || '').slice(0, 2000))}</div>
        </div>`).join('')
        : `<div class="empty-state">No replies yet.</div>`;

    const bodyHtml = `
        <section class="hero">
            <a class="link-inline" href="/forum" style="font-size:0.9rem;">← Forum home</a>
            <h1 class="page-title" style="margin-top:0.5rem;">${title}</h1>
            ${thread.body ? `<div class="card" style="margin-top:1rem;white-space:pre-wrap;">${escapeHtml(String(thread.body).slice(0, 2000))}</div>` : ''}
        </section>
        <section class="section-panel" style="margin-top:1.5rem;">
            <div class="section-head"><h2 class="section-title">${(posts || []).length} ${(posts || []).length === 1 ? 'reply' : 'replies'}</h2></div>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">${postsHtml}</div>
        </section>
        <section class="section-panel" style="margin-top:1.5rem;">
            <div class="section-head"><h2 class="section-title">Reply</h2></div>
            <div class="empty-state" style="text-align:left;">
                <p style="margin:0;"><a class="link-inline" href="${SIGN_IN_URL}">Sign in</a> to post a reply.</p>
            </div>
        </section>`;
    return _forumShell({ title: `${title} · OpenVibe Forum`, description: thread.body ? String(thread.body).slice(0, 160) : thread.title || 'Thread', active: 'threads', bodyHtml });
}

module.exports = { renderForumHomePage, renderForumSpacePage, renderForumThreadPage };
