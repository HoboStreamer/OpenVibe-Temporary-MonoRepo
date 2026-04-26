'use strict';

// openvibe-ai — boot-time seeding. Idempotent. Inserts the stub provider,
// stub models, default routes, default templates and workflows, and the
// default content source registry.

const model = require('./model');
const { SEED_SOURCES } = require('./sources');

function _stubProvider() {
    let p = model.getProviderByKey('stub');
    if (p) return p;
    return model.createProvider({
        provider_key: 'stub',
        display_name: 'Local Stub',
        status: 'active',
        auth_mode: 'none',
        default_model: 'stub-chat-1',
        supports_chat: true, supports_json: true, supports_embeddings: true,
        supports_tools: false, supports_streaming: false,
        timeout_ms: 5000, priority: 1000,
        metadata: { offline_safe: true, fabricated: false },
    });
}

function _stubModels(providerId) {
    const ensure = (m) => {
        const existing = model.getModelByKey(providerId, m.model_key);
        if (existing) return existing;
        return model.createModel(Object.assign({ provider_id: providerId, status: 'active' }, m));
    };
    return {
        chat:  ensure({ model_key: 'stub-chat-1',  model_type: 'chat',      display_name: 'Stub Chat',      supports_json: true }),
        embed: ensure({ model_key: 'stub-embed-1', model_type: 'embedding', display_name: 'Stub Embedding', context_window: 1024 }),
    };
}

function _routes(provider, models) {
    const r = (key, response_format = 'text', modelId = models.chat.id) => model.upsertRoute({
        route_key: key,
        primary_provider_id: provider.id,
        primary_model_id: modelId,
        response_format,
    });
    r('default.chat');
    r('default.json', 'json');
    r('default.embedding', 'text', models.embed.id);
    r('wiki.generate', 'json');
    r('blog.draft', 'json');
    r('news.summarize', 'json');
    r('reviews.summarize', 'json');
    r('deals.enrich', 'json');
    r('coupons.extract', 'json');
    r('trade.summarize', 'json');
    r('codes.generate_docs', 'json');
    r('games.generate_lore', 'json');
    r('moderation.classify', 'json');
}

function _templates() {
    const T = (key, name, system, user_template, schema) => model.upsertTemplate({
        template_key: key, name, version: 1, visibility: 'system',
        system_prompt: system, user_prompt_template: user_template,
        output_schema: schema || {}, default_route_key: 'default.chat',
    });
    T('summarize.basic', 'Basic summary',
        'You are a careful summarizer. Cite sources when given.',
        'Summarize the following content:\n{{text}}',
        { type: 'object', properties: { summary: { type: 'string' }, bullets: { type: 'array' } } });
    T('classify.basic', 'Basic classifier',
        'You classify input into one of the provided labels.',
        'Labels: {{labels}}\nInput: {{input}}',
        { type: 'object', properties: { label: { type: 'string' }, confidence: { type: 'number' } } });
    T('extract.json', 'Extract JSON',
        'You extract structured data per the provided JSON schema.',
        'Schema: {{schema}}\nInput: {{input}}',
        { type: 'object' });
    T('wiki.page', 'Wiki page draft',
        'You draft neutral, well-cited wiki pages.',
        'Topic: {{topic}}\nSources: {{sources}}',
        { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, citations: { type: 'array' } } });
    T('blog.post', 'Blog post draft',
        'You draft engaging but accurate blog posts.',
        'Topic: {{topic}}\nAngle: {{angle}}',
        { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } } });
    T('news.story', 'News summary',
        'You summarize news stories and never invent quotes or facts.',
        'Sources: {{sources}}',
        { type: 'object', properties: { headline: { type: 'string' }, summary: { type: 'string' }, citations: { type: 'array' } } });
    T('trade.context', 'Trade market context',
        'You produce neutral market context. Always include not_financial_advice=true.',
        'Asset: {{asset}}\nSources: {{sources}}',
        { type: 'object' });
}

function _workflows() {
    const W = (key, name, ns, steps, route) => model.upsertWorkflow({
        workflow_key: key, name, service_namespace: ns, version: 1,
        steps: steps, default_route_key: route, status: 'active',
        metadata: ns === 'trade' ? { not_financial_advice: true } : {},
    });
    W('wiki.generate_space',     'Generate wiki space',          'wiki',     [{ template: 'wiki.page' }],     'wiki.generate');
    W('wiki.generate_page',      'Generate wiki page',           'wiki',     [{ template: 'wiki.page' }],     'wiki.generate');
    W('blog.draft_post',         'Draft blog post',              'blog',     [{ template: 'blog.post' }],     'blog.draft');
    W('news.summarize_story',    'Summarize news story',         'news',     [{ template: 'news.story' }],    'news.summarize');
    W('news.compare_perspectives','Compare news perspectives',   'news',     [{ template: 'news.story' }],    'news.summarize');
    W('reviews.summarize_entity','Summarize reviews for entity', 'reviews',  [{ template: 'summarize.basic' }], 'reviews.summarize');
    W('deals.enrich_deal',       'Enrich a deal',                'deals',    [{ template: 'extract.json' }],  'deals.enrich');
    W('coupons.extract_coupon',  'Extract coupon from text',     'coupons',  [{ template: 'extract.json' }],  'coupons.extract');
    W('trade.summarize_market_context', 'Summarize market ctx',  'trade',    [{ template: 'trade.context' }], 'trade.summarize');
    W('codes.generate_docs',     'Generate codes docs',          'codes',    [{ template: 'extract.json' }],  'codes.generate_docs');
    W('games.generate_lore',     'Generate game lore',           'games',    [{ template: 'wiki.page' }],     'games.generate_lore');
    W('tools.describe',          'Describe a tool',              'tools',    [{ template: 'wiki.page' }],     'default.json');
    W('moderation.classify_text','Moderation classify',          'system',   [{ template: 'classify.basic' }], 'moderation.classify');
}

function _sources() {
    for (const s of SEED_SOURCES) model.upsertContentSource(s);
}

function seedAll() {
    const provider = _stubProvider();
    const models   = _stubModels(provider.id);
    _routes(provider, models);
    _templates();
    _workflows();
    _sources();
    return {
        providers: model.listProviders().length,
        models:    model.listModels().length,
        routes:    model.listRoutes().length,
        templates: model.listTemplates().length,
        workflows: model.listWorkflows().length,
        sources:   model.listContentSources().length,
    };
}

module.exports = { seedAll };
