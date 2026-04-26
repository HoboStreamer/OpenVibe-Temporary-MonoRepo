# Content source registry

The `content_sources` table is the single registry of every external
data source OpenVibe ever ingests. It is admin-editable through
`POST/PUT /api/v1/ai/sources` and consumable from any service via the
SDK (`AiClient.listContentSources`).

## Key fields

| Field | Purpose |
| --- | --- |
| `source_key` | UNIQUE machine identifier |
| `source_type` | `rss` / `sitemap` / `wordpress` / `gdelt` / `newsapi` / `yelp` / `ebay` / `amazon_paapi` / `market_api` / `coupon_feed` / etc. |
| `category` | `wiki` / `blog` / `news` / `reviews` / `deals` / `coupons` / `trade` / `codes` / `tools` / `games` |
| `auth_mode` | `none` / `env` / `header` / `bearer` / `custom` |
| `api_key_env` | env-var **name** containing the credential — never the value |
| `enabled`, `respect_robots`, `requires_review` | safety flags |
| `default_indexing_status` | initial SEO status for items pulled from this source |

## Default seeded entries

`gdelt_doc`, `newsapi_top`, `rss_news_generic`, `youtube_news`,
`reddit_topic`, `wordpress_posts`, `rss_blog_generic`, `sitemap_blog`,
`json_ld_article`, `yelp_places`, `reddit_reviews`, `review_struct`,
`ebay_browse`, `dealnews_rss`, `product_json_ld`, `rakuten_coupons`,
`merchant_coupon`, `alpha_vantage`, `coingecko`, `finnhub`,
`sec_edgar`, `robots_txt`, `sitemap_xml`. Sources that require an API
key default to `enabled: false` until an admin enables them.

## Adapter contract

All sources resolve to an adapter exposing `test(source)`,
`fetch(source, opts)`, and `robotsCheck(source)`. The Phase 7
adapter is offline-safe (`stubAdapter` in
[sources.js](../../services/openvibe-ai/server/sources.js)). Live HTTP
adapters are added in subsequent phases without changing the contract.

## Robots / ToS

- `respect_robots` defaults to true for every source.
- `requires_review` flags sources whose ToS requires a human approval
  per item before publication.
- `terms_notes` is a free-text reminder displayed in the admin UI.
