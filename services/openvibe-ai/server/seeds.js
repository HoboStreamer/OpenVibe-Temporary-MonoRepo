'use strict';

// openvibe-ai — boot-time seeding. Idempotent. Inserts the stub provider,
// stub models, default routes, default templates and workflows, and the
// default content source registry.

const model = require('./model');
const { SEED_SOURCES } = require('./sources');

// ── real provider helpers ───────────────────────────────────────────────────
// Each function idempotently ensures a DB provider record exists.
// The runtime adapter is already registered in providers.js; the DB record
// maps route_key → provider so runner.js knows which adapter to invoke.

function _openaiProvider() {
    let p = model.getProviderByKey('openai');
    if (p) return p;
    return model.createProvider({
        provider_key: 'openai',
        display_name: 'OpenAI',
        status: 'active',
        auth_mode: 'bearer',
        default_model: 'gpt-4o-mini',
        supports_chat: true, supports_json: true, supports_embeddings: true,
        supports_tools: true, supports_streaming: false,
        timeout_ms: 30000, priority: 10,
        metadata: { env_key: 'OPENVIBE_AI_OPENAI_KEY', base_url: 'https://api.openai.com' },
    });
}

function _openaiModels(providerId) {
    const ensure = (m) => {
        const existing = model.getModelByKey(providerId, m.model_key);
        if (existing) return existing;
        return model.createModel(Object.assign({ provider_id: providerId, status: 'active' }, m));
    };
    return {
        chat:  ensure({ model_key: 'gpt-4o-mini',              model_type: 'chat',      display_name: 'GPT-4o Mini',        supports_json: true, context_window: 128000 }),
        chat4: ensure({ model_key: 'gpt-4o',                   model_type: 'chat',      display_name: 'GPT-4o',             supports_json: true, context_window: 128000 }),
        embed: ensure({ model_key: 'text-embedding-3-small',   model_type: 'embedding', display_name: 'Text Embedding 3 S', context_window: 8191 }),
    };
}

function _anthropicProvider() {
    let p = model.getProviderByKey('anthropic');
    if (p) return p;
    return model.createProvider({
        provider_key: 'anthropic',
        display_name: 'Anthropic',
        status: 'active',
        auth_mode: 'bearer',
        default_model: 'claude-3-5-haiku-20241022',
        supports_chat: true, supports_json: true, supports_embeddings: false,
        supports_tools: false, supports_streaming: false,
        timeout_ms: 30000, priority: 20,
        metadata: { env_key: 'OPENVIBE_AI_ANTHROPIC_KEY', base_url: 'https://api.anthropic.com' },
    });
}

function _anthropicModels(providerId) {
    const ensure = (m) => {
        const existing = model.getModelByKey(providerId, m.model_key);
        if (existing) return existing;
        return model.createModel(Object.assign({ provider_id: providerId, status: 'active' }, m));
    };
    return {
        haiku:  ensure({ model_key: 'claude-3-5-haiku-20241022',  model_type: 'chat', display_name: 'Claude 3.5 Haiku', supports_json: true, context_window: 200000 }),
        sonnet: ensure({ model_key: 'claude-3-5-sonnet-20241022', model_type: 'chat', display_name: 'Claude 3.5 Sonnet', supports_json: true, context_window: 200000 }),
    };
}

function _ollamaProvider() {
    let p = model.getProviderByKey('ollama');
    if (p) return p;
    return model.createProvider({
        provider_key: 'ollama',
        display_name: 'Ollama (local)',
        status: 'active',
        auth_mode: 'none',
        default_model: 'llama3',
        supports_chat: true, supports_json: true, supports_embeddings: true,
        supports_tools: false, supports_streaming: false,
        timeout_ms: 120000, priority: 50,
        metadata: { env_key: 'OPENVIBE_AI_OLLAMA_URL', base_url: 'http://127.0.0.1:11434' },
    });
}

function _ollamaModels(providerId) {
    const ensure = (m) => {
        const existing = model.getModelByKey(providerId, m.model_key);
        if (existing) return existing;
        return model.createModel(Object.assign({ provider_id: providerId, status: 'active' }, m));
    };
    return {
        chat:  ensure({ model_key: 'llama3',          model_type: 'chat',      display_name: 'Llama 3', context_window: 8192 }),
        embed: ensure({ model_key: 'nomic-embed-text', model_type: 'embedding', display_name: 'Nomic Embed Text', context_window: 8192 }),
    };
}

function _openrouterProvider() {
    let p = model.getProviderByKey('openrouter');
    if (p) return p;
    return model.createProvider({
        provider_key: 'openrouter',
        display_name: 'OpenRouter',
        status: 'active',
        auth_mode: 'bearer',
        default_model: 'meta-llama/llama-3.1-8b-instruct:free',
        supports_chat: true, supports_json: false, supports_embeddings: false,
        supports_tools: false, supports_streaming: false,
        timeout_ms: 45000, priority: 30,
        metadata: { env_key: 'OPENVIBE_AI_OPENROUTER_KEY', base_url: 'https://openrouter.ai' },
    });
}

function _openrouterModels(providerId) {
    const ensure = (m) => {
        const existing = model.getModelByKey(providerId, m.model_key);
        if (existing) return existing;
        return model.createModel(Object.assign({ provider_id: providerId, status: 'active' }, m));
    };
    return {
        chat: ensure({ model_key: 'meta-llama/llama-3.1-8b-instruct:free', model_type: 'chat', display_name: 'Llama 3.1 8B (free)', context_window: 131072 }),
    };
}

// ── stub provider ───────────────────────────────────────────────────────────
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
    r('tools.describe', 'json');
    r('games.generate_lore', 'json');
    r('moderation.classify', 'json');
}

function _templates() {
    const T = (cfg) => model.upsertTemplate(Object.assign({
        version: 1,
        visibility: 'system',
        status: 'active',
        input_schema: { type: 'object', properties: {} },
        output_schema: { type: 'object', properties: {} },
        default_route_key: 'default.chat',
        metadata: {},
    }, cfg));

    T({
        template_key: 'summarize.basic',
        name: 'Basic summary',
        system_prompt: 'You are a careful summarizer. Cite sources when given and avoid inventing details.',
        user_prompt_template: 'Summarize the following content:\n{{text}}',
        default_route_key: 'default.json',
        output_schema: { type: 'object', properties: { summary: { type: 'string' }, bullets: { type: 'array' } } },
    });
    T({
        template_key: 'classify.basic',
        name: 'Basic classifier',
        system_prompt: 'You classify input into one of the provided labels.',
        user_prompt_template: 'Labels: {{labels}}\nInput: {{input}}',
        default_route_key: 'moderation.classify',
        output_schema: { type: 'object', properties: { label: { type: 'string' }, confidence: { type: 'number' } } },
    });
    T({
        template_key: 'extract.json',
        name: 'Extract JSON',
        system_prompt: 'You extract structured data per the provided JSON schema without inventing fields.',
        user_prompt_template: 'Schema: {{schema}}\nInput: {{input}}',
        default_route_key: 'default.json',
        output_schema: { type: 'object', properties: { data: { type: 'object' } } },
    });
    T({
        template_key: 'wiki.space',
        name: 'Wiki space blueprint',
        system_prompt: 'You draft neutral, reference-style wiki space copy with source transparency and clear taxonomy clues.',
        user_prompt_template: 'Space topic: {{topic}}\nAudience: {{audience}}\nSeed sources: {{sources}}',
        default_route_key: 'wiki.generate',
        output_schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, bullets: { type: 'array' }, citations: { type: 'array' } } },
    });
    T({
        template_key: 'wiki.page',
        name: 'Wiki page draft',
        system_prompt: 'You draft neutral, well-cited wiki pages with encyclopedic tone and explicit sourcing needs.',
        user_prompt_template: 'Topic: {{topic}}\nSections: {{sections}}\nSources: {{sources}}',
        default_route_key: 'wiki.generate',
        output_schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, bullets: { type: 'array' }, citations: { type: 'array' } } },
    });
    T({
        template_key: 'blog.post',
        name: 'Blog post draft',
        system_prompt: 'You draft engaging, accurate blog posts with a clear angle, helpful structure, and no fabricated claims.',
        user_prompt_template: 'Topic: {{topic}}\nAngle: {{angle}}\nAudience: {{audience}}\nSources: {{sources}}',
        default_route_key: 'blog.draft',
        output_schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, outline: { type: 'array' } } },
    });
    T({
        template_key: 'news.story',
        name: 'News summary',
        system_prompt: 'You summarize news stories and never invent quotes, chronology, or attributed facts.',
        user_prompt_template: 'Story focus: {{topic}}\nSources: {{sources}}',
        default_route_key: 'news.summarize',
        output_schema: { type: 'object', properties: { headline: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, bullets: { type: 'array' }, citations: { type: 'array' } } },
    });
    T({
        template_key: 'news.perspectives',
        name: 'News perspectives comparison',
        system_prompt: 'You compare reporting angles across sources without implying facts that are not supported by the source set.',
        user_prompt_template: 'Topic: {{topic}}\nPerspective sources: {{sources}}',
        default_route_key: 'news.summarize',
        output_schema: { type: 'object', properties: { headline: { type: 'string' }, summary: { type: 'string' }, perspectives: { type: 'array' }, citations: { type: 'array' } } },
    });
    T({
        template_key: 'reviews.entity',
        name: 'Reviews entity summary',
        system_prompt: 'You summarize review consensus without fabricating ratings, prices, or unanimous sentiment.',
        user_prompt_template: 'Entity: {{entity}}\nReview sources: {{sources}}',
        default_route_key: 'reviews.summarize',
        output_schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, pros: { type: 'array' }, cons: { type: 'array' }, citations: { type: 'array' } } },
    });
    T({
        template_key: 'deals.page',
        name: 'Deal page draft',
        system_prompt: 'You describe deals factually, highlight what is verifiable, and avoid inventing prices, stock, or coupon terms.',
        user_prompt_template: 'Product: {{product_name}}\nMerchant: {{merchant}}\nObserved deal data: {{deal_data}}\nSources: {{sources}}',
        default_route_key: 'deals.enrich',
        output_schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, merchant: { type: 'string' }, price: { type: ['string', 'number'] }, priceCurrency: { type: 'string' }, highlights: { type: 'array' } } },
    });
    T({
        template_key: 'coupons.page',
        name: 'Coupon page draft',
        system_prompt: 'You extract and organize coupon information without fabricating codes, expirations, or restrictions.',
        user_prompt_template: 'Merchant: {{merchant}}\nObserved coupon text: {{input}}\nSources: {{sources}}',
        default_route_key: 'coupons.extract',
        output_schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, coupon_code: { type: 'string' }, discount_text: { type: 'string' }, redemption_steps: { type: 'array' }, restrictions: { type: 'array' } } },
    });
    T({
        template_key: 'trade.context',
        name: 'Trade market context',
        system_prompt: 'You produce neutral market context. Always include not_financial_advice=true and never frame speculation as certainty.',
        user_prompt_template: 'Asset: {{asset}}\nTime horizon: {{time_horizon}}\nSources: {{sources}}',
        default_route_key: 'trade.summarize',
        output_schema: { type: 'object', properties: { headline: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, catalysts: { type: 'array' }, risks: { type: 'array' } } },
    });
    T({
        template_key: 'codes.docs',
        name: 'Code docs draft',
        system_prompt: 'You draft technical docs with emphasis on setup, examples, and documentation gaps still needing source verification.',
        user_prompt_template: 'Project: {{name}}\nAudience: {{audience}}\nAPI surface: {{api_surface}}\nSources: {{sources}}',
        default_route_key: 'codes.generate_docs',
        output_schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, quickstart: { type: 'array' }, api_notes: { type: 'array' }, examples: { type: 'array' } } },
    });
    T({
        template_key: 'tools.page',
        name: 'Tool page draft',
        system_prompt: 'You draft software tool pages focused on what the tool does, who it helps, integration surfaces, and what still needs human verification.',
        user_prompt_template: 'Tool: {{tool_name}}\nUse case: {{use_case}}\nCategory: {{applicationCategory}}\nSources: {{sources}}',
        default_route_key: 'tools.describe',
        output_schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, use_cases: { type: 'array' }, integrations: { type: 'array' }, pricing_notes: { type: 'array' } } },
    });
    T({
        template_key: 'games.lore',
        name: 'Game lore draft',
        system_prompt: 'You draft game-lore pages with clear narrative hooks and explicit separation between sourced facts and creative filler.',
        user_prompt_template: 'Game: {{game_name}}\nFaction focus: {{faction}}\nSources: {{sources}}',
        default_route_key: 'games.generate_lore',
        output_schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, factions: { type: 'array' }, characters: { type: 'array' }, plot_hooks: { type: 'array' } } },
    });
}

function _workflows() {
    const PRODUCT_OUTPUT_SCHEMA = {
        type: 'object',
        properties: {
            product: { type: 'object' },
            draft: { type: 'object' },
            seo: { type: 'object' },
            sources: { type: 'object' },
            quality: { type: 'object' },
            search_document: { type: 'object' },
            disclosures: { type: 'object' },
            raw_output: { type: 'object' },
        },
    };
    const productMeta = (meta) => Object.assign({
        ui_contract: 'product-seam-v1',
        search_contract: 'local-sqlite',
        source_transparency: true,
        authoring_process: 'AI-assisted draft assembled by openvibe-ai and packaged for SEO, search, and editorial review.',
    }, meta || {});
    const W = (cfg) => model.upsertWorkflow(Object.assign({
        version: 1,
        status: 'active',
        input_schema: { type: 'object', properties: {} },
        output_schema: PRODUCT_OUTPUT_SCHEMA,
        steps: [],
        metadata: {},
    }, cfg));

    W({
        workflow_key: 'wiki.generate_space',
        name: 'Generate wiki space',
        description: 'Create a wiki space draft with SEO metadata, source plan, and search payload.',
        service_namespace: 'wiki',
        input_schema: { type: 'object', properties: { topic: { type: 'string' }, audience: { type: 'string' }, slug: { type: 'string' } } },
        steps: [{ template: 'wiki.space', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'wiki.generate',
        metadata: productMeta({ product_key: 'openvibe.wiki', site_label: 'OpenVibe Wiki', canonical_host: 'openvibe.wiki', canonical_path_prefix: '/spaces', content_type: 'wiki_page', schema_type: 'Article', index_key: 'wiki', document_type: 'wiki_space', min_source_count: 2, recommended_source_keys: ['json_ld_article', 'sitemap_blog', 'rss_blog_generic'], section_titles: ['Overview', 'Scope', 'Sources'], intent_label: 'Provide an editorial-ready wiki space scaffold.' }),
    });
    W({
        workflow_key: 'wiki.generate_page',
        name: 'Generate wiki page',
        description: 'Create a wiki page draft with source transparency, SEO, and search payload.',
        service_namespace: 'wiki',
        input_schema: { type: 'object', properties: { topic: { type: 'string' }, sections: { type: 'array' }, slug: { type: 'string' } } },
        steps: [{ template: 'wiki.page', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'wiki.generate',
        metadata: productMeta({ product_key: 'openvibe.wiki', site_label: 'OpenVibe Wiki', canonical_host: 'openvibe.wiki', canonical_path_prefix: '/pages', content_type: 'wiki_page', schema_type: 'Article', index_key: 'wiki', document_type: 'wiki_page', min_source_count: 2, recommended_source_keys: ['json_ld_article', 'sitemap_blog', 'rss_blog_generic'], section_titles: ['Overview', 'Key facts', 'Sources'], intent_label: 'Generate an encyclopedic page draft for OpenVibe Wiki.' }),
    });
    W({
        workflow_key: 'blog.draft_post',
        name: 'Draft blog post',
        description: 'Create a blog post draft with SEO metadata and search payload.',
        service_namespace: 'blog',
        input_schema: { type: 'object', properties: { topic: { type: 'string' }, angle: { type: 'string' }, audience: { type: 'string' } } },
        steps: [{ template: 'blog.post', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'blog.draft',
        metadata: productMeta({ product_key: 'openvibe.blog', site_label: 'OpenVibe Blog', canonical_host: 'openvibe.blog', canonical_path_prefix: '/posts', content_type: 'blog_post', schema_type: 'BlogPosting', index_key: 'blog', document_type: 'blog_post', min_source_count: 1, recommended_source_keys: ['wordpress_posts', 'rss_blog_generic', 'sitemap_blog'], section_titles: ['Hook', 'Draft', 'Source notes'], intent_label: 'Create a people-first blog draft for editorial refinement.' }),
    });
    W({
        workflow_key: 'news.summarize_story',
        name: 'Summarize news story',
        description: 'Create a news-story package with citations, SEO, and search payload.',
        service_namespace: 'news',
        input_schema: { type: 'object', properties: { topic: { type: 'string' }, slug: { type: 'string' } } },
        steps: [{ template: 'news.story', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'news.summarize',
        metadata: productMeta({ product_key: 'openvibe.news', site_label: 'OpenVibe News', canonical_host: 'openvibe.news', canonical_path_prefix: '/stories', content_type: 'news_story', schema_type: 'NewsArticle', index_key: 'news', document_type: 'news_story', min_source_count: 2, recommended_source_keys: ['gdelt_doc', 'newsapi_top', 'rss_news_generic', 'youtube_news', 'reddit_topic'], section_titles: ['Lede', 'What happened', 'Sources'], intent_label: 'Package a sourced story summary for OpenVibe News.' }),
    });
    W({
        workflow_key: 'news.compare_perspectives',
        name: 'Compare news perspectives',
        description: 'Compare multiple reporting angles and package the result for OpenVibe News.',
        service_namespace: 'news',
        input_schema: { type: 'object', properties: { topic: { type: 'string' }, perspective_count: { type: 'number' } } },
        steps: [{ template: 'news.perspectives', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'news.summarize',
        metadata: productMeta({ product_key: 'openvibe.news', site_label: 'OpenVibe News', canonical_host: 'openvibe.news', canonical_path_prefix: '/perspectives', content_type: 'news_story', schema_type: 'NewsArticle', index_key: 'news', document_type: 'news_perspectives', min_source_count: 2, recommended_source_keys: ['gdelt_doc', 'newsapi_top', 'rss_news_generic', 'youtube_news', 'reddit_topic'], section_titles: ['Angle', 'Comparison', 'Sources'], intent_label: 'Show perspective drift across multiple news sources.' }),
    });
    W({
        workflow_key: 'reviews.summarize_entity',
        name: 'Summarize reviews for entity',
        description: 'Create a review-summary package with source transparency and SEO payload.',
        service_namespace: 'reviews',
        input_schema: { type: 'object', properties: { entity: { type: 'string' }, slug: { type: 'string' } } },
        steps: [{ template: 'reviews.entity', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'reviews.summarize',
        metadata: productMeta({ product_key: 'openvibe.reviews', site_label: 'OpenVibe Reviews', canonical_host: 'openvibe.reviews', canonical_path_prefix: '/reviews', content_type: 'review_page', schema_type: 'Review', index_key: 'reviews', document_type: 'review_page', min_source_count: 2, recommended_source_keys: ['yelp_places', 'reddit_reviews', 'review_struct'], section_titles: ['Verdict', 'Highlights', 'Sources'], intent_label: 'Summarize review consensus without fabricating ratings.' }),
    });
    W({
        workflow_key: 'deals.enrich_deal',
        name: 'Enrich a deal',
        description: 'Create a deal-page package with SEO, structured data, and search payload.',
        service_namespace: 'deals',
        input_schema: { type: 'object', properties: { product_name: { type: 'string' }, merchant: { type: 'string' }, price: { type: ['string', 'number'] }, priceCurrency: { type: 'string' } } },
        steps: [{ template: 'deals.page', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'deals.enrich',
        metadata: productMeta({ product_key: 'openvibe.deals', site_label: 'OpenVibe Deals', canonical_host: 'openvibe.deals', canonical_path_prefix: '/deals', content_type: 'deal_page', schema_type: 'Product', index_key: 'deals', document_type: 'deal_page', min_source_count: 1, recommended_source_keys: ['ebay_browse', 'dealnews_rss', 'product_json_ld'], section_titles: ['Offer summary', 'Why it matters', 'Sources'], intent_label: 'Package a verified deal summary for shoppers.' }),
    });
    W({
        workflow_key: 'coupons.extract_coupon',
        name: 'Extract coupon from text',
        description: 'Create a coupon-page package with redemption notes and SEO payload.',
        service_namespace: 'coupons',
        input_schema: { type: 'object', properties: { merchant: { type: 'string' }, input: { type: 'string' }, slug: { type: 'string' } } },
        steps: [{ template: 'coupons.page', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'coupons.extract',
        metadata: productMeta({ product_key: 'openvibe.coupons', site_label: 'OpenVibe Coupons', canonical_host: 'openvibe.coupons', canonical_path_prefix: '/coupons', content_type: 'coupon_page', schema_type: 'Article', index_key: 'coupons', document_type: 'coupon_page', min_source_count: 1, recommended_source_keys: ['rakuten_coupons', 'merchant_coupon'], section_titles: ['Coupon details', 'How to redeem', 'Restrictions'], intent_label: 'Extract coupon details into a structured consumer-facing page.' }),
    });
    W({
        workflow_key: 'trade.summarize_market_context',
        name: 'Summarize market context',
        description: 'Create a market-context package with disclosures, SEO, and search payload.',
        service_namespace: 'trade',
        input_schema: { type: 'object', properties: { asset: { type: 'string' }, time_horizon: { type: 'string' } } },
        steps: [{ template: 'trade.context', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'trade.summarize',
        metadata: productMeta({ product_key: 'openvibe.trade', site_label: 'OpenVibe Trade', canonical_host: 'openvibe.trade', canonical_path_prefix: '/markets', content_type: 'trade_page', schema_type: 'Article', index_key: 'trade', document_type: 'trade_page', min_source_count: 2, recommended_source_keys: ['alpha_vantage', 'coingecko', 'finnhub', 'sec_edgar'], section_titles: ['Market context', 'Watch list', 'Sources'], intent_label: 'Provide neutral market context with explicit non-advice disclosure.', not_financial_advice: true }),
    });
    W({
        workflow_key: 'codes.generate_docs',
        name: 'Generate codes docs',
        description: 'Create a developer-doc package with SEO and search payload.',
        service_namespace: 'codes',
        input_schema: { type: 'object', properties: { name: { type: 'string' }, audience: { type: 'string' }, applicationCategory: { type: 'string' }, operatingSystem: { type: 'string' } } },
        steps: [{ template: 'codes.docs', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'codes.generate_docs',
        metadata: productMeta({ product_key: 'openvibe.codes', site_label: 'OpenVibe Codes', canonical_host: 'openvibe.codes', canonical_path_prefix: '/docs', content_type: 'codes_doc', schema_type: 'SoftwareApplication', index_key: 'codes', document_type: 'codes_doc', min_source_count: 1, recommended_source_keys: ['sitemap_xml', 'json_ld_article', 'robots_txt'], section_titles: ['Quickstart', 'Reference notes', 'Source notes'], applicationCategory: 'DeveloperApplication', intent_label: 'Prepare developer-facing docs for OpenVibe Codes.' }),
    });
    W({
        workflow_key: 'tools.describe',
        name: 'Describe a tool',
        description: 'Create a software-tool package with SEO, source plan, and search payload.',
        service_namespace: 'tools',
        input_schema: { type: 'object', properties: { tool_name: { type: 'string' }, use_case: { type: 'string' }, applicationCategory: { type: 'string' }, operatingSystem: { type: 'string' } } },
        steps: [{ template: 'tools.page', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'tools.describe',
        metadata: productMeta({ product_key: 'openvibe.tools', site_label: 'OpenVibe Tools', canonical_host: 'openvibe.tools', canonical_path_prefix: '/tools', content_type: 'tool_page', schema_type: 'SoftwareApplication', index_key: 'tools', document_type: 'tool_page', min_source_count: 1, recommended_source_keys: ['product_json_ld', 'review_struct', 'reddit_reviews', 'ebay_browse'], section_titles: ['Overview', 'Use cases', 'Adoption notes'], applicationCategory: 'DeveloperApplication', intent_label: 'Package a tool profile for OpenVibe Tools.' }),
    });
    W({
        workflow_key: 'games.generate_lore',
        name: 'Generate game lore',
        description: 'Create a lore package with SEO metadata and search payload for OpenVibe Games.',
        service_namespace: 'games',
        input_schema: { type: 'object', properties: { game_name: { type: 'string' }, faction: { type: 'string' } } },
        steps: [{ template: 'games.lore', stage: 'draft' }, { stage: 'package', action: 'product_output' }],
        default_route_key: 'games.generate_lore',
        metadata: productMeta({ product_key: 'openvibe.games', site_label: 'OpenVibe Games', canonical_host: 'openvibe.games', canonical_path_prefix: '/lore', content_type: 'generic_article', schema_type: 'Article', index_key: 'games', document_type: 'game_lore', min_source_count: 1, recommended_source_keys: ['youtube_news', 'reddit_topic', 'rss_blog_generic'], section_titles: ['World', 'Hooks', 'Sources'], intent_label: 'Create a lore-first content scaffold for OpenVibe Games.' }),
    });
    W({
        workflow_key: 'moderation.classify_text',
        name: 'Moderation classify',
        description: 'Classify moderation signals for text.',
        service_namespace: 'system',
        steps: [{ template: 'classify.basic', stage: 'classify' }],
        default_route_key: 'moderation.classify',
        metadata: {},
    });
}

function _sources() {
    for (const s of SEED_SOURCES) model.upsertContentSource(s);
}

function seedAll() {
    const stubProvider = _stubProvider();
    const stubModels   = _stubModels(stubProvider.id);

    // Real providers — idempotent, created if not present
    const openaiProvider      = _openaiProvider();
    const openaiModels        = _openaiModels(openaiProvider.id);
    const anthropicProvider   = _anthropicProvider();
    /* anthropicModels */      _anthropicModels(anthropicProvider.id);
    const ollamaProvider      = _ollamaProvider();
    /* ollamaModels */         _ollamaModels(ollamaProvider.id);
    const openrouterProvider  = _openrouterProvider();
    /* openrouterModels */     _openrouterModels(openrouterProvider.id);

    // Routes: prefer openai primary with stub as fallback (stub stays if no openai key)
    // Routes are seeded using stub; at runtime providers.js resolves the adapter by key.
    _routes(openaiProvider, openaiModels);

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
