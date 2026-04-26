# SEO foundation

OpenVibe SEO is a **deterministic, server-side** policy. No ML, no
heuristic guessing, no fabricated metadata.

## Canonical URLs

- Each product surface declares its canonical host
  (`<product>.openvibe.network`).
- `seo.canonicalize({host, pathname, query})` collapses double slashes,
  strips trailing index suffixes, sorts query parameters, and emits a
  `https://…` canonical URL.
- `seo.normalizeSlug` lowercases, strips diacritics, and clamps slugs
  to 96 characters.

## Sitemaps and feeds

- `seo.generateSitemap` and `generateSitemapIndex` emit Sitemap-XML.
- `seo.generateRssFeed` / `generateAtomFeed` emit feed XML.
- Sitemap entries with `indexable: false` are **excluded** from output.
- `seo.generateRobotsTxt` builds an opt-in robots policy with
  per-host sitemaps.

## JSON-LD generation rules

- `Review` is **only** emitted with `reviewRating` if a real numeric
  rating is supplied. No fabricated ratings.
- `Offer` returns `null` if `price` and `priceCurrency` are not both
  supplied. No invented prices, currencies, or availability.
- `Recipe` requires `name` and `recipeIngredient`.
- Unknown / empty fields are stripped before serialization.

## Indexability gate

See [ai-generated-content-indexing-policy.md](ai-generated-content-indexing-policy.md).
