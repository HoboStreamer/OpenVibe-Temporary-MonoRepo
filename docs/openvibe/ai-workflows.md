# AI workflows, prompt templates and runs

## Templates (`ai_prompt_templates`)

A template captures: a versioned `template_key`, a `system_prompt`,
a `user_prompt_template`, optional input/output schemas, a
`default_route_key`, ownership and visibility.

Templates seeded on boot: `summarize.basic`, `classify.basic`,
`extract.json`, `wiki.page`, `blog.post`, `news.story`,
`trade.context` (always namespaces with `not_financial_advice`).

## Workflows (`ai_workflows`)

A workflow is a versioned, named pipeline of steps. Each step
references a template. Workflows belong to a `service_namespace`
(wiki, blog, news, reviews, deals, coupons, trade, codes, tools,
games, …) and have a `default_route_key`.

Workflows seeded on boot: every key in
[ai-events.js → AI_WORKFLOW_KEYS](../../packages/openvibe-contracts/ai-events.js).

## Runs (`ai_runs`)

A run is a single execution. Important fields:

- `idempotency_key` — UNIQUE; replaying with the same key returns the
  prior result without re-executing.
- `requested_by_type`/`requested_by_id` — actor accounting.
- `target_type`/`target_id` — what business entity this run is about.
- `status` — `queued | running | succeeded | failed | cancelled | cached`.
- `input_json`, `output_json`, `error`.

Each run also writes one or more `ai_requests` rows (one per provider
attempt), with `status='succeeded' | 'fallback_used' | 'failed' | 'cached'`.
