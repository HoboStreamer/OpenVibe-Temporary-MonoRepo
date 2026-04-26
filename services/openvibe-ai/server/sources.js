'use strict';

// openvibe-ai — content source adapter seam. Real network adapters are
// intentionally minimal in Phase 7; the registry/adapter interface and
// mock/stub fetchers are the contract future ingestion services depend on.
//
// Adapter shape:
//   {
//     test(source) -> { ok, error?, sample? }
//     fetch(source, opts) -> { items: [...], retrieved_at, source_meta }
//     robotsCheck(source) -> { allowed, robots_url, note }
//   }

function _stubItems(source, n) {
    n = n || 3;
    const out = [];
    for (let i = 1; i <= n; i++) {
        out.push({
            external_id: `${source.source_key}_${i}`,
            title:       `[stub] ${source.source_name} item ${i}`,
            url:         (source.base_url || `https://${source.source_key}.example`) + `/items/${i}`,
            published_at: new Date(Date.now() - i * 3600 * 1000).toISOString(),
            snippet:     `Stub snippet for ${source.source_name} item ${i}.`,
            metadata:    { stub: true, adapter: source.source_type },
        });
    }
    return out;
}

const stubAdapter = {
    async test(source) {
        return { ok: true, sample: _stubItems(source, 1)[0], adapter: source.source_type };
    },
    async fetch(source, opts) {
        const limit = (opts && opts.limit) || 3;
        return {
            items: _stubItems(source, limit),
            retrieved_at: new Date().toISOString(),
            source_meta: { stub: true, adapter: source.source_type },
        };
    },
    async robotsCheck(source) {
        return {
            allowed: source.respect_robots ? true : true,
            robots_url: source.robots_txt_url || (source.base_url ? source.base_url.replace(/\/$/, '') + '/robots.txt' : null),
            note: 'stub adapter — no live HTTP request performed',
        };
    },
};

function adapterFor(_source) {
    // All real adapters fall through to the offline stub adapter in Phase 7.
    // Future phases plug live HTTP adapters in here keyed by source.source_type.
    return stubAdapter;
}

// Default seed source registry (admin-editable). These define the categories
// and adapter contract surfaces; they do not perform live network calls until
// configured with credentials and explicitly enabled.
const SEED_SOURCES = [
    // News
    { source_key: 'gdelt_doc',          source_name: 'GDELT DOC API',           source_type: 'gdelt',         category: 'news',   enabled: false, terms_notes: 'Public bulk news API. Respect rate limits.' },
    { source_key: 'newsapi_top',        source_name: 'NewsAPI top headlines',   source_type: 'newsapi',       category: 'news',   enabled: false, auth_mode: 'api_key_env', api_key_env: 'OPENVIBE_NEWSAPI_KEY' },
    { source_key: 'rss_news_generic',   source_name: 'Generic news RSS feed',   source_type: 'rss',           category: 'news',   enabled: true },
    { source_key: 'youtube_news',       source_name: 'YouTube news search',     source_type: 'youtube',       category: 'news',   enabled: false, auth_mode: 'api_key_env', api_key_env: 'OPENVIBE_YOUTUBE_API_KEY' },
    { source_key: 'reddit_topic',       source_name: 'Reddit topic search',     source_type: 'reddit',        category: 'news',   enabled: false, auth_mode: 'api_key_env', api_key_env: 'OPENVIBE_REDDIT_CLIENT_ID' },
    // Blog / wiki
    { source_key: 'wordpress_posts',    source_name: 'WordPress REST posts',    source_type: 'wordpress',     category: 'blog',   enabled: false },
    { source_key: 'rss_blog_generic',   source_name: 'Generic blog RSS feed',   source_type: 'rss',           category: 'blog',   enabled: true },
    { source_key: 'sitemap_blog',       source_name: 'Generic blog sitemap',    source_type: 'sitemap',       category: 'blog',   enabled: true },
    { source_key: 'json_ld_article',    source_name: 'JSON-LD article extract', source_type: 'json_ld',       category: 'wiki',   enabled: true },
    // Reviews
    { source_key: 'yelp_places',        source_name: 'Yelp Fusion places',      source_type: 'yelp',          category: 'reviews', enabled: false, auth_mode: 'api_key_env', api_key_env: 'OPENVIBE_YELP_API_KEY' },
    { source_key: 'reddit_reviews',     source_name: 'Reddit review threads',   source_type: 'reddit',        category: 'reviews', enabled: false, auth_mode: 'api_key_env', api_key_env: 'OPENVIBE_REDDIT_CLIENT_ID' },
    { source_key: 'review_struct',      source_name: 'Review structured-data',  source_type: 'structured_data', category: 'reviews', enabled: true },
    // Deals
    { source_key: 'ebay_browse',        source_name: 'eBay Browse search',      source_type: 'ebay',          category: 'deals',  enabled: false, auth_mode: 'api_key_env', api_key_env: 'OPENVIBE_EBAY_CLIENT_ID' },
    { source_key: 'dealnews_rss',       source_name: 'DealNews RSS feed',       source_type: 'rss',           category: 'deals',  enabled: false },
    { source_key: 'product_json_ld',    source_name: 'Product JSON-LD extract', source_type: 'json_ld',       category: 'deals',  enabled: true },
    // Coupons
    { source_key: 'rakuten_coupons',    source_name: 'Rakuten Coupon API',      source_type: 'coupon_feed',   category: 'coupons', enabled: false, auth_mode: 'api_key_env', api_key_env: 'OPENVIBE_RAKUTEN_COUPON_API_TOKEN' },
    { source_key: 'merchant_coupon',    source_name: 'Merchant coupon page',    source_type: 'web_page',      category: 'coupons', enabled: false, requires_review: true },
    // Trade
    { source_key: 'alpha_vantage',      source_name: 'Alpha Vantage',           source_type: 'market_api',    category: 'trade',  enabled: false, auth_mode: 'api_key_env', api_key_env: 'OPENVIBE_ALPHA_VANTAGE_API_KEY' },
    { source_key: 'coingecko',          source_name: 'CoinGecko',               source_type: 'market_api',    category: 'trade',  enabled: false, auth_mode: 'api_key_env', api_key_env: 'OPENVIBE_COINGECKO_API_KEY' },
    { source_key: 'finnhub',            source_name: 'Finnhub',                 source_type: 'market_api',    category: 'trade',  enabled: false, auth_mode: 'api_key_env', api_key_env: 'OPENVIBE_FINNHUB_API_KEY' },
    { source_key: 'sec_edgar',          source_name: 'SEC EDGAR',               source_type: 'official_api',  category: 'trade',  enabled: true,  terms_notes: 'Public official filings.' },
    // Search/extraction primitives
    { source_key: 'robots_txt',         source_name: 'robots.txt parser',       source_type: 'web_page',      category: null,     enabled: true },
    { source_key: 'sitemap_xml',        source_name: 'Generic sitemap parser',  source_type: 'sitemap',       category: null,     enabled: true },
];

module.exports = { stubAdapter, adapterFor, SEED_SOURCES };
