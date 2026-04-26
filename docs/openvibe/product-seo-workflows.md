# Per-product SEO workflows

Each product layer calls `POST /api/v1/ai/seo/metadata` (and the
related helpers) to produce its public-facing SEO surface. The
workflow is identical across products; only the per-product schema
differs.

```
1. Build content (wiki / blog / news / reviews / deals / coupons / trade / codes / tools / games).
2. Compute duplicate-hash via /seo/duplicate-hash.
3. Generate metadata (slug, canonical URL, og/twitter, structured data) via /seo/metadata.
4. Evaluate indexability via /seo/indexability — receive directive + reasons + fixes.
5. Persist seo_content row (the model.upsertSeoContent call inside /seo/metadata when persist=true).
6. Emit search index document via /search/index — the index respects visibility and indexing_status.
```

Per-product structured-data type mapping:

| Product | Default JSON-LD |
| --- | --- |
| wiki    | `Article` + `BreadcrumbList` |
| blog    | `BlogPosting` + `BreadcrumbList` |
| news    | `NewsArticle` |
| reviews | `Review` (only with real ratingValue) |
| deals   | `Product` + `Offer` (only with real price+currency) |
| coupons | `Offer` (only when expiry/code provided) |
| trade   | `Article` + disclaimer |
| codes   | `Article` (often `HowTo` for tutorials) |
| tools   | `SoftwareApplication` |
| games   | `Article` |
| recipe  | `Recipe` (only when ingredients are present) |
