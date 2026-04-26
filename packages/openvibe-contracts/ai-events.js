'use strict';

// OpenVibe — Phase 7 AI / SEO / source-ingestion / search event-type catalog.
//
// Topics (string, registered in topics.js):
//   ai.events
//   seo.events
//   content.events
//   search.events
//
// Payload shape is additive — unknown keys must be tolerated by consumers.

const AI_TOPICS = Object.freeze({
    AI:      'ai.events',
    SEO:     'seo.events',
    CONTENT: 'content.events',
    SEARCH:  'search.events',
});

// ── core AI events ─────────────────────────────────────────────
const AI_EVENT_TYPES = Object.freeze({
    PROVIDER_CREATED:  'ai.provider.created',
    PROVIDER_UPDATED:  'ai.provider.updated',
    PROVIDER_DISABLED: 'ai.provider.disabled',
    MODEL_CREATED:     'ai.model.created',
    MODEL_UPDATED:     'ai.model.updated',
    ROUTE_CREATED:     'ai.route.created',
    ROUTE_UPDATED:     'ai.route.updated',
    TEMPLATE_CREATED:  'ai.template.created',
    TEMPLATE_UPDATED:  'ai.template.updated',
    WORKFLOW_CREATED:  'ai.workflow.created',
    WORKFLOW_UPDATED:  'ai.workflow.updated',
    RUN_CREATED:       'ai.run.created',
    RUN_QUEUED:        'ai.run.queued',
    RUN_STARTED:       'ai.run.started',
    RUN_SUCCEEDED:     'ai.run.succeeded',
    RUN_FAILED:        'ai.run.failed',
    RUN_CANCELLED:     'ai.run.cancelled',
    RUN_CACHED:        'ai.run.cached',
    USAGE_RECORDED:    'ai.usage.recorded',
    QUOTA_EXCEEDED:    'ai.quota.exceeded',
    SOURCE_ATTACHED:   'ai.source.attached',
});

// ── SEO events ─────────────────────────────────────────────────
const SEO_EVENT_TYPES = Object.freeze({
    METADATA_GENERATED:        'seo.metadata.generated',
    INDEXABILITY_EVALUATED:    'seo.indexability.evaluated',
    STRUCTURED_DATA_GENERATED: 'seo.structured_data.generated',
    SITEMAP_ENTRY_GENERATED:   'seo.sitemap.entry.generated',
    SITEMAP_GENERATED:         'seo.sitemap.generated',
    FEED_GENERATED:            'seo.feed.generated',
    ROBOTS_GENERATED:          'seo.robots.generated',
});

// ── content / source / ingestion events ────────────────────────
const CONTENT_EVENT_TYPES = Object.freeze({
    SOURCE_REGISTERED:        'content.source.registered',
    SOURCE_UPDATED:           'content.source.updated',
    SOURCE_TESTED:            'content.source.tested',
    SOURCE_FETCH_STARTED:     'content.source.fetch.started',
    SOURCE_FETCH_SUCCEEDED:   'content.source.fetch.succeeded',
    SOURCE_FETCH_FAILED:      'content.source.fetch.failed',
    SOURCE_ROBOTS_BLOCKED:    'content.source.robots.blocked',
    INGESTION_JOB_CREATED:    'content.ingestion.job.created',
    INGESTION_JOB_STARTED:    'content.ingestion.job.started',
    INGESTION_JOB_SUCCEEDED:  'content.ingestion.job.succeeded',
    INGESTION_JOB_FAILED:     'content.ingestion.job.failed',
    QUALITY_EVALUATED:        'content.quality.evaluated',
});

// ── search events ──────────────────────────────────────────────
const SEARCH_EVENT_TYPES = Object.freeze({
    DOCUMENT_INDEXED: 'search.document.indexed',
    DOCUMENT_DELETED: 'search.document.deleted',
    QUERY_EXECUTED:   'search.query.executed',
});

const AI_EVENT_TYPE_LIST      = Object.freeze(Object.values(AI_EVENT_TYPES));
const SEO_EVENT_TYPE_LIST     = Object.freeze(Object.values(SEO_EVENT_TYPES));
const CONTENT_EVENT_TYPE_LIST = Object.freeze(Object.values(CONTENT_EVENT_TYPES));
const SEARCH_EVENT_TYPE_LIST  = Object.freeze(Object.values(SEARCH_EVENT_TYPES));

function isAiEventType(t)      { return typeof t === 'string' && AI_EVENT_TYPE_LIST.includes(t); }
function isSeoEventType(t)     { return typeof t === 'string' && SEO_EVENT_TYPE_LIST.includes(t); }
function isContentEventType(t) { return typeof t === 'string' && CONTENT_EVENT_TYPE_LIST.includes(t); }
function isSearchEventType(t)  { return typeof t === 'string' && SEARCH_EVENT_TYPE_LIST.includes(t); }

// ── enumerations ───────────────────────────────────────────────
const AI_PROVIDER_KEYS = Object.freeze(['stub', 'openai', 'anthropic', 'gemini', 'ollama', 'openrouter', 'local_http', 'custom']);
const AI_PROVIDER_STATUSES = Object.freeze(['active', 'disabled', 'degraded']);
const AI_AUTH_MODES = Object.freeze(['none', 'env', 'header', 'bearer', 'custom']);
const AI_MODEL_TYPES = Object.freeze(['chat', 'completion', 'embedding', 'vision', 'rerank', 'moderation', 'custom']);
const AI_RESPONSE_FORMATS = Object.freeze(['text', 'json', 'markdown']);
const AI_RUN_STATUSES = Object.freeze(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'cached']);
const AI_REQUEST_STATUSES = Object.freeze(['started', 'succeeded', 'failed', 'fallback_used', 'cached']);
const AI_TEMPLATE_STATUSES = Object.freeze(['active', 'draft', 'deprecated', 'archived']);
const AI_TEMPLATE_VISIBILITIES = Object.freeze(['system', 'service', 'public', 'private']);
const AI_QUOTA_PERIODS = Object.freeze(['minute', 'hour', 'day', 'month']);

const AI_SERVICE_NAMESPACES = Object.freeze([
    'wiki', 'blog', 'news', 'reviews', 'deals', 'coupons',
    'trade', 'codes', 'tools', 'games', 'community', 'live', 'system',
]);

const AI_TARGET_TYPES = Object.freeze([
    'wiki', 'blog', 'news', 'reviews', 'deals', 'coupons',
    'trade', 'codes', 'tools', 'games', 'community', 'live', 'system',
]);

const AI_ROUTE_KEYS = Object.freeze([
    'default.chat', 'default.json', 'default.embedding',
    'wiki.generate', 'blog.draft', 'news.summarize', 'reviews.summarize',
    'deals.enrich', 'coupons.extract', 'trade.summarize',
    'codes.generate_docs', 'games.generate_lore', 'moderation.classify',
]);

const AI_WORKFLOW_KEYS = Object.freeze([
    'wiki.generate_space', 'wiki.generate_page', 'wiki.refresh_page',
    'blog.draft_post', 'blog.generate_series_plan',
    'news.summarize_story', 'news.compare_perspectives',
    'reviews.summarize_entity', 'reviews.extract_review_signals',
    'deals.enrich_deal', 'deals.normalize_product', 'deals.search_unshittifier',
    'coupons.extract_coupon', 'coupons.validate_coupon',
    'trade.summarize_market_context', 'trade.crypto_context',
    'codes.generate_docs', 'codes.generate_tutorial',
    'tools.generate_tool_page',
    'games.generate_lore',
    'moderation.classify',
]);

// content / source enums
const CONTENT_SOURCE_TYPES = Object.freeze([
    'official_api', 'api', 'rss', 'atom', 'sitemap', 'web_page',
    'structured_data', 'json_ld', 'wordpress', 'gdelt', 'newsapi',
    'reddit', 'youtube', 'yelp', 'ebay', 'amazon_paapi',
    'market_api', 'coupon_feed', 'deal_site', 'review_site',
    'community', 'manual', 'media',
]);
const CONTENT_SOURCE_CATEGORIES = Object.freeze([
    'wiki', 'blog', 'news', 'reviews', 'deals', 'coupons',
    'trade', 'codes', 'tools', 'games',
]);
const CONTENT_INGESTION_STATUSES = Object.freeze(['queued', 'running', 'succeeded', 'failed', 'skipped', 'blocked']);
const CONTENT_INGESTION_JOB_TYPES = Object.freeze([
    'fetch', 'refresh', 'parse', 'summarize', 'dedupe',
    'classify', 'extract', 'index', 'quality_check',
]);

// SEO enums
const SEO_CONTENT_TYPES = Object.freeze([
    'wiki_page', 'blog_post', 'news_story', 'review_page',
    'deal_page', 'coupon_page', 'trade_page', 'codes_doc',
    'tool_page', 'recipe_page', 'generic_article',
]);
const SEO_INDEXING_STATUSES = Object.freeze(['draft', 'ready', 'published', 'noindex', 'stale', 'blocked']);
const SEO_GENERATED_BY = Object.freeze(['human', 'ai', 'hybrid', 'imported']);
const SEO_ROBOTS_DIRECTIVES = Object.freeze(['index,follow', 'noindex,follow', 'noindex,nofollow']);

const SEO_STRUCTURED_TYPES = Object.freeze([
    'Article', 'NewsArticle', 'BlogPosting', 'Review', 'AggregateRating',
    'Product', 'Offer', 'FAQPage', 'HowTo', 'Recipe',
    'SoftwareApplication', 'Dataset', 'VideoObject',
    'BreadcrumbList', 'WebSite', 'Organization', 'LocalBusiness',
]);

// ── canonical OpenVibe AI domain ───────────────────────────────
const AI_OPENVIBE_NETWORK_HOST = 'ai.openvibe.network';
const AI_OPENVIBE_NETWORK_URL  = 'https://ai.openvibe.network';

// ── payload builders (additive) ────────────────────────────────
function buildAiEventPayload(base, extra) {
    return Object.assign({}, base || {}, extra || {});
}
function buildSeoEventPayload(base, extra) {
    return Object.assign({}, base || {}, extra || {});
}
function buildContentEventPayload(base, extra) {
    return Object.assign({}, base || {}, extra || {});
}
function buildSearchEventPayload(base, extra) {
    return Object.assign({}, base || {}, extra || {});
}

module.exports = {
    AI_TOPICS,
    AI_EVENT_TYPES, SEO_EVENT_TYPES, CONTENT_EVENT_TYPES, SEARCH_EVENT_TYPES,
    AI_EVENT_TYPE_LIST, SEO_EVENT_TYPE_LIST, CONTENT_EVENT_TYPE_LIST, SEARCH_EVENT_TYPE_LIST,
    isAiEventType, isSeoEventType, isContentEventType, isSearchEventType,

    AI_PROVIDER_KEYS, AI_PROVIDER_STATUSES, AI_AUTH_MODES, AI_MODEL_TYPES,
    AI_RESPONSE_FORMATS, AI_RUN_STATUSES, AI_REQUEST_STATUSES,
    AI_TEMPLATE_STATUSES, AI_TEMPLATE_VISIBILITIES, AI_QUOTA_PERIODS,
    AI_SERVICE_NAMESPACES, AI_TARGET_TYPES, AI_ROUTE_KEYS, AI_WORKFLOW_KEYS,

    CONTENT_SOURCE_TYPES, CONTENT_SOURCE_CATEGORIES,
    CONTENT_INGESTION_STATUSES, CONTENT_INGESTION_JOB_TYPES,

    SEO_CONTENT_TYPES, SEO_INDEXING_STATUSES, SEO_GENERATED_BY,
    SEO_ROBOTS_DIRECTIVES, SEO_STRUCTURED_TYPES,

    AI_OPENVIBE_NETWORK_HOST, AI_OPENVIBE_NETWORK_URL,

    buildAiEventPayload, buildSeoEventPayload,
    buildContentEventPayload, buildSearchEventPayload,
};
