'use strict';

const { renderIcon } = require('@openvibe/icons');

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes || 0);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

function toIsoDate(value) {
    return new Date(value).toISOString();
}

function navItems(config) {
    return [
        { id: 'codes',   label: 'Codes',   href: `${config.surfaces.codes}/` },
        { id: 'blog',    label: 'Blog',    href: `${config.surfaces.blog}/` },
        { id: 'wiki',    label: 'Wiki',    href: `${config.surfaces.wiki}/` },
        { id: 'news',    label: 'News',    href: `${config.surfaces.news}/` },
        { id: 'reviews', label: 'Reviews', href: `${config.surfaces.reviews}/` },
        { id: 'deals',   label: 'Deals',   href: `${config.surfaces.deals}/` },
        { id: 'coupons', label: 'Coupons', href: `${config.surfaces.coupons}/` },
        { id: 'trade',   label: 'Trade',   href: `${config.surfaces.trade}/` },
        { id: 'host',    label: 'Host',    href: `${config.surfaces.host}/` },
    ];
}

function surfaceStatusNote(surface) {
    return surface.indexable ? null : surface.deferReason || null;
}

function surfaceKicker(surface) {
    if (!surface.indexable) return 'draft / noindex';
    return surface.implemented ? 'published' : 'deferred / noindex';
}

function pageForPath(surface, routePath) {
    if (routePath === '/' || routePath === '') return null;
    return surface.entries.find((entry) => entry.path === routePath) || null;
}

function buildJsonLd(surface, canonicalUrl, entry) {
    if (entry) {
        const base = {
            '@context': 'https://schema.org',
            '@type': entry.kind || 'Article',
            headline: entry.title,
            description: entry.summary,
            datePublished: toIsoDate(entry.publishedAt),
            mainEntityOfPage: canonicalUrl,
            publisher: { '@type': 'Organization', name: 'OpenVibe' },
        };
        if (surface.id === 'wiki') {
            base.inDefinedTermSet = surface.origin;
        }
        return base;
    }
    return {
        '@context': 'https://schema.org',
        '@type': surface.kind || 'WebSite',
        name: surface.label,
        url: canonicalUrl,
        description: surface.description,
        potentialAction: { '@type': 'ReadAction', target: canonicalUrl },
    };
}

function renderLayout({ config, surface, pageTitle, description, canonicalUrl, robots, bodyHtml, jsonLd, statusNote, currentPath }) {
    const title = pageTitle || surface.title;
    const nav = navItems(config).map((item) => {
        const active = item.id === surface.id ? 'ov-nav-link active' : 'ov-nav-link';
        return `<a class="${active}" href="${escapeHtml(item.href)}">${renderIcon(item.id, { decorative: true })}<span>${escapeHtml(item.label)}</span></a>`;
    }).join('');
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="${escapeHtml(robots)}">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <link rel="alternate" type="application/rss+xml" title="${escapeHtml(surface.label)} feed" href="${escapeHtml(surface.origin)}/feed.xml">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <link rel="stylesheet" href="/assets/openvibe-icons.css">
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <style>
        :root {
            color-scheme: dark;
            --bg: #07111d;
            --card: rgba(10, 28, 49, 0.86);
            --card-strong: rgba(16, 37, 62, 0.96);
            --border: rgba(148, 184, 255, 0.18);
            --fg: #ecf5ff;
            --muted: #9ab4d3;
            --accent: #6cc6ff;
            --accent-2: #8c7dff;
            --warning: #ffcc66;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            background: radial-gradient(circle at top, rgba(76, 125, 255, 0.2), transparent 34%), linear-gradient(180deg, #07111d 0%, #081523 100%);
            color: var(--fg);
            min-height: 100vh;
        }
        a { color: var(--accent); }
        .ov-shell { max-width: 1120px; margin: 0 auto; padding: 32px 20px 72px; }
        .ov-nav { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 28px; }
        .ov-brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.15rem; color: var(--fg); text-decoration: none; }
        .ov-nav-links { display: flex; gap: 14px; flex-wrap: wrap; }
        .ov-nav-link { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: var(--muted); padding: 8px 12px; border-radius: 999px; }
        .ov-nav-link.active, .ov-nav-link:hover { background: rgba(108, 198, 255, 0.12); color: var(--fg); }
        .ov-hero, .ov-card, .ov-note, article { background: var(--card); border: 1px solid var(--border); border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.22); }
        .ov-hero { padding: 28px; margin-bottom: 24px; }
        .ov-kicker { display: inline-flex; gap: 8px; align-items: center; padding: 8px 12px; border-radius: 999px; font-size: 0.85rem; color: var(--accent); background: rgba(108, 198, 255, 0.1); }
        .ov-hero h1 { font-size: clamp(2rem, 5vw, 3.3rem); line-height: 1.03; margin: 14px 0 12px; }
        .ov-hero p, .ov-copy p, .ov-meta { color: var(--muted); line-height: 1.7; }
        .ov-grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .ov-card { padding: 22px; }
        .ov-card h2, .ov-card h3 { margin-top: 0; }
        .ov-status { margin-bottom: 18px; padding: 14px 16px; border-radius: 16px; background: rgba(255, 204, 102, 0.12); border: 1px solid rgba(255, 204, 102, 0.26); color: #ffe7a8; }
        article { padding: 30px; }
        article h1 { margin-top: 0; font-size: clamp(2rem, 4vw, 3rem); }
        .ov-meta { display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.92rem; margin-bottom: 20px; }
        .ov-copy { display: grid; gap: 16px; }
        .ov-footer { margin-top: 36px; color: var(--muted); font-size: 0.92rem; }
        .ov-path { color: var(--muted); font-size: 0.85rem; margin-bottom: 12px; }
        @media (max-width: 720px) {
            .ov-nav { flex-direction: column; align-items: flex-start; }
        }
    </style>
</head>
<body>
    <div class="ov-shell">
        <header class="ov-nav">
            <a class="ov-brand" href="${escapeHtml(surface.origin)}/">${renderIcon(surface.id, { decorative: true })}<span>${escapeHtml(surface.label)}</span></a>
            <nav class="ov-nav-links" aria-label="OpenVibe content surfaces">${nav}</nav>
        </header>
        ${statusNote ? `<div class="ov-status">${escapeHtml(statusNote)}</div>` : ''}
        ${bodyHtml}
        <footer class="ov-footer">Rendered by ${escapeHtml(config.serviceId)} on ${escapeHtml(surface.host)} · current path: ${escapeHtml(currentPath || '/')}.</footer>
    </div>
</body>
</html>`;
}

function renderHome({ config, surface }) {
    const cards = surface.entries.map((entry) => `
        <section class="ov-card">
            <div class="ov-path">${escapeHtml(entry.path)}</div>
            <h2><a href="${escapeHtml(surface.origin + entry.path)}" style="display:inline-flex;align-items:center;gap:10px;">${renderIcon(surface.id, { decorative: true })}<span>${escapeHtml(entry.title)}</span></a></h2>
            <p>${escapeHtml(entry.summary)}</p>
            <div class="ov-meta"><span>${escapeHtml(new Date(entry.publishedAt).toISOString().slice(0, 10))}</span><span>${escapeHtml(entry.kind)}</span></div>
        </section>`).join('');
    const body = `
        <section class="ov-hero">
            <div class="ov-kicker">${renderIcon(surface.id, { decorative: true })}<span>${surfaceKicker(surface)}</span></div>
            <h1>${escapeHtml(surface.heroTitle)}</h1>
            <p>${escapeHtml(surface.heroText)}</p>
        </section>
        ${surface.entries.length ? `<div class="ov-grid">${cards}</div>` : `<section class="ov-card"><h2>Deferred host</h2><p>${escapeHtml(surface.deferReason || 'This public runtime is not live yet.')}</p></section>`}`;
    return renderLayout({
        config,
        surface,
        pageTitle: surface.title,
        description: surface.description,
        canonicalUrl: `${surface.origin}/`,
        robots: surface.indexable ? 'index,follow,max-image-preview:large' : 'noindex,nofollow',
        jsonLd: buildJsonLd(surface, `${surface.origin}/`, null),
        statusNote: surfaceStatusNote(surface),
        bodyHtml: body,
        currentPath: '/',
    });
}

function renderEntry({ config, surface, entry }) {
    const body = `
        <article>
            <div class="ov-path">${escapeHtml(surface.label)}${escapeHtml(entry.path)}</div>
            <h1>${escapeHtml(entry.title)}</h1>
            <div class="ov-meta"><span>${escapeHtml(new Date(entry.publishedAt).toISOString().slice(0, 10))}</span><span>${escapeHtml(entry.kind)}</span></div>
            <div class="ov-copy">${entry.sections.map((section) => `<p>${escapeHtml(section)}</p>`).join('')}</div>
        </article>`;
    return renderLayout({
        config,
        surface,
        pageTitle: `${entry.title} · ${surface.label}`,
        description: entry.summary,
        canonicalUrl: `${surface.origin}${entry.path}`,
        robots: surface.indexable ? 'index,follow,max-image-preview:large' : 'noindex,nofollow',
        jsonLd: buildJsonLd(surface, `${surface.origin}${entry.path}`, entry),
        statusNote: null,
        bodyHtml: body,
        currentPath: entry.path,
    });
}

function renderNotFound({ config, surface, routePath }) {
    const body = `
        <section class="ov-card">
            <h1>Page not found</h1>
            <p>The path <code>${escapeHtml(routePath)}</code> is not published on ${escapeHtml(surface.label)} yet.</p>
        </section>`;
    return renderLayout({
        config,
        surface,
        pageTitle: `Not found · ${surface.label}`,
        description: `No page is published for ${routePath} on ${surface.label}.`,
        canonicalUrl: `${surface.origin}${routePath}`,
        robots: 'noindex,nofollow',
        jsonLd: buildJsonLd(surface, `${surface.origin}${routePath}`, null),
        statusNote: surfaceStatusNote(surface),
        bodyHtml: body,
        currentPath: routePath,
    });
}

function buildFeedXml(surface) {
    const items = surface.entries.map((entry) => `
        <item>
            <title>${escapeHtml(entry.title)}</title>
            <link>${escapeHtml(surface.origin + entry.path)}</link>
            <guid>${escapeHtml(surface.origin + entry.path)}</guid>
            <pubDate>${new Date(entry.publishedAt).toUTCString()}</pubDate>
            <description>${escapeHtml(entry.summary)}</description>
        </item>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>${escapeHtml(surface.label)}</title>
        <link>${escapeHtml(surface.origin)}/</link>
        <description>${escapeHtml(surface.description)}</description>${items}
    </channel>
</rss>`;
}

function buildAtomXml(surface) {
    const items = surface.entries.map((entry) => `
        <entry>
            <title>${escapeHtml(entry.title)}</title>
            <link href="${escapeHtml(surface.origin + entry.path)}" />
            <id>${escapeHtml(surface.origin + entry.path)}</id>
            <updated>${toIsoDate(entry.publishedAt)}</updated>
            <summary>${escapeHtml(entry.summary)}</summary>
        </entry>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
    <title>${escapeHtml(surface.label)}</title>
    <id>${escapeHtml(surface.origin)}/</id>
    <updated>${toIsoDate(surface.entries[0] ? surface.entries[0].publishedAt : new Date())}</updated>${items}
</feed>`;
}

function buildSitemapXml(surface) {
    const urls = [`${surface.origin}/`, ...surface.entries.map((entry) => `${surface.origin}${entry.path}`)];
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `
    <url>
        <loc>${escapeHtml(url)}</loc>
    </url>`).join('')}
</urlset>`;
}

function buildRobotsTxt(surface) {
    if (!surface.indexable) {
        return `User-agent: *\nDisallow: /\n# ${surface.deferReason || 'Deferred surface'}\n`;
    }
    return `User-agent: *\nAllow: /\nSitemap: ${surface.origin}/sitemap.xml\n`;
}

function renderRequest({ config, surface, routePath }) {
    if (routePath === '/feed.xml') {
        return { status: 200, contentType: 'application/rss+xml; charset=utf-8', body: buildFeedXml(surface) };
    }
    if (routePath === '/atom.xml') {
        return { status: 200, contentType: 'application/atom+xml; charset=utf-8', body: buildAtomXml(surface) };
    }
    if (routePath === '/sitemap.xml') {
        return { status: 200, contentType: 'application/xml; charset=utf-8', body: buildSitemapXml(surface) };
    }
    if (routePath === '/robots.txt') {
        return { status: 200, contentType: 'text/plain; charset=utf-8', body: buildRobotsTxt(surface) };
    }
    const entry = pageForPath(surface, routePath);
    if (routePath === '/' || routePath === '') {
        return { status: 200, contentType: 'text/html; charset=utf-8', body: renderHome({ config, surface }) };
    }
    if (entry) {
        return { status: 200, contentType: 'text/html; charset=utf-8', body: renderEntry({ config, surface, entry }) };
    }
    return { status: 404, contentType: 'text/html; charset=utf-8', body: renderNotFound({ config, surface, routePath }) };
}

module.exports = {
    escapeHtml,
    formatBytes,
    toIsoDate,
    navItems,
    surfaceStatusNote,
    surfaceKicker,
    pageForPath,
    buildJsonLd,
    renderLayout,
    renderHome,
    renderEntry,
    renderNotFound,
    buildFeedXml,
    buildAtomXml,
    buildSitemapXml,
    buildRobotsTxt,
    renderRequest,
};
