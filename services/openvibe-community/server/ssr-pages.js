'use strict';

const { escapeHtml, _shell, COMMUNITY_URLS } = require('./ssr-shared');

function renderPagesPage(registry, opts) {
    opts = opts || {};
    const pages = (registry || []);
    const notFound = opts.notFound || null;

    const pageCards = pages.length
        ? pages.map((p) => {
            const views = p.view_count || 0;
            const tags = (p.tags || []).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join('');
            return `<a class="glass-card" href="/pages/${encodeURIComponent(p.slug)}" style="display:block;text-decoration:none;position:relative;">
                <div class="pill-row">
                    <span class="pill primary">Community Page</span>
                    ${tags}
                </div>
                <h3 class="card-title" style="margin-top:.5rem;">${escapeHtml(p.title || p.slug)}</h3>
                <p class="card-body">${escapeHtml(p.description || '')}</p>
                <div class="card-kicker" style="margin-top:.4rem;">
                    by ${escapeHtml(p.author || 'unknown')}
                    ${views ? ` · ${views} view${views === 1 ? '' : 's'}` : ''}
                </div>
            </a>`;
        }).join('')
        : `<div class="empty-state"><p>No community pages yet.</p><p><a class="link-inline" href="/pages/submit">Submit the first one →</a></p></div>`;

    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Community Pages</h1>
            <p class="page-sub">Vibecoded pages built by the community. Personal homepages, tools, and experiments.</p>
        </section>
        <div class="section-head">
            <h2 class="section-title">${pages.length} page${pages.length === 1 ? '' : 's'}</h2>
            <a class="section-link" href="/pages/submit">Submit your page →</a>
        </div>
        ${notFound ? `<div class="empty-state" style="margin-bottom:1rem;"><p>Page <strong>${escapeHtml(notFound)}</strong> not found in the registry.</p></div>` : ''}
        <div class="card-grid">${pageCards}</div>`;

    return _shell({ title: 'Community Pages — OpenVibe', description: 'User-built pages on OpenVibe Community.', active: 'pages', bodyHtml });
}

function renderSubmitPage() {
    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Submit a Community Page</h1>
            <p class="page-sub">Got a vibecoded page you want hosted here? Here's how to get it in.</p>
        </section>

        <div class="glass-card" style="margin-bottom:1.2rem;">
            <div class="pill-row"><span class="pill primary">Step 1</span></div>
            <h3 class="card-title" style="margin-top:.5rem;">Build your page</h3>
            <p class="card-body">Write a self-contained HTML file. It can use inline CSS and JS. No build step required. Aim for one file — link to external CDN resources if you need libraries.</p>
        </div>

        <div class="glass-card" style="margin-bottom:1.2rem;">
            <div class="pill-row"><span class="pill primary">Step 2</span></div>
            <h3 class="card-title" style="margin-top:.5rem;">Name your file</h3>
            <p class="card-body">Use a slug that matches your handle or page name: <code>yourname.html</code>. It'll live at <code>/pages/yourname</code> on openvibe.community.</p>
        </div>

        <div class="glass-card" style="margin-bottom:1.2rem;">
            <div class="pill-row"><span class="pill primary">Step 3</span></div>
            <h3 class="card-title" style="margin-top:.5rem;">Submit it</h3>
            <p class="card-body">Drop your file in the <strong>OpenVibe Discord</strong> or open a pull request on the monorepo. Add your entry to <code>services/openvibe-community/server/pages-registry.json</code> with a title, author, and description — a maintainer will review and merge it.</p>
        </div>

        <div class="glass-card">
            <div class="pill-row"><span class="pill success">Guidelines</span></div>
            <h3 class="card-title" style="margin-top:.5rem;">Keep it clean</h3>
            <ul class="card-body" style="padding-left:1.2rem;margin:0.5rem 0 0;">
                <li>No malicious scripts, trackers, or data exfiltration.</li>
                <li>Content must comply with the OpenVibe community standards.</li>
                <li>Keep external requests minimal — no loading 40 third-party SDKs.</li>
                <li>Your page can link back to openvibe.network, your channel, pastes, etc.</li>
            </ul>
        </div>

        <div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap;">
            <a class="section-link" href="/pages">← Community Pages</a>
            <a class="section-link" href="${COMMUNITY_URLS.network}">Join the network</a>
        </div>`;

    return _shell({ title: 'Submit a Page — OpenVibe Community', description: 'How to contribute a community page to OpenVibe.', active: 'pages', bodyHtml });
}

module.exports = { renderPagesPage, renderSubmitPage };
