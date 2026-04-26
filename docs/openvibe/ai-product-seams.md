# Product workflow seams

Each OpenVibe product has a dedicated AI workflow seam mounted under
`/api/v1/ai/<product>/…`. Calls always:

1. Resolve the workflow's `default_route_key` (or one provided in the
   request body).
2. Pass through the runner: idempotency → quota → cache → provider +
   fallback → source attach → cache write → quota increment → events.
3. Emit `ai.run.*` events on `ai.events`.

| Product | Workflow keys | HTTP path |
| --- | --- | --- |
| Wiki    | `wiki.generate_space`, `wiki.generate_page`, `wiki.refresh_page` | `/wiki/generate-space`, `/wiki/generate-page` |
| Blog    | `blog.draft_post`, `blog.generate_series_plan`     | `/blog/draft-post` |
| News    | `news.summarize_story`, `news.compare_perspectives`| `/news/summarize-story`, `/news/compare-perspectives` |
| Reviews | `reviews.summarize_entity`, `reviews.extract_review_signals` | `/reviews/summarize-entity` |
| Deals   | `deals.enrich_deal`, `deals.normalize_product`, `deals.search_unshittifier` | `/deals/enrich-deal` |
| Coupons | `coupons.extract_coupon`, `coupons.validate_coupon`| `/coupons/extract-coupon` |
| Trade   | `trade.summarize_market_context`, `trade.crypto_context` | `/trade/summarize-market-context` |
| Codes   | `codes.generate_docs`, `codes.generate_tutorial`   | `/codes/generate-docs` |
| Tools   | `tools.generate_tool_page`                         | (use `runs` with workflow key) |
| Games   | `games.generate_lore`                              | `/games/generate-lore` |

## Trade safety

Every response from `trade.*` workflows is post-processed to add:

```json
{ "not_financial_advice": true,
  "disclaimer": "This content is for informational purposes only and is not financial advice." }
```

This rule is enforced at the route layer ([routes.js](../../services/openvibe-ai/server/routes.js)), so callers cannot bypass it.
