# AI-generated content indexing policy

OpenVibe refuses to ship AI slop into search engines. Every page —
human-authored, AI-drafted, or imported — passes the deterministic
indexability gate before its `seo_content` row is allowed to flip to
`indexing_status='ready'`.

## Inputs

```js
{
  content_type:          'wiki_page' | 'blog_post' | 'news_story' | 'review_page' | …,
  body, word_count, sources, source_count,
  generated_by:          'human' | 'ai' | 'hybrid' | 'imported',
  provider_key,                       // e.g. 'stub' | 'openai'
  production_mode:       boolean,     // NODE_ENV === 'production'
  duplicate_hash_seen:   boolean,
  canonical_url:         string,
  sensitive_category:    string,
  requires_manual_review:boolean,
}
```

## Rules

| Condition | `indexing_status` | `robots_directive` |
| --- | --- | --- |
| word count below per-type threshold | `noindex` | `noindex,follow` |
| source count below per-type threshold | `noindex` | `noindex,follow` |
| `generated_by='ai'` AND `provider_key='stub'` AND `production_mode` | `noindex` | `noindex,follow` |
| duplicate hash seen and no canonical URL | `noindex` | `noindex,follow` |
| sensitive category awaiting manual review | `noindex` | `noindex,nofollow` |
| otherwise | `ready` | `index,follow` |

`reasons[]` and `required_fixes[]` are returned alongside the decision
so that admin UIs can show editors exactly what to add.

## Per-type thresholds (defaults)

```
wiki_page    250 words / 2 sources
blog_post    400 words
news_story   200 words / 2 sources
review_page  200 words / 2 sources
deal_page     80 words / 1 source
coupon_page   40 words / 1 source
trade_page   200 words / 2 sources
…
```

These can be overridden per call via `min_word_count` /
`min_source_count`.
