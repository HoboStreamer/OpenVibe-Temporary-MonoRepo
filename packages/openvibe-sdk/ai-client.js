'use strict';

// OpenVibe SDK — AiClient. Wraps openvibe-ai (canonical public domain
// `ai.openvibe.network`). Includes AI orchestration, SEO helpers, source
// registry, ingestion job, and search-index seam methods.

const { jsonRequest } = require('./http');

const DEFAULT_AI_URL = 'http://127.0.0.1:5100';
const DEFAULT_CANONICAL_HOST = 'ai.openvibe.network';

class AiClient {
    constructor(opts) {
        opts = opts || {};
        this.aiUrl = String(
            opts.aiUrl
            || (typeof process !== 'undefined' && process.env && process.env.OPENVIBE_AI_URL)
            || DEFAULT_AI_URL
        ).replace(/\/$/, '');
        this.canonicalHost = opts.canonicalHost
            || (typeof process !== 'undefined' && process.env && process.env.AI_OPENVIBE_NETWORK_HOST)
            || DEFAULT_CANONICAL_HOST;
        this.internalKey = opts.internalKey || null;
        this.callerService = opts.service || null;
    }
    _u(p) { return `${this.aiUrl}${p}`; }
    _hdrs() {
        const h = {};
        if (this.callerService) h['X-OpenVibe-Service'] = this.callerService;
        return h;
    }
    _get(p)        { return jsonRequest(this._u(p), { headers: this._hdrs(), internalKey: this.internalKey }); }
    _post(p, body) { return jsonRequest(this._u(p), { method: 'POST', headers: this._hdrs(), internalKey: this.internalKey, body: body || {} }); }
    _put(p, body)  { return jsonRequest(this._u(p), { method: 'PUT',  headers: this._hdrs(), internalKey: this.internalKey, body: body || {} }); }
    _del(p)        { return jsonRequest(this._u(p), { method: 'DELETE', headers: this._hdrs(), internalKey: this.internalKey }); }

    // ── health / status ──
    health()        { return this._get('/health'); }
    status()        { return this._get('/api/v1/ai/status'); }
    adminSummary()  { return this._get('/api/v1/ai/admin/summary'); }

    // ── providers / models / routes ──
    listProviders()           { return this._get('/api/v1/ai/providers'); }
    createProvider(body)      { return this._post('/api/v1/ai/providers', body); }
    getProvider(id)           { return this._get(`/api/v1/ai/providers/${encodeURIComponent(id)}`); }
    updateProvider(id, body)  { return this._put(`/api/v1/ai/providers/${encodeURIComponent(id)}`, body); }
    disableProvider(id)       { return this._del(`/api/v1/ai/providers/${encodeURIComponent(id)}`); }

    listModels()              { return this._get('/api/v1/ai/models'); }
    createModel(body)         { return this._post('/api/v1/ai/models', body); }
    updateModel(id, body)     { return this._put(`/api/v1/ai/models/${encodeURIComponent(id)}`, body); }
    disableModel(id)          { return this._del(`/api/v1/ai/models/${encodeURIComponent(id)}`); }

    listRoutes()              { return this._get('/api/v1/ai/routes'); }
    createRoute(body)         { return this._post('/api/v1/ai/routes', body); }
    getRoute(key)             { return this._get(`/api/v1/ai/routes/${encodeURIComponent(key)}`); }
    updateRoute(key, body)    { return this._put(`/api/v1/ai/routes/${encodeURIComponent(key)}`, body); }
    disableRoute(key)         { return this._del(`/api/v1/ai/routes/${encodeURIComponent(key)}`); }

    // ── templates / workflows ──
    listTemplates()             { return this._get('/api/v1/ai/templates'); }
    createTemplate(body)        { return this._post('/api/v1/ai/templates', body); }
    getTemplate(key)            { return this._get(`/api/v1/ai/templates/${encodeURIComponent(key)}`); }
    updateTemplate(key, body)   { return this._put(`/api/v1/ai/templates/${encodeURIComponent(key)}`, body); }
    deprecateTemplate(key)      { return this._post(`/api/v1/ai/templates/${encodeURIComponent(key)}/deprecate`, {}); }

    listWorkflows()             { return this._get('/api/v1/ai/workflows'); }
    createWorkflow(body)        { return this._post('/api/v1/ai/workflows', body); }
    getWorkflow(key)            { return this._get(`/api/v1/ai/workflows/${encodeURIComponent(key)}`); }
    updateWorkflow(key, body)   { return this._put(`/api/v1/ai/workflows/${encodeURIComponent(key)}`, body); }
    deprecateWorkflow(key)      { return this._post(`/api/v1/ai/workflows/${encodeURIComponent(key)}/deprecate`, {}); }

    // ── runs ──
    createRun(body)             { return this._post('/api/v1/ai/runs', body); }
    listRuns(query)             { const qs = new URLSearchParams(query || {}).toString(); return this._get(`/api/v1/ai/runs${qs ? '?' + qs : ''}`); }
    getRun(id)                  { return this._get(`/api/v1/ai/runs/${encodeURIComponent(id)}`); }
    cancelRun(id)               { return this._post(`/api/v1/ai/runs/${encodeURIComponent(id)}/cancel`, {}); }
    retryRun(id)                { return this._post(`/api/v1/ai/runs/${encodeURIComponent(id)}/retry`, {}); }

    // ── direct AI tasks ──
    chat(body)         { return this._post('/api/v1/ai/chat', body); }
    generate(body)     { return this._post('/api/v1/ai/generate', body); }
    summarize(body)    { return this._post('/api/v1/ai/summarize', body); }
    classify(body)     { return this._post('/api/v1/ai/classify', body); }
    extract(body)      { return this._post('/api/v1/ai/extract', body); }
    enrich(body)       { return this._post('/api/v1/ai/enrich', body); }
    embed(body)        { return this._post('/api/v1/ai/embed', body); }

    // ── product workflow helpers ──
    generateWikiSpace(body)         { return this._post('/api/v1/ai/wiki/generate-space', body); }
    generateWikiPage(body)          { return this._post('/api/v1/ai/wiki/generate-page', body); }
    draftBlogPost(body)             { return this._post('/api/v1/ai/blog/draft-post', body); }
    summarizeNewsStory(body)        { return this._post('/api/v1/ai/news/summarize-story', body); }
    compareNewsPerspectives(body)   { return this._post('/api/v1/ai/news/compare-perspectives', body); }
    summarizeReviewsEntity(body)    { return this._post('/api/v1/ai/reviews/summarize-entity', body); }
    enrichDeal(body)                { return this._post('/api/v1/ai/deals/enrich-deal', body); }
    extractCoupon(body)             { return this._post('/api/v1/ai/coupons/extract-coupon', body); }
    summarizeTradeContext(body)     { return this._post('/api/v1/ai/trade/summarize-market-context', body); }
    generateCodesDocs(body)         { return this._post('/api/v1/ai/codes/generate-docs', body); }
    describeTool(body)              { return this._post('/api/v1/ai/tools/describe-tool', body); }
    generateToolPage(body)          { return this._post('/api/v1/ai/tools/generate-page', body); }
    generateGameLore(body)          { return this._post('/api/v1/ai/games/generate-lore', body); }

    // ── SEO helpers ──
    generateSeoMetadata(body)       { return this._post('/api/v1/ai/seo/metadata', body); }
    evaluateIndexability(body)      { return this._post('/api/v1/ai/seo/indexability', body); }
    generateStructuredData(body)    { return this._post('/api/v1/ai/seo/structured-data', body); }
    generateSitemapEntry(body)      { return this._post('/api/v1/ai/seo/sitemap-entry', body); }
    generateSitemap(body)           { return this._post('/api/v1/ai/seo/sitemap', body); }
    generateSitemapIndex(body)      { return this._post('/api/v1/ai/seo/sitemap-index', body); }
    generateRssFeed(body)           { return this._post('/api/v1/ai/seo/rss', body); }
    generateAtomFeed(body)          { return this._post('/api/v1/ai/seo/atom', body); }
    generateRobotsTxt(body)         { return this._post('/api/v1/ai/seo/robots', body); }
    normalizeSlug(body)             { return this._post('/api/v1/ai/seo/slug', body); }
    canonicalizeUrl(body)           { return this._post('/api/v1/ai/seo/canonical', body); }
    generateDuplicateHash(body)     { return this._post('/api/v1/ai/seo/duplicate-hash', body); }

    // ── source registry ──
    listContentSources()              { return this._get('/api/v1/ai/sources'); }
    registerContentSource(body)       { return this._post('/api/v1/ai/sources', body); }
    getContentSource(id)              { return this._get(`/api/v1/ai/sources/${encodeURIComponent(id)}`); }
    updateContentSource(id, body)     { return this._put(`/api/v1/ai/sources/${encodeURIComponent(id)}`, body); }
    testContentSource(id)             { return this._post(`/api/v1/ai/sources/${encodeURIComponent(id)}/test`, {}); }
    fetchContentSource(id, body)      { return this._post(`/api/v1/ai/sources/${encodeURIComponent(id)}/fetch`, body || {}); }
    robotsCheckContentSource(id)      { return this._post(`/api/v1/ai/sources/${encodeURIComponent(id)}/robots-check`, {}); }

    // ── ingestion / quality ──
    createIngestionJob(body)        { return this._post('/api/v1/ai/ingestion/jobs', body); }
    listIngestionJobs(query)        { const qs = new URLSearchParams(query || {}).toString(); return this._get(`/api/v1/ai/ingestion/jobs${qs ? '?' + qs : ''}`); }
    getIngestionJob(id)             { return this._get(`/api/v1/ai/ingestion/jobs/${encodeURIComponent(id)}`); }
    runIngestionJob(id)             { return this._post(`/api/v1/ai/ingestion/jobs/${encodeURIComponent(id)}/run`, {}); }
    cancelIngestionJob(id)          { return this._post(`/api/v1/ai/ingestion/jobs/${encodeURIComponent(id)}/cancel`, {}); }
    evaluateContentQuality(body)    { return this._post('/api/v1/ai/content/quality', body); }

    // ── search-index seam ──
    indexSearchDocument(body)       { return this._post('/api/v1/ai/search/index', body); }
    querySearchIndex(body)          { return this._post('/api/v1/ai/search/query', body); }
    deleteSearchDocument(body)      { return this._post('/api/v1/ai/search/delete', body); }
    searchStatus()                  { return this._get('/api/v1/ai/search/status'); }
}

module.exports = { AiClient, DEFAULT_AI_URL, DEFAULT_CANONICAL_HOST };
