'use strict';

// openvibe-ai — HTTP route surface (`/api/v1/ai/*`).

const express = require('express');
const model = require('./model');
const policy = require('./policy');
const seo = require('./seo');
const sources = require('./sources');
const providers = require('./providers');
const runner = require('./runner');

function _wrap(fn) {
    return async (req, res, next) => {
        try { await fn(req, res, next); }
        catch (e) { next(e); }
    };
}
function _strip(p) {
    if (!p) return p;
    const out = Object.assign({}, p);
    // Never expose API key VALUES anywhere; api_key_env (the variable NAME) is fine
    delete out.api_key;
    delete out.apiKey;
    delete out.token;
    return out;
}
function _stripProvider(p)  { return _strip(p); }
function _stripSource(s)    { return _strip(s); }

function buildRouter({ config, eventBus }) {
    const r = express.Router();
    r.use(express.json({ limit: '1mb' }));

    // ── status / admin ─────────────────────────────────────────────
    r.get('/status', _wrap(async (_req, res) => {
        res.json({
            ok: true, service: config.serviceId,
            canonical_host: config.canonicalHost,
            canonical_url: config.canonicalUrl,
            providers: model.listProviders().length,
            routes: model.listRoutes().length,
            templates: model.listTemplates().length,
            workflows: model.listWorkflows().length,
            sources: model.listContentSources().length,
            search: model.searchIndexStatus(),
        });
    }));
    r.get('/admin/summary', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        res.json({
            providers: model.listProviders().map(_stripProvider),
            routes:    model.listRoutes(),
            templates: model.listTemplates().length,
            workflows: model.listWorkflows().length,
            recent_runs: model.listRuns({ limit: 25 }),
            usage: model.listUsage(25),
        });
    }));
    r.get('/admin/usage', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        res.json({ usage: model.listUsage(parseInt(req.query.limit, 10) || 100) });
    }));
    r.get('/admin/cache', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        res.json({ entries: model.listCache(parseInt(req.query.limit, 10) || 100) });
    }));

    // ── providers ─────────────────────────────────────────────────
    r.get('/providers', _wrap(async (_req, res) => {
        res.json({ providers: model.listProviders().map(_stripProvider) });
    }));
    r.post('/providers', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const p = model.createProvider(req.body || {});
        if (eventBus) eventBus.publishAi('ai.provider.created', { provider_id: p.id, provider_key: p.provider_key });
        res.status(201).json({ provider: _stripProvider(p) });
    }));
    r.get('/providers/:id', _wrap(async (req, res) => {
        const p = model.getProvider(req.params.id);
        if (!p) return res.status(404).json({ error: 'not_found' });
        res.json({ provider: _stripProvider(p) });
    }));
    r.put('/providers/:id', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const p = model.updateProvider(req.params.id, req.body || {});
        if (!p) return res.status(404).json({ error: 'not_found' });
        if (eventBus) eventBus.publishAi('ai.provider.updated', { provider_id: p.id });
        res.json({ provider: _stripProvider(p) });
    }));
    r.delete('/providers/:id', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const p = model.disableProvider(req.params.id);
        if (!p) return res.status(404).json({ error: 'not_found' });
        if (eventBus) eventBus.publishAi('ai.provider.disabled', { provider_id: p.id });
        res.json({ provider: _stripProvider(p) });
    }));

    // ── models ───────────────────────────────────────────────────
    r.get('/models', _wrap(async (_req, res) => res.json({ models: model.listModels() })));
    r.post('/models', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const m = model.createModel(req.body || {});
        if (eventBus) eventBus.publishAi('ai.model.created', { model_id: m.id, model_key: m.model_key });
        res.status(201).json({ model: m });
    }));
    r.put('/models/:id', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const m = model.updateModel(req.params.id, req.body || {});
        if (!m) return res.status(404).json({ error: 'not_found' });
        if (eventBus) eventBus.publishAi('ai.model.updated', { model_id: m.id });
        res.json({ model: m });
    }));
    r.delete('/models/:id', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const m = model.disableModel(req.params.id);
        if (!m) return res.status(404).json({ error: 'not_found' });
        res.json({ model: m });
    }));

    // ── routes ───────────────────────────────────────────────────
    r.get('/routes', _wrap(async (_req, res) => res.json({ routes: model.listRoutes() })));
    r.post('/routes', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const r2 = model.upsertRoute(req.body || {});
        if (eventBus) eventBus.publishAi('ai.route.created', { route_key: r2.route_key });
        res.status(201).json({ route: r2 });
    }));
    r.get('/routes/:key', _wrap(async (req, res) => {
        const r2 = model.getRoute(req.params.key);
        if (!r2) return res.status(404).json({ error: 'not_found' });
        res.json({ route: r2 });
    }));
    r.put('/routes/:key', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const r2 = model.upsertRoute(Object.assign({}, req.body || {}, { route_key: req.params.key }));
        if (eventBus) eventBus.publishAi('ai.route.updated', { route_key: r2.route_key });
        res.json({ route: r2 });
    }));
    r.delete('/routes/:key', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const r2 = model.disableRoute(req.params.key);
        if (!r2) return res.status(404).json({ error: 'not_found' });
        res.json({ route: r2 });
    }));

    // ── templates ────────────────────────────────────────────────
    r.get('/templates', _wrap(async (_req, res) => res.json({ templates: model.listTemplates() })));
    r.post('/templates', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const t = model.upsertTemplate(req.body || {});
        if (eventBus) eventBus.publishAi('ai.template.created', { template_key: t.template_key });
        res.status(201).json({ template: t });
    }));
    r.get('/templates/:key', _wrap(async (req, res) => {
        const t = model.getTemplate(req.params.key);
        if (!t) return res.status(404).json({ error: 'not_found' });
        res.json({ template: t });
    }));
    r.put('/templates/:key', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const t = model.upsertTemplate(Object.assign({}, req.body || {}, { template_key: req.params.key }));
        if (eventBus) eventBus.publishAi('ai.template.updated', { template_key: t.template_key });
        res.json({ template: t });
    }));
    r.post('/templates/:key/deprecate', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const t = model.upsertTemplate({ template_key: req.params.key, status: 'deprecated' });
        res.json({ template: t });
    }));

    // ── workflows ────────────────────────────────────────────────
    r.get('/workflows', _wrap(async (_req, res) => res.json({ workflows: model.listWorkflows() })));
    r.post('/workflows', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const w = model.upsertWorkflow(req.body || {});
        if (eventBus) eventBus.publishAi('ai.workflow.created', { workflow_key: w.workflow_key });
        res.status(201).json({ workflow: w });
    }));
    r.get('/workflows/:key', _wrap(async (req, res) => {
        const w = model.getWorkflow(req.params.key);
        if (!w) return res.status(404).json({ error: 'not_found' });
        res.json({ workflow: w });
    }));
    r.put('/workflows/:key', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const w = model.upsertWorkflow(Object.assign({}, req.body || {}, { workflow_key: req.params.key }));
        if (eventBus) eventBus.publishAi('ai.workflow.updated', { workflow_key: w.workflow_key });
        res.json({ workflow: w });
    }));
    r.post('/workflows/:key/deprecate', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const w = model.upsertWorkflow({ workflow_key: req.params.key, status: 'deprecated' });
        res.json({ workflow: w });
    }));

    // ── runs ─────────────────────────────────────────────────────
    function _actor(req) {
        const a = policy.actorOfReq(req);
        return { actor_type: a.type === 'service' ? 'service' : (a.type === 'user' ? 'user' : 'anonymous'), actor_id: a.id || 'anonymous' };
    }

    r.post('/runs', _wrap(async (req, res) => {
        policy.assert(policy.decideRunCreate({ req }));
        const body = req.body || {};
        const result = await runner.executeRun({
            config, events: eventBus, actor: _actor(req),
            namespace:    body.namespace,
            workflow_key: body.workflow_key,
            template_key: body.template_key,
            route_key:    body.route_key,
            task:         body.task || 'chat',
            input:        body.input || {},
            options:      body.options || {},
            sources:      body.sources || [],
            target_type:  body.target_type, target_id: body.target_id,
            source_service: body.source_service, trace_id: body.trace_id,
            idempotency_key: body.idempotency_key,
            no_cache: !!body.no_cache,
        });
        res.status(result.replayed ? 200 : 201).json(result);
    }));
    r.get('/runs', _wrap(async (req, res) => res.json({ runs: model.listRuns(req.query || {}) })));
    r.get('/runs/:id', _wrap(async (req, res) => {
        const run = model.getRun(req.params.id);
        if (!run) return res.status(404).json({ error: 'not_found' });
        res.json({ run, requests: model.listRequests(run.id), sources: model.listSourcesForRun(run.id) });
    }));
    r.post('/runs/:id/cancel', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const run = model.updateRun(req.params.id, { status: 'cancelled', completed_at: new Date().toISOString() });
        if (!run) return res.status(404).json({ error: 'not_found' });
        if (eventBus) eventBus.publishAi('ai.run.cancelled', { run_id: run.id });
        res.json({ run });
    }));
    r.post('/runs/:id/retry', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const orig = model.getRun(req.params.id);
        if (!orig) return res.status(404).json({ error: 'not_found' });
        const result = await runner.executeRun({
            config, events: eventBus, actor: _actor(req),
            namespace: 'system',
            workflow_key: orig.workflow_key, template_key: orig.template_key,
            route_key: orig.route_key, task: 'chat',
            input: orig.input_json || {}, no_cache: true,
        });
        res.status(201).json(result);
    }));

    // ── direct AI tasks ──────────────────────────────────────────
    function _direct(task) {
        return _wrap(async (req, res) => {
            policy.assert(policy.decideRunCreate({ req }));
            const body = req.body || {};
            const result = await runner.executeRun({
                config, events: eventBus, actor: _actor(req),
                namespace: body.namespace || 'system',
                route_key: body.route_key,
                task,
                input: body.input || body,
                options: body.options || {},
                sources: body.sources || [],
                idempotency_key: body.idempotency_key,
                no_cache: !!body.no_cache,
            });
            res.json(result);
        });
    }
    r.post('/chat',      _direct('chat'));
    r.post('/generate',  _direct('generate'));
    r.post('/summarize', _direct('summarize'));
    r.post('/classify',  _direct('classify'));
    r.post('/extract',   _direct('extract'));
    r.post('/enrich',    _direct('enrich'));
    r.post('/embed',     _direct('embed'));

    // ── product workflow seams ───────────────────────────────────
    function _workflow(workflow_key, defaultTask) {
        return _wrap(async (req, res) => {
            policy.assert(policy.decideRunCreate({ req }));
            const body = req.body || {};
            const wf = model.getWorkflow(workflow_key);
            const result = await runner.executeRun({
                config, events: eventBus, actor: _actor(req),
                namespace: (wf && wf.service_namespace) || 'system',
                workflow_key,
                route_key: body.route_key || (wf && wf.default_route_key),
                task: body.task || defaultTask || 'generate',
                input: body.input || body,
                sources: body.sources || [],
                target_type: body.target_type, target_id: body.target_id,
                idempotency_key: body.idempotency_key,
                no_cache: !!body.no_cache,
            });
            // Trade outputs always include not_financial_advice + disclaimer.
            if (workflow_key === 'trade.summarize_market_context' && result && result.output && typeof result.output === 'object') {
                result.output = Object.assign({}, result.output, {
                    not_financial_advice: true,
                    disclaimer: 'This content is for informational purposes only and is not financial advice.',
                });
            }
            res.json(result);
        });
    }
    r.post('/wiki/generate-space',           _workflow('wiki.generate_space',    'generate'));
    r.post('/wiki/generate-page',            _workflow('wiki.generate_page',     'generate'));
    r.post('/blog/draft-post',               _workflow('blog.draft_post',        'generate'));
    r.post('/news/summarize-story',          _workflow('news.summarize_story',   'summarize'));
    r.post('/news/compare-perspectives',     _workflow('news.compare_perspectives', 'summarize'));
    r.post('/reviews/summarize-entity',      _workflow('reviews.summarize_entity', 'summarize'));
    r.post('/deals/enrich-deal',             _workflow('deals.enrich_deal',      'enrich'));
    r.post('/coupons/extract-coupon',        _workflow('coupons.extract_coupon', 'extract'));
    r.post('/trade/summarize-market-context',_workflow('trade.summarize_market_context', 'summarize'));
    r.post('/codes/generate-docs',           _workflow('codes.generate_docs',    'generate'));
    r.post('/tools/describe-tool',           _workflow('tools.describe',         'generate'));
    r.post('/tools/generate-page',           _workflow('tools.describe',         'generate'));
    r.post('/games/generate-lore',           _workflow('games.generate_lore',    'generate'));

    // ── SEO helpers ──────────────────────────────────────────────
    r.post('/seo/metadata', _wrap(async (req, res) => {
        const meta = seo.generateMetadata(req.body || {});
        const seoRow = req.body && req.body.persist
            ? model.upsertSeoContent(Object.assign({ generated_by: 'ai' }, req.body, meta))
            : null;
        if (eventBus) eventBus.publishSeo('seo.metadata.generated', { content_type: meta.content_type, slug: meta.slug });
        res.json({ metadata: meta, seo: seoRow });
    }));
    r.post('/seo/indexability', _wrap(async (req, res) => {
        const body = req.body || {};
        // duplicate-hash detection seam
        let dupeSeen = body.duplicate_hash_seen;
        if (body.body && body.title) {
            const hash = seo.duplicateHash({ title: body.title, body: body.body, sources: body.sources });
            const existing = model.findDuplicateSeoByHash(hash);
            if (existing && existing.id !== body.id) dupeSeen = true;
        }
        const result = seo.evaluateIndexability(Object.assign({
            production_mode: config.nodeEnv === 'production',
        }, body, { duplicate_hash_seen: dupeSeen }));
        if (eventBus) eventBus.publishSeo('seo.indexability.evaluated', { content_type: body.content_type, status: result.indexing_status });
        res.json(result);
    }));
    r.post('/seo/structured-data', _wrap(async (req, res) => {
        const ld = seo.generateStructuredData(req.body || {});
        if (eventBus) eventBus.publishSeo('seo.structured_data.generated', { type: req.body && req.body.type });
        res.json({ jsonld: ld });
    }));
    r.post('/seo/sitemap-entry', _wrap(async (_req, res) => {
        // Single-entry helper for callers that want a normalized URL row.
        const e = _req.body || {};
        if (e.indexable === false) return res.json({ entry: null, skipped: true });
        res.json({ entry: { loc: e.loc, lastmod: e.lastmod, changefreq: e.changefreq, priority: e.priority } });
    }));
    r.post('/seo/sitemap', _wrap(async (req, res) => {
        const xml = seo.generateSitemap(req.body || {});
        res.type('application/xml').send(xml);
    }));
    r.post('/seo/sitemap-index', _wrap(async (req, res) => {
        const xml = seo.generateSitemapIndex(req.body || {});
        res.type('application/xml').send(xml);
    }));
    r.post('/seo/rss', _wrap(async (req, res) => {
        const xml = seo.generateRssFeed(req.body || {});
        res.type('application/rss+xml').send(xml);
    }));
    r.post('/seo/atom', _wrap(async (req, res) => {
        const xml = seo.generateAtomFeed(req.body || {});
        res.type('application/atom+xml').send(xml);
    }));
    r.post('/seo/robots', _wrap(async (req, res) => {
        const txt = seo.generateRobotsTxt(req.body || {});
        res.type('text/plain').send(txt);
    }));
    r.post('/seo/slug', _wrap(async (req, res) => res.json({ slug: seo.normalizeSlug((req.body || {}).text || (req.body || {}).input || '') })));
    r.post('/seo/canonical', _wrap(async (req, res) => res.json({ url: seo.canonicalize(req.body || {}) })));
    r.post('/seo/duplicate-hash', _wrap(async (req, res) => res.json({ hash: seo.duplicateHash(req.body || {}) })));

    // ── source registry ──────────────────────────────────────────
    r.get('/sources', _wrap(async (_req, res) => {
        res.json({ sources: model.listContentSources().map(_stripSource) });
    }));
    r.post('/sources', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const s = model.upsertContentSource(req.body || {});
        if (eventBus) eventBus.publishContent('content.source.registered', { source_id: s.id, source_key: s.source_key });
        res.status(201).json({ source: _stripSource(s) });
    }));
    r.get('/sources/:id', _wrap(async (req, res) => {
        const s = model.getContentSource(req.params.id);
        if (!s) return res.status(404).json({ error: 'not_found' });
        res.json({ source: _stripSource(s) });
    }));
    r.put('/sources/:id', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const cur = model.getContentSource(req.params.id);
        if (!cur) return res.status(404).json({ error: 'not_found' });
        const s = model.upsertContentSource(Object.assign({}, cur, req.body || {}, { source_key: cur.source_key }));
        if (eventBus) eventBus.publishContent('content.source.updated', { source_id: s.id, source_key: s.source_key });
        res.json({ source: _stripSource(s) });
    }));
    r.post('/sources/:id/test', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const s = model.getContentSource(req.params.id);
        if (!s) return res.status(404).json({ error: 'not_found' });
        const adapter = sources.adapterFor(s);
        const result = await adapter.test(s);
        if (eventBus) eventBus.publishContent('content.source.tested', { source_id: s.id, ok: !!result.ok });
        res.json(result);
    }));
    r.post('/sources/:id/fetch', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const s = model.getContentSource(req.params.id);
        if (!s) return res.status(404).json({ error: 'not_found' });
        if (!s.enabled) return res.status(409).json({ error: 'source_disabled' });
        const adapter = sources.adapterFor(s);
        if (eventBus) eventBus.publishContent('content.source.fetch.started', { source_id: s.id });
        try {
            const result = await adapter.fetch(s, req.body || {});
            if (eventBus) eventBus.publishContent('content.source.fetch.succeeded', { source_id: s.id, count: (result.items || []).length });
            res.json(result);
        } catch (e) {
            if (eventBus) eventBus.publishContent('content.source.fetch.failed', { source_id: s.id, error: String(e.message) });
            throw e;
        }
    }));
    r.post('/sources/:id/robots-check', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const s = model.getContentSource(req.params.id);
        if (!s) return res.status(404).json({ error: 'not_found' });
        const adapter = sources.adapterFor(s);
        const result = await adapter.robotsCheck(s);
        if (!result.allowed && eventBus) eventBus.publishContent('content.source.robots.blocked', { source_id: s.id });
        res.json(result);
    }));

    // ── ingestion / quality ──────────────────────────────────────
    r.post('/ingestion/jobs', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const body = req.body || {};
        if (body.source_id) {
            const src = model.getContentSource(body.source_id);
            if (!src)         return res.status(404).json({ error: 'source_not_found' });
            if (!src.enabled) return res.status(409).json({ error: 'source_disabled' });
        }
        const job = model.createIngestionJob(body);
        if (eventBus) eventBus.publishContent('content.ingestion.job.created', { job_id: job.id, source_id: job.source_id, job_type: job.job_type });
        res.status(201).json({ job });
    }));
    r.get('/ingestion/jobs', _wrap(async (req, res) => res.json({ jobs: model.listIngestionJobs(req.query || {}) })));
    r.get('/ingestion/jobs/:id', _wrap(async (req, res) => {
        const j = model.getIngestionJob(req.params.id);
        if (!j) return res.status(404).json({ error: 'not_found' });
        res.json({ job: j });
    }));
    r.post('/ingestion/jobs/:id/run', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const j = model.getIngestionJob(req.params.id);
        if (!j) return res.status(404).json({ error: 'not_found' });
        const src = j.source_id ? model.getContentSource(j.source_id) : null;
        model.updateIngestionJob(j.id, { status: 'running', started_at: new Date().toISOString() });
        if (eventBus) eventBus.publishContent('content.ingestion.job.started', { job_id: j.id });
        try {
            const adapter = src ? sources.adapterFor(src) : null;
            const out = adapter ? await adapter.fetch(src, j.input_json || {}) : { items: [], note: 'no source' };
            const done = model.updateIngestionJob(j.id, { status: 'succeeded', output_json: out, completed_at: new Date().toISOString() });
            if (eventBus) eventBus.publishContent('content.ingestion.job.succeeded', { job_id: j.id, count: (out.items || []).length });
            res.json({ job: done });
        } catch (e) {
            const done = model.updateIngestionJob(j.id, { status: 'failed', error: String(e.message), completed_at: new Date().toISOString() });
            if (eventBus) eventBus.publishContent('content.ingestion.job.failed', { job_id: j.id, error: String(e.message) });
            res.status(500).json({ job: done, error: String(e.message) });
        }
    }));
    r.post('/ingestion/jobs/:id/cancel', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const j = model.updateIngestionJob(req.params.id, { status: 'skipped', completed_at: new Date().toISOString() });
        if (!j) return res.status(404).json({ error: 'not_found' });
        res.json({ job: j });
    }));
    r.post('/content/quality', _wrap(async (req, res) => {
        const result = seo.evaluateIndexability(Object.assign({ production_mode: config.nodeEnv === 'production' }, req.body || {}));
        if (eventBus) eventBus.publishContent('content.quality.evaluated', { content_type: (req.body || {}).content_type, status: result.indexing_status });
        res.json(result);
    }));

    // ── search seam ──────────────────────────────────────────────
    r.post('/search/index', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const d = model.indexSearchDocument(req.body || {});
        if (eventBus) eventBus.publishSearch('search.document.indexed', { cache_key: d.cache_key });
        res.status(201).json({ document: d });
    }));
    r.post('/search/query', _wrap(async (req, res) => {
        const docs = model.querySearchIndex(req.body || {});
        if (eventBus) eventBus.publishSearch('search.query.executed', { count: docs.length });
        res.json({ results: docs });
    }));
    r.post('/search/delete', _wrap(async (req, res) => {
        policy.assert(policy.decideAdminMutation({ req }));
        const n = model.deleteSearchDocument(req.body || {});
        if (eventBus) eventBus.publishSearch('search.document.deleted', { count: n });
        res.json({ deleted: n });
    }));
    r.get('/search/status', _wrap(async (_req, res) => res.json(model.searchIndexStatus())));

    // ── error handler ────────────────────────────────────────────
    r.use((err, _req, res, _next) => {
        if (err && err.code === 'EAIPOLICY')   return res.status(err.status || 403).json({ error: 'forbidden', code: err.code, reason: err.reason });
        if (err && err.code === 'EAIQUOTA')    return res.status(429).json({ error: 'quota_exceeded', code: err.code });
        if (err && err.code === 'EAINOROUTE')  return res.status(500).json({ error: 'no_route', code: err.code });
        if (err && err.code === 'EAIROUTE')    return res.status(400).json({ error: 'route_disabled', code: err.code });
        if (err && err.code === 'EAIFEATURE')  return res.status(400).json({ error: 'feature_unsupported', code: err.code });
        if (err && err.code === 'EAIPROVIDER') return res.status(502).json({ error: 'provider_failed', code: err.code });
        if (err && err.status)                 return res.status(err.status).json({ error: err.message });
        console.error('[openvibe-ai] unhandled:', err && err.stack || err);
        res.status(500).json({ error: 'internal_error' });
    });

    return r;
}

module.exports = { buildRouter };
