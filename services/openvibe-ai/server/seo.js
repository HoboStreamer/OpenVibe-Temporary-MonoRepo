'use strict';

// openvibe-ai — SEO primitives. Pure helpers + indexability gate.

const crypto = require('crypto');

const DEFAULTS = Object.freeze({
    minWordCountByType: {
        wiki_page:    250,
        blog_post:    400,
        news_story:   200,
        review_page:  200,
        deal_page:    80,
        coupon_page:  40,
        trade_page:   200,
        codes_doc:    150,
        tool_page:    150,
        recipe_page:  150,
        generic_article: 200,
    },
    minSourceCountByType: {
        wiki_page: 2, news_story: 2, review_page: 2,
        deal_page: 1, coupon_page: 1, trade_page: 2,
    },
});

function normalizeSlug(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/['"’`]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 96);
}

function canonicalize({ host, pathname, query }) {
    const h = String(host || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    let p = String(pathname || '/');
    if (!p.startsWith('/')) p = '/' + p;
    p = p.replace(/\/{2,}/g, '/').replace(/\/index(\.html?|\.php)?$/i, '/');
    if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
    let q = '';
    if (query && typeof query === 'object') {
        const keys = Object.keys(query).filter(k => query[k] != null && query[k] !== '').sort();
        if (keys.length) q = '?' + keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join('&');
    }
    return `https://${h}${p}${q}`;
}

function duplicateHash({ title, body, sources }) {
    const norm = String(title || '').trim().toLowerCase() + '|' +
        String(body || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 4096) + '|' +
        (Array.isArray(sources) ? sources.map(s => (s.url || s.title || '').toLowerCase().trim()).sort().join(',') : '');
    return crypto.createHash('sha256').update(norm).digest('hex');
}

function generateMetadata(input) {
    const ct = input.content_type || 'generic_article';
    const title = String(input.title || input.name || '').trim();
    const desc  = String(input.description || input.summary || input.excerpt || '').trim();
    const slug  = normalizeSlug(input.slug || title);
    const host  = input.canonical_domain || 'openvibe.network';
    const path  = input.canonical_path || `/${slug}`;
    const canonical = canonicalize({ host, pathname: path });
    return {
        content_type:    ct,
        seo_title:       title.slice(0, 65),
        seo_description: desc.slice(0, 158),
        slug,
        canonical_url:   canonical,
        canonical_domain: host,
        og_title:        title.slice(0, 90),
        og_description:  desc.slice(0, 200),
        og_image_media_id: input.og_image_media_id || null,
        twitter_card:    input.twitter_card || 'summary_large_image',
        breadcrumbs:     input.breadcrumbs || [],
        ai_disclosure:   input.generated_by === 'ai' ? 'AI-generated content' : null,
    };
}

function evaluateIndexability(input) {
    const ct = input.content_type || 'generic_article';
    const minWords  = input.min_word_count   || DEFAULTS.minWordCountByType[ct] || 200;
    const minSources = input.min_source_count || DEFAULTS.minSourceCountByType[ct] || 0;
    const wordCount = Number(input.word_count || (input.body ? String(input.body).split(/\s+/).filter(Boolean).length : 0));
    const sourceCount = Number(input.source_count || (Array.isArray(input.sources) ? input.sources.length : 0));
    const generatedBy = input.generated_by || 'ai';
    const providerKey = input.provider_key || null;
    const productionMode = input.production_mode === true;
    const sensitive = !!input.sensitive_category;
    const manualReview = !!input.requires_manual_review;
    const dupeHashSeen = !!input.duplicate_hash_seen;
    const canonicalProvided = !!input.canonical_url;

    const reasons = [];
    const fixes = [];
    let directive = 'index,follow';

    if (wordCount < minWords) {
        reasons.push(`thin_content:${wordCount}<${minWords}`);
        fixes.push(`Reach at least ${minWords} words`);
        directive = 'noindex,follow';
    }
    if (minSources && sourceCount < minSources) {
        reasons.push(`insufficient_sources:${sourceCount}<${minSources}`);
        fixes.push(`Cite at least ${minSources} sources`);
        directive = 'noindex,follow';
    }
    if (generatedBy === 'ai' && providerKey === 'stub' && productionMode) {
        reasons.push('stub_generated_in_production');
        fixes.push('Use a non-stub provider in production');
        directive = 'noindex,follow';
    }
    if (dupeHashSeen && !canonicalProvided) {
        reasons.push('duplicate_without_canonical');
        fixes.push('Set canonical_url to the original');
        directive = 'noindex,follow';
    }
    if (sensitive && manualReview) {
        reasons.push('sensitive_pending_manual_review');
        fixes.push('Flag for manual review');
        directive = 'noindex,nofollow';
    }
    const status = directive === 'index,follow' ? 'ready' : 'noindex';
    const quality = Math.max(0, Math.min(1, (wordCount / Math.max(minWords, 1)) * 0.5 + (sourceCount / Math.max(minSources || 1, 1)) * 0.3 + (generatedBy === 'human' ? 0.2 : 0.1)));
    const freshness = input.published_at
        ? Math.max(0, 1 - ((Date.now() - new Date(input.published_at).getTime()) / (1000 * 60 * 60 * 24 * 365)))
        : null;
    return {
        indexing_status: status,
        robots_directive: directive,
        quality_score: Number(quality.toFixed(3)),
        freshness_score: freshness == null ? null : Number(freshness.toFixed(3)),
        reasons,
        required_fixes: fixes,
    };
}

// ── JSON-LD generators ────────────────────────────────────────────
function _ld(type, fields) {
    const out = { '@context': 'https://schema.org', '@type': type };
    for (const [k, v] of Object.entries(fields || {})) {
        if (v == null || (Array.isArray(v) && v.length === 0)) continue;
        out[k] = v;
    }
    return out;
}

function generateStructuredData(input) {
    const t = input.type || 'Article';
    const f = input.fields || {};
    switch (t) {
        case 'Article':
        case 'NewsArticle':
        case 'BlogPosting':
            return _ld(t, {
                headline: f.headline || f.title,
                description: f.description,
                datePublished: f.datePublished,
                dateModified: f.dateModified,
                author: f.author ? { '@type': 'Person', name: f.author } : undefined,
                publisher: f.publisher ? { '@type': 'Organization', name: f.publisher } : undefined,
                url: f.url, image: f.image,
            });
        case 'Review':
            // Only include reviewRating if it actually exists.
            return _ld('Review', {
                itemReviewed: f.itemReviewed,
                reviewBody: f.reviewBody,
                author: f.author ? { '@type': 'Person', name: f.author } : undefined,
                reviewRating: (f.ratingValue != null) ? {
                    '@type': 'Rating',
                    ratingValue: f.ratingValue,
                    bestRating: f.bestRating || 5,
                    worstRating: f.worstRating || 1,
                } : undefined,
            });
        case 'Product':
            return _ld('Product', {
                name: f.name, description: f.description, image: f.image,
                brand: f.brand ? { '@type': 'Brand', name: f.brand } : undefined,
                offers: (f.price != null && f.priceCurrency) ? {
                    '@type': 'Offer',
                    price: f.price, priceCurrency: f.priceCurrency,
                    availability: f.availability, url: f.url,
                } : undefined,
            });
        case 'Offer':
            if (f.price == null || !f.priceCurrency) return null; // never fabricate
            return _ld('Offer', {
                price: f.price, priceCurrency: f.priceCurrency,
                availability: f.availability, url: f.url,
                validThrough: f.validThrough,
            });
        case 'FAQPage':
            return _ld('FAQPage', {
                mainEntity: (f.questions || []).map(q => ({
                    '@type': 'Question', name: q.question,
                    acceptedAnswer: { '@type': 'Answer', text: q.answer },
                })),
            });
        case 'HowTo':
            return _ld('HowTo', {
                name: f.name, description: f.description,
                step: (f.steps || []).map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.name || `Step ${i + 1}`, text: s.text })),
            });
        case 'Recipe':
            if (!f.name || !Array.isArray(f.recipeIngredient)) return null;
            return _ld('Recipe', {
                name: f.name, description: f.description, image: f.image,
                recipeIngredient: f.recipeIngredient,
                recipeInstructions: f.recipeInstructions,
                totalTime: f.totalTime, recipeYield: f.recipeYield,
            });
        case 'SoftwareApplication':
            return _ld('SoftwareApplication', {
                name: f.name, description: f.description,
                applicationCategory: f.applicationCategory, operatingSystem: f.operatingSystem,
                url: f.url,
            });
        case 'Dataset':
            return _ld('Dataset', { name: f.name, description: f.description, url: f.url, license: f.license });
        case 'VideoObject':
            return _ld('VideoObject', {
                name: f.name, description: f.description, thumbnailUrl: f.thumbnailUrl,
                uploadDate: f.uploadDate, contentUrl: f.contentUrl, embedUrl: f.embedUrl, duration: f.duration,
            });
        case 'BreadcrumbList':
            return _ld('BreadcrumbList', {
                itemListElement: (f.items || []).map((it, i) => ({
                    '@type': 'ListItem', position: i + 1, name: it.name, item: it.url,
                })),
            });
        case 'WebSite':       return _ld('WebSite', { name: f.name, url: f.url });
        case 'Organization':  return _ld('Organization', { name: f.name, url: f.url, logo: f.logo });
        case 'LocalBusiness': return _ld('LocalBusiness', { name: f.name, address: f.address, telephone: f.telephone, url: f.url });
        default: return null;
    }
}

// ── Sitemap / RSS / robots ────────────────────────────────────────
function _xmlEscape(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function generateSitemap({ entries }) {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
    for (const e of entries || []) {
        if (!e || !e.loc) continue;
        if (e.indexable === false) continue;
        lines.push('  <url>');
        lines.push(`    <loc>${_xmlEscape(e.loc)}</loc>`);
        if (e.lastmod)    lines.push(`    <lastmod>${_xmlEscape(e.lastmod)}</lastmod>`);
        if (e.changefreq) lines.push(`    <changefreq>${_xmlEscape(e.changefreq)}</changefreq>`);
        if (e.priority != null) lines.push(`    <priority>${_xmlEscape(e.priority)}</priority>`);
        lines.push('  </url>');
    }
    lines.push('</urlset>');
    return lines.join('\n');
}

function generateSitemapIndex({ sitemaps }) {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
    for (const s of sitemaps || []) {
        if (!s || !s.loc) continue;
        lines.push('  <sitemap>');
        lines.push(`    <loc>${_xmlEscape(s.loc)}</loc>`);
        if (s.lastmod) lines.push(`    <lastmod>${_xmlEscape(s.lastmod)}</lastmod>`);
        lines.push('  </sitemap>');
    }
    lines.push('</sitemapindex>');
    return lines.join('\n');
}

function generateRssFeed({ channel, items }) {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0">', '  <channel>',
        `    <title>${_xmlEscape(channel && channel.title || '')}</title>`,
        `    <link>${_xmlEscape(channel && channel.link || '')}</link>`,
        `    <description>${_xmlEscape(channel && channel.description || '')}</description>`];
    for (const it of items || []) {
        lines.push('    <item>');
        lines.push(`      <title>${_xmlEscape(it.title || '')}</title>`);
        lines.push(`      <link>${_xmlEscape(it.link || '')}</link>`);
        if (it.guid)        lines.push(`      <guid>${_xmlEscape(it.guid)}</guid>`);
        if (it.pubDate)     lines.push(`      <pubDate>${_xmlEscape(it.pubDate)}</pubDate>`);
        if (it.description) lines.push(`      <description>${_xmlEscape(it.description)}</description>`);
        lines.push('    </item>');
    }
    lines.push('  </channel>', '</rss>');
    return lines.join('\n');
}

function generateAtomFeed({ feed, entries }) {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        `  <title>${_xmlEscape(feed && feed.title || '')}</title>`,
        `  <link href="${_xmlEscape(feed && feed.link || '')}" />`,
        `  <updated>${_xmlEscape(feed && feed.updated || new Date().toISOString())}</updated>`,
        `  <id>${_xmlEscape(feed && feed.id || feed && feed.link || '')}</id>`];
    for (const e of entries || []) {
        lines.push('  <entry>');
        lines.push(`    <title>${_xmlEscape(e.title || '')}</title>`);
        lines.push(`    <link href="${_xmlEscape(e.link || '')}" />`);
        lines.push(`    <id>${_xmlEscape(e.id || e.link || '')}</id>`);
        if (e.updated) lines.push(`    <updated>${_xmlEscape(e.updated)}</updated>`);
        if (e.summary) lines.push(`    <summary>${_xmlEscape(e.summary)}</summary>`);
        lines.push('  </entry>');
    }
    lines.push('</feed>');
    return lines.join('\n');
}

function generateRobotsTxt({ host, sitemaps, disallows, allows }) {
    const lines = ['User-agent: *'];
    for (const a of allows || [])     lines.push(`Allow: ${a}`);
    for (const d of disallows || [])  lines.push(`Disallow: ${d}`);
    if (host) lines.push(`Host: ${host}`);
    for (const sm of sitemaps || [])  lines.push(`Sitemap: ${sm}`);
    return lines.join('\n') + '\n';
}

module.exports = {
    DEFAULTS,
    normalizeSlug, canonicalize, duplicateHash,
    generateMetadata, evaluateIndexability,
    generateStructuredData,
    generateSitemap, generateSitemapIndex,
    generateRssFeed, generateAtomFeed, generateRobotsTxt,
};
