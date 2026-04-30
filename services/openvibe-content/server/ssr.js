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
        { id: 'codes', label: 'Codes', href: `${config.surfaces.codes}/` },
        { id: 'blog', label: 'Blog', href: `${config.surfaces.blog}/` },
        { id: 'wiki', label: 'Wiki', href: `${config.surfaces.wiki}/` },
        { id: 'news', label: 'News', href: `${config.surfaces.news}/` },
        { id: 'reviews', label: 'Reviews', href: `${config.surfaces.reviews}/` },
        { id: 'deals', label: 'Deals', href: `${config.surfaces.deals}/` },
        { id: 'coupons', label: 'Coupons', href: `${config.surfaces.coupons}/` },
        { id: 'trade', label: 'Trade', href: `${config.surfaces.trade}/` },
        { id: 'host', label: 'Host', href: `${config.surfaces.host}/` },
    ];
}

function buildSurfaceCatalog(config) {
    const limits = config.limits;
    return {
        codes: {
            id: 'codes',
            host: 'openvibe.codes',
            origin: config.surfaces.codes,
            label: 'openvibe.codes',
            title: 'openvibe.codes — native docs and platform notes',
            description: 'Engineering notes, operator docs, and platform guides for the native OpenVibe runtime.',
            kind: 'WebSite',
            implemented: true,
            indexable: true,
            heroTitle: 'Native docs for the OpenVibe network',
            heroText: `Plain-English docs for an open, community-first platform. No marketing layer, no investor talking points — just how the runtime actually works. Public media objects hard-stop at ${formatBytes(limits.publicMediaObjectMaxBytes)} with a ${formatBytes(limits.targetPublicObjectBytes)} target and ${formatBytes(limits.warnPublicObjectBytes)} warning threshold.`,
            entries: [
                {
                    path: '/docs/host-routing-truth',
                    title: 'Host routing without localhost lies',
                    summary: 'How OpenVibe resolves canonical hosts locally without sprinkling raw loopback URLs across product surfaces.',
                    publishedAt: '2026-04-29T10:00:00.000Z',
                    kind: 'TechArticle',
                    sections: [
                        'Use the shared URL defaults to derive public origins per surface instead of hardcoding localhost or production-only URLs.',
                        'Host-aware services stay honest in staging by serving the same logical surfaces under *.localhost domains.',
                        'This keeps browser smoke meaningful and avoids fake prod links in prelaunch environments.',
                    ],
                },
                {
                    path: '/docs/production-readiness-reporting',
                    title: 'Truthful production-readiness reporting',
                    summary: 'Why the repo now produces layered readiness artifacts instead of a single optimistic checklist.',
                    publishedAt: '2026-04-29T11:30:00.000Z',
                    kind: 'TechArticle',
                    sections: [
                        'Per-surface readiness needs exact blockers: missing Redis, missing Postgres adapters, missing Cloudflare docs, or partial browser coverage.',
                        'Machine-readable JSON reports are generated so deploy/cutover flows can consume the same source of truth as humans.',
                        'Yellow means caveat; red means blocker. No fake green confetti cannons.',
                    ],
                },
            ],
        },
        blog: {
            id: 'blog',
            host: 'openvibe.blog',
            origin: config.surfaces.blog,
            label: 'openvibe.blog',
            title: 'openvibe.blog — build notes from the native platform cutover',
            description: 'Short-form product and engineering updates from the OpenVibe migration and production-readiness track.',
            kind: 'Blog',
            implemented: true,
            indexable: true,
            heroTitle: 'Build notes from a community-first platform',
            heroText: 'Honest dev notes from a no-investor, no-ad-network, no-startup-cosplay open platform. Wave-one hosts are real; deferred hosts stay marked draft/noindex until their backend seams are ready. Built in the open, kept boring on purpose.',
            entries: [
                {
                    path: '/posts/native-runtime-before-polish',
                    title: 'Ship the native runtime before polishing the wallpaper',
                    summary: 'A note on why honest readiness and host routing matter more than fake feature parity while the platform is still prelaunch.',
                    publishedAt: '2026-04-29T12:00:00.000Z',
                    kind: 'BlogPosting',
                    sections: [
                        'Migration, media, AI, staff/admin, and realtime foundations already existed in the repo before this content runtime landed.',
                        'The highest-value missing layer was public host delivery plus a readiness/reporting stack that reflects the actual repo state.',
                        'That is why some hosts are now shipped while others remain explicit noindex placeholders instead of pretend launch pages.',
                    ],
                },
                {
                    path: '/posts/readiness-truth-over-dashboard-fantasy',
                    title: 'Readiness truth over dashboard fantasy',
                    summary: 'A short note on refusing to paint missing backends green.',
                    publishedAt: '2026-04-29T12:30:00.000Z',
                    kind: 'BlogPosting',
                    sections: [
                        'If a service still depends on SQLite bootstrap or is missing Redis-backed fanout, the report should say so plainly.',
                        'Browser smoke belongs in the report, but absent hosts should fail honestly until the runtime exists.',
                    ],
                },
            ],
        },
        wiki: {
            id: 'wiki',
            host: 'openvibe.wiki',
            origin: config.surfaces.wiki,
            label: 'openvibe.wiki',
            title: 'openvibe.wiki — platform glossary and migration index',
            description: 'Reference pages for the OpenVibe platform, migration bundle, and production-readiness vocabulary.',
            kind: 'WebSite',
            implemented: true,
            indexable: true,
            heroTitle: 'Reference pages for the OpenVibe network',
            heroText: 'Plain-language vocabulary for the platform — no jargon walls, no premium tier behind a paywall. Wave one keeps the wiki focused on core concepts, the canonical bundle shape, and readiness gate semantics so anyone can fork it and run their own.',
            entries: [
                {
                    path: '/concepts/openvibe-target-bundle',
                    title: 'openvibe-target bundle',
                    summary: 'The canonical migration bundle used for staging loads, Postgres loads, and semantic validation.',
                    publishedAt: '2026-04-29T13:00:00.000Z',
                    kind: 'DefinedTerm',
                    sections: [
                        'The bundle is a file-based handoff that groups identity, control-plane, live, chat, community, media, billing, and games datasets.',
                        'Excluded rows such as secrets, sessions, reset tokens, and raw API keys must stay out of the canonical import shape.',
                    ],
                },
                {
                    path: '/concepts/readiness-gates',
                    title: 'readiness gates',
                    summary: 'Green, yellow, and red gate semantics for OpenVibe staging and production posture.',
                    publishedAt: '2026-04-29T13:30:00.000Z',
                    kind: 'DefinedTerm',
                    sections: [
                        'Green means implemented and verified.',
                        'Yellow means usable with caveats or manual action.',
                        'Red means blocker; production-ready should stay false until reds are gone.',
                    ],
                },
            ],
        },
        news: {
            id: 'news',
            host: 'openvibe.news',
            origin: config.surfaces.news,
            label: 'openvibe.news',
            title: 'openvibe.news — draft source review surface',
            description: 'Draft news publication surface that stays noindex until cited ingestion and review are complete.',
            kind: 'WebSite',
            implemented: true,
            indexable: false,
            readiness: 'yellow',
            deferReason: 'Source ingestion and review workflows exist in openvibe-ai, but the public news runtime is not ready for truthful launch yet.',
            heroTitle: 'Draft news pages stay reviewed and noindex',
            heroText: 'The AI/content control plane exists, and this public host is now rendered end to end, but it remains intentionally noindex until source review and publication states are fully wired.',
            entries: [
                {
                    path: '/briefs/source-review-pipeline',
                    title: 'Source review stays ahead of public indexing',
                    summary: 'How the OpenVibe news surface keeps draft output review-only until sources, status, and publication approvals line up.',
                    publishedAt: '2026-04-29T14:00:00.000Z',
                    kind: 'NewsArticle',
                    sections: [
                        'This draft surface intentionally avoids public indexing until the ingestion job, source transparency, and editorial review states agree.',
                        'No fake bylines, no fabricated quotes, and no made-up citations appear here while the review seam is still prelaunch.',
                        'The host is real, but the robots policy remains noindex so operators can verify HTML, canonical URLs, and structured data without pretending launch readiness.',
                    ],
                },
            ],
        },
        reviews: {
            id: 'reviews',
            host: 'openvibe.reviews',
            origin: config.surfaces.reviews,
            label: 'openvibe.reviews',
            title: 'openvibe.reviews — draft review workspace',
            description: 'Draft review surface that refuses fake stars, fake authors, and fake merchant claims.',
            kind: 'WebSite',
            implemented: true,
            indexable: false,
            readiness: 'yellow',
            deferReason: 'Review pages must not fabricate ratings, authors, or merchant facts. Public runtime remains draft-only until those seams are complete.',
            heroTitle: 'Reviews stay noindex until source truth is ready',
            heroText: 'No fake stars, no fake authors, no fake merchant claims. This host stays honest and noindex for now.',
            entries: [
                {
                    path: '/drafts/review-evidence-checklist',
                    title: 'Review evidence checklist before publication',
                    summary: 'What has to be true before a review page can ever become indexable on OpenVibe.',
                    publishedAt: '2026-04-29T14:10:00.000Z',
                    kind: 'Article',
                    sections: [
                        'Merchant facts, pricing, authorship, and citations must be attributable before a review page can move beyond draft mode.',
                        'This host currently renders only draft guidance pages so operators can validate the route, metadata, and noindex posture.',
                        'The absence of ratings here is deliberate: a blank rating is more truthful than a fake one.',
                    ],
                },
            ],
        },
        deals: {
            id: 'deals',
            host: 'openvibe.deals',
            origin: config.surfaces.deals,
            label: 'openvibe.deals',
            title: 'openvibe.deals — draft deal verification surface',
            description: 'Draft-only deal surface for source freshness and pricing verification workflows.',
            kind: 'WebSite',
            implemented: true,
            indexable: false,
            readiness: 'yellow',
            deferReason: 'Public deals pages need source freshness and pricing truth checks before launch.',
            heroTitle: 'Deals runtime remains a draft surface',
            heroText: 'This host is intentionally noindex until source freshness and merchant truth checks are online.',
            entries: [
                {
                    path: '/drafts/pricing-freshness-policy',
                    title: 'Pricing freshness policy for deal pages',
                    summary: 'Why OpenVibe deals pages stay draft until freshness windows and merchant attribution are verifiable.',
                    publishedAt: '2026-04-29T14:20:00.000Z',
                    kind: 'Article',
                    sections: [
                        'Deal pages must expire or refresh cleanly when pricing changes; stale prices are not a cute quirk, they are a product bug.',
                        'This draft host renders publication policy and verification notes only, with no fake discounts or synthetic offers.',
                        'The noindex stance remains in place until freshness and source-review jobs can prove the published numbers are current.',
                    ],
                },
            ],
        },
        coupons: {
            id: 'coupons',
            host: 'openvibe.coupons',
            origin: config.surfaces.coupons,
            label: 'openvibe.coupons',
            title: 'openvibe.coupons — draft coupon validation surface',
            description: 'Draft-only coupon surface focused on expiry, verification, and source trust.',
            kind: 'WebSite',
            implemented: true,
            indexable: false,
            readiness: 'yellow',
            deferReason: 'Coupon claims must be verifiable and time-bounded before public indexing is allowed.',
            heroTitle: 'Coupons are not launched yet',
            heroText: 'Coupon surfaces stay noindex until validation, expiry, and source review are all truthful.',
            entries: [
                {
                    path: '/drafts/coupon-expiry-guardrails',
                    title: 'Coupon expiry guardrails',
                    summary: 'A draft policy page for coupon freshness, expiration, and claim verification.',
                    publishedAt: '2026-04-29T14:30:00.000Z',
                    kind: 'Article',
                    sections: [
                        'Coupon pages remain noindex until the platform can prove codes, expiry windows, and source attribution are still valid.',
                        'The draft surface is intentionally useful for operator review without pretending a public coupon program exists today.',
                        'That means no fake promo codes, no fake savings values, and no invented merchant endorsements.',
                    ],
                },
            ],
        },
        trade: {
            id: 'trade',
            host: 'openvibe.trade',
            origin: config.surfaces.trade,
            label: 'openvibe.trade',
            title: 'openvibe.trade — draft market context surface',
            description: 'Draft-only market context surface that remains explicitly non-financial-advice.',
            kind: 'WebSite',
            implemented: true,
            indexable: false,
            readiness: 'yellow',
            deferReason: 'Trade pages require review gates, source transparency, and non-financial-advice handling before public launch.',
            heroTitle: 'Trade stays review-only and noindex',
            heroText: 'Any future trade content must remain explicitly non-financial-advice. This runtime is staged, not launched.',
            entries: [
                {
                    path: '/drafts/non-financial-advice-policy',
                    title: 'Non-financial-advice policy for trade pages',
                    summary: 'A draft policy page that explains why market context stays noindex until review and source transparency are enforced.',
                    publishedAt: '2026-04-29T14:40:00.000Z',
                    kind: 'Article',
                    sections: [
                        'This surface is for informational market context only and must never present itself as financial advice.',
                        'The draft runtime exists so operators can validate host routing, metadata, and disclaimer handling before any public launch.',
                        'That means no performance promises, no fake analyst voices, and no indexable pages until review gates are complete.',
                    ],
                },
            ],
        },
        host: {
            id: 'host',
            host: 'openvibe.host',
            origin: config.surfaces.host,
            label: 'openvibe.host',
            title: 'openvibe.host — draft creator hosting surface',
            description: 'Draft hosting surface for hobo creators who want a homepage, not a brand deal.',
            kind: 'WebSite',
            implemented: true,
            indexable: false,
            readiness: 'yellow',
            deferReason: 'Hosting pages stay noindex until profile claim flow, abuse handling, and quota policy are reviewed.',
            heroTitle: 'Host your hobo corner of the internet',
            heroText: 'A staged hosting shell so creators can park a profile without renting a brand-friendly platform. No clout grading, no algorithm. Just a place that loads.',
            entries: [
                {
                    path: '/drafts/hosting-policy',
                    title: 'Hobo hosting policy draft',
                    summary: 'Why openvibe.host stays noindex until profile claim, abuse handling, and quota policy are reviewed.',
                    publishedAt: '2026-04-30T12:00:00.000Z',
                    kind: 'Article',
                    sections: [
                        'openvibe.host is a creator hosting surface, not an influencer marketplace. The runtime exists so operators can validate routing and policy before launch.',
                        'No follower counts, no monetization gates, no fake creator tiers. Just a hobo corner of the internet that loads when the rest of the internet rents itself out.',
                        'Pages stay noindex until profile claim flow, abuse handling, and quota policy are reviewed and exercised end to end.',
                    ],
                },
            ],
        },
    };
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
            publisher: {
                '@type': 'Organization',
                name: 'OpenVibe',
            },
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
        potentialAction: {
            '@type': 'ReadAction',
            target: canonicalUrl,
        },
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

function hostStatuses(config) {
    const catalog = buildSurfaceCatalog(config);
    return Object.values(catalog).map((surface) => ({
        surface: surface.id,
        host: surface.host,
        origin: surface.origin,
        implemented: surface.implemented,
        indexable: surface.indexable,
        readiness: surface.readiness || (surface.implemented ? 'green' : 'yellow'),
        entry_count: surface.entries.length,
        defer_reason: surface.deferReason || null,
    }));
}

function renderRequest({ config, surfaceId, routePath }) {
    const catalog = buildSurfaceCatalog(config);
    const surface = catalog[surfaceId] || catalog.codes;
    if (routePath === '/feed.xml') {
        return {
            status: 200,
            contentType: 'application/rss+xml; charset=utf-8',
            body: buildFeedXml(surface),
        };
    }
    if (routePath === '/atom.xml') {
        return {
            status: 200,
            contentType: 'application/atom+xml; charset=utf-8',
            body: buildAtomXml(surface),
        };
    }
    if (routePath === '/sitemap.xml') {
        return {
            status: 200,
            contentType: 'application/xml; charset=utf-8',
            body: buildSitemapXml(surface),
        };
    }
    if (routePath === '/robots.txt') {
        return {
            status: 200,
            contentType: 'text/plain; charset=utf-8',
            body: buildRobotsTxt(surface),
        };
    }

    const entry = pageForPath(surface, routePath);
    if (routePath === '/' || routePath === '') {
        return {
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: renderHome({ config, surface }),
        };
    }
    if (entry) {
        return {
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: renderEntry({ config, surface, entry }),
        };
    }
    return {
        status: 404,
        contentType: 'text/html; charset=utf-8',
        body: renderNotFound({ config, surface, routePath }),
    };
}

module.exports = {
    buildSurfaceCatalog,
    buildRobotsTxt,
    buildSitemapXml,
    buildFeedXml,
    buildAtomXml,
    formatBytes,
    hostStatuses,
    renderRequest,
};
