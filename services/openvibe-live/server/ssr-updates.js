'use strict';

const {
    BUILD_UPDATES,
    renderSection,
    renderPage,
    escapeHtml,
} = require('./ssr-shared');

function renderUpdatesPage({ baseUrl, releases }) {
    const items = (releases && releases.length > 0) ? releases : BUILD_UPDATES;
    const updatesHtml = items.map((item) => `
        <article class="timeline-card" data-reveal data-update-id="${escapeHtml(String(item.id || ''))}">
            <div class="eyebrow">${escapeHtml(item.date)}</div>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <p class="card-body">${escapeHtml(item.body)}</p>
            ${item.url ? `<a class="link-inline" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">View on GitHub →</a>` : ''}
        </article>
    `).join('');
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">Release notes</div>
                <h1 class="hero-heading">Recent <span class="hero-gradient">OpenVibe Live updates</span></h1>
                <p>A focused record of changes landing in the native live surface — the kind of thing that should be easy to scan without trawling through implementation details.</p>
            </div>
        </section>
        ${renderSection({
            title: 'Shipped in this surface',
            subtitle: 'Current product deltas that affect the live discovery and routing experience.',
            content: `<div class="surface-grid">${updatesHtml}</div>`,
        })}
    `;
    return renderPage({
        title: 'Updates — openvibe.live',
        description: 'Recent changes to the OpenVibe Live discovery, routing, and product shell.',
        canonical: `${baseUrl}/updates`,
        activeNav: 'updates',
        bodyHtml: pageContent,
        baseUrl,
    });
}

module.exports = { renderUpdatesPage };
