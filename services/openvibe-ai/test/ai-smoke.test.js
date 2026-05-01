'use strict';

// openvibe-ai smoke test — exercises the in-process app against an isolated
// SQLite DB. Set env BEFORE requiring config/db.

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const assert = require('assert');

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-ai-'));
process.env.NODE_ENV = 'development';
process.env.OPENVIBE_ENV = 'development';
process.env.PORT = '0';
process.env.DB_PATH = path.join(tmpdir, 'ai.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.INTERNAL_API_KEY = 'test-internal-key';
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_OPENVIBE_AI_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_AI_DATABASE_URL = '';

const config = require('../server/config');
const db = require('../server/db');
const seeds = require('../server/seeds');
const model = require('../server/model');
const seo = require('../server/seo');
const runner = require('../server/runner');
const sources = require('../server/sources');

function _req(server, method, urlPath, body, headers) {
    return new Promise((resolve, reject) => {
        const data = body == null ? null : JSON.stringify(body);
        const port = server.address().port;
        const req = http.request({
            host: '127.0.0.1', port, method, path: urlPath,
            headers: Object.assign({
                'content-type': 'application/json',
                'content-length': data ? Buffer.byteLength(data) : 0,
                'x-internal-key': 'test-internal-key',
                'x-openvibe-service': 'test-suite',
            }, headers || {}),
        }, res => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(buf); } catch { json = buf; }
                resolve({ status: res.statusCode, body: json, headers: res.headers });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function main() {
    console.log('[ai-smoke] tmp db:', config.db.path);
    db.init(config.db.path);
    const counts = seeds.seedAll();
    assert.ok(counts.providers >= 1, 'providers seeded');
    assert.ok(counts.routes >= 14, 'routes seeded');
    assert.ok(counts.workflows >= 10, 'workflows seeded');
    assert.ok(counts.sources >= 5, 'sources seeded');
    console.log('[ai-smoke] seeds:', counts);
    assert.ok(model.getRoute('tools.describe'), 'tools route present');
    assert.ok(model.getWorkflow('tools.describe'), 'tools workflow present');
    assert.ok(model.getTemplate('tools.page'), 'tools template present');

    // Direct runner: deterministic stub run + idempotency replay
    const idem = 'idem-test-1';
    const r1 = await runner.executeRun({
        config, events: null, actor: { actor_type: 'service', actor_id: 'test-suite' },
        namespace: 'wiki', workflow_key: 'wiki.generate_space',
        task: 'generate', input: { topic: 'OpenVibe' }, idempotency_key: idem,
    });
    assert.ok(!r1.replayed, 'first run not replayed');
    assert.ok(r1.run && r1.run.id, 'run created');
    assert.ok(r1.output && (r1.output.text || typeof r1.output === 'object'), 'has output');
    const r2 = await runner.executeRun({
        config, events: null, actor: { actor_type: 'service', actor_id: 'test-suite' },
        namespace: 'wiki', workflow_key: 'wiki.generate_space',
        task: 'generate', input: { topic: 'OpenVibe' }, idempotency_key: idem,
    });
    assert.ok(r2.replayed, 'second run replayed via idempotency');
    assert.strictEqual(r2.run.id, r1.run.id, 'replay returns same run id');

    // Cache hit on identical (non-idempotent) call
    const c1 = await runner.executeRun({
        config, events: null, actor: { actor_type: 'service', actor_id: 'test-suite' },
        namespace: 'system', task: 'generate', input: { prompt: 'hello world' },
    });
    const c2 = await runner.executeRun({
        config, events: null, actor: { actor_type: 'service', actor_id: 'test-suite' },
        namespace: 'system', task: 'generate', input: { prompt: 'hello world' },
    });
    assert.ok(c2.cached, 'second identical task served from cache');

    // Quota: drop limit to 1 then attempt
    const provider = model.getProviderByKey('stub');
    assert.ok(provider, 'stub provider present');
    config.ai.perDayLimit = 1;
    let threw = false;
    try {
        await runner.executeRun({
            config, events: null, actor: { actor_type: 'service', actor_id: 'quota-test' },
            namespace: 'system', task: 'generate', input: { prompt: 'qtest-' + Date.now() },
        });
        await runner.executeRun({
            config, events: null, actor: { actor_type: 'service', actor_id: 'quota-test' },
            namespace: 'system', task: 'generate', input: { prompt: 'qtest2-' + Date.now() },
        });
    } catch (e) {
        threw = e && e.code === 'EAIQUOTA';
    }
    assert.ok(threw, 'quota limit enforced');
    config.ai.perDayLimit = 20000; // restore

    // SEO: indexability gate (thin, sufficient, duplicate, stub-in-prod)
    const thin = seo.evaluateIndexability({ content_type: 'wiki_page', body: 'short', source_count: 0, generated_by: 'ai', provider_key: 'stub', production_mode: false });
    assert.strictEqual(thin.indexing_status, 'noindex', 'thin → noindex');
    assert.ok(thin.reasons.find(x => x.startsWith('thin_content')), 'thin reason present');

    const longBody = 'word '.repeat(800);
    const ok = seo.evaluateIndexability({
        content_type: 'wiki_page', body: longBody, word_count: 800, source_count: 3,
        generated_by: 'ai', provider_key: 'stub', production_mode: false,
    });
    assert.strictEqual(ok.indexing_status, 'ready', 'sufficient + dev-stub allowed');

    const prodStub = seo.evaluateIndexability({
        content_type: 'wiki_page', word_count: 800, source_count: 3,
        generated_by: 'ai', provider_key: 'stub', production_mode: true,
    });
    assert.strictEqual(prodStub.indexing_status, 'noindex', 'stub-in-production noindex');

    const dupe = seo.evaluateIndexability({
        content_type: 'wiki_page', word_count: 800, source_count: 3,
        generated_by: 'ai', provider_key: 'openai', production_mode: true,
        duplicate_hash_seen: true, canonical_url: '',
    });
    assert.strictEqual(dupe.indexing_status, 'noindex', 'duplicate without canonical noindex');

    // JSON-LD never fabricates
    const review = seo.generateStructuredData({ type: 'Review', fields: { itemReviewed: 'X', reviewBody: 'good' } });
    assert.ok(review && !review.reviewRating, 'Review without ratingValue omits reviewRating');
    const offerNoPrice = seo.generateStructuredData({ type: 'Offer', fields: { url: 'http://x' } });
    assert.strictEqual(offerNoPrice, null, 'Offer without price returns null (no fabrication)');

    // Sitemap excludes indexable=false rows
    const sitemap = seo.generateSitemap({ entries: [
        { loc: 'https://x/a', indexable: true },
        { loc: 'https://x/b', indexable: false },
    ]});
    assert.ok(sitemap.includes('https://x/a'), 'sitemap includes indexable url');
    assert.ok(!sitemap.includes('https://x/b'), 'sitemap excludes noindex url');

    // Source registry: stub adapter test + disabled fetch rejection (via direct adapter)
    const src = model.getContentSourceByKey('rss_news_generic');
    assert.ok(src, 'rss source present');
    const adapter = sources.adapterFor(src);
    const test = await adapter.test(src);
    assert.ok(test.ok, 'stub adapter test ok');

    // Ingestion job lifecycle
    const job = model.createIngestionJob({ source_id: src.id, job_type: 'fetch' });
    assert.strictEqual(job.status, 'queued', 'job queued');
    const out = await adapter.fetch(src, {});
    const done = model.updateIngestionJob(job.id, { status: 'succeeded', output_json: out, completed_at: new Date().toISOString() });
    assert.strictEqual(done.status, 'succeeded', 'job succeeded');

    // Search index + query + delete
    const doc = model.indexSearchDocument({
        index_key: 'wiki', document_type: 'wiki_page', document_id: 'p1',
        title: 'OpenVibe Wiki', body_text: 'about openvibe', visibility: 'public',
    });
    assert.ok(doc.cache_key, 'doc indexed');
    const q = model.querySearchIndex({ q: 'openvibe' });
    assert.ok(q.length >= 1, 'query returns indexed doc');
    const n = model.deleteSearchDocument({ index_key: 'wiki', document_type: 'wiki_page', document_id: 'p1' });
    assert.strictEqual(n, 1, 'doc deleted');

    // Provider responses must never include raw API key values — only api_key_env
    const { buildApp } = require('../server/index');
    // Need a fresh app since we already initialized DB; reuse same DB.
    const { app } = buildApp();
    const server = app.listen(0);
    try {
        const provs = await _req(server, 'GET', '/api/v1/ai/providers');
        assert.strictEqual(provs.status, 200);
        for (const p of provs.body.providers) {
            assert.ok(!('api_key' in p),  'no api_key value returned');
            assert.ok(!('apiKey'  in p),  'no apiKey value returned');
            assert.ok(!('token'   in p),  'no token value returned');
        }
        const status = await _req(server, 'GET', '/api/v1/ai/status');
        assert.strictEqual(status.status, 200);
        assert.strictEqual(status.body.canonical_host, 'ai.openvibe.network');

        const slug = await _req(server, 'POST', '/api/v1/ai/seo/slug', { text: 'Hello, World! 2024' });
        assert.strictEqual(slug.body.slug, 'hello-world-2024');

        const trade = await _req(server, 'POST', '/api/v1/ai/trade/summarize-market-context', {
            input: { asset: 'BTC' }, idempotency_key: 'trade-' + Date.now(),
        });
        assert.strictEqual(trade.status, 200);
        assert.strictEqual(trade.body.output.not_financial_advice, true, 'trade output marked not financial advice');

        const longText = 'OpenVibe provides a structured editorial workflow that emphasizes source transparency, search-readiness, and product-specific output packaging for publishing surfaces. '.repeat(8);
        const productCases = [
            {
                path: '/api/v1/ai/wiki/generate-space',
                body: { input: { topic: 'OpenVibe Knowledge Base', description: longText }, sources: [{ url: 'https://example.com/wiki-1', title: 'Wiki source 1' }, { url: 'https://example.com/wiki-2', title: 'Wiki source 2' }], idempotency_key: 'wiki-space-' + Date.now() },
                expectedProduct: 'openvibe.wiki', expectedSchema: 'Article', expectedHost: 'openvibe.wiki', expectedIndex: 'wiki', expectedDocType: 'wiki_space',
            },
            {
                path: '/api/v1/ai/wiki/generate-page',
                body: { input: { topic: 'OpenVibe AI Service', description: longText }, sources: [{ url: 'https://example.com/wiki-page-1', title: 'Wiki page source 1' }, { url: 'https://example.com/wiki-page-2', title: 'Wiki page source 2' }], idempotency_key: 'wiki-page-' + Date.now() },
                expectedProduct: 'openvibe.wiki', expectedSchema: 'Article', expectedHost: 'openvibe.wiki', expectedIndex: 'wiki', expectedDocType: 'wiki_page',
            },
            {
                path: '/api/v1/ai/blog/draft-post',
                body: { input: { topic: 'Why source-aware AI drafts matter', angle: 'editorial workflow', description: longText }, sources: [{ url: 'https://example.com/blog-1', title: 'Blog source 1' }], idempotency_key: 'blog-' + Date.now() },
                expectedProduct: 'openvibe.blog', expectedSchema: 'BlogPosting', expectedHost: 'openvibe.blog', expectedIndex: 'blog', expectedDocType: 'blog_post',
            },
            {
                path: '/api/v1/ai/news/summarize-story',
                body: { input: { topic: 'OpenVibe launches product-specific AI seams', description: longText }, sources: [{ url: 'https://example.com/news-1', title: 'News source 1' }, { url: 'https://example.com/news-2', title: 'News source 2' }], idempotency_key: 'news-story-' + Date.now() },
                expectedProduct: 'openvibe.news', expectedSchema: 'NewsArticle', expectedHost: 'openvibe.news', expectedIndex: 'news', expectedDocType: 'news_story',
            },
            {
                path: '/api/v1/ai/news/compare-perspectives',
                body: { input: { topic: 'OpenVibe AI coverage comparison', description: longText }, sources: [{ url: 'https://example.com/news-compare-1', title: 'Perspective source 1' }, { url: 'https://example.com/news-compare-2', title: 'Perspective source 2' }], idempotency_key: 'news-compare-' + Date.now() },
                expectedProduct: 'openvibe.news', expectedSchema: 'NewsArticle', expectedHost: 'openvibe.news', expectedIndex: 'news', expectedDocType: 'news_perspectives',
            },
            {
                path: '/api/v1/ai/reviews/summarize-entity',
                body: { input: { entity: 'OpenVibe Studio', description: longText }, sources: [{ url: 'https://example.com/review-1', title: 'Review source 1' }, { url: 'https://example.com/review-2', title: 'Review source 2' }], idempotency_key: 'reviews-' + Date.now() },
                expectedProduct: 'openvibe.reviews', expectedSchema: 'Review', expectedHost: 'openvibe.reviews', expectedIndex: 'reviews', expectedDocType: 'review_page',
            },
            {
                path: '/api/v1/ai/deals/enrich-deal',
                body: { input: { product_name: 'OpenVibe Capture Card', merchant: 'OpenVibe Shop', price: '199.99', priceCurrency: 'USD', brand: 'OpenVibe', description: longText }, sources: [{ url: 'https://example.com/deal-1', title: 'Deal source 1' }], idempotency_key: 'deals-' + Date.now() },
                expectedProduct: 'openvibe.deals', expectedSchema: 'Product', expectedHost: 'openvibe.deals', expectedIndex: 'deals', expectedDocType: 'deal_page',
            },
            {
                path: '/api/v1/ai/coupons/extract-coupon',
                body: { input: { merchant: 'OpenVibe Shop', input: `${longText} Use coupon SAVE10 for 10 percent off selected items.` }, sources: [{ url: 'https://example.com/coupon-1', title: 'Coupon source 1' }], idempotency_key: 'coupons-' + Date.now() },
                expectedProduct: 'openvibe.coupons', expectedSchema: 'Article', expectedHost: 'openvibe.coupons', expectedIndex: 'coupons', expectedDocType: 'coupon_page',
            },
            {
                path: '/api/v1/ai/trade/summarize-market-context',
                body: { input: { asset: 'BTC', description: longText }, sources: [{ url: 'https://example.com/trade-1', title: 'Trade source 1' }, { url: 'https://example.com/trade-2', title: 'Trade source 2' }], idempotency_key: 'trade-seam-' + Date.now() },
                expectedProduct: 'openvibe.trade', expectedSchema: 'Article', expectedHost: 'openvibe.trade', expectedIndex: 'trade', expectedDocType: 'trade_page',
            },
            {
                path: '/api/v1/ai/codes/generate-docs',
                body: { input: { name: 'openvibe-sdk', audience: 'developers', applicationCategory: 'DeveloperApplication', operatingSystem: 'Linux', description: longText }, sources: [{ url: 'https://example.com/codes-1', title: 'Codes source 1' }], idempotency_key: 'codes-' + Date.now() },
                expectedProduct: 'openvibe.codes', expectedSchema: 'SoftwareApplication', expectedHost: 'openvibe.codes', expectedIndex: 'codes', expectedDocType: 'codes_doc',
            },
            {
                path: '/api/v1/ai/tools/describe-tool',
                body: { input: { tool_name: 'OpenVibe Studio', use_case: 'multi-surface content ops', applicationCategory: 'DeveloperApplication', operatingSystem: 'Linux', description: longText }, sources: [{ url: 'https://example.com/tools-1', title: 'Tool source 1' }], idempotency_key: 'tools-' + Date.now() },
                expectedProduct: 'openvibe.tools', expectedSchema: 'SoftwareApplication', expectedHost: 'openvibe.tools', expectedIndex: 'tools', expectedDocType: 'tool_page',
            },
            {
                path: '/api/v1/ai/games/generate-lore',
                body: { input: { game_name: 'OpenVibe Quest', faction: 'The Signal Keepers', description: longText }, sources: [{ url: 'https://example.com/games-1', title: 'Games source 1' }], idempotency_key: 'games-' + Date.now() },
                expectedProduct: 'openvibe.games', expectedSchema: 'Article', expectedHost: 'openvibe.games', expectedIndex: 'games', expectedDocType: 'game_lore',
            },
        ];

        for (const tc of productCases) {
            const res = await _req(server, 'POST', tc.path, tc.body);
            assert.strictEqual(res.status, 200, `product seam ${tc.path} returns 200`);
            assert.strictEqual(res.body.output.product.key, tc.expectedProduct, `${tc.path} product key`);
            assert.strictEqual(res.body.output.product.canonical_host, tc.expectedHost, `${tc.path} canonical host`);
            assert.strictEqual(res.body.output.seo.structured_data_type, tc.expectedSchema, `${tc.path} schema type`);
            assert.strictEqual(res.body.output.search_document.index_key, tc.expectedIndex, `${tc.path} search index key`);
            assert.strictEqual(res.body.output.search_document.document_type, tc.expectedDocType, `${tc.path} search document type`);
            assert.ok(res.body.output.seo.metadata.canonical_url.includes(tc.expectedHost), `${tc.path} canonical url`);
            assert.ok(Array.isArray(res.body.output.sources.recommended_source_keys), `${tc.path} source recommendations`);
            assert.ok(Array.isArray(res.body.output.draft.sections), `${tc.path} draft sections`);
            assert.ok(res.body.output.quality.word_count > 0, `${tc.path} has word count`);
            assert.ok(res.body.output.search_document.title, `${tc.path} search payload has title`);
        }
    } finally {
        server.close();
    }

    console.log('[ai-smoke] OK');
}

main().catch(e => { console.error('[ai-smoke] FAIL:', e && e.stack || e); process.exit(1); });
