'use strict';

// openvibe-ai — product-facing workflow output packager. Converts raw model
// responses into product-specific drafts with SEO, source transparency, and
// search-index payloads for OpenVibe content surfaces.

const model = require('./model');
const seo = require('./seo');

const WORKFLOW_DEFAULTS = Object.freeze({
    'wiki.generate_space': {
        product_key: 'openvibe.wiki',
        site_label: 'OpenVibe Wiki',
        canonical_host: 'openvibe.wiki',
        canonical_path_prefix: '/spaces',
        content_type: 'wiki_page',
        schema_type: 'Article',
        index_key: 'wiki',
        document_type: 'wiki_space',
        recommended_source_keys: ['json_ld_article', 'sitemap_blog', 'rss_blog_generic'],
        section_titles: ['Overview', 'Scope', 'Sources'],
    },
    'wiki.generate_page': {
        product_key: 'openvibe.wiki',
        site_label: 'OpenVibe Wiki',
        canonical_host: 'openvibe.wiki',
        canonical_path_prefix: '/pages',
        content_type: 'wiki_page',
        schema_type: 'Article',
        index_key: 'wiki',
        document_type: 'wiki_page',
        recommended_source_keys: ['json_ld_article', 'sitemap_blog', 'rss_blog_generic'],
        section_titles: ['Overview', 'Key facts', 'Sources'],
    },
    'blog.draft_post': {
        product_key: 'openvibe.blog',
        site_label: 'OpenVibe Blog',
        canonical_host: 'openvibe.blog',
        canonical_path_prefix: '/posts',
        content_type: 'blog_post',
        schema_type: 'BlogPosting',
        index_key: 'blog',
        document_type: 'blog_post',
        recommended_source_keys: ['wordpress_posts', 'rss_blog_generic', 'sitemap_blog'],
        section_titles: ['Hook', 'Draft', 'Source notes'],
    },
    'news.summarize_story': {
        product_key: 'openvibe.news',
        site_label: 'OpenVibe News',
        canonical_host: 'openvibe.news',
        canonical_path_prefix: '/stories',
        content_type: 'news_story',
        schema_type: 'NewsArticle',
        index_key: 'news',
        document_type: 'news_story',
        recommended_source_keys: ['gdelt_doc', 'newsapi_top', 'rss_news_generic', 'youtube_news', 'reddit_topic'],
        section_titles: ['Lede', 'What happened', 'Sources'],
    },
    'news.compare_perspectives': {
        product_key: 'openvibe.news',
        site_label: 'OpenVibe News',
        canonical_host: 'openvibe.news',
        canonical_path_prefix: '/perspectives',
        content_type: 'news_story',
        schema_type: 'NewsArticle',
        index_key: 'news',
        document_type: 'news_perspectives',
        recommended_source_keys: ['gdelt_doc', 'newsapi_top', 'rss_news_generic', 'youtube_news', 'reddit_topic'],
        section_titles: ['Angle', 'Comparison', 'Sources'],
    },
    'reviews.summarize_entity': {
        product_key: 'openvibe.reviews',
        site_label: 'OpenVibe Reviews',
        canonical_host: 'openvibe.reviews',
        canonical_path_prefix: '/reviews',
        content_type: 'review_page',
        schema_type: 'Review',
        index_key: 'reviews',
        document_type: 'review_page',
        recommended_source_keys: ['yelp_places', 'reddit_reviews', 'review_struct'],
        section_titles: ['Verdict', 'Highlights', 'Sources'],
    },
    'deals.enrich_deal': {
        product_key: 'openvibe.deals',
        site_label: 'OpenVibe Deals',
        canonical_host: 'openvibe.deals',
        canonical_path_prefix: '/deals',
        content_type: 'deal_page',
        schema_type: 'Product',
        index_key: 'deals',
        document_type: 'deal_page',
        recommended_source_keys: ['ebay_browse', 'dealnews_rss', 'product_json_ld'],
        section_titles: ['Offer summary', 'Why it matters', 'Sources'],
    },
    'coupons.extract_coupon': {
        product_key: 'openvibe.coupons',
        site_label: 'OpenVibe Coupons',
        canonical_host: 'openvibe.coupons',
        canonical_path_prefix: '/coupons',
        content_type: 'coupon_page',
        schema_type: 'Article',
        index_key: 'coupons',
        document_type: 'coupon_page',
        recommended_source_keys: ['rakuten_coupons', 'merchant_coupon'],
        section_titles: ['Coupon details', 'How to redeem', 'Restrictions'],
    },
    'trade.summarize_market_context': {
        product_key: 'openvibe.trade',
        site_label: 'OpenVibe Trade',
        canonical_host: 'openvibe.trade',
        canonical_path_prefix: '/markets',
        content_type: 'trade_page',
        schema_type: 'Article',
        index_key: 'trade',
        document_type: 'trade_page',
        recommended_source_keys: ['alpha_vantage', 'coingecko', 'finnhub', 'sec_edgar'],
        section_titles: ['Market context', 'Watch list', 'Sources'],
    },
    'codes.generate_docs': {
        product_key: 'openvibe.codes',
        site_label: 'OpenVibe Codes',
        canonical_host: 'openvibe.codes',
        canonical_path_prefix: '/docs',
        content_type: 'codes_doc',
        schema_type: 'SoftwareApplication',
        index_key: 'codes',
        document_type: 'codes_doc',
        recommended_source_keys: ['sitemap_xml', 'json_ld_article', 'robots_txt'],
        section_titles: ['Quickstart', 'Reference notes', 'Source notes'],
        applicationCategory: 'DeveloperApplication',
    },
    'tools.describe': {
        product_key: 'openvibe.tools',
        site_label: 'OpenVibe Tools',
        canonical_host: 'openvibe.tools',
        canonical_path_prefix: '/tools',
        content_type: 'tool_page',
        schema_type: 'SoftwareApplication',
        index_key: 'tools',
        document_type: 'tool_page',
        recommended_source_keys: ['product_json_ld', 'review_struct', 'reddit_reviews', 'ebay_browse'],
        section_titles: ['Overview', 'Use cases', 'Adoption notes'],
        applicationCategory: 'DeveloperApplication',
    },
    'games.generate_lore': {
        product_key: 'openvibe.games',
        site_label: 'OpenVibe Games',
        canonical_host: 'openvibe.games',
        canonical_path_prefix: '/lore',
        content_type: 'generic_article',
        schema_type: 'Article',
        index_key: 'games',
        document_type: 'game_lore',
        recommended_source_keys: ['youtube_news', 'reddit_topic', 'rss_blog_generic'],
        section_titles: ['World', 'Hooks', 'Sources'],
    },
});

function _firstString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function _compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function _excerpt(value, limit) {
    const s = _compact(value);
    if (!s) return '';
    if (s.length <= limit) return s;
    return s.slice(0, limit - 1).trimEnd() + '…';
}

function _wordCount(value) {
    const s = _compact(value);
    return s ? s.split(/\s+/).filter(Boolean).length : 0;
}

function _stringList(value) {
    if (!Array.isArray(value)) return [];
    return value.map(v => (typeof v === 'string' ? _compact(v) : '')).filter(Boolean);
}

function _flattenText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(_flattenText).filter(Boolean).join('\n');
    if (value && typeof value === 'object') {
        return Object.entries(value)
            .map(([key, nested]) => {
                const text = _flattenText(nested);
                return text ? `${key}: ${text}` : '';
            })
            .filter(Boolean)
            .join('\n');
    }
    return '';
}

function _metadataFor(workflowKey, workflow) {
    return Object.assign({}, WORKFLOW_DEFAULTS[workflowKey] || {}, workflow && (workflow.metadata_json || workflow.metadata || {}));
}

function _normalizeCitations(sourceRecords, suppliedSources, output) {
    const raw = Array.isArray(sourceRecords) && sourceRecords.length
        ? sourceRecords
        : Array.isArray(suppliedSources) && suppliedSources.length
            ? suppliedSources
            : Array.isArray(output && output.sources)
                ? output.sources
                : [];
    return raw.map((source, index) => ({
        id: source.id || source.source_id || `${seo.normalizeSlug(source.title || source.url || 'source') || 'source'}-${index + 1}`,
        source_type: source.source_type || source.type || null,
        title: source.title || source.name || null,
        url: source.url || null,
        author: source.author || null,
        published_at: source.published_at || null,
        snippet: source.snippet || source.summary || null,
        trust_score: source.trust_score == null ? null : source.trust_score,
    }));
}

function _registrySources(meta) {
    if (Array.isArray(meta.recommended_source_keys) && meta.recommended_source_keys.length) {
        return meta.recommended_source_keys
            .map(key => model.getContentSourceByKey(key))
            .filter(Boolean)
            .map(source => ({
                source_key: source.source_key,
                source_name: source.source_name,
                source_type: source.source_type,
                category: source.category,
                enabled: !!source.enabled,
                auth_mode: source.auth_mode,
                requires_review: !!source.requires_review,
            }));
    }
    if (!meta.source_category) return [];
    return model.listContentSources({ category: meta.source_category }).map(source => ({
        source_key: source.source_key,
        source_name: source.source_name,
        source_type: source.source_type,
        category: source.category,
        enabled: !!source.enabled,
        auth_mode: source.auth_mode,
        requires_review: !!source.requires_review,
    }));
}

function _sourceNotes(citations, registrySources) {
    if (citations.length) {
        return citations
            .map(citation => `${citation.title || citation.url || citation.id}${citation.url ? ` — ${citation.url}` : ''}`)
            .join('\n');
    }
    if (registrySources.length) {
        return registrySources
            .map(source => `${source.source_name} (${source.source_key})${source.enabled ? '' : ' [disabled]'}`)
            .join('\n');
    }
    return 'Attach source records to improve citations, indexability, and search payload quality.';
}

function _composeDraft(rawOutput, input) {
    const raw = rawOutput && typeof rawOutput === 'object'
        ? rawOutput
        : { text: _flattenText(rawOutput) };
    return {
        raw,
        title: _firstString(
            raw.title,
            raw.headline,
            input.title,
            input.topic,
            input.name,
            input.entity,
            input.asset,
            input.product_name,
            input.tool_name,
            input.game_name,
            input.subject,
            input.space_name,
            input.page_title
        ),
        summary: _firstString(raw.summary, raw.description, input.summary, input.excerpt, input.description),
        body: _firstString(raw.body, raw.text, input.body, input.description, _flattenText(raw.data)),
        bullets: _stringList(raw.bullets),
        data: raw.data || null,
    };
}

function _buildSections(meta, draft, citations, registrySources, input) {
    const titles = Array.isArray(meta.section_titles) && meta.section_titles.length
        ? meta.section_titles
        : ['Overview', 'Details', 'Sources'];
    const contentPool = [
        draft.body || draft.summary || _flattenText(input),
        draft.bullets.length ? draft.bullets.join('\n') : _flattenText(draft.data || input.highlights || input.facts || {}),
        _sourceNotes(citations, registrySources),
    ];
    return titles
        .map((title, index) => ({
            key: seo.normalizeSlug(title) || `section-${index + 1}`,
            title,
            content: _excerpt(contentPool[Math.min(index, contentPool.length - 1)], index === 0 ? 1600 : 1000),
        }))
        .filter(section => section.content);
}

function _canonicalPath(prefix, slug) {
    const cleanPrefix = String(prefix || '').replace(/^\/+|\/+$/g, '');
    return `/${[cleanPrefix, slug].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
}

function _structuredData(meta, title, summary, canonicalUrl, input, bodyText) {
    const schemaType = meta.schema_type || 'Article';
    switch (schemaType) {
        case 'Review':
            return seo.generateStructuredData({
                type: 'Review',
                fields: {
                    itemReviewed: _firstString(input.entity, input.product_name, input.name, title),
                    reviewBody: _excerpt(bodyText, 600),
                    author: _firstString(input.author),
                    ratingValue: input.ratingValue != null ? input.ratingValue : input.rating,
                },
            });
        case 'Product':
            return seo.generateStructuredData({
                type: 'Product',
                fields: {
                    name: _firstString(input.product_name, input.name, title),
                    description: summary,
                    image: input.image || input.image_url || null,
                    brand: input.brand || null,
                    price: input.price != null ? input.price : null,
                    priceCurrency: input.priceCurrency || input.currency || null,
                    availability: input.availability || null,
                    url: canonicalUrl,
                },
            });
        case 'SoftwareApplication':
            return seo.generateStructuredData({
                type: 'SoftwareApplication',
                fields: {
                    name: _firstString(input.tool_name, input.name, input.subject, title),
                    description: summary,
                    applicationCategory: input.applicationCategory || meta.applicationCategory || 'DeveloperApplication',
                    operatingSystem: input.operatingSystem || meta.operatingSystem || null,
                    url: canonicalUrl,
                },
            });
        default:
            return seo.generateStructuredData({
                type: schemaType,
                fields: {
                    title,
                    headline: title,
                    description: summary,
                    url: canonicalUrl,
                    author: _firstString(input.author),
                    publisher: meta.site_label,
                    datePublished: input.published_at || input.datePublished || null,
                    dateModified: input.updated_at || input.dateModified || null,
                    image: input.image || input.image_url || null,
                },
            });
    }
}

function shapeWorkflowOutput({ workflowKey, workflow, route, input, output, sourceRecords, suppliedSources, providerKey, config, targetType, targetId }) {
    const meta = _metadataFor(workflowKey, workflow);
    if (!meta.product_key && !meta.content_type) return output;

    const draft = _composeDraft(output, input || {});
    const registrySources = _registrySources(meta);
    const citations = _normalizeCitations(sourceRecords, suppliedSources, output);

    const title = _firstString(draft.title, workflow && workflow.name, meta.site_label, meta.product_key, 'OpenVibe draft');
    const slug = seo.normalizeSlug(_firstString(output && output.slug, input && input.slug, title)) || 'draft';
    const canonicalHost = meta.canonical_host || `openvibe.${(workflow && workflow.service_namespace) || 'network'}`;
    const canonicalPath = _canonicalPath(meta.canonical_path_prefix || '', slug);
    const sections = _buildSections(meta, draft, citations, registrySources, input || {});
    const bodyText = [
        draft.body,
        draft.summary,
        draft.bullets.join(' '),
        sections.map(section => `${section.title}: ${section.content}`).join('\n\n'),
        _flattenText(draft.data),
    ].filter(Boolean).join('\n\n');
    const summary = _excerpt(_firstString(draft.summary, draft.body, sections[0] && sections[0].content, _flattenText(draft.data), _flattenText(input || {})), 240);
    const metadata = seo.generateMetadata({
        content_type: meta.content_type || 'generic_article',
        title,
        description: summary,
        slug,
        canonical_domain: canonicalHost,
        canonical_path: canonicalPath,
        generated_by: 'ai',
        breadcrumbs: [
            { name: meta.site_label || meta.product_key, url: `https://${canonicalHost}` },
            { name: title, url: `https://${canonicalHost}${canonicalPath}` },
        ],
        og_image_media_id: input && input.og_image_media_id,
    });
    const duplicateHash = seo.duplicateHash({ title, body: bodyText, sources: citations });
    const duplicate = model.findDuplicateSeoByHash(duplicateHash);
    const resolvedProviderKey = providerKey || (output && output.metadata && output.metadata.stub ? 'stub' : null);
    const indexability = seo.evaluateIndexability({
        content_type: meta.content_type || 'generic_article',
        title,
        body: bodyText,
        sources: citations,
        source_count: citations.length,
        min_word_count: meta.min_word_count,
        min_source_count: meta.min_source_count,
        generated_by: 'ai',
        provider_key: resolvedProviderKey,
        production_mode: !!(config && config.nodeEnv === 'production'),
        requires_manual_review: !!meta.requires_manual_review,
        sensitive_category: meta.sensitive_category || null,
        duplicate_hash_seen: !!(duplicate && duplicate.id),
        canonical_url: metadata.canonical_url,
        published_at: input && (input.published_at || input.datePublished),
    });
    const structuredData = _structuredData(meta, title, summary, metadata.canonical_url, input || {}, bodyText);
    const quality = {
        word_count: _wordCount(bodyText),
        source_count: citations.length,
        citation_count: citations.length,
        quality_score: indexability.quality_score,
        freshness_score: indexability.freshness_score,
        indexing_status: indexability.indexing_status,
        stub: !!(output && output.metadata && output.metadata.stub),
    };
    const disclosures = {
        generated_by: 'ai',
        ai_assisted: true,
        stub: quality.stub,
        authoring_process: meta.authoring_process || 'AI-assisted draft assembled by openvibe-ai using workflow templates and attached source context.',
        why_this_exists: meta.intent_label || `Provide a product-ready draft for ${meta.product_key || (workflow && workflow.service_namespace) || 'OpenVibe'}.`,
        review_recommended: indexability.indexing_status !== 'ready' || !!meta.requires_manual_review,
    };
    if (meta.product_key === 'openvibe.trade') {
        disclosures.not_financial_advice = true;
        disclosures.disclaimer = 'This content is for informational purposes only and is not financial advice.';
    }

    return {
        product: {
            key: meta.product_key || `openvibe.${(workflow && workflow.service_namespace) || 'network'}`,
            site_label: meta.site_label || title,
            service_namespace: workflow && workflow.service_namespace || null,
            workflow_key: workflowKey || null,
            route_key: route && route.route_key || null,
            title,
            slug,
            canonical_host: canonicalHost,
            canonical_url: metadata.canonical_url,
            content_type: meta.content_type || 'generic_article',
            schema_type: meta.schema_type || 'Article',
            output_contract: meta.ui_contract || 'product-seam-v1',
            target_type: targetType || null,
            target_id: targetId || null,
        },
        draft: {
            title,
            summary,
            body: bodyText,
            bullets: draft.bullets,
            data: draft.data,
            sections,
        },
        seo: {
            metadata,
            indexability,
            structured_data_type: meta.schema_type || 'Article',
            structured_data: structuredData,
            duplicate_hash: duplicateHash,
        },
        sources: {
            citations,
            citation_count: citations.length,
            recommended_source_keys: meta.recommended_source_keys || [],
            registry_sources: registrySources,
        },
        quality,
        search_document: {
            index_key: meta.index_key || (workflow && workflow.service_namespace) || 'content',
            document_type: meta.document_type || meta.content_type || 'content',
            document_id: targetId || slug,
            title,
            summary,
            body_text: bodyText,
            canonical_url: metadata.canonical_url,
            tags: [meta.product_key, meta.content_type].filter(Boolean),
            source_ids: citations.map(citation => citation.id).filter(Boolean),
            freshness_score: quality.freshness_score,
            quality_score: quality.quality_score,
            visibility: 'public',
            indexing_status: quality.indexing_status,
        },
        disclosures,
        raw_output: output,
    };
}

module.exports = { shapeWorkflowOutput };